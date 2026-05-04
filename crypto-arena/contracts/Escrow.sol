// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CreatureNFT.sol";
import "./ReputationSystem.sol";

/**
 * @title Escrow
 * @notice Peer-to-peer escrow for creature trades.
 *
 * Flow:
 *   1. Seller calls createEscrow(tokenId, price)  — NFT locked here, awaiting buyer
 *   2. Buyer  calls acceptEscrow(id) payable       — ETH locked here, status → AwaitingConfirm
 *   3a. Buyer calls confirmDelivery(id)             — NFT→Buyer, ETH→Seller; +rep both
 *   3b. Buyer calls raiseDispute(id) before deadline— frozen; DisputeResolution decides
 *   3c. Anyone calls autoRelease(id) after deadline  — NFT→Buyer, ETH→Seller (timeout release)
 *   0b. Seller calls cancelEscrow(id) before accept — NFT returned, escrow deleted
 *
 * Feature 6 — Escrow Smart Contract.
 */

interface IDisputeResolution {
    function createDispute(
        uint256 escrowId,
        address buyer,
        address seller,
        uint256 amount
    ) external;
}

contract Escrow is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    CreatureNFT      public creatureNFT;
    ReputationSystem public reputation;
    address          public disputeResolution; // set after DisputeResolution is deployed

    uint256 public constant CONFIRMATION_WINDOW = 2 days;

    uint256 private _nextEscrowId = 1;

    enum EscrowStatus {
        AwaitingBuyer,        // created, no buyer yet
        AwaitingConfirmation, // buyer accepted, ETH locked, awaiting confirm / dispute
        Confirmed,            // buyer confirmed — ETH→Seller, NFT→Buyer
        AutoReleased,         // timeout elapsed — ETH→Seller, NFT→Buyer
        Disputed,             // dispute raised; resolved by DisputeResolution
        FavorBuyer,           // dispute resolved: ETH→Buyer, NFT stays with Buyer
        FavorSeller,          // dispute resolved: ETH→Seller, NFT stays with Buyer
        Cancelled             // seller cancelled before any buyer
    }

    struct EscrowEntry {
        address      seller;
        address      buyer;
        uint256      tokenId;
        uint256      price;       // ETH amount (wei)
        uint256      deadline;    // buyer must confirm before this timestamp
        EscrowStatus status;
    }

    mapping(uint256 => EscrowEntry) public escrows;

    event EscrowCreated(uint256 indexed id, address indexed seller, uint256 indexed tokenId, uint256 price);
    event EscrowAccepted(uint256 indexed id, address indexed buyer, uint256 deadline);
    event EscrowConfirmed(uint256 indexed id, address buyer, address seller, uint256 amount);
    event EscrowAutoReleased(uint256 indexed id, uint256 amount);
    event EscrowDisputed(uint256 indexed id, address indexed buyer);
    event EscrowResolved(uint256 indexed id, bool favorBuyer);
    event EscrowCancelled(uint256 indexed id);

    constructor(address initialOwner, address _creatureNFT, address _reputation) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ADMIN_ROLE, initialOwner);
        creatureNFT = CreatureNFT(payable(_creatureNFT));
        reputation  = ReputationSystem(_reputation);
    }

    function setDisputeResolution(address _dr) external onlyRole(ADMIN_ROLE) {
        require(_dr != address(0), "Escrow: zero address");
        disputeResolution = _dr;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * @notice Seller locks an NFT into escrow and sets the asking price.
     *         Seller must have approved this contract on CreatureNFT.
     */
    function createEscrow(uint256 tokenId, uint256 price) external returns (uint256 id) {
        require(creatureNFT.ownerOf(tokenId) == msg.sender, "Escrow: not owner");
        require(price > 0, "Escrow: zero price");

        creatureNFT.transferFrom(msg.sender, address(this), tokenId);

        id = _nextEscrowId++;
        escrows[id] = EscrowEntry({
            seller:   msg.sender,
            buyer:    address(0),
            tokenId:  tokenId,
            price:    price,
            deadline: 0,
            status:   EscrowStatus.AwaitingBuyer
        });

        emit EscrowCreated(id, msg.sender, tokenId, price);
    }

    /**
     * @notice Buyer accepts the escrow by depositing the exact price (or more — excess refunded).
     *         After this, a CONFIRMATION_WINDOW timer starts.
     */
    function acceptEscrow(uint256 id) external payable nonReentrant {
        EscrowEntry storage e = escrows[id];
        require(e.status == EscrowStatus.AwaitingBuyer, "Escrow: not awaiting buyer");
        require(msg.sender != e.seller,                  "Escrow: seller cannot buy");
        require(msg.value >= e.price,                    "Escrow: insufficient ETH");

        // Refund excess immediately
        uint256 excess = msg.value - e.price;
        if (excess > 0) payable(msg.sender).transfer(excess);

        e.buyer    = msg.sender;
        e.deadline = block.timestamp + CONFIRMATION_WINDOW;
        e.status   = EscrowStatus.AwaitingConfirmation;

        emit EscrowAccepted(id, msg.sender, e.deadline);
    }

    /**
     * @notice Buyer confirms they are satisfied.
     *         NFT transfers to buyer; ETH releases to seller.
     */
    function confirmDelivery(uint256 id) external nonReentrant {
        EscrowEntry storage e = escrows[id];
        require(e.status == EscrowStatus.AwaitingConfirmation, "Escrow: not awaiting confirmation");
        require(e.buyer == msg.sender,                          "Escrow: not buyer");

        e.status = EscrowStatus.Confirmed;

        creatureNFT.transferFrom(address(this), e.buyer, e.tokenId);
        payable(e.seller).transfer(e.price);

        try reputation.addReputation(e.seller, 10, "Escrow sale confirmed") {} catch {}
        try reputation.addReputation(e.buyer,  5,  "Escrow purchase confirmed") {} catch {}

        emit EscrowConfirmed(id, e.buyer, e.seller, e.price);
    }

    /**
     * @notice Anyone may call this after the deadline if buyer has neither confirmed
     *         nor raised a dispute. NFT→Buyer, ETH→Seller.
     */
    function autoRelease(uint256 id) external nonReentrant {
        EscrowEntry storage e = escrows[id];
        require(e.status == EscrowStatus.AwaitingConfirmation, "Escrow: not awaiting confirmation");
        require(block.timestamp > e.deadline,                   "Escrow: deadline not passed");

        e.status = EscrowStatus.AutoReleased;

        creatureNFT.transferFrom(address(this), e.buyer, e.tokenId);
        payable(e.seller).transfer(e.price);

        emit EscrowAutoReleased(id, e.price);
    }

    /**
     * @notice Buyer raises a dispute before the deadline. ETH and NFT are frozen here
     *         until DisputeResolution calls back with resolveDispute().
     */
    function raiseDispute(uint256 id) external {
        EscrowEntry storage e = escrows[id];
        require(e.status == EscrowStatus.AwaitingConfirmation, "Escrow: not awaiting confirmation");
        require(e.buyer == msg.sender,                          "Escrow: not buyer");
        require(block.timestamp <= e.deadline,                  "Escrow: deadline passed");
        require(disputeResolution != address(0),                "Escrow: dispute contract not set");

        e.status = EscrowStatus.Disputed;

        IDisputeResolution(disputeResolution).createDispute(id, e.buyer, e.seller, e.price);

        emit EscrowDisputed(id, msg.sender);
    }

    /**
     * @notice Called by DisputeResolution only.
     *         favorBuyer=true → ETH refunded to buyer, NFT also to buyer (seller takes loss).
     *         favorBuyer=false → ETH to seller, NFT to buyer (dispute invalid; normal sale).
     */
    function resolveDispute(uint256 id, bool favorBuyer) external nonReentrant {
        require(msg.sender == disputeResolution, "Escrow: not dispute contract");
        EscrowEntry storage e = escrows[id];
        require(e.status == EscrowStatus.Disputed, "Escrow: not in dispute");

        if (favorBuyer) {
            e.status = EscrowStatus.FavorBuyer;
            creatureNFT.transferFrom(address(this), e.buyer, e.tokenId);
            payable(e.buyer).transfer(e.price);
            try reputation.slashReputation(e.seller, 30, "Lost dispute as seller") {} catch {}
            try reputation.addReputation(e.buyer, 50,    "Won dispute as buyer") {} catch {}
        } else {
            e.status = EscrowStatus.FavorSeller;
            creatureNFT.transferFrom(address(this), e.buyer, e.tokenId);
            payable(e.seller).transfer(e.price);
            try reputation.slashReputation(e.buyer, 30,  "Lost dispute as buyer") {} catch {}
            try reputation.addReputation(e.seller, 50,   "Won dispute as seller") {} catch {}
        }

        emit EscrowResolved(id, favorBuyer);
    }

    /**
     * @notice Seller cancels before any buyer accepts. NFT returned.
     */
    function cancelEscrow(uint256 id) external nonReentrant {
        EscrowEntry storage e = escrows[id];
        require(e.seller == msg.sender,                      "Escrow: not seller");
        require(e.status == EscrowStatus.AwaitingBuyer,      "Escrow: already accepted");

        e.status = EscrowStatus.Cancelled;
        creatureNFT.transferFrom(address(this), e.seller, e.tokenId);

        emit EscrowCancelled(id);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getEscrow(uint256 id) external view returns (EscrowEntry memory) {
        return escrows[id];
    }

    function getCount() external view returns (uint256) {
        return _nextEscrowId - 1;
    }
}
