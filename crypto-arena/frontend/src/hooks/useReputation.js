import { useState, useCallback } from "react";
import { ethers } from "ethers";

export function useReputation(contracts, account) {
  const [reputation, setReputation]   = useState(0);
  const [hasToken, setHasToken]       = useState(false);
  const [history, setHistory]         = useState([]);
  const [loading, setLoading]         = useState(false);

  const fetchReputation = useCallback(async () => {
    if (!contracts.reputationSystem || !account) return;
    try {
      const [rep, tok] = await Promise.all([
        contracts.reputationSystem.getReputation(account),
        contracts.reputationSystem.hasToken(account),
      ]);
      setReputation(Number(rep));
      setHasToken(tok);

      // Fetch reputation history via events
      const filter = contracts.reputationSystem.filters.ReputationUpdated(account);
      const logs   = await contracts.reputationSystem.queryFilter(filter);
      const parsed = logs.map(l => ({
        newScore: Number(l.args.newScore),
        delta:    Number(l.args.delta),
        reason:   l.args.reason,
        blockNum: l.blockNumber,
      })).reverse(); // newest first
      setHistory(parsed);
    } catch (e) {
      console.error("fetchReputation:", e);
    }
  }, [contracts.reputationSystem, account]);

  const fetchOtherReputation = useCallback(async (address) => {
    if (!contracts.reputationSystem || !ethers.isAddress(address)) return null;
    try {
      return Number(await contracts.reputationSystem.getReputation(address));
    } catch {
      return null;
    }
  }, [contracts.reputationSystem]);

  return { reputation, hasToken, history, loading, fetchReputation, fetchOtherReputation };
}
