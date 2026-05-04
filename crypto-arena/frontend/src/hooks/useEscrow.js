import { useState, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

const STATUS_LABELS = [
  "Awaiting Buyer",
  "Awaiting Confirmation",
  "Confirmed",
  "Auto-Released",
  "Disputed",
  "Resolved: Buyer Won",
  "Resolved: Seller Won",
  "Cancelled",
];

export function useEscrow(contracts, account) {
  const [escrows, setEscrows]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [acting, setActing]     = useState(false);

  const fetchEscrows = useCallback(async () => {
    if (!contracts.escrow || !contracts.creatureNFT) return;
    setLoading(true);
    try {
      const count = Number(await contracts.escrow.getCount());
      const result = [];
      for (let i = 1; i <= count; i++) {
        const e = await contracts.escrow.getEscrow(i);
        // Only show escrows relevant to this account (seller or buyer)
        if (
          e.seller.toLowerCase() === account.toLowerCase() ||
          e.buyer.toLowerCase()  === account.toLowerCase() ||
          e.status === 0n // AwaitingBuyer — show all open ones
        ) {
          let creatureName = `#${e.tokenId}`;
          let avatarUrl    = `https://robohash.org/${e.tokenId}?set=set2`;
          try {
            const c = await contracts.creatureNFT.getCreature(e.tokenId);
            creatureName = c.creatureName;
            avatarUrl = `https://robohash.org/${c.dna}?set=set2`;
          } catch {}

          result.push({
            id:           i,
            seller:       e.seller,
            buyer:        e.buyer,
            tokenId:      Number(e.tokenId),
            price:        ethers.formatEther(e.price),
            priceWei:     e.price,
            deadline:     Number(e.deadline),
            status:       Number(e.status),
            statusLabel:  STATUS_LABELS[Number(e.status)] ?? "Unknown",
            creatureName,
            avatarUrl,
            isMySale:     e.seller.toLowerCase() === account.toLowerCase(),
            isMyPurchase: e.buyer.toLowerCase()  === account.toLowerCase(),
          });
        }
      }
      setEscrows(result);
    } catch (e) {
      console.error("fetchEscrows:", e);
    } finally {
      setLoading(false);
    }
  }, [contracts.escrow, contracts.creatureNFT, account]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const createEscrow = useCallback(async (tokenId, priceEth) => {
    if (!contracts.escrow || !contracts.creatureNFT) return;
    setActing(true);
    try {
      // Approve escrow contract to transfer the NFT
      const approveTx = await contracts.creatureNFT.approve(
        await contracts.escrow.getAddress(), tokenId
      );
      await approveTx.wait();

      const tx = await contracts.escrow.createEscrow(tokenId, ethers.parseEther(priceEth));
      await tx.wait();
      toast.success("Escrow created — waiting for a buyer.");
      await fetchEscrows();
    } catch (e) {
      toast.error(e.reason || e.message || "Create escrow failed");
    } finally {
      setActing(false);
    }
  }, [contracts.escrow, contracts.creatureNFT, fetchEscrows]);

  const acceptEscrow = useCallback(async (escrowId, priceWei) => {
    if (!contracts.escrow) return;
    setActing(true);
    try {
      const tx = await contracts.escrow.acceptEscrow(escrowId, { value: priceWei });
      await tx.wait();
      toast.success("Escrow accepted — ETH locked. Confirm when satisfied.");
      await fetchEscrows();
    } catch (e) {
      toast.error(e.reason || e.message || "Accept failed");
    } finally {
      setActing(false);
    }
  }, [contracts.escrow, fetchEscrows]);

  const confirmDelivery = useCallback(async (escrowId) => {
    if (!contracts.escrow) return;
    setActing(true);
    try {
      const tx = await contracts.escrow.confirmDelivery(escrowId);
      await tx.wait();
      toast.success("Delivery confirmed — ETH released to seller!");
      await fetchEscrows();
    } catch (e) {
      toast.error(e.reason || e.message || "Confirm failed");
    } finally {
      setActing(false);
    }
  }, [contracts.escrow, fetchEscrows]);

  const raiseDispute = useCallback(async (escrowId) => {
    if (!contracts.escrow) return;
    setActing(true);
    try {
      const tx = await contracts.escrow.raiseDispute(escrowId);
      await tx.wait();
      toast.success("Dispute raised — arbitrators will be assigned.");
      await fetchEscrows();
    } catch (e) {
      toast.error(e.reason || e.message || "Raise dispute failed");
    } finally {
      setActing(false);
    }
  }, [contracts.escrow, fetchEscrows]);

  const autoRelease = useCallback(async (escrowId) => {
    if (!contracts.escrow) return;
    setActing(true);
    try {
      const tx = await contracts.escrow.autoRelease(escrowId);
      await tx.wait();
      toast.success("Auto-released — deadline passed, ETH sent to seller.");
      await fetchEscrows();
    } catch (e) {
      toast.error(e.reason || e.message || "Auto-release failed");
    } finally {
      setActing(false);
    }
  }, [contracts.escrow, fetchEscrows]);

  const cancelEscrow = useCallback(async (escrowId) => {
    if (!contracts.escrow) return;
    setActing(true);
    try {
      const tx = await contracts.escrow.cancelEscrow(escrowId);
      await tx.wait();
      toast.success("Escrow cancelled — NFT returned.");
      await fetchEscrows();
    } catch (e) {
      toast.error(e.reason || e.message || "Cancel failed");
    } finally {
      setActing(false);
    }
  }, [contracts.escrow, fetchEscrows]);

  return {
    escrows, loading, acting, fetchEscrows,
    createEscrow, acceptEscrow, confirmDelivery,
    raiseDispute, autoRelease, cancelEscrow,
  };
}
