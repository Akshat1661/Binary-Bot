// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Treasury
 * @notice Platform fee sink. Marketplace sends its 2.5% cut here.
 *         ADMIN_ROLE can allocate funds to specific purposes (dev, marketing, buybacks).
 *         Feature 11 — Platform Fee & Treasury System.
 */
contract Treasury is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public totalReceived;
    uint256 public totalAllocated;

    struct Allocation {
        address recipient;
        uint256 amount;
        string  reason;
        uint256 timestamp;
    }

    Allocation[] private _allocations;

    event FeeReceived(address indexed from, uint256 amount, uint256 newTotal);
    event FundsAllocated(address indexed recipient, uint256 amount, string reason);

    constructor(address initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ADMIN_ROLE, initialOwner);
    }

    receive() external payable {
        totalReceived += msg.value;
        emit FeeReceived(msg.sender, msg.value, totalReceived);
    }

    /**
     * @notice Send `amount` ETH from the treasury to `recipient` labelled with `reason`.
     *         Only ADMIN_ROLE. Reverts if balance is insufficient.
     */
    function allocate(address payable recipient, uint256 amount, string calldata reason)
        external onlyRole(ADMIN_ROLE) nonReentrant
    {
        require(amount > 0,                          "Treasury: zero amount");
        require(address(this).balance >= amount,     "Treasury: insufficient balance");
        require(recipient != address(0),             "Treasury: zero address");

        totalAllocated += amount;
        _allocations.push(Allocation({
            recipient: recipient,
            amount:    amount,
            reason:    reason,
            timestamp: block.timestamp
        }));

        recipient.transfer(amount);
        emit FundsAllocated(recipient, amount, reason);
    }

    function getAllocations() external view returns (Allocation[] memory) {
        return _allocations;
    }

    function getAllocationCount() external view returns (uint256) {
        return _allocations.length;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
