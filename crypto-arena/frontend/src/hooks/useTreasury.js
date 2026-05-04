import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

export function useTreasury(contracts, account) {
  const [balance, setBalance]         = useState("0");
  const [totalReceived, setReceived]  = useState("0");
  const [totalAllocated, setAllocated]= useState("0");
  const [allocations, setAllocations] = useState([]);
  const [isAdmin, setIsAdmin]         = useState(false);
  const [loading, setLoading]         = useState(false);

  // Reset admin flag immediately when account switches so stale state never shows
  useEffect(() => { setIsAdmin(false); }, [account]);

  const fetchTreasury = useCallback(async () => {
    if (!contracts.treasury) return;
    try {
      const [bal, recv, alloc, history] = await Promise.all([
        contracts.treasury.getBalance(),
        contracts.treasury.totalReceived(),
        contracts.treasury.totalAllocated(),
        contracts.treasury.getAllocations(),
      ]);
      setBalance(ethers.formatEther(bal));
      setReceived(ethers.formatEther(recv));
      setAllocated(ethers.formatEther(alloc));
      setAllocations(
        [...history].reverse().map(a => ({
          recipient: a.recipient,
          amount:    ethers.formatEther(a.amount),
          reason:    a.reason,
          timestamp: Number(a.timestamp),
        }))
      );

      // Check if connected wallet is admin
      if (account) {
        try {
          const adminRole = await contracts.treasury.ADMIN_ROLE();
          const admin     = await contracts.treasury.hasRole(adminRole, account);
          setIsAdmin(admin);
        } catch { setIsAdmin(false); }
      }
    } catch (e) {
      console.error("fetchTreasury:", e);
    }
  }, [contracts.treasury, account]);

  const allocateFunds = useCallback(async (recipient, amountEth, reason) => {
    if (!contracts.treasury) return;

    // Normalize address — prevents ethers v6 ENS resolution on local networks
    let checksummed;
    try {
      checksummed = ethers.getAddress(recipient);
    } catch {
      toast.error("Invalid Ethereum address");
      return;
    }

    setLoading(true);
    try {
      const tx = await contracts.treasury.allocate(
        checksummed,
        ethers.parseEther(amountEth),
        reason
      );
      await tx.wait();
      toast.success(`Allocated ${amountEth} ETH to ${checksummed.slice(0, 8)}…`);
      await fetchTreasury();
    } catch (e) {
      toast.error(e.reason || e.message || "Allocation failed");
    } finally {
      setLoading(false);
    }
  }, [contracts.treasury, fetchTreasury]);

  return { balance, totalReceived, totalAllocated, allocations, isAdmin, loading, fetchTreasury, allocateFunds };
}
