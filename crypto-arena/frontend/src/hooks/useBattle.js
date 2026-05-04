import { useState, useCallback, useEffect } from "react";
import toast from "react-hot-toast";

const COOLDOWN_MS = 60_000; // 1 minute — must match BattleEngine.sol BATTLE_COOLDOWN

export function useBattle(contracts, parseCreature, account) {
  const [battleResult, setBattleResult]   = useState(null);
  const [battling, setBattling]           = useState(false);
  const [allCreatures, setAllCreatures]   = useState([]);
  const [loadingAll, setLoadingAll]       = useState(false);
  const [cooldownMap, setCooldownMap]     = useState({});
  const [incomingChallenges, setIncomingChallenges] = useState([]);
  const [outgoingChallenges, setOutgoingChallenges] = useState([]);

  // Clear stale result when the connected wallet changes
  useEffect(() => {
    setBattleResult(null);
    setCooldownMap({});
  }, [account]);

  // ── Fetch all on-chain creatures ──────────────────────────────────────────

  const fetchAllCreatures = useCallback(async () => {
    if (!contracts.creatureNFT) return;
    setLoadingAll(true);
    try {
      const total    = Number(await contracts.creatureNFT.totalSupply());
      const tokenIds = await Promise.all(
        Array.from({ length: total }, (_, i) => contracts.creatureNFT.tokenByIndex(i))
      );
      const parsed = await Promise.all(tokenIds.map(id => parseCreature(id, contracts)));
      setAllCreatures(parsed);
    } catch (e) {
      console.error("fetchAllCreatures:", e);
    } finally {
      setLoadingAll(false);
    }
  }, [contracts, parseCreature]);

  // ── Fetch pending challenges for the connected account ────────────────────

  const fetchChallenges = useCallback(async () => {
    if (!contracts.battleEngine || !account) return;
    try {
      const [inIds, outIds] = await Promise.all([
        contracts.battleEngine.getIncomingChallenges(account),
        contracts.battleEngine.getOutgoingChallenges(account),
      ]);

      const resolveChallenge = async (id) => {
        const c = await contracts.battleEngine.challenges(id);
        if (!c.active) return null;
        try {
          const [cCreature, tCreature] = await Promise.all([
            parseCreature(c.challengerTokenId, contracts),
            parseCreature(c.targetTokenId, contracts),
          ]);
          return {
            id:                Number(id),
            challengerTokenId: Number(c.challengerTokenId),
            targetTokenId:     Number(c.targetTokenId),
            challenger:        c.challenger,
            challengerCreature: cCreature,
            targetCreature:     tCreature,
          };
        } catch {
          return null; // creature may have been burned
        }
      };

      const [inc, out] = await Promise.all([
        Promise.all(inIds.map(resolveChallenge)),
        Promise.all(outIds.map(resolveChallenge)),
      ]);

      setIncomingChallenges(inc.filter(Boolean));
      setOutgoingChallenges(out.filter(Boolean));
    } catch (e) {
      console.error("fetchChallenges:", e);
    }
  }, [contracts, account, parseCreature]);

  // ── Direct battle (you own both creatures — useful for quick demos) ────────

  const doBattle = useCallback(async (myId, targetId, onDone) => {
    if (!contracts.battleEngine) return;
    setBattling(true);
    setBattleResult(null);
    const t = toast.loading("Battle in progress…");
    try {
      const tx      = await contracts.battleEngine.battle(myId, targetId);
      const receipt = await tx.wait();

      const result = _parseBattleResult(contracts.battleEngine.interface, receipt, myId);
      setBattleResult(result);
      _setCooldowns(setCooldownMap, myId, targetId);

      toast.success(
        result.winnerId === Number(myId)
          ? `Victory! +${(Number(result.reward) / 1e18).toFixed(0)} ARENA`
          : "Defeat! Keep training.",
        { id: t }
      );
      onDone?.();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    } finally {
      setBattling(false);
    }
  }, [contracts]);

  // ── Challenge flow ────────────────────────────────────────────────────────

  const createChallenge = useCallback(async (myId, targetId) => {
    if (!contracts.battleEngine) return;
    const t = toast.loading("Sending challenge…");
    try {
      await (await contracts.battleEngine.createChallenge(myId, targetId)).wait();
      toast.success("Challenge sent! Waiting for opponent to accept.", { id: t, duration: 5000 });
      await fetchChallenges();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchChallenges]);

  const acceptChallenge = useCallback(async (challengeId, targetTokenId, onDone) => {
    if (!contracts.battleEngine) return;
    setBattling(true);
    setBattleResult(null);
    const t = toast.loading("Accepting challenge — battle in progress…");
    try {
      const tx      = await contracts.battleEngine.acceptChallenge(challengeId);
      const receipt = await tx.wait();

      const result = _parseBattleResult(contracts.battleEngine.interface, receipt, targetTokenId);
      setBattleResult(result);

      // Extract both creature IDs from the BattleResult event
      const iface = contracts.battleEngine.interface;
      const log   = receipt.logs.find(l => { try { return iface.parseLog(l).name === "BattleResult"; } catch { return false; } });
      if (log) {
        const ev = iface.parseLog(log);
        _setCooldowns(setCooldownMap, Number(ev.args.winnerId), Number(ev.args.loserId));
      }

      const won = result.winnerId === Number(targetTokenId);
      toast.success(
        won
          ? `You won! +${(Number(result.reward) / 1e18).toFixed(0)} ARENA 🏆`
          : `You lost! Challenger wins. +10 XP consolation.`,
        { id: t, duration: 5000 }
      );
      await fetchChallenges();
      onDone?.();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    } finally {
      setBattling(false);
    }
  }, [contracts, fetchChallenges]);

  const cancelChallenge = useCallback(async (challengeId) => {
    if (!contracts.battleEngine) return;
    const t = toast.loading("Cancelling challenge…");
    try {
      await (await contracts.battleEngine.cancelChallenge(challengeId)).wait();
      toast.success("Challenge cancelled.", { id: t });
      await fetchChallenges();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchChallenges]);

  const declineChallenge = useCallback(async (challengeId) => {
    if (!contracts.battleEngine) return;
    const t = toast.loading("Declining challenge…");
    try {
      await (await contracts.battleEngine.declineChallenge(challengeId)).wait();
      toast.success("Challenge declined.", { id: t });
      await fetchChallenges();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchChallenges]);

  return {
    battleResult, battling,
    allCreatures, loadingAll, fetchAllCreatures,
    incomingChallenges, outgoingChallenges, fetchChallenges,
    doBattle,
    createChallenge, acceptChallenge, cancelChallenge, declineChallenge,
    cooldownMap,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _parseBattleResult(iface, receipt, myTokenId) {
  const log = receipt.logs.find(l => { try { return iface.parseLog(l).name === "BattleResult"; } catch { return false; } });
  if (!log) return null;
  const ev = iface.parseLog(log);
  return {
    winnerId:  Number(ev.args.winnerId),
    loserId:   Number(ev.args.loserId),
    reward:    ev.args.arenaRewarded,
    myId:      Number(myTokenId),
  };
}

function _setCooldowns(setCooldownMap, id1, id2) {
  const endTime = Date.now() + COOLDOWN_MS;
  setCooldownMap(m => ({ ...m, [id1]: endTime, [id2]: endTime }));
}
