import { useEffect, useState } from "react";
import { ethers } from "ethers";
import Modal from "../components/Modal.jsx";

const TYPE_LABEL = ["Fixed Price", "Auction"];

function ListingCard({ listing, account, onBuy, onBid, onFinalize, onCancel, selected, onSelect }) {
  const [bidAmt, setBidAmt] = useState("");
  const isOwner    = listing.seller.toLowerCase() === account?.toLowerCase();
  const isAuction  = listing.listingType === 1;
  const ended      = isAuction && listing.auctionEnd > 0 && Date.now() / 1000 > listing.auctionEnd;
  const timeLeft   = isAuction ? Math.max(0, listing.auctionEnd - Math.floor(Date.now() / 1000)) : 0;
  const fmtTime    = timeLeft > 0
    ? timeLeft > 3600
      ? `${Math.floor(timeLeft / 3600)}h ${Math.floor((timeLeft % 3600) / 60)}m`
      : `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s`
    : "Ended";
  const hasBids    = Number(listing.highestBid) > 0;
  const hasReserve = listing.reservePrice > 0n;
  const reserveMet = !hasReserve || listing.highestBid >= listing.reservePrice;

  return (
    <div className={`card relative transition-all ${selected ? "border-arena-gold ring-1 ring-arena-gold/40" : ""}`}>
      {/* Batch select checkbox — only fixed-price non-owned */}
      {!isOwner && !isAuction && onSelect && (
        <div
          className="absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer z-10"
          style={{ borderColor: selected ? "#f59e0b" : "#374151", background: selected ? "#f59e0b20" : "transparent" }}
          onClick={e => { e.stopPropagation(); onSelect(listing.listingId); }}
        >
          {selected && <span className="text-arena-gold text-xs font-bold">✓</span>}
        </div>
      )}

      <img
        src={listing.creature.avatarUrl}
        alt={listing.creature.name}
        className="w-full h-32 object-cover rounded-lg mb-3 bg-arena-border"
        onError={e => { e.target.src = `https://robohash.org/${listing.tokenId}?set=set1`; }}
      />
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="font-bold text-white">{listing.creature.name}</div>
          <div className="text-xs text-gray-500">
            Lv {listing.creature.level} · {listing.creature.elementEmoji} {listing.creature.elementName}
          </div>
        </div>
        <span className="badge bg-arena-purple/20 text-arena-purple text-[10px]">
          {TYPE_LABEL[listing.listingType]}
        </span>
      </div>

      {isAuction ? (
        <div className="text-sm text-gray-300 mb-2 space-y-0.5">
          <div>Start: <span className="text-white font-semibold">{listing.priceEth} ETH</span></div>
          {hasReserve && (
            <div className="text-xs text-gray-600">
              Reserve: {listing.reservePriceEth} ETH
              {hasBids && (reserveMet ? <span className="text-arena-green ml-1">✓ met</span> : <span className="text-arena-red ml-1">not met</span>)}
            </div>
          )}
          {hasBids ? (
            <div>Current: <span className="text-arena-gold font-bold">{listing.highestBidEth} ETH</span></div>
          ) : (
            <div className="text-xs text-gray-600">No bids yet</div>
          )}
          <div className="text-xs text-gray-500">{ended ? "⏹ Auction ended" : `⏱ ${fmtTime} left`}</div>
        </div>
      ) : (
        <div className="text-sm mb-2">
          Price: <span className="text-arena-gold font-bold">{listing.priceEth} ETH</span>
        </div>
      )}

      {isOwner ? (
        <div className="flex gap-2">
          {ended && isAuction && (
            <button className="btn-primary text-xs flex-1" onClick={() => onFinalize(listing.listingId)}>
              ✅ Finalize
            </button>
          )}
          {!ended && (
            <button className="btn-danger text-xs flex-1" onClick={() => onCancel(listing.listingId)}>
              Cancel
            </button>
          )}
        </div>
      ) : ended ? (
        <div className="text-xs text-center py-2 text-gray-500 italic">
          {hasBids
            ? "Ended · Waiting for seller to finalize"
            : "Ended — no bids"}
        </div>
      ) : isAuction ? (
        <div className="flex gap-2">
          <input
            className="input text-xs flex-1"
            placeholder={`Min: ${hasBids ? (Number(listing.highestBidEth) * 1.05).toFixed(4) : listing.priceEth} ETH`}
            value={bidAmt}
            onChange={e => setBidAmt(e.target.value)}
          />
          <button
            className="btn-primary text-xs px-3"
            onClick={() => { onBid(listing.listingId, bidAmt); setBidAmt(""); }}
            disabled={!bidAmt}
          >
            Bid
          </button>
        </div>
      ) : (
        <button className="btn-primary text-xs w-full" onClick={() => onBuy(listing.listingId, listing.price)}>
          Buy Now
        </button>
      )}
    </div>
  );
}

