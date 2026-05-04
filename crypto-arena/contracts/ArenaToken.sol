// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ArenaToken (ARENA)
 * @notice Play-to-earn ERC-20 token. Earned by winning battles, completing quests,
 *         and tournament placements. Spent on breeding, levelling up, and marketplace fees.
 */
contract ArenaToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18; // 1 billion

    event Minted(address indexed to, uint256 amount);

    constructor(address initialOwner) ERC20("Arena Token", "ARENA") {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);
        // 10% initial supply to owner (for liquidity / rewards bootstrapping)
        _mint(initialOwner, 100_000_000 * 10 ** 18);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "ArenaToken: cap exceeded");
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function grantMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, account);
    }
}
