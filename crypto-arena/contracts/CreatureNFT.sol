// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ArenaToken.sol";

/**
 * @title CreatureNFT
 * @notice Core NFT contract for CryptoArena. Each creature is an ERC-721 token with
 *         on-chain DNA encoding its element, base stats, and rarity. Creatures earn XP
 *         from battles, level up for improved stats, and can breed to create offspring.
 *
 * DNA layout (uint256):
 *   bits  0-2   element   (0=Fire 1=Water 2=Earth 3=Air 4=Light 5=Dark)
 *   bits  3-9   baseATK   (0-127)
 *   bits 10-16  baseDEF   (0-127)
 *   bits 17-23  baseSPD   (0-127)
 *   bits 24-30  baseHP    (0-127)
 *   bits 31-32  rarity    (0=Common 1=Uncommon 2=Rare 3=Legendary)
 *   bits 33-40  trait1    (color palette)
 *   bits 41-48  trait2    (body type)
 *   bits 49-255 uniqueness
 */
contract CreatureNFT is ERC721, ERC721Enumerable, ERC2981, AccessControl, ReentrancyGuard {
    bytes32 public constant GAME_ROLE = keccak256("GAME_ROLE"); // BattleEngine etc.

    ArenaToken public arenaToken;

    uint256 private _nextTokenId = 1;
    uint256 private _nonce;

    // Breeding costs in ARENA tokens per rarity
    uint256[4] public breedCosts = [
        50 * 10 ** 18,   // Common
        100 * 10 ** 18,  // Uncommon
        200 * 10 ** 18,  // Rare
        500 * 10 ** 18   // Legendary
    ];

    uint256 public constant BREED_COOLDOWN = 5 minutes;
    uint256 public constant MAX_BREED_COUNT = 7;
    uint256 public constant MAX_LEVEL = 100;
    uint256 public constant LEVEL_UP_COST = 20 * 10 ** 18; // 20 ARENA per level
    uint256 public constant MINT_FEE = 0.01 ether;

    enum Element { Fire, Water, Earth, Air, Light, Dark }
    enum Rarity  { Common, Uncommon, Rare, Legendary }

    struct Creature {
        string  name;
        uint256 dna;
        uint32  level;
        uint32  xp;
        uint32  winCount;
        uint32  lossCount;
        uint32  breedCount;
        uint64  lastBreedTime;
        address originalMinter; // for royalty tracking
    }

    struct Stats {
        uint256 atk;
        uint256 def;
        uint256 spd;
        uint256 hp;
        Element element;
        Rarity  rarity;
    }

    mapping(uint256 => Creature) public creatures;

    // XP thresholds per level (quadratic curve): xpForLevel[L] = L * L * 10
    function xpForNextLevel(uint32 level) public pure returns (uint32) {
        return level * level * 10;
    }

    event CreatureMinted(uint256 indexed tokenId, address indexed owner, uint256 dna, string name);
    event CreatureLevelUp(uint256 indexed tokenId, uint32 newLevel);
    event CreatureBred(uint256 indexed tokenId, uint256 parent1, uint256 parent2, address indexed owner);
    event XPGained(uint256 indexed tokenId, uint32 xpGained, uint32 totalXP);

    constructor(address initialOwner, address _arenaToken) ERC721("CryptoArena Creature", "CREATURE") {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(GAME_ROLE, initialOwner);
        arenaToken = ArenaToken(_arenaToken);
        // 5% royalty to contract itself (split to original minter tracked off-chain via events)
        _setDefaultRoyalty(initialOwner, 500);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Minting
    // ──────────────────────────────────────────────────────────────────────────

    function mintCreature(string calldata name) external payable nonReentrant returns (uint256 tokenId) {
        require(msg.value >= MINT_FEE, "CreatureNFT: insufficient mint fee");
        require(bytes(name).length > 0 && bytes(name).length <= 32, "CreatureNFT: invalid name");

        tokenId = _nextTokenId++;
        uint256 dna = _generateDNA(msg.sender, tokenId);

        creatures[tokenId] = Creature({
            name:          name,
            dna:           dna,
            level:         1,
            xp:            0,
            winCount:      0,
            lossCount:     0,
            breedCount:    0,
            lastBreedTime: 0,
            originalMinter: msg.sender
        });

        _safeMint(msg.sender, tokenId);
        // Per-token royalty pointing to original minter (5%)
        _setTokenRoyalty(tokenId, msg.sender, 500);

        emit CreatureMinted(tokenId, msg.sender, dna, name);
    }

    // Admin / GAME_ROLE can mint free (for quests, airdrops, tournament prizes)
    function mintFree(address to, string calldata name) external onlyRole(GAME_ROLE) returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        uint256 dna = _generateDNA(to, tokenId);
        creatures[tokenId] = Creature({
            name:          name,
            dna:           dna,
            level:         1,
            xp:            0,
            winCount:      0,
            lossCount:     0,
            breedCount:    0,
            lastBreedTime: 0,
            originalMinter: to
        });
        _safeMint(to, tokenId);
        _setTokenRoyalty(tokenId, to, 500);
        emit CreatureMinted(tokenId, to, dna, name);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Stats
    // ──────────────────────────────────────────────────────────────────────────

    function getStats(uint256 tokenId) public view returns (Stats memory s) {
        require(_ownerOf(tokenId) != address(0), "CreatureNFT: nonexistent token");
        Creature storage c = creatures[tokenId];
        uint256 dna = c.dna;
        uint32  lvl = c.level;

        s.element = Element((dna & 0x7) % 6);                   // bits 0-2, clamped to 6 types
        uint256 baseATK = (dna >> 3)  & 0x7F;                 // bits 3-9
        uint256 baseDEF = (dna >> 10) & 0x7F;                 // bits 10-16
        uint256 baseSPD = (dna >> 17) & 0x7F;                 // bits 17-23
        uint256 baseHP  = (dna >> 24) & 0x7F;                 // bits 24-30
        s.rarity        = Rarity((dna >> 31) & 0x3);          // bits 31-32

        uint256 rarityMult = uint256(s.rarity) + 1; // 1-4x bonus scaling

        s.atk = 50  + baseATK + (lvl * rarityMult);
        s.def = 30  + baseDEF + (lvl * rarityMult);
        s.spd = 20  + baseSPD + (lvl * rarityMult);
        s.hp  = 100 + (baseHP * 5) + (lvl * rarityMult * 10);
    }

    function getElement(uint256 tokenId) external view returns (Element) {
        return Element((creatures[tokenId].dna & 0x7) % 6);
    }

    function getRarity(uint256 tokenId) external view returns (Rarity) {
        return Rarity((creatures[tokenId].dna >> 31) & 0x3);
    }

    // Explicit getter to avoid ethers.js v6 Result naming issues with mapping getter
    function getCreature(uint256 tokenId) external view returns (
        string memory creatureName,
        uint256 dna,
        uint32  level,
        uint32  xp,
        uint32  winCount,
        uint32  lossCount,
        uint32  breedCount,
        uint64  lastBreedTime,
        address originalMinter
    ) {
        require(_ownerOf(tokenId) != address(0), "CreatureNFT: nonexistent token");
        Creature storage c = creatures[tokenId];
        creatureName   = c.name;
        dna            = c.dna;
        level          = c.level;
        xp             = c.xp;
        winCount       = c.winCount;
        lossCount      = c.lossCount;
        breedCount     = c.breedCount;
        lastBreedTime  = c.lastBreedTime;
        originalMinter = c.originalMinter;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // XP & Levelling
    // ──────────────────────────────────────────────────────────────────────────

    function addXP(uint256 tokenId, uint32 xpAmount) external onlyRole(GAME_ROLE) {
        Creature storage c = creatures[tokenId];
        c.xp += xpAmount;
        emit XPGained(tokenId, xpAmount, c.xp);
        _checkLevelUp(tokenId);
    }

    function levelUp(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "CreatureNFT: not owner");
        Creature storage c = creatures[tokenId];
        require(c.level < MAX_LEVEL, "CreatureNFT: max level");

        arenaToken.burnFrom(msg.sender, LEVEL_UP_COST);
        c.level++;
        emit CreatureLevelUp(tokenId, c.level);
    }

    function recordWin(uint256 tokenId) external onlyRole(GAME_ROLE) {
        creatures[tokenId].winCount++;
    }

    function recordLoss(uint256 tokenId) external onlyRole(GAME_ROLE) {
        creatures[tokenId].lossCount++;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Breeding
    // ──────────────────────────────────────────────────────────────────────────

    function breed(uint256 parent1Id, uint256 parent2Id, string calldata childName)
        external nonReentrant returns (uint256 childId)
    {
        require(ownerOf(parent1Id) == msg.sender, "CreatureNFT: not owner of parent1");
        require(ownerOf(parent2Id) == msg.sender, "CreatureNFT: not owner of parent2");
        require(parent1Id != parent2Id, "CreatureNFT: same creature");

        // Cache parent data before burning
        uint256 p1Dna   = creatures[parent1Id].dna;
        uint256 p2Dna   = creatures[parent2Id].dna;
        uint32  p1Level = creatures[parent1Id].level;
        uint32  p2Level = creatures[parent2Id].level;

        // Cost = avg rarity of parents
        uint256 r1 = (p1Dna >> 31) & 0x3;
        uint256 r2 = (p2Dna >> 31) & 0x3;
        uint256 avgRarity = (r1 + r2) / 2;
        uint256 cost = breedCosts[avgRarity];

        arenaToken.burnFrom(msg.sender, cost);

        childId = _nextTokenId++;
        uint256 childDna = _blendDNA(p1Dna, p2Dna, childId);

        // Child level: random between min(p1,p2) and p1+p2 — it's a bet!
        _nonce++;
        uint32 minLvl   = p1Level < p2Level ? p1Level : p2Level;
        uint32 totalLvl = p1Level + p2Level;
        uint256 lvlRng  = uint256(keccak256(abi.encodePacked(block.prevrandao, childId, _nonce)));
        uint32 childLevel = minLvl + uint32(lvlRng % (uint256(totalLvl - minLvl) + 1));
        if (childLevel < 1)                  childLevel = 1;
        if (childLevel > uint32(MAX_LEVEL)) childLevel = uint32(MAX_LEVEL);

        // Child XP: random between 0 and xpForNextLevel(childLevel)-1
        _nonce++;
        uint256 xpRng  = uint256(keccak256(abi.encodePacked(block.prevrandao, childId, _nonce)));
        uint32  capXP  = xpForNextLevel(childLevel);
        uint32  childXP = capXP > 0 ? uint32(xpRng % capXP) : 0;

        creatures[childId] = Creature({
            name:           childName,
            dna:            childDna,
            level:          childLevel,
            xp:             childXP,
            winCount:       0,
            lossCount:      0,
            breedCount:     0,
            lastBreedTime:  0,
            originalMinter: msg.sender
        });

        _safeMint(msg.sender, childId);
        _setTokenRoyalty(childId, msg.sender, 500);

        emit CreatureBred(childId, parent1Id, parent2Id, msg.sender);

        // Parents are consumed by breeding — burn them
        _burn(parent1Id);
        delete creatures[parent1Id];
        _burn(parent2Id);
        delete creatures[parent2Id];
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Owner views
    // ──────────────────────────────────────────────────────────────────────────

    function getOwnerCreatures(address owner) external view returns (uint256[] memory) {
        uint256 count = balanceOf(owner);
        uint256[] memory ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = tokenOfOwnerByIndex(owner, i);
        }
        return ids;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────────────────────────────────

    function grantGameRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(GAME_ROLE, account);
    }

    function withdrawFees(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        to.transfer(address(this).balance);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────────────────────────────────

    function _generateDNA(address owner, uint256 tokenId) internal returns (uint256) {
        _nonce++;
        return uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            owner,
            tokenId,
            _nonce
        )));
    }

    function _blendDNA(uint256 dna1, uint256 dna2, uint256 childId) internal returns (uint256) {
        _nonce++;
        uint256 mask = uint256(keccak256(abi.encodePacked(block.prevrandao, childId, _nonce)));
        // mutation: 5% chance to randomise each bit group
        uint256 mutation = uint256(keccak256(abi.encodePacked(mask, _nonce + 1)));
        uint256 child = (dna1 & mask) | (dna2 & ~mask);
        // apply small mutation to uniqueness bits (bits 49+)
        uint256 lowMask = (uint256(1) << 49) - 1;
        child = (child & lowMask) | (mutation & ~lowMask);
        return child;
    }

    function _checkLevelUp(uint256 tokenId) internal {
        Creature storage c = creatures[tokenId];
        while (c.level < MAX_LEVEL && c.xp >= xpForNextLevel(c.level)) {
            c.xp -= xpForNextLevel(c.level);
            c.level++;
            emit CreatureLevelUp(tokenId, c.level);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Overrides (OpenZeppelin v5 requirement)
    // ──────────────────────────────────────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth)
        internal override(ERC721, ERC721Enumerable) returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721Enumerable, ERC2981, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    receive() external payable {}
}
