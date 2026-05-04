// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CreatureNFT.sol";
import "./ArenaToken.sol";
import "./ReputationSystem.sol";

/**
 * @title BattleEngine
 * @notice PvP battle system for CryptoArena.
 *
 * Two battle modes:
 *  1. createChallenge() → acceptChallenge() : sends a challenge to another wallet
 *  2. battle()                               : direct battle (same wallet, testing)
 *
 * Reputation: winner +15, loser +5 (participation reward — no one loses rep for fair combat).
 */
contract BattleEngine is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    CreatureNFT      public creatureNFT;
    ArenaToken       public arenaToken;
    ReputationSystem public reputation;

    uint256 private _battleNonce;

    uint256 public constant WIN_XP         = 50;
    uint256 public constant LOSS_XP        = 10;
    uint256 public constant WIN_ARENA      = 10 * 10 ** 18;
    uint256 public constant BATTLE_COOLDOWN = 1 minutes;

    uint16[6][6] private _elementTable;

    mapping(uint256 => uint64) public lastBattleTime;

    struct BattleRecord {
        uint256 winnerId;
        uint256 loserId;
        uint256 timestamp;
        uint32  attackerHP;
    }
    BattleRecord[] public battleHistory;

    // ── Challenge system ──────────────────────────────────────────────────────
    struct Challenge {
        uint256 challengerTokenId;
        uint256 targetTokenId;
        address challenger;
        bool    active;
        uint256 timestamp;
    }

    uint256 private _nextChallengeId = 1;
    mapping(uint256 => Challenge)    public challenges;
    mapping(address => uint256[]) private _incomingChallenges;
    mapping(address => uint256[]) private _outgoingChallenges;

    // ── Events ────────────────────────────────────────────────────────────────

    event BattleResult(
        uint256 indexed winnerId,
        uint256 indexed loserId,
        address indexed winnerOwner,
        uint256 arenaRewarded,
        uint256 historyIndex
    );
    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed challenger,
        uint256 challengerTokenId,
        uint256 targetTokenId,
        address indexed targetOwner
    );
    event ChallengeAccepted(uint256 indexed challengeId, uint256 indexed winnerId);
    event ChallengeCancelled(uint256 indexed challengeId);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        address initialOwner,
        address _creatureNFT,
        address _arenaToken,
        address _reputation
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ADMIN_ROLE, initialOwner);
        creatureNFT = CreatureNFT(payable(_creatureNFT));
        arenaToken  = ArenaToken(_arenaToken);
        reputation  = ReputationSystem(_reputation);
        _initElementTable();
    }

    // ── Direct battle ─────────────────────────────────────────────────────────

    function battle(uint256 myId, uint256 targetId) external nonReentrant returns (uint256 winnerId) {
        require(creatureNFT.ownerOf(myId) == msg.sender, "BattleEngine: not your creature");
        require(myId != targetId,                         "BattleEngine: cannot fight self");
        require(
            block.timestamp >= lastBattleTime[myId] + BATTLE_COOLDOWN,
            "BattleEngine: creature on cooldown"
        );
        require(
            block.timestamp >= lastBattleTime[targetId] + BATTLE_COOLDOWN,
            "BattleEngine: opponent creature on cooldown"
        );
        winnerId = _executeBattle(myId, targetId);
    }

    // ── Challenge flow ────────────────────────────────────────────────────────

    function createChallenge(uint256 myId, uint256 targetId) external returns (uint256 challengeId) {
        require(creatureNFT.ownerOf(myId) == msg.sender,          "BattleEngine: not your creature");
        require(myId != targetId,                                   "BattleEngine: cannot challenge self");
        address targetOwner = creatureNFT.ownerOf(targetId);
        require(targetOwner != msg.sender,                          "BattleEngine: cannot challenge your own creature");
        require(
            block.timestamp >= lastBattleTime[myId] + BATTLE_COOLDOWN,
            "BattleEngine: your creature is on cooldown"
        );

        challengeId = _nextChallengeId++;
        challenges[challengeId] = Challenge({
            challengerTokenId: myId,
            targetTokenId:     targetId,
            challenger:        msg.sender,
            active:            true,
            timestamp:         block.timestamp
        });
        _incomingChallenges[targetOwner].push(challengeId);
        _outgoingChallenges[msg.sender].push(challengeId);

        emit ChallengeCreated(challengeId, msg.sender, myId, targetId, targetOwner);
    }

    function acceptChallenge(uint256 challengeId) external nonReentrant returns (uint256 winnerId) {
        Challenge storage c = challenges[challengeId];
        require(c.active,                                           "BattleEngine: challenge not active");
        require(
            creatureNFT.ownerOf(c.targetTokenId) == msg.sender,
            "BattleEngine: not the target creature owner"
        );
        require(
            block.timestamp >= lastBattleTime[c.challengerTokenId] + BATTLE_COOLDOWN,
            "BattleEngine: challenger creature on cooldown"
        );
        require(
            block.timestamp >= lastBattleTime[c.targetTokenId] + BATTLE_COOLDOWN,
            "BattleEngine: your creature is on cooldown"
        );

        c.active = false;
        winnerId = _executeBattle(c.challengerTokenId, c.targetTokenId);
        emit ChallengeAccepted(challengeId, winnerId);
    }

    function cancelChallenge(uint256 challengeId) external {
        Challenge storage c = challenges[challengeId];
        require(c.active,                    "BattleEngine: challenge not active");
        require(c.challenger == msg.sender,  "BattleEngine: not the challenger");
        c.active = false;
        emit ChallengeCancelled(challengeId);
    }

    function declineChallenge(uint256 challengeId) external {
        Challenge storage c = challenges[challengeId];
        require(c.active, "BattleEngine: challenge not active");
        require(
            creatureNFT.ownerOf(c.targetTokenId) == msg.sender,
            "BattleEngine: not the target creature owner"
        );
        c.active = false;
        emit ChallengeCancelled(challengeId);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getIncomingChallenges(address defender) external view returns (uint256[] memory) {
        return _incomingChallenges[defender];
    }

    function getOutgoingChallenges(address challenger) external view returns (uint256[] memory) {
        return _outgoingChallenges[challenger];
    }

    function getElementAdvantage(
        CreatureNFT.Element attacker,
        CreatureNFT.Element defender
    ) external view returns (uint16 basisPoints) {
        return _elementTable[uint8(attacker)][uint8(defender)];
    }

    function battleHistoryLength() external view returns (uint256) {
        return battleHistory.length;
    }

    function cooldownRemaining(uint256 tokenId) external view returns (uint256) {
        uint256 ready = lastBattleTime[tokenId] + BATTLE_COOLDOWN;
        if (block.timestamp >= ready) return 0;
        return ready - block.timestamp;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _executeBattle(uint256 aId, uint256 dId) internal returns (uint256 winnerId) {
        lastBattleTime[aId] = uint64(block.timestamp);
        lastBattleTime[dId] = uint64(block.timestamp);

        CreatureNFT.Stats memory aStats = creatureNFT.getStats(aId);
        CreatureNFT.Stats memory dStats = creatureNFT.getStats(dId);

        (uint256 aRounds, uint256 dRounds) = _simulate(aStats, dStats, aId, dId);

        bool aWins   = (aRounds < dRounds) || (aRounds == dRounds && aStats.spd >= dStats.spd);
        winnerId      = aWins ? aId : dId;
        uint256 loserId = aWins ? dId : aId;

        creatureNFT.recordWin(winnerId);
        creatureNFT.recordLoss(loserId);
        creatureNFT.addXP(winnerId, uint32(WIN_XP));
        creatureNFT.addXP(loserId,  uint32(LOSS_XP));

        address winnerOwner = creatureNFT.ownerOf(winnerId);
        address loserOwner  = creatureNFT.ownerOf(loserId);
        arenaToken.mint(winnerOwner, WIN_ARENA);

        // Reputation: winner +15, loser +5 (participation reward)
        _addRep(winnerOwner, 15, "Battle victory");
        _addRep(loserOwner,  5,  "Battle participation");

        uint32 remainingHP = uint32(aWins ? aStats.hp : dStats.hp);
        uint256 histIdx    = battleHistory.length;
        battleHistory.push(BattleRecord({
            winnerId:   winnerId,
            loserId:    loserId,
            timestamp:  block.timestamp,
            attackerHP: remainingHP
        }));

        emit BattleResult(winnerId, loserId, winnerOwner, WIN_ARENA, histIdx);
    }

    function _simulate(
        CreatureNFT.Stats memory a,
        CreatureNFT.Stats memory d,
        uint256 aId,
        uint256 dId
    ) internal returns (uint256 aRounds, uint256 dRounds) {
        _battleNonce++;
        uint256 rng       = uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, aId, dId, _battleNonce)));
        uint256 aVariance = 85 + (rng % 31);
        uint256 dVariance = 85 + ((rng >> 8) % 31);

        uint16 aAdv = _elementTable[uint8(a.element)][uint8(d.element)];
        uint16 dAdv = _elementTable[uint8(d.element)][uint8(a.element)];

        uint256 aEffATK = (a.atk * aAdv * aVariance) / (10000 * 100);
        uint256 dEffATK = (d.atk * dAdv * dVariance) / (10000 * 100);

        uint256 aDmg = aEffATK > d.def ? aEffATK - d.def : 1;
        uint256 dDmg = dEffATK > a.def ? dEffATK - a.def : 1;

        aRounds = (d.hp + aDmg - 1) / aDmg;
        dRounds = (a.hp + dDmg - 1) / dDmg;
    }

    function _addRep(address user, uint256 amount, string memory reason) internal {
        if (address(reputation) != address(0)) {
            try reputation.addReputation(user, amount, reason) {} catch {}
        }
    }

    function _initElementTable() internal {
        for (uint8 i = 0; i < 6; i++)
            for (uint8 j = 0; j < 6; j++)
                _elementTable[i][j] = 10000;

        _elementTable[0][2] = 15000; // Fire   > Earth
        _elementTable[1][0] = 15000; // Water  > Fire
        _elementTable[2][1] = 15000; // Earth  > Water
        _elementTable[3][2] = 15000; // Air    > Earth
        _elementTable[4][5] = 15000; // Light  > Dark
        _elementTable[5][4] = 15000; // Dark   > Light

        _elementTable[0][1] = 7500;  // Fire   < Water
        _elementTable[1][2] = 7500;  // Water  < Earth
        _elementTable[2][0] = 7500;  // Earth  < Fire
        _elementTable[3][0] = 7500;  // Air    < Fire
    }
}
