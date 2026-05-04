import { useEffect, useState } from "react";
import toast from "react-hot-toast";

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleString();
}

export default function TreasuryPage({
  balance, totalReceived, totalAllocated, allocations,
  isAdmin, loading, onFetch, onAllocate,
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount]       = useState("");
  const [reason, setReason]       = useState("");

  useEffect(() => { onFetch(); }, []);

  const handleAllocate = () => {
    if (!recipient || !amount || !reason) return toast.error("Fill all fields");
    if (parseFloat(amount) <= 0)          return toast.error("Invalid amount");
    onAllocate(recipient, amount, reason);
    setRecipient(""); setAmount(""); setReason("");
  };

  const utilizationPct = totalReceived > 0
    ? ((parseFloat(totalAllocated) / parseFloat(totalReceived)) * 100).toFixed(1)
    : "0";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Platform Treasury</h1>
      <p className="text-gray-400 text-sm mb-6">
        All 2.5% marketplace fees flow here. Admin can allocate funds to specific purposes.
        Every allocation is recorded on-chain permanently.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center border-arena-gold/30">
          <div className="text-2xl font-bold text-arena-gold">{parseFloat(balance).toFixed(4)}</div>
          <div className="text-xs text-gray-500 mt-1">ETH Available</div>
        </div>
        <div className="card text-center border-arena-green/30">
          <div className="text-2xl font-bold text-arena-green">{parseFloat(totalReceived).toFixed(4)}</div>
          <div className="text-xs text-gray-500 mt-1">ETH Received</div>
        </div>
        <div className="card text-center border-arena-purple/30">
          <div className="text-2xl font-bold text-arena-purple">{parseFloat(totalAllocated).toFixed(4)}</div>
          <div className="text-xs text-gray-500 mt-1">ETH Allocated</div>
        </div>
      </div>

      {/* Utilization bar */}
      <div className="card mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Treasury utilization</span>
          <span>{utilizationPct}%</span>
        </div>
        <div className="bg-arena-border rounded-full h-2">
          <div
            className="bg-arena-gold h-2 rounded-full transition-all"
            style={{ width: `${Math.min(100, parseFloat(utilizationPct))}%` }}
          />
        </div>
      </div>

      {/* Allocate funds */}
      <div className="card mb-6 border-arena-purple/30">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Allocate Funds</h2>
          {isAdmin
            ? <span className="text-xs text-arena-green font-semibold">✓ You are admin (deployer account)</span>
            : <span className="text-xs text-gray-500">Switch to the deployer wallet (Account #0) to allocate</span>
          }
        </div>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Recipient address (0x...)"
            className="input w-full font-mono text-sm"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
          />
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="Amount in ETH"
              step="0.001"
              min="0"
              className="input flex-1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
            <input
              type="text"
              placeholder="Purpose (e.g. Development)"
              className="input flex-1"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          <button
            className="btn-primary w-full"
            onClick={handleAllocate}
            disabled={loading}
          >
            Send {amount || "0"} ETH from Treasury
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Fees from marketplace sales (2.5%) flow here automatically. Paste any Hardhat address (0x…) in the recipient field — no ENS needed.
        </p>
      </div>

      {/* Allocation history */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 border-b border-arena-border pb-1">
          Allocation History ({allocations.length})
        </h2>
        {allocations.length === 0 && !loading && (
          <p className="text-center text-gray-600 py-6">No allocations yet.</p>
        )}
        <div className="space-y-2">
          {allocations.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-arena-border/10">
              <div className="w-8 h-8 rounded-full bg-arena-gold/20 flex items-center justify-center text-arena-gold text-sm font-bold">
                ↗
              </div>
              <div className="flex-1">
                <div className="text-sm text-white font-medium">{a.reason}</div>
                <div className="text-xs text-gray-500 font-mono">{a.recipient}</div>
                <div className="text-xs text-gray-600">{fmtTime(a.timestamp)}</div>
              </div>
              <div className="text-arena-gold font-semibold">{parseFloat(a.amount).toFixed(4)} ETH</div>
            </div>
          ))}
        </div>
      </div>

      {loading && (
        <div className="space-y-2 mt-4">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-arena-border/20 rounded-lg animate-pulse" />)}
        </div>
      )}
    </div>
  );
}
