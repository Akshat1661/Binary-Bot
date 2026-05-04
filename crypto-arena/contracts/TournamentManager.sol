// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CreatureNFT.sol";
import "./ArenaToken.sol";
import "./ReputationSystem.sol";

/**
 * @title TournamentManager
 * @notice Single-elimination bracket tournaments with round-by-round progression.
 *
 * Flow:
 *   1. createTournament() — admin/anyone creates tournament with a registration window
 *   2. register()         — participants pay entry fee and register a creature
 *   3. startTournament()  — callable after deadline; runs Round 1, sets state InProgress
 *   4. advanceRound()     — callable after ROUND_DELAY (60 s); runs next round
 *   5. Repeat step 4 until one survivor → TournamentFinished
 *
 * States: Open(0) → InProgress(1) → Finished(2) | Cancelled(3)
 */
contract TournamentManager is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    CreatureNFT      public creatureNFT;
    ArenaToken       public arenaToken;
    ReputationSystem public reputation;
    address          public feeRecipient;

    uint256 public constant WINNER_ARENA_REWARD = 500 * 10 ** 18;
    uint256 public constant ROUND_DELAY         = 60; // 60 seconds between rounds

    uint256 private _nextTournamentId = 1;
    uint256 private _tournamentNonce;

    enum TournamentState { Open, InProgress, Finished, Cancelled }

    struct Tournament {
        string          name;
        uint256         entryFee;
        uint8           maxParticipants;
        uint8           participantCount;
        uint256         prizePool;
        TournamentState state;
        uint256         registrationDeadline;
        uint256         winner;
        address         winnerAddress;
        uint8           currentRoundNum;
        uint256         nextRoundTime;
    }

    mapping(uint256 => Tournament)               public tournaments;
    mapping(uint256 => uint256[])                public participants;
    mapping(uint256 => mapping(uint256 => bool)) public isParticipant;
    // survivors remaining in the current round
    mapping(uint256 => uint256[])                private _currentRound;

    event TournamentCreated(uint256 indexed id, string name, uint256 entryFee, uint8 maxParticipants, uint256 deadline);
    event CreatureRegistered(uint256 indexed tournamentId, uint256 indexed tokenId, address owner);
    event MatchPlayed(uint256 indexed tournamentId, uint256 indexed round, uint256 fighter1, uint256 fighter2, uint256 winner);
    event RoundCompleted(uint256 indexed tournamentId, uint256 round, uint256[] survivors);
    event TournamentFinished(uint256 indexed tournamentId, uint256 champion, address winnerAddress, uint256 ethPrize, uint256 arenaReward);

    constructor(
        address initialOwner,
        address _creatureNFT,
        address _arenaToken,
        address _reputation
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ADMIN_ROLE, initialOwner);
        creatureNFT  = CreatureNFT(payable(_creatureNFT));
        arenaToken   = ArenaToken(_arenaToken);
        reputation   = ReputationSystem(_reputation);
        feeRecipient = initialOwner;
    }

    // ── Tournament lifecycle ──────────────────────────────────────────────────

    function createTournament(
        string calldata name,
        uint256 entryFee,
        uint8   maxParticipants,
        uint256 registrationWindow
    ) external returns (uint256 tid) {
        require(
            maxParticipants == 4  || maxParticipants == 8 ||
            maxParticipants == 16 || maxParticipants == 32,
            "TournamentManager: size must be 4/8/16/32"
        );
        uint256 deadline = block.timestamp + registrationWindow;
        tid = _nextTournamentId++;
        tournaments[tid] = Tournament({
            name:                 name,
            entryFee:             entryFee,
            maxParticipants:      maxParticipants,
            participantCount:     0,
            prizePool:            0,
            state:                TournamentState.Open,
            registrationDeadline: deadline,
            winner:               0,
            winnerAddress:        address(0),
            currentRoundNum:      0,
            nextRoundTime:        0
        });
        emit TournamentCreated(tid, name, entryFee, maxParticipants, deadline);
    }

    function register(uint256 tournamentId, uint256 tokenId) external payable nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(t.state == TournamentState.Open,            "TournamentManager: not open");
        require(block.timestamp <= t.registrationDeadline,  "TournamentManager: registration closed");
        require(creatureNFT.ownerOf(tokenId) == msg.sender, "TournamentManager: not owner");
        require(!isParticipant[tournamentId][tokenId],       "TournamentManager: already registered");
        require(t.participantCount < t.maxParticipants,      "TournamentManager: tournament full");
        require(msg.value >= t.entryFee,                     "TournamentManager: insufficient entry fee");

        isParticipant[tournamentId][tokenId] = true;
        participants[tournamentId].push(tokenId);
        t.participantCount++;
        t.prizePool += t.entryFee;

        if (msg.value > t.entryFee) payable(msg.sender).transfer(msg.value - t.entryFee);

        emit CreatureRegistered(tournamentId, tokenId, msg.sender);
    }

    /**
     * @notice Start the tournament and run Round 1.
     *         Callable by anyone once registration closes (or bracket is full).
     *         State transitions Open → InProgress (or Finished if only 2 entered).
     */
    function startTournament(uint256 tournamentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(t.state == TournamentState.Open, "TournamentManager: not open");
        require(
            block.timestamp > t.registrationDeadline || t.participantCount >= t.maxParticipants,
            "TournamentManager: registration still open"
        );
        require(t.participantCount >= 2, "TournamentManager: need at least 2 participants");

        // Seed _currentRound with registered participants
        uint256[] storage parts = participants[tournamentId];
        for (uint256 i = 0; i < parts.length; i++) {
            _currentRound[tournamentId].push(parts[i]);
        }

        t.state = TournamentState.InProgress;
        t.currentRoundNum = 1;

        _runRound(tournamentId);
    }

    /**
     * @notice Advance to the next round. Callable after ROUND_DELAY seconds.
     */
    function advanceRound(uint256 tournamentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(t.state == TournamentState.InProgress,      "TournamentManager: not in progress");
        require(block.timestamp >= t.nextRoundTime,          "TournamentManager: round delay not elapsed");
        _runRound(tournamentId);
    }

    function cancelTournament(uint256 tournamentId) external onlyRole(ADMIN_ROLE) nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(
            t.state == TournamentState.Open || t.state == TournamentState.InProgress,
            "TournamentManager: cannot cancel"
        );
        t.state = TournamentState.Cancelled;
        if (t.entryFee > 0) {
            uint256[] storage parts = participants[tournamentId];
            for (uint256 i = 0; i < parts.length; i++) {
                try creatureNFT.ownerOf(parts[i]) returns (address owner) {
                    payable(owner).transfer(t.entryFee);
                } catch {}
            }
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getParticipants(uint256 tournamentId) external view returns (uint256[] memory) {
        return participants[tournamentId];
    }

    function getCurrentRound(uint256 tournamentId) external view returns (uint256[] memory) {
        return _currentRound[tournamentId];
    }

    function getTournamentCount() external view returns (uint256) {
        return _nextTournamentId - 1;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _runRound(uint256 tournamentId) internal {
        Tournament storage t = tournaments[tournamentId];
        uint256 n    = _currentRound[tournamentId].length;
        uint256 pairs  = n / 2;
        uint256 hasBye = n % 2;

        uint256[] memory next = new uint256[](pairs + hasBye);
        uint8 roundNum = t.currentRoundNum;

        for (uint256 i = 0; i < pairs; i++) {
            uint256 f1 = _currentRound[tournamentId][2 * i];
            uint256 f2 = _currentRound[tournamentId][2 * i + 1];
            uint256 w  = _pickWinner(f1, f2);
            next[i]    = w;
            emit MatchPlayed(tournamentId, roundNum, f1, f2, w);
        }
        if (hasBye > 0) {
            next[pairs] = _currentRound[tournamentId][n - 1];
        }

        emit RoundCompleted(tournamentId, roundNum, next);

        // Replace _currentRound with survivors
        delete _currentRound[tournamentId];
        for (uint256 i = 0; i < next.length; i++) {
            _currentRound[tournamentId].push(next[i]);
        }

        if (next.length == 1) {
            _finishTournament(tournamentId, next[0]);
        } else {
            t.currentRoundNum++;
            t.nextRoundTime = block.timestamp + ROUND_DELAY;
        }
    }

    function _finishTournament(uint256 tournamentId, uint256 champion) internal {
        Tournament storage t = tournaments[tournamentId];
        address winnerAddr = creatureNFT.ownerOf(champion);

        t.winner        = champion;
        t.winnerAddress = winnerAddr;
        t.state         = TournamentState.Finished;

        creatureNFT.recordWin(champion);
        creatureNFT.addXP(champion, 200);

        uint256 prize = t.prizePool;
        if (prize > 0) payable(winnerAddr).transfer(prize);
        arenaToken.mint(winnerAddr, WINNER_ARENA_REWARD);

        _addRep(winnerAddr, 20, "Tournament champion");
        uint256[] storage parts = participants[tournamentId];
        for (uint256 i = 0; i < parts.length; i++) {
            address pAddr = creatureNFT.ownerOf(parts[i]);
            if (pAddr != winnerAddr) {
                _addRep(pAddr, 5, "Tournament participation");
            }
        }

        emit TournamentFinished(tournamentId, champion, winnerAddr, prize, WINNER_ARENA_REWARD);
    }

    /**
     * @dev Pick winner using stat power + 85-115% random variance so upsets are possible.
     */
    function _pickWinner(uint256 id1, uint256 id2) internal returns (uint256) {
        if (id2 == 0) return id1;
        CreatureNFT.Stats memory s1 = creatureNFT.getStats(id1);
        CreatureNFT.Stats memory s2 = creatureNFT.getStats(id2);

        _tournamentNonce++;
        uint256 rng = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, id1, id2, _tournamentNonce
        )));
        uint256 v1 = 85 + (rng & 0xFF) % 31;         // 85-115
        uint256 v2 = 85 + ((rng >> 8) & 0xFF) % 31;  // 85-115

        uint256 power1 = (s1.atk + s1.def + s1.spd + s1.hp) * v1;
        uint256 power2 = (s2.atk + s2.def + s2.spd + s2.hp) * v2;

        return power1 >= power2 ? id1 : id2;
    }

    function _addRep(address user, uint256 amount, string memory reason) internal {
        if (address(reputation) != address(0)) {
            try reputation.addReputation(user, amount, reason) {} catch {}
        }
    }

    receive() external payable {}
}
