import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const STATUS_COLOR = [
  "text-gray-400",          // 0 AwaitingBuyer
  "text-arena-gold",        // 1 AwaitingConfirmation
  "text-arena-green",       // 2 Confirmed
  "text-arena-green",       // 3 AutoReleased
  "text-arena-red",         // 4 Disputed
  "text-arena-green",       // 5 FavorBuyer
  "text-arena-purple",      // 6 FavorSeller
  "text-gray-600",          // 7 Cancelled
];

function fmtAddr(a) {
  return a === "0x0000000000000000000000000000000000000000"
    ? "—"
    : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function EscrowCard({ e, account, onAccept, onConfirm, onDispute, onAutoRelease, onCancel, acting }) {
  const now        = Math.floor(Date.now() / 1000);
  const deadlinePassed = e.deadline && now > e.deadline;

  return (
    <div className="card border-arena-border/50">
      <div className="flex items-start gap-3 mb-3">
        <img
          src={e.avatarUrl}
          alt={e.creatureName}
          className="w-14 h-14 rounded-lg object-cover bg-arena-border"
          onError={ev => { ev.target.src = `https://robohash.org/${e.tokenId}?set=set1`; }}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{e.creatureName}</span>
            <span className="text-gray-600 text-xs">#{e.tokenId}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Seller: {fmtAddr(e.seller)} · Buyer: {fmtAddr(e.buyer)}
          </div>
          {e.deadline > 0 && (
            <div className="text-xs text-gray-600 mt-0.5">
              Deadline: {fmtTime(e.deadline)}
              {deadlinePassed && <span className="text-arena-red ml-1">(expired)</span>}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-arena-gold font-bold">{e.price} ETH</div>
          <div className={`text-xs mt-1 ${STATUS_COLOR[e.status]}`}>{e.statusLabel}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-2">
        {/* Awaiting buyer — anyone can accept */}
        {e.status === 0 && !e.isMySale && (
          <button
            className="btn-primary text-sm"
            onClick={() => onAccept(e.id, e.priceWei)}
            disabled={acting}
          >
            Buy for {e.price} ETH
          </button>
        )}
        {/* Awaiting buyer — seller can cancel */}
        {e.status === 0 && e.isMySale && (
          <button className="btn-secondary text-sm" onClick={() => onCancel(e.id)} disabled={acting}>
            Cancel Listing
          </button>
        )}
        {/* Awaiting confirmation — buyer actions */}
        {e.status === 1 && e.isMyPurchase && !deadlinePassed && (
          <>
            <button className="btn-primary text-sm" onClick={() => onConfirm(e.id)} disabled={acting}>
              ✓ Confirm — Release ETH
            </button>
            <button
              className="text-sm px-3 py-1.5 rounded-lg border border-arena-red text-arena-red hover:bg-arena-red/10 transition-colors"
              onClick={() => onDispute(e.id)}
              disabled={acting}
            >
              ⚠ Raise Dispute
            </button>
          </>
        )}
        {/* Auto-release after deadline */}
        {e.status === 1 && deadlinePassed && (
          <button className="btn-secondary text-sm" onClick={() => onAutoRelease(e.id)} disabled={acting}>
            ⏱ Trigger Auto-Release
          </button>
        )}
      </div>
    </div>
  );
}

export default function EscrowPage({
  escrows, myCreatures, loading, acting,
  onFetch, onCreateEscrow, onAcceptEscrow,
  onConfirmDelivery, onRaiseDispute, onAutoRelease, onCancelEscrow,
  account,
}) {
  const [tokenId, setTokenId]   = useState("");
  const [priceEth, setPriceEth] = useState("");

  useEffect(() => { onFetch(); }, []);

  const handleCreate = () => {
    if (!tokenId || !priceEth || parseFloat(priceEth) <= 0) {
      return toast.error("Select a creature and set a valid price.");
    }
    onCreateEscrow(tokenId, priceEth);
    setTokenId(""); setPriceEth("");
  };

  const open      = escrows.filter(e => e.status === 0);
  const myActive  = escrows.filter(e => e.status === 1 && (e.isMySale || e.isMyPurchase));
  const disputed  = escrows.filter(e => e.status === 4);
  const resolved  = escrows.filter(e => [2,3,5,6,7].includes(e.status));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Peer-to-Peer Escrow</h1>
      <p className="text-gray-400 text-sm mb-6">
        Create a secure trade: NFT and ETH are both locked in the smart contract.
        Buyer gets the NFT, seller gets ETH only after buyer confirms — or after a 48-hour timeout.
        Disputed trades go to the arbitration panel.
      </p>

      {/* Create escrow */}
      {myCreatures.length > 0 && (
        <div className="card mb-6 border-arena-purple/30">
          <h2 className="font-semibold text-white mb-3">List a Creature via Escrow</h2>
          <div className="flex flex-wrap gap-3">
            <select
              className="input flex-1 min-w-[180px]"
              value={tokenId}
              onChange={e => setTokenId(e.target.value)}
            >
              <option value="">— select your creature —</option>
              {myCreatures.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (Lv {c.level}) #{c.id}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Price in ETH"
              step="0.001"
              min="0"
              className="input w-40"
              value={priceEth}
              onChange={e => setPriceEth(e.target.value)}
            />
            <button className="btn-primary" onClick={handleCreate} disabled={acting}>
              Create Escrow
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            MetaMask will ask you to approve the Escrow contract to transfer your NFT, then create the listing.
          </p>
        </div>
      )}

      {/* Open listings */}
      {open.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-3 border-b border-arena-border pb-1">
            Open Listings ({open.length})
          </h2>
          <div className="space-y-3">
            {open.map(e => (
              <EscrowCard key={e.id} e={e} account={account}
                onAccept={onAcceptEscrow} onConfirm={onConfirmDelivery}
                onDispute={onRaiseDispute} onAutoRelease={onAutoRelease}
                onCancel={onCancelEscrow} acting={acting} />
            ))}
          </div>
        </section>
      )}

      {/* My active trades */}
      {myActive.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-arena-gold mb-3 border-b border-arena-border pb-1">
            Awaiting Confirmation ({myActive.length})
          </h2>
          <div className="space-y-3">
            {myActive.map(e => (
              <EscrowCard key={e.id} e={e} account={account}
                onAccept={onAcceptEscrow} onConfirm={onConfirmDelivery}
                onDispute={onRaiseDispute} onAutoRelease={onAutoRelease}
                onCancel={onCancelEscrow} acting={acting} />
            ))}
          </div>
        </section>
      )}

      {/* Disputed */}
      {disputed.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-arena-red mb-3 border-b border-arena-border pb-1">
            In Arbitration ({disputed.length})
          </h2>
          <div className="space-y-3">
            {disputed.map(e => (
              <EscrowCard key={e.id} e={e} account={account}
                onAccept={onAcceptEscrow} onConfirm={onConfirmDelivery}
                onDispute={onRaiseDispute} onAutoRelease={onAutoRelease}
                onCancel={onCancelEscrow} acting={acting} />
            ))}
          </div>
        </section>
      )}

      {/* History */}
      {resolved.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-600 mb-3 border-b border-arena-border pb-1">
            Completed / Cancelled
          </h2>
          <div className="space-y-2">
            {resolved.map(e => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg bg-arena-border/10">
                <img src={e.avatarUrl} alt={e.creatureName}
                  className="w-10 h-10 rounded-lg object-cover bg-arena-border"
                  onError={ev => { ev.target.src = `https://robohash.org/${e.tokenId}?set=set1`; }} />
                <div className="flex-1 text-sm">
                  <span className="text-white font-medium">{e.creatureName}</span>
                  <span className="text-gray-500 ml-2">{e.price} ETH</span>
                </div>
                <span className={`text-xs ${STATUS_COLOR[e.status]}`}>{e.statusLabel}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="card animate-pulse h-24" />)}
        </div>
      )}

      {!loading && escrows.length === 0 && myCreatures.length === 0 && (
        <p className="text-center text-gray-600 py-12">
          Mint a creature on the Dashboard to start an escrow trade.
        </p>
      )}

      {!loading && escrows.length === 0 && myCreatures.length > 0 && (
        <p className="text-center text-gray-600 py-8">No escrow listings found. Create one above.</p>
      )}
    </div>
  );
}
