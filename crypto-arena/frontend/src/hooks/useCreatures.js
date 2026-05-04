import { useState, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { ELEMENT_NAMES, RARITY_NAMES, ELEMENT_EMOJIS, RARITY_COLORS, CONTRACT_ADDRESSES } from "../config.js";

export function useCreatures(contracts, account) {
  const [creatures, setCreatures]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [arenaBalance, setArenaBalance] = useState("0");

  // Parse raw contract data into a displayable object
  const parseCreature = useCallback(async (id, contracts) => {
    const [c, stats] = await Promise.all([
      contracts.creatureNFT.getCreature(id),
      contracts.creatureNFT.getStats(id),
    ]);
    const dna     = c.dna.toString();
    const elemIdx = Number(stats.element);
    const rarIdx  = Number(stats.rarity);
    return {
      id:           Number(id),
      name:         c.creatureName,
      dna:          dna,
      level:        Number(c.level),
      xp:           Number(c.xp),
      winCount:     Number(c.winCount),
      lossCount:    Number(c.lossCount),
      breedCount:   Number(c.breedCount),
      element:      elemIdx,
      elementName:  ELEMENT_NAMES[elemIdx],
      elementEmoji: ELEMENT_EMOJIS[elemIdx],
      rarity:       rarIdx,
      rarityName:   RARITY_NAMES[rarIdx],
      rarityColor:  RARITY_COLORS[rarIdx],
      stats: {
        atk: Number(stats.atk),
        def: Number(stats.def),
        spd: Number(stats.spd),
        hp:  Number(stats.hp),
      },
      avatarUrl: `https://robohash.org/${dna}?set=set2&size=200x200`,
    };
  }, []);

  const fetchMyCreatures = useCallback(async () => {
    if (!contracts.creatureNFT || !account) return;
    setLoading(true);
    try {
      const ids = await contracts.creatureNFT.getOwnerCreatures(account);
      const parsed = await Promise.all(ids.map(id => parseCreature(id, contracts)));
      setCreatures(parsed);

      const bal = await contracts.arenaToken.balanceOf(account);
      setArenaBalance(ethers.formatEther(bal));
    } catch (e) {
      console.error("fetchMyCreatures:", e);
      toast.error("Failed to load creatures. Are you on the Hardhat network?");
    } finally {
      setLoading(false);
    }
  }, [contracts, account, parseCreature]);

  const mintCreature = useCallback(async (name) => {
    if (!contracts.creatureNFT) return;
    const t = toast.loading("Minting creature…");
    try {
      // Hardcoded to match MINT_FEE constant in CreatureNFT.sol (0.01 ether)
      const fee = ethers.parseEther("0.01");
      const tx  = await contracts.creatureNFT.mintCreature(name, { value: fee });
      await tx.wait();
      toast.success("Creature minted!", { id: t });
      await fetchMyCreatures();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchMyCreatures]);

  const breedCreatures = useCallback(async (parent1Id, parent2Id, childName) => {
    if (!contracts.creatureNFT || !contracts.arenaToken) return;
    const t = toast.loading("Breeding creatures…");
    try {
      // Approve a generous amount covering all rarity tiers (max is 500 ARENA for Legendary)
      const maxBreedCost = ethers.parseEther("500");
      const nftAddr = CONTRACT_ADDRESSES.CreatureNFT;
      await (await contracts.arenaToken.approve(nftAddr, maxBreedCost)).wait();
      const tx = await contracts.creatureNFT.breed(parent1Id, parent2Id, childName);
      await tx.wait();
      toast.success("New creature born! Parents consumed. 🧬", { id: t });
      await fetchMyCreatures();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchMyCreatures]);

  const levelUpCreature = useCallback(async (tokenId) => {
    if (!contracts.creatureNFT || !contracts.arenaToken) return;
    const t = toast.loading("Levelling up…");
    try {
      // Hardcoded to match LEVEL_UP_COST constant in CreatureNFT.sol (20 ARENA)
      const cost = ethers.parseEther("20");
      const nftAddr = CONTRACT_ADDRESSES.CreatureNFT;
      await (await contracts.arenaToken.approve(nftAddr, cost)).wait();
      const tx = await contracts.creatureNFT.levelUp(tokenId);
      await tx.wait();
      toast.success("Level up! 🎉", { id: t });
      await fetchMyCreatures();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchMyCreatures]);

  return { creatures, loading, arenaBalance, fetchMyCreatures, mintCreature, breedCreatures, levelUpCreature, parseCreature };
}
