import { useState, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { CONTRACT_ADDRESSES } from "../config.js";

export function useMarketplace(contracts, account, parseCreature) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading]   = useState(false);

  const fetchListings = useCallback(async () => {
    if (!contracts.marketplace || !contracts.creatureNFT) return;
    setLoading(true);
    try {
      const [rawListings, ids] = await contracts.marketplace.getActiveListings(1, 100);
      const enriched = await Promise.all(
        rawListings.map(async (l, i) => {
          const creature = await parseCreature(l.tokenId, contracts);
          return {
            listingId:       Number(ids[i]),
            tokenId:         Number(l.tokenId),
            seller:          l.seller,
            price:           l.price,
            priceEth:        ethers.formatEther(l.price),
            reservePrice:    l.reservePrice,
            reservePriceEth: ethers.formatEther(l.reservePrice),
            highestBid:      l.highestBid,
            highestBidEth:   ethers.formatEther(l.highestBid),
            auctionEnd:      Number(l.auctionEnd),
            listingType:     Number(l.listingType), // 0=Fixed, 1=Auction
            creature,
          };
        })
      );
      setListings(enriched);
    } catch (e) {
      console.error("fetchListings:", e);
    } finally {
      setLoading(false);
    }
  }, [contracts, parseCreature]);

  const listFixed = useCallback(async (tokenId, priceEth) => {
    if (!contracts.marketplace || !contracts.creatureNFT) return;
    const t = toast.loading("Listing for sale…");
    try {
      const price = ethers.parseEther(priceEth);
      await (await contracts.creatureNFT.approve(CONTRACT_ADDRESSES.Marketplace, tokenId)).wait();
      await (await contracts.marketplace.listFixed(tokenId, price)).wait();
      toast.success("Listed!", { id: t });
      await fetchListings();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchListings]);

  // reservePriceEth = "0" means no reserve
  const listAuction = useCallback(async (tokenId, startPriceEth, reservePriceEth, durationSecs) => {
    if (!contracts.marketplace || !contracts.creatureNFT) return;
    const t = toast.loading("Creating auction…");
    try {
      const price   = ethers.parseEther(startPriceEth);
      const reserve = reservePriceEth && parseFloat(reservePriceEth) > 0
        ? ethers.parseEther(reservePriceEth)
        : 0n;
      await (await contracts.creatureNFT.approve(CONTRACT_ADDRESSES.Marketplace, tokenId)).wait();
      await (await contracts.marketplace.listAuction(tokenId, price, reserve, durationSecs)).wait();
      toast.success("Auction started!", { id: t });
      await fetchListings();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchListings]);

  const buyFixed = useCallback(async (listingId, priceWei) => {
    if (!contracts.marketplace) return;
    const t = toast.loading("Buying creature…");
    try {
      await (await contracts.marketplace.buy(listingId, { value: priceWei })).wait();
      toast.success("Creature purchased!", { id: t });
      await fetchListings();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchListings]);

  const placeBid = useCallback(async (listingId, bidEth) => {
    if (!contracts.marketplace) return;
    const t = toast.loading("Placing bid…");
    try {
      await (await contracts.marketplace.bid(listingId, { value: ethers.parseEther(bidEth) })).wait();
      toast.success("Bid placed!", { id: t });
      await fetchListings();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchListings]);

  const finalizeAuction = useCallback(async (listingId) => {
    if (!contracts.marketplace) return;
    const t = toast.loading("Finalizing auction…");
    try {
      const tx      = await contracts.marketplace.finalizeAuction(listingId);
      const receipt = await tx.wait();
      const iface   = contracts.marketplace.interface;

      const finalLog = receipt.logs.find(l => {
        try { return iface.parseLog(l).name === "AuctionFinalized"; } catch { return false; }
      });

      if (finalLog) {
        const ev     = iface.parseLog(finalLog);
        const winner = ev.args.winner;
        const amount = ethers.formatEther(ev.args.amount);
        toast.success(
          `Auction settled! Winner: ${winner.slice(0, 6)}…${winner.slice(-4)} · ${amount} ETH`,
          { id: t, duration: 8000 }
        );
      } else {
        toast.success("Auction ended — no valid bids. Creature returned.", { id: t });
      }
      await fetchListings();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchListings]);

  const cancelListing = useCallback(async (listingId) => {
    if (!contracts.marketplace) return;
    const t = toast.loading("Cancelling listing…");
    try {
      await (await contracts.marketplace.cancel(listingId)).wait();
      toast.success("Listing cancelled.", { id: t });
      await fetchListings();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, fetchListings]);

  // ── Batch operations (Feature 15) ─────────────────────────────────────────

  const batchListFixed = useCallback(async (tokenIds, pricesEth) => {
    if (!contracts.marketplace || !contracts.creatureNFT) return;
    const t = toast.loading(`Batch listing ${tokenIds.length} creatures…`);
    try {
      // setApprovalForAll covers all tokens in one tx
      const isApproved = await contracts.creatureNFT.isApprovedForAll(
        account, CONTRACT_ADDRESSES.Marketplace
      );
      if (!isApproved) {
        await (await contracts.creatureNFT.setApprovalForAll(CONTRACT_ADDRESSES.Marketplace, true)).wait();
      }
      const prices = pricesEth.map(p => ethers.parseEther(p));
      await (await contracts.marketplace.batchListFixed(tokenIds, prices)).wait();
      toast.success(`${tokenIds.length} creatures listed in one transaction!`, { id: t });
      await fetchListings();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, account, fetchListings]);

  const batchBuy = useCallback(async (listingIds) => {
    if (!contracts.marketplace) return;
    const t = toast.loading(`Buying ${listingIds.length} creatures…`);
    try {
      // Sum up total cost from current listing state
      const relevant = listingIds.map(id => listings.find(l => l.listingId === id)).filter(Boolean);
      const totalWei = relevant.reduce((sum, l) => sum + l.price, 0n);
      await (await contracts.marketplace.batchBuy(listingIds, { value: totalWei })).wait();
      toast.success(`${listingIds.length} creatures purchased in one transaction!`, { id: t });
      await fetchListings();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    }
  }, [contracts, listings, fetchListings]);

  const myListings    = listings.filter(l => l.seller.toLowerCase() === account?.toLowerCase());
  const otherListings = listings.filter(l => l.seller.toLowerCase() !== account?.toLowerCase());

  return {
    listings, myListings, otherListings, loading, fetchListings,
    listFixed, listAuction, buyFixed, placeBid, finalizeAuction, cancelListing,
    batchListFixed, batchBuy,
  };
}
