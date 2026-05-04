import { useState, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

const STAKE_AMOUNT = "100"; // 100 ARENA

export function useDispute(contracts, account) {
  const [disputes, setDisputes]       = useState([]);
  const [isArbitrator, setIsArb]      = useState(false);
  const [poolSize, setPoolSize]        = useState(0);
  const [stakedAmount, setStaked]      = useState("0");
  const [loading, setLoading]          = useState(false);
  const [acting, setActing]            = useState(false);

  const fetchDisputes = useCallback(async () => {
    if (!contracts.disputeResolution || !account) return;
    setLoading(true);
    try {
      const [isArb, pool, staked, count] = await Promise.all([
        contracts.disputeResolution.isArbitrator(account),
        contracts.disputeResolution.poolSize(),
        contracts.disputeResolution.stakedAmount(account),
        contracts.disputeResolution.getDisputeCount(),
      ]);
      setIsArb(isArb);
      setPoolSize(Number(pool));
      setStaked(ethers.formatEther(staked));

      const result = [];
      for (let i = 1; i <= Number(count); i++) {
        const d = await contracts.disputeResolution.getDispute(i);
        // Only show disputes assigned to this arbitrator or as buyer/seller
        const isMyDispute =
          d.buyer.toLowerCase()  === account.toLowerCase() ||
          d.seller.toLowerCase() === account.toLowerCase() ||
          d.arbitrators.some(a => a.toLowerCase() === account.toLowerCase());

        if (isMyDispute) {
          const mySlot = d.arbitrators.findIndex(a => a.toLowerCase() === account.toLowerCase());
          const myVote = mySlot >= 0 ? Number(d.votes[mySlot]) : -1;

          const votes      = d.votes.map(Number);
          const buyerVotes  = votes.filter(v => v === 1).length;
          const sellerVotes = votes.filter(v => v === 2).length;
          // outcome: 0=None 1=BuyerWon 2=SellerWon
          const outcome    = Number(d.outcome ?? 0);

          result.push({
            id:           i,
            escrowId:     Number(d.escrowId),
            buyer:        d.buyer,
            seller:       d.seller,
            amount:       ethers.formatEther(d.amount),
            arbitrators:  d.arbitrators,
            votes,
            voteCount:    Number(d.voteCount),
            buyerVotes,
            sellerVotes,
            deadline:     Number(d.deadline),
            resolved:     Number(d.status) === 1,
            outcome,
            isBuyer:      d.buyer.toLowerCase()  === account.toLowerCase(),
            isSeller:     d.seller.toLowerCase() === account.toLowerCase(),
            isArbitrator: mySlot >= 0,
            mySlot,
            myVote, // 0=None 1=FavorBuyer 2=FavorSeller
          });
        }
      }
      setDisputes(result);
    } catch (e) {
      console.error("fetchDisputes:", e);
    } finally {
      setLoading(false);
    }
  }, [contracts.disputeResolution, account]);

  // ── Arbitrator actions ────────────────────────────────────────────────────

  const stake = useCallback(async () => {
    if (!contracts.disputeResolution || !contracts.arenaToken) return;
    setActing(true);
    try {
      const drAddr = await contracts.disputeResolution.getAddress();
      const cost   = ethers.parseEther(STAKE_AMOUNT);
      const allowance = await contracts.arenaToken.allowance(account, drAddr);
      if (allowance < cost) {
        const approveTx = await contracts.arenaToken.approve(drAddr, cost);
        await approveTx.wait();
      }
      const tx = await contracts.disputeResolution.stakeToArbitrate();
      await tx.wait();
      toast.success(`Staked ${STAKE_AMOUNT} ARENA — you are now an arbitrator!`);
      await fetchDisputes();
    } catch (e) {
      toast.error(e.reason || e.message || "Staking failed");
    } finally {
      setActing(false);
    }
  }, [contracts, account, fetchDisputes]);

  const unstake = useCallback(async () => {
    if (!contracts.disputeResolution) return;
    setActing(true);
    try {
      const tx = await contracts.disputeResolution.unstake();
      await tx.wait();
      toast.success("Unstaked — ARENA returned.");
      await fetchDisputes();
    } catch (e) {
      toast.error(e.reason || e.message || "Unstake failed");
    } finally {
      setActing(false);
    }
  }, [contracts.disputeResolution, fetchDisputes]);

  const vote = useCallback(async (disputeId, favorBuyer) => {
    if (!contracts.disputeResolution) return;
    setActing(true);
    try {
      const tx = await contracts.disputeResolution.vote(disputeId, favorBuyer);
      await tx.wait();
      toast.success(`Vote cast: ${favorBuyer ? "Favor Buyer" : "Favor Seller"}. +20 ARENA earned!`);
      await fetchDisputes();
    } catch (e) {
      toast.error(e.reason || e.message || "Vote failed");
    } finally {
      setActing(false);
    }
  }, [contracts.disputeResolution, fetchDisputes]);

  const forceResolve = useCallback(async (disputeId) => {
    if (!contracts.disputeResolution) return;
    setActing(true);
    try {
      const tx = await contracts.disputeResolution.forceResolve(disputeId);
      await tx.wait();
      toast.success("Dispute resolved by majority vote.");
      await fetchDisputes();
    } catch (e) {
      toast.error(e.reason || e.message || "Force resolve failed");
    } finally {
      setActing(false);
    }
  }, [contracts.disputeResolution, fetchDisputes]);

  return {
    disputes, isArbitrator, poolSize, stakedAmount, loading, acting,
    fetchDisputes, stake, unstake, vote, forceResolve,
    STAKE_AMOUNT,
  };
}