export default function MarketplacePage({
  myCreatures, myListings, otherListings, loading,
  onFetch, onListFixed, onListAuction, onBuy, onBid, onFinalize, onCancel,
  onBatchListFixed, onBatchBuy,
  account,
}) {
  const [tab, setTab]             = useState("browse");
  const [sellModal, setSellModal] = useState(false);
  const [sellTokenId, setSellTokenId]   = useState("");
  const [sellType, setSellType]         = useState("fixed");
  const [sellPrice, setSellPrice]       = useState("");
  const [sellReserve, setSellReserve]   = useState("");
  const [sellDuration, setSellDuration] = useState("3600");

  // Batch state
  const [batchMode, setBatchMode]       = useState(false);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  // Batch list: tokenId → price
  const [batchListModal, setBatchListModal]   = useState(false);
  const [batchPrices, setBatchPrices]         = useState({});

  useEffect(() => { onFetch(); }, []);

  const handleSell = () => {
    const id = Number(sellTokenId);
    if (!id || !sellPrice) return;
    if (sellType === "fixed") {
      onListFixed(id, sellPrice);
    } else {
      onListAuction(id, sellPrice, sellReserve || "0", Number(sellDuration));
    }
    setSellModal(false);
    setSellTokenId(""); setSellPrice(""); setSellReserve("");
  };

  const toggleSelect = (listingId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(listingId) ? next.delete(listingId) : next.add(listingId);
      return next;
    });
  };

  const handleBatchBuy = () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    onBatchBuy(ids);
    setSelectedIds(new Set());
    setBatchMode(false);
  };

  const handleBatchList = () => {
    const tokenIds = Object.keys(batchPrices).map(Number);
    const prices   = tokenIds.map(id => batchPrices[id]);
    if (tokenIds.length === 0 || prices.some(p => !p || parseFloat(p) <= 0)) return;
    onBatchListFixed(tokenIds, prices);
    setBatchListModal(false);
    setBatchPrices({});
  };

  const unlistedCreatures = myCreatures.filter(
    c => !myListings.find(l => l.tokenId === c.id)
  );
  const fixedOtherListings = otherListings.filter(l => l.listingType === 0);
  const selectedTotal = [...selectedIds].reduce((sum, id) => {
    const l = otherListings.find(l => l.listingId === id);
    return l ? sum + Number(ethers.formatEther(l.price)) : sum;
  }, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Fixed price · English auction with reserve price · 2.5% fee → Treasury · ERC-2981 royalties
          </p>
        </div>
        <div className="flex gap-2">
          {unlistedCreatures.length > 1 && (
            <button className="btn-secondary text-sm" onClick={() => setBatchListModal(true)}>
              ⚡ Batch List
            </button>
          )}
          <button className="btn-primary" onClick={() => setSellModal(true)} disabled={unlistedCreatures.length === 0}>
            + List Creature
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-arena-border pb-2">
        {[["browse", "Browse"], ["mine", "My Listings"]].map(([key, label]) => (
          <button
            key={key}
            className={`text-sm px-3 py-1 ${tab === key ? "text-arena-purple font-semibold" : "text-gray-500"}`}
            onClick={() => { setTab(key); setBatchMode(false); setSelectedIds(new Set()); }}
          >
            {label} {key === "browse" ? `(${otherListings.length})` : `(${myListings.length})`}
          </button>
        ))}

        {/* Batch buy toggle — only on browse tab */}
        {tab === "browse" && fixedOtherListings.length > 1 && (
          <button
            className={`ml-auto text-sm px-3 py-1 rounded-lg border transition-colors ${
              batchMode ? "border-arena-gold text-arena-gold" : "border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
          >
            {batchMode ? "Cancel Batch" : "⚡ Batch Buy"}
          </button>
        )}
      </div>

      {/* Batch buy bar */}
      {batchMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-arena-gold/10 border border-arena-gold/30">
          <span className="text-arena-gold font-semibold">{selectedIds.size} selected</span>
          <span className="text-gray-400 text-sm">Total: {selectedTotal.toFixed(4)} ETH</span>
          <button className="btn-primary text-sm ml-auto" onClick={handleBatchBuy}>
            Buy {selectedIds.size} in 1 tx
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="card animate-pulse h-60" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(tab === "browse" ? otherListings : myListings).map(l => (
            <ListingCard
              key={l.listingId}
              listing={l}
              account={account}
              onBuy={onBuy}
              onBid={onBid}
              onFinalize={onFinalize}
              onCancel={onCancel}
              selected={batchMode && selectedIds.has(l.listingId)}
              onSelect={batchMode && l.listingType === 0 ? toggleSelect : null}
            />
          ))}
          {(tab === "browse" ? otherListings : myListings).length === 0 && (
            <div className="col-span-full card text-center py-16 text-gray-500">
              <div className="text-3xl mb-2">📭</div>
              {tab === "browse" ? "No creatures listed yet." : "You have no active listings."}
            </div>
          )}
        </div>
      )}

      {/* Single sell modal */}
      <Modal open={sellModal} onClose={() => setSellModal(false)} title="List Creature for Sale">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Select Creature</label>
            <select className="input" value={sellTokenId} onChange={e => setSellTokenId(e.target.value)}>
              <option value="">— choose —</option>
              {unlistedCreatures.map(c => (
                <option key={c.id} value={c.id}>#{c.id} {c.name} (Lv {c.level})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Listing Type</label>
            <div className="flex gap-2">
              {["fixed", "auction"].map(t => (
                <button
                  key={t}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                    sellType === t ? "border-arena-purple text-arena-purple" : "border-arena-border text-gray-500"
                  }`}
                  onClick={() => setSellType(t)}
                >
                  {t === "fixed" ? "Fixed Price" : "English Auction"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {sellType === "fixed" ? "Price (ETH)" : "Starting Price (ETH)"}
            </label>
            <input className="input" placeholder="0.1" value={sellPrice} onChange={e => setSellPrice(e.target.value)} />
          </div>
          {sellType === "auction" && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Reserve Price (ETH) — optional</label>
                <input
                  className="input"
                  placeholder="Leave blank for no reserve"
                  value={sellReserve}
                  onChange={e => setSellReserve(e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">
                  If the highest bid doesn't reach this price, the auction fails and the NFT is returned.
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Duration</label>
                <select className="input" value={sellDuration} onChange={e => setSellDuration(e.target.value)}>
                  <option value="60">1 minute (demo)</option>
                  <option value="600">10 minutes</option>
                  <option value="3600">1 hour</option>
                  <option value="86400">24 hours</option>
                  <option value="604800">7 days</option>
                </select>
              </div>
            </>
          )}
          <p className="text-xs text-gray-500">
            2.5% platform fee → Treasury · 5% ERC-2981 royalty to original minter
          </p>
          <button className="btn-primary w-full" onClick={handleSell} disabled={!sellTokenId || !sellPrice}>
            List for Sale
          </button>
        </div>
      </Modal>

      {/* Batch list modal */}
      <Modal open={batchListModal} onClose={() => setBatchListModal(false)} title="Batch List Creatures">
        <p className="text-gray-400 text-sm mb-4">
          Set prices for multiple creatures and list them all in one transaction.
          Uses <code className="text-xs bg-arena-border px-1 rounded">setApprovalForAll</code> — one MetaMask click covers all.
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
          {unlistedCreatures.map(c => (
            <div key={c.id} className="flex items-center gap-3">
              <img src={c.avatarUrl} alt={c.name}
                className="w-8 h-8 rounded-lg object-cover bg-arena-border"
                onError={e => { e.target.src = `https://robohash.org/${c.id}?set=set1`; }} />
              <span className="text-sm text-white flex-1">{c.name} <span className="text-gray-500">#{c.id}</span></span>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="ETH"
                className="input w-24 text-sm"
                value={batchPrices[c.id] || ""}
                onChange={e => setBatchPrices(prev => ({ ...prev, [c.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button
          className="btn-primary w-full"
          onClick={handleBatchList}
          disabled={Object.keys(batchPrices).length === 0}
        >
          List All in 1 Transaction
        </button>
      </Modal>
    </div>
  );
}
