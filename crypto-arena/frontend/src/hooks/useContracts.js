import { useMemo } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES } from "../config.js";
import ArenaTokenABI         from "../abi/ArenaToken.json";
import CreatureNFTABI        from "../abi/CreatureNFT.json";
import BattleEngineABI       from "../abi/BattleEngine.json";
import MarketplaceABI        from "../abi/Marketplace.json";
import TournamentManagerABI  from "../abi/TournamentManager.json";
import TreasuryABI           from "../abi/Treasury.json";
import ReputationSystemABI   from "../abi/ReputationSystem.json";
import GameItemsABI          from "../abi/GameItems.json";
import EscrowABI             from "../abi/Escrow.json";
import DisputeResolutionABI  from "../abi/DisputeResolution.json";

export function useContracts(signer) {
  return useMemo(() => {
    if (!signer) return {};
    const make = (addr, abi) => new ethers.Contract(addr, abi, signer);
    return {
      arenaToken:        make(CONTRACT_ADDRESSES.ArenaToken,        ArenaTokenABI),
      creatureNFT:       make(CONTRACT_ADDRESSES.CreatureNFT,       CreatureNFTABI),
      battleEngine:      make(CONTRACT_ADDRESSES.BattleEngine,      BattleEngineABI),
      marketplace:       make(CONTRACT_ADDRESSES.Marketplace,       MarketplaceABI),
      tournamentManager: make(CONTRACT_ADDRESSES.TournamentManager, TournamentManagerABI),
      treasury:          make(CONTRACT_ADDRESSES.Treasury,          TreasuryABI),
      reputationSystem:  make(CONTRACT_ADDRESSES.ReputationSystem,  ReputationSystemABI),
      gameItems:         make(CONTRACT_ADDRESSES.GameItems,         GameItemsABI),
      escrow:            make(CONTRACT_ADDRESSES.Escrow,            EscrowABI),
      disputeResolution: make(CONTRACT_ADDRESSES.DisputeResolution, DisputeResolutionABI),
    };
  }, [signer]);
}
