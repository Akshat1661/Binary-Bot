import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { CHAIN_CONFIG } from "../config.js";

export function useWallet() {
  const [provider, setProvider]   = useState(null);
  const [signer, setSigner]       = useState(null);
  const [account, setAccount]     = useState(null);
  const [chainId, setChainId]     = useState(null);
  const [connecting, setConnecting] = useState(false);

  const isCorrectChain = chainId !== null && Number(chainId) === CHAIN_CONFIG.chainId;

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      toast.error("MetaMask not found. Please install it.");
      return;
    }
    setConnecting(true);
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const p  = new ethers.BrowserProvider(window.ethereum);
      const s  = await p.getSigner();
      const n  = await p.getNetwork();
      setProvider(p);
      setSigner(s);
      setAccount(await s.getAddress());
      setChainId(Number(n.chainId));
    } catch (e) {
      toast.error("Connection failed: " + (e.reason || e.message));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + CHAIN_CONFIG.chainId.toString(16) }],
      });
    } catch (e) {
      toast.error("Could not switch network.");
    }
  }, []);

  // Sync on metamask events
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (accounts) => {
      if (accounts.length === 0) disconnect();
      else connect();
    };
    const onChain = () => connect();
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, [connect, disconnect]);

  return { provider, signer, account, chainId, connecting, isCorrectChain, connect, disconnect, switchNetwork };
}
