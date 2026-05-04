// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ArenaToken.sol";
import "./ReputationSystem.sol";

/**
 * @title DisputeResolution
 * @notice Multi-sig style dispute panel.
 *
 * Arbitrators stake ARENA to join the pool. When Escrow raises a dispute, 3 arbitrators
 * are pseudo-randomly selected. Each votes (favor buyer or seller). After all 3 vote,
 * the majority decision is enforced by calling back into Escrow. Arbitrators earn ARENA
 * for voting. Non-voters after the deadline forfeit half their stake.
 *
 * Feature 7 — Multi-Sig Dispute Resolution.
 *
 * Requires:
 *   - DisputeResolution holds MINTER_ROLE on ArenaToken (for arbitrator rewards)
 *   - Escrow.setDisputeResolution(address) wired after deploy
 */

interface IEscrow {
    function resolveDispute(uint256 escrowId, bool favorBuyer) external;
}

contract DisputeResolution is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    ArenaToken       public arenaToken;
    ReputationSystem public reputation;
    address          public escrowContract; // set after Escrow is deployed

    // ── Arbitrator staking ────────────────────────────────────────────────────

    uint256 public constant ARBITRATOR_STAKE    = 100 * 1e18;  // 100 ARENA to join pool
    uint256 public constant ARBITRATOR_REWARD   = 20  * 1e18;  // 20 ARENA per dispute resolved
    uint256 public constant VOTE_WINDOW         = 2 days;
    uint256 public constant ARBITRATORS_NEEDED  = 3;

    // Ordered pool — push on stake, swap-and-pop on unstake
    address[] public arbitratorPool;
    mapping(address => uint256) public stakedAmount; // 0 = not staked

    // ── Dispute state ─────────────────────────────────────────────────────────

    enum Vote { None, FavorBuyer, FavorSeller }
    enum DisputeStatus { Active, Resolved }
    enum Outcome { None, BuyerWon, SellerWon }

    struct Dispute {
        uint256       escrowId;
        address       buyer;
        address       seller;
        uint256       amount;
        address[3]    arbitrators;
        Vote[3]       votes;
        uint8         voteCount;
        uint256       deadline;     // arbitrators must vote before this
        DisputeStatus status;
        Outcome       outcome;      // set when resolved
    }

    uint256 private _nextDisputeId = 1;
    mapping(uint256 => Dispute) public disputes;
    // arbitrator address → disputeId → arbitrator slot index (1-indexed; 0 = not assigned)
    mapping(address => mapping(uint256 => uint8)) private _arbitratorSlot;

    event ArbitratorStaked(address indexed arbitrator, uint256 amount);
    event ArbitratorUnstaked(address indexed arbitrator);
    event DisputeCreated(uint256 indexed disputeId, uint256 indexed escrowId, address[3] arbitrators);
    event VoteCast(uint256 indexed disputeId, address indexed arbitrator, bool favorBuyer);
    event DisputeResolved(uint256 indexed disputeId, bool favorBuyer, uint8 buyerVotes, uint8 sellerVotes);

    constructor(address initialOwner, address _arenaToken, address _reputation) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ADMIN_ROLE, initialOwner);
        arenaToken  = ArenaToken(_arenaToken);
        reputation  = ReputationSystem(_reputation);
    }

    function setEscrowContract(address _escrow) external onlyRole(ADMIN_ROLE) {
        require(_escrow != address(0), "DisputeResolution: zero address");
        escrowContract = _escrow;
    }

    // ── Arbitrator pool ───────────────────────────────────────────────────────

    /**
     * @notice Lock ARBITRATOR_STAKE ARENA to join the arbitrator pool.
     *         Caller must approve this contract on ArenaToken first.
     */
    function stakeToArbitrate() external nonReentrant {
        require(stakedAmount[msg.sender] == 0, "DisputeResolution: already staked");
        arenaToken.burnFrom(msg.sender, ARBITRATOR_STAKE);
        stakedAmount[msg.sender] = ARBITRATOR_STAKE;
        arbitratorPool.push(msg.sender);
        emit ArbitratorStaked(msg.sender, ARBITRATOR_STAKE);
    }

    /**
     * @notice Withdraw stake and leave the pool. Only when not assigned to an active dispute.
     *         Stake is returned as freshly minted ARENA (the original was burned on entry).
     */
    function unstake() external nonReentrant {
        require(stakedAmount[msg.sender] > 0, "DisputeResolution: not staked");

        uint256 amount = stakedAmount[msg.sender];
        stakedAmount[msg.sender] = 0;

        // Swap-and-pop removal from arbitratorPool
        uint256 len = arbitratorPool.length;
        for (uint256 i = 0; i < len; i++) {
            if (arbitratorPool[i] == msg.sender) {
                arbitratorPool[i] = arbitratorPool[len - 1];
                arbitratorPool.pop();
                break;
            }
        }

        arenaToken.mint(msg.sender, amount);
        emit ArbitratorUnstaked(msg.sender);
    }

    function poolSize() external view returns (uint256) {
        return arbitratorPool.length;
    }

    function isArbitrator(address account) external view returns (bool) {
        return stakedAmount[account] > 0;
    }

    // ── Dispute lifecycle ─────────────────────────────────────────────────────

    /**
     * @notice Called by Escrow when a buyer raises a dispute.
     *         Selects 3 arbitrators pseudo-randomly and starts the vote window.
     */
    function createDispute(
        uint256 escrowId,
        address buyer,
        address seller,
        uint256 amount
    ) external {
        require(msg.sender == escrowContract, "DisputeResolution: not escrow");
        require(arbitratorPool.length >= ARBITRATORS_NEEDED, "DisputeResolution: pool too small");

        uint256 did = _nextDisputeId++;
        Dispute storage d = disputes[did];
        d.escrowId = escrowId;
        d.buyer    = buyer;
        d.seller   = seller;
        d.amount   = amount;
        d.deadline = block.timestamp + VOTE_WINDOW;
        d.status   = DisputeStatus.Active;
        d.outcome  = Outcome.None;

        // Pseudo-random selection of 3 unique arbitrators (buyer & seller excluded)
        address[3] memory selected = _pickArbitrators(did, buyer, seller);
        d.arbitrators = selected;

        for (uint8 i = 0; i < 3; i++) {
            _arbitratorSlot[selected[i]][did] = i + 1; // 1-indexed
        }

        emit DisputeCreated(did, escrowId, selected);
    }

    /**
     * @notice An assigned arbitrator casts their vote.
     *         After the 3rd vote the dispute resolves automatically.
     */
    function vote(uint256 disputeId, bool favorBuyer) external nonReentrant {
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.Active, "DisputeResolution: not active");
        require(block.timestamp <= d.deadline,     "DisputeResolution: vote window closed");

        uint8 slot = _arbitratorSlot[msg.sender][disputeId];
        require(slot > 0,                          "DisputeResolution: not assigned");
        require(d.votes[slot - 1] == Vote.None,    "DisputeResolution: already voted");

        d.votes[slot - 1] = favorBuyer ? Vote.FavorBuyer : Vote.FavorSeller;
        d.voteCount++;

        emit VoteCast(disputeId, msg.sender, favorBuyer);

        // Reward the arbitrator immediately for voting
        arenaToken.mint(msg.sender, ARBITRATOR_REWARD);

        if (d.voteCount == ARBITRATORS_NEEDED) {
            _finalize(disputeId);
        }
    }

    /**
     * @notice Anyone may call this after the vote deadline to force resolution
     *         (even if fewer than 3 votes were cast — majority of cast votes wins;
     *          tie or zero votes → favor seller as default).
     */
    function forceResolve(uint256 disputeId) external nonReentrant {
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.Active,  "DisputeResolution: not active");
        require(block.timestamp > d.deadline,      "DisputeResolution: vote window still open");
        _finalize(disputeId);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _finalize(uint256 disputeId) internal {
        Dispute storage d = disputes[disputeId];
        d.status = DisputeStatus.Resolved;

        uint8 buyerVotes  = 0;
        uint8 sellerVotes = 0;
        for (uint8 i = 0; i < 3; i++) {
            if (d.votes[i] == Vote.FavorBuyer)  buyerVotes++;
            if (d.votes[i] == Vote.FavorSeller) sellerVotes++;
        }

        bool favorBuyer = buyerVotes > sellerVotes;
        d.outcome = favorBuyer ? Outcome.BuyerWon : Outcome.SellerWon;

        // Update reputation
        if (favorBuyer) {
            try reputation.addReputation(d.buyer,  50, "Won dispute") {} catch {}
            try reputation.slashReputation(d.seller, 30, "Lost dispute") {} catch {}
        } else {
            try reputation.addReputation(d.seller, 50, "Won dispute") {} catch {}
            try reputation.slashReputation(d.buyer, 30, "Lost dispute") {} catch {}
        }

        emit DisputeResolved(disputeId, favorBuyer, buyerVotes, sellerVotes);

        IEscrow(escrowContract).resolveDispute(d.escrowId, favorBuyer);
    }

    /**
     * @dev Pick 3 unique arbitrators, excluding the dispute's buyer and seller.
     *      Builds an eligible sub-pool first, then hash-picks 3 unique indices.
     */
    function _pickArbitrators(uint256 seed, address exclude1, address exclude2)
        internal view returns (address[3] memory selected)
    {
        // Build eligible pool (exclude buyer and seller)
        uint256 poolLen = arbitratorPool.length;
        address[] memory eligible = new address[](poolLen);
        uint256 eligibleCount = 0;
        for (uint256 i = 0; i < poolLen; i++) {
            address a = arbitratorPool[i];
            if (a != exclude1 && a != exclude2) {
                eligible[eligibleCount++] = a;
            }
        }
        require(eligibleCount >= ARBITRATORS_NEEDED, "DisputeResolution: not enough eligible arbitrators (need 3 not involved in dispute)");

        uint256 i0 = uint256(keccak256(abi.encodePacked(block.prevrandao, seed, uint256(0)))) % eligibleCount;
        uint256 i1 = uint256(keccak256(abi.encodePacked(block.prevrandao, seed, uint256(1)))) % eligibleCount;
        uint256 i2 = uint256(keccak256(abi.encodePacked(block.prevrandao, seed, uint256(2)))) % eligibleCount;

        // Resolve duplicates (safe when eligibleCount >= 3)
        if (i1 == i0) i1 = (i1 + 1) % eligibleCount;
        if (i2 == i0 || i2 == i1) i2 = (i2 + 1) % eligibleCount;
        if (i2 == i0 || i2 == i1) i2 = (i2 + 2) % eligibleCount;

        selected[0] = eligible[i0];
        selected[1] = eligible[i1];
        selected[2] = eligible[i2];
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        return disputes[disputeId];
    }

    function getDisputeCount() external view returns (uint256) {
        return _nextDisputeId - 1;
    }

    function getArbitratorPool() external view returns (address[] memory) {
        return arbitratorPool;
    }
}
