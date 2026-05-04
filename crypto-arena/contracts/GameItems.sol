// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ArenaToken.sol";
import "./CreatureNFT.sol";

/**
 * @title GameItems
 * @notice ERC-1155 semi-fungible consumable items for CryptoArena.
 *         Items are bought with ARENA tokens from the in-game shop and burned on use.
 *
 *   id=0  XP Potion     — grants 100 XP to a creature instantly
 *   id=1  Breed Boost   — grants 200 XP to a creature (simulate offspring bonus)
 *   id=2  Battle Boost  — grants 50 XP + records an extra win on a creature
 *
 * Feature 2 — ERC-1155 Multi-Token Bundles.
 *
 * Requires:
 *   - GameItems must hold GAME_ROLE on CreatureNFT  (for addXP, recordWin)
 *   - ARENA approval from user before buyItem()      (arenaToken.approve)
 */
contract GameItems is ERC1155, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Item IDs
    uint256 public constant XP_POTION    = 0;
    uint256 public constant BREED_BOOST  = 1;
    uint256 public constant BATTLE_BOOST = 2;
    uint256 public constant ITEM_COUNT   = 3;

    ArenaToken  public arenaToken;
    CreatureNFT public creatureNFT;

    // ARENA cost per item (in wei)
    uint256[ITEM_COUNT] public shopPrices;

    // Human-readable names
    string[ITEM_COUNT] private _names;

    // XP / bonus amounts applied on use
    uint32 public constant XP_POTION_GRANT    = 100;
    uint32 public constant BREED_BOOST_GRANT  = 200;
    uint32 public constant BATTLE_BOOST_GRANT = 50;

    event ItemPurchased(address indexed buyer, uint256 indexed itemId, uint256 quantity, uint256 arenaCost);
    event ItemUsed(address indexed user, uint256 indexed itemId, uint256 indexed tokenId);
    event ShopPriceUpdated(uint256 indexed itemId, uint256 newPrice);

    constructor(address initialOwner, address _arenaToken, address _creatureNFT)
        ERC1155("https://cryptoarena.local/items/{id}.json")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);

        arenaToken  = ArenaToken(_arenaToken);
        creatureNFT = CreatureNFT(payable(_creatureNFT));

        shopPrices[XP_POTION]    = 10 * 1e18;  // 10 ARENA
        shopPrices[BREED_BOOST]  = 25 * 1e18;  // 25 ARENA
        shopPrices[BATTLE_BOOST] = 15 * 1e18;  // 15 ARENA

        _names[XP_POTION]    = "XP Potion";
        _names[BREED_BOOST]  = "Breed Boost";
        _names[BATTLE_BOOST] = "Battle Boost";
    }

    // ── Shop ──────────────────────────────────────────────────────────────────

    /**
     * @notice Buy `quantity` of item `itemId` from the shop. Burns ARENA from caller.
     *         Caller must have approved this contract on ArenaToken first.
     */
    function buyItem(uint256 itemId, uint256 quantity) external nonReentrant {
        require(itemId < ITEM_COUNT,  "GameItems: invalid item");
        require(quantity > 0,         "GameItems: zero quantity");

        uint256 cost = shopPrices[itemId] * quantity;
        arenaToken.burnFrom(msg.sender, cost);

        _mint(msg.sender, itemId, quantity, "");
        emit ItemPurchased(msg.sender, itemId, quantity, cost);
    }

    // ── Use items ─────────────────────────────────────────────────────────────

    /**
     * @notice Consume 1 XP Potion on `tokenId` → creature gains 100 XP immediately.
     */
    function useXPPotion(uint256 tokenId) external nonReentrant {
        require(creatureNFT.ownerOf(tokenId) == msg.sender, "GameItems: not creature owner");
        require(balanceOf(msg.sender, XP_POTION) >= 1,      "GameItems: no XP Potion");

        _burn(msg.sender, XP_POTION, 1);
        creatureNFT.addXP(tokenId, XP_POTION_GRANT);
        emit ItemUsed(msg.sender, XP_POTION, tokenId);
    }

    /**
     * @notice Consume 1 Breed Boost on `tokenId` → creature gains 200 XP.
     *         Simulate the bonus XP offspring would have inherited.
     */
    function useBreedBoost(uint256 tokenId) external nonReentrant {
        require(creatureNFT.ownerOf(tokenId) == msg.sender, "GameItems: not creature owner");
        require(balanceOf(msg.sender, BREED_BOOST) >= 1,    "GameItems: no Breed Boost");

        _burn(msg.sender, BREED_BOOST, 1);
        creatureNFT.addXP(tokenId, BREED_BOOST_GRANT);
        emit ItemUsed(msg.sender, BREED_BOOST, tokenId);
    }

    /**
     * @notice Consume 1 Battle Boost on `tokenId` → creature gains 50 XP + 1 extra win.
     */
    function useBattleBoost(uint256 tokenId) external nonReentrant {
        require(creatureNFT.ownerOf(tokenId) == msg.sender, "GameItems: not creature owner");
        require(balanceOf(msg.sender, BATTLE_BOOST) >= 1,   "GameItems: no Battle Boost");

        _burn(msg.sender, BATTLE_BOOST, 1);
        creatureNFT.addXP(tokenId, BATTLE_BOOST_GRANT);
        creatureNFT.recordWin(tokenId);
        emit ItemUsed(msg.sender, BATTLE_BOOST, tokenId);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /** @notice Mint items for free (airdrops, rewards, testing). */
    function adminMint(address to, uint256 itemId, uint256 amount)
        external onlyRole(MINTER_ROLE)
    {
        require(itemId < ITEM_COUNT, "GameItems: invalid item");
        _mint(to, itemId, amount, "");
    }

    function setShopPrice(uint256 itemId, uint256 price) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(itemId < ITEM_COUNT, "GameItems: invalid item");
        shopPrices[itemId] = price;
        emit ShopPriceUpdated(itemId, price);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getItemName(uint256 itemId) external view returns (string memory) {
        require(itemId < ITEM_COUNT, "GameItems: invalid item");
        return _names[itemId];
    }

    /** @notice Returns [xpPotion, breedBoost, battleBoost] balances for `user`. */
    function getBalances(address user) external view returns (uint256[ITEM_COUNT] memory bals) {
        for (uint256 i = 0; i < ITEM_COUNT; i++) {
            bals[i] = balanceOf(user, i);
        }
    }

    function getAllPrices() external view returns (uint256[ITEM_COUNT] memory) {
        return shopPrices;
    }

    // ── Interface support ─────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
