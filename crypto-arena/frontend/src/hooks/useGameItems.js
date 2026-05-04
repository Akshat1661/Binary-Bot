import { useState, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { ITEM_NAMES, ITEM_EMOJIS, ITEM_DESCS } from "../config.js";

const ITEM_IDS = [0, 1, 2];

export function useGameItems(contracts, account) {
  const [balances, setBalances] = useState([0, 0, 0]);
  const [prices, setPrices]     = useState(["0", "0", "0"]);
  const [loading, setLoading]   = useState(false);

  const fetchItems = useCallback(async () => {
    if (!contracts.gameItems || !account) return;
    try {
      const [bals, priceArr] = await Promise.all([
        contracts.gameItems.getBalances(account),
        contracts.gameItems.getAllPrices(),
      ]);
      setBalances(bals.map(Number));
      setPrices(priceArr.map(p => ethers.formatEther(p)));
    } catch (e) {
      console.error("fetchItems:", e);
    }
  }, [contracts.gameItems, account]);

  // ── Buy ───────────────────────────────────────────────────────────────────

  const buyItem = useCallback(async (itemId, quantity) => {
    if (!contracts.gameItems || !contracts.arenaToken) return;
    setLoading(true);
    try {
      const cost = ethers.parseEther(prices[itemId]) * BigInt(quantity);

      // Approve first
      const allowance = await contracts.arenaToken.allowance(account, await contracts.gameItems.getAddress());
      if (allowance < cost) {
        const approveTx = await contracts.arenaToken.approve(await contracts.gameItems.getAddress(), cost);
        await approveTx.wait();
      }

      const tx = await contracts.gameItems.buyItem(itemId, quantity);
      await tx.wait();
      toast.success(`Bought ${quantity}× ${ITEM_NAMES[itemId]}!`);
      await fetchItems();
    } catch (e) {
      toast.error(e.reason || e.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  }, [contracts, account, prices, fetchItems]);

  // ── Use ───────────────────────────────────────────────────────────────────

  const useXPPotion = useCallback(async (tokenId) => {
    if (!contracts.gameItems) return;
    setLoading(true);
    try {
      const tx = await contracts.gameItems.useXPPotion(tokenId);
      await tx.wait();
      toast.success("XP Potion used — +100 XP!");
      await fetchItems();
    } catch (e) {
      toast.error(e.reason || e.message || "Use failed");
    } finally {
      setLoading(false);
    }
  }, [contracts.gameItems, fetchItems]);

  const useBreedBoost = useCallback(async (tokenId) => {
    if (!contracts.gameItems) return;
    setLoading(true);
    try {
      const tx = await contracts.gameItems.useBreedBoost(tokenId);
      await tx.wait();
      toast.success("Breed Boost used — +200 XP!");
      await fetchItems();
    } catch (e) {
      toast.error(e.reason || e.message || "Use failed");
    } finally {
      setLoading(false);
    }
  }, [contracts.gameItems, fetchItems]);

  const useBattleBoost = useCallback(async (tokenId) => {
    if (!contracts.gameItems) return;
    setLoading(true);
    try {
      const tx = await contracts.gameItems.useBattleBoost(tokenId);
      await tx.wait();
      toast.success("Battle Boost used — +50 XP + 1 Win!");
      await fetchItems();
    } catch (e) {
      toast.error(e.reason || e.message || "Use failed");
    } finally {
      setLoading(false);
    }
  }, [contracts.gameItems, fetchItems]);

  const items = ITEM_IDS.map(id => ({
    id,
    name:    ITEM_NAMES[id],
    emoji:   ITEM_EMOJIS[id],
    desc:    ITEM_DESCS[id],
    price:   prices[id],
    balance: balances[id],
  }));

  return { items, loading, fetchItems, buyItem, useXPPotion, useBreedBoost, useBattleBoost };
}
