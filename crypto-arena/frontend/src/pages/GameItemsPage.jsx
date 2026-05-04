import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const ITEM_COLORS = ["text-arena-purple", "text-arena-green", "text-arena-gold"];
const ITEM_BG     = ["bg-arena-purple/10", "bg-arena-green/10", "bg-arena-gold/10"];
const ITEM_BORDER = ["border-arena-purple/30", "border-arena-green/30", "border-arena-gold/30"];

function ItemCard({ item, onBuy, onUse, creatures, loading }) {
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState("");

  return (
    <div className={`card border ${ITEM_BORDER[item.id]} ${ITEM_BG[item.id]}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className="text-4xl">{item.emoji}</div>
        <div className="flex-1">
          <h3 className={`font-bold text-lg ${ITEM_COLORS[item.id]}`}>{item.name}</h3>
          <p className="text-xs text-gray-400">{item.desc}</p>
        </div>
        <div className="text-right">
          <div className="text-arena-gold font-semibold">{item.price} ARENA</div>
          <div className="text-xs text-gray-500">per item</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 p-2 bg-arena-border/20 rounded-lg">
        <span className="text-sm text-gray-400">Inventory:</span>
        <span className={`font-bold text-lg ${ITEM_COLORS[item.id]}`}>{item.balance}</span>
        <span className="text-gray-600 text-sm">owned</span>
      </div>

      {/* Buy section */}
      <div className="flex gap-2 mb-3">
        <input
          type="number"
          min={1}
          max={99}
          value={qty}
          onChange={e => setQty(Math.max(1, Number(e.target.value)))}
          className="input w-20 text-center"
        />
        <button
          className="btn-primary flex-1"
          onClick={() => onBuy(item.id, qty)}
          disabled={loading}
        >
          Buy {qty}× ({(parseFloat(item.price) * qty).toFixed(0)} ARENA)
        </button>
      </div>

      {/* Use section */}
      {item.balance > 0 && creatures.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Use on creature:</div>
          <div className="flex gap-2">
            <select
              className="input flex-1 text-sm"
              value={selected}
              onChange={e => setSelected(e.target.value)}
            >
              <option value="">— select creature —</option>
              {creatures.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (Lv {c.level}) #{c.id}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary text-sm px-3"
              onClick={() => {
                if (!selected) return toast.error("Select a creature first");
                onUse(item.id, Number(selected));
              }}
              disabled={loading || !selected}
            >
              Use
            </button>
          </div>
        </div>
      )}
      {item.balance > 0 && creatures.length === 0 && (
        <p className="text-xs text-gray-600 italic">Mint a creature on the Dashboard to use this item.</p>
      )}
    </div>
  );
}

export default function GameItemsPage({
  items, creatures, arenaBalance, loading,
  onFetch, onBuy, onUseXP, onUseBreed, onUseBattle,
}) {
  useEffect(() => { onFetch(); }, []);

  const handleUse = (itemId, tokenId) => {
    if (itemId === 0) onUseXP(tokenId);
    else if (itemId === 1) onUseBreed(tokenId);
    else onUseBattle(tokenId);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Item Shop</h1>
        <div className="text-sm text-gray-400">
          Balance: <span className="text-arena-gold font-semibold">{parseFloat(arenaBalance).toFixed(0)} ARENA</span>
        </div>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        ERC-1155 consumables — buy with ARENA, use on your creatures.
        Each item is a semi-fungible token: own multiples, trade them, use one at a time.
      </p>

      {/* Tech badge */}
      <div className="card mb-6 border-arena-purple/30 bg-arena-purple/5 py-2 px-4">
        <span className="text-xs text-arena-purple font-semibold">ERC-1155 Multi-Token Standard</span>
        <span className="text-xs text-gray-500 ml-2">
          — multiple identical items share one token ID. View your balances below.
        </span>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[0,1,2].map(i => <div key={i} className="card animate-pulse h-56" />)}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              creatures={creatures}
              loading={loading}
              onBuy={onBuy}
              onUse={handleUse}
            />
          ))}
        </div>
      )}

      <div className="mt-8 card border-gray-800">
        <h2 className="text-sm font-semibold text-gray-400 mb-2">How items work</h2>
        <ul className="text-xs text-gray-500 space-y-1 list-disc pl-4">
          <li>ARENA is burned when you buy — no refunds.</li>
          <li>Items are ERC-1155 tokens: you can send them to other wallets just like NFTs.</li>
          <li>Using an item burns it from your balance and applies the effect on-chain immediately.</li>
          <li>You must approve the Item Shop contract to spend your ARENA before the first purchase (MetaMask will show this as a separate transaction).</li>
        </ul>
      </div>
    </div>
  );
}
