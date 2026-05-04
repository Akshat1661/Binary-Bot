// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ReputationSystem
 * @notice One soulbound (non-transferable) token per address. Reputation score is updated by
 *         authorised game contracts (Marketplace, BattleEngine, TournamentManager, Escrow,
 *         DisputeResolution) via addReputation / slashReputation.
 *
 * Feature 8 — On-Chain Reputation System.
 *
 * Soulbound: _update reverts on any transfer (mint from 0 and burn to 0 are allowed).
 */
contract ReputationSystem is ERC721, AccessControl {
    bytes32 public constant REP_CALLER_ROLE = keccak256("REP_CALLER_ROLE");

    uint256 private _nextTokenId = 1;

    // address → reputation score (lifetime, never rolls over)
    mapping(address => uint256) public reputation;
    // address → soulbound tokenId (0 = no token yet)
    mapping(address => uint256) public repTokenOf;

    event ReputationUpdated(
        address indexed user,
        uint256 newScore,
        int256  delta,
        string  reason
    );

    constructor(address initialOwner) ERC721("CryptoArena Reputation", "AREP") {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(REP_CALLER_ROLE, initialOwner);
    }

    // ── Soulbound enforcement ─────────────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        // Block normal transfers (allow mint: from==0, allow burn: to==0)
        require(
            from == address(0) || to == address(0),
            "ReputationSystem: soulbound - non-transferable"
        );
        return super._update(to, tokenId, auth);
    }

    // ── Internal: mint lazily on first reputation event ──────────────────────

    function _ensureToken(address user) internal {
        if (repTokenOf[user] == 0) {
            uint256 tid = _nextTokenId++;
            repTokenOf[user] = tid;
            _mint(user, tid); // _mint bypasses the transfer block (from == address(0))
        }
    }

    // ── Reputation management (REP_CALLER_ROLE only) ─────────────────────────

    function addReputation(address user, uint256 amount, string calldata reason)
        external onlyRole(REP_CALLER_ROLE)
    {
        require(user != address(0), "ReputationSystem: zero address");
        _ensureToken(user);
        reputation[user] += amount;
        emit ReputationUpdated(user, reputation[user], int256(amount), reason);
    }

    function slashReputation(address user, uint256 amount, string calldata reason)
        external onlyRole(REP_CALLER_ROLE)
    {
        require(user != address(0), "ReputationSystem: zero address");
        _ensureToken(user);
        reputation[user] = reputation[user] > amount ? reputation[user] - amount : 0;
        emit ReputationUpdated(user, reputation[user], -int256(amount), reason);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getReputation(address user) external view returns (uint256) {
        return reputation[user];
    }

    function hasToken(address user) external view returns (bool) {
        return repTokenOf[user] != 0;
    }

    // ── Admin: grant REP_CALLER_ROLE to game contracts ────────────────────────

    function grantCallerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(REP_CALLER_ROLE, account);
    }

    // ── Interface support ─────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
