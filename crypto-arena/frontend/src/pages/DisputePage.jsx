import { useEffect } from "react";

function fmtAddr(a) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

const VOTE_LABEL = ["Not voted", "Favor Buyer", "Favor Seller"];
const VOTE_COLOR = ["text-gray-500", "text-arena-green", "text-arena-purple"];

const OUTCOME_LABEL = ["Pending", "Buyer Won", "Seller Won"];
const OUTCOME_COLOR = ["text-gray-400", "text-arena-green", "text-arena-purple"];

function DisputeCard({ d, onVote, acting }) {
  const now      = Math.floor(Date.now() / 1000);
  const expired  = now > d.deadline;
  const canVote  = d.isArbitrator && d.myVote === 0 && !d.resolved && !expired;

  return (
    <div className={`card border ${d.resolved ? "border-gray-700" : "border-arena-red/40"}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-semibold text-white">Dispute #{d.id}</span>
          <span className="text-gray-500 text-sm ml-2">→ Escrow #{d.escrowId}</span>
        </div>
        <div className="text-right">
          <span className={`text-sm font-semibold ${d.resolved ? "text-arena-green" : "text-arena-red"}`}>
            {d.resolved ? "Resolved" : "Active"}
          </span>
          {d.resolved && d.outcome > 0 && (
            <div className={`text-xs font-bold mt-0.5 ${OUTCOME_COLOR[d.outcome]}`}>
              {OUTCOME_LABEL[d.outcome]} ({d.buyerVotes}-{d.sellerVotes} vote{d.buyerVotes + d.sellerVotes !== 1 ? "s" : ""})
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-arena-border/20 rounded p-2">
          <div className="text-gray-500">Buyer</div>
          <div className="text-white font-mono">{fmtAddr(d.buyer)}</div>
        </div>
        <div className="bg-arena-border/20 rounded p-2">
          <div className="text-gray-500">Seller</div>
          <div className="text-white font-mono">{fmtAddr(d.seller)}</div>
        </div>
        <div className="bg-arena-border/20 rounded p-2">
          <div className="text-gray-500">Amount</div>
          <div className="text-arena-gold font-semibold">{d.amount} ETH</div>
        </div>
        <div className="bg-arena-border/20 rounded p-2">
          <div className="text-gray-500">Deadline</div>
          <div className={expired ? "text-arena-red" : "text-white"}>{fmtTime(d.deadline)}</div>
        </div>
      </div>

      {/* Arbitrators */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-1">Arbitrators:</div>
        <div className="space-y-1">
          {d.arbitrators.map((arb, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-white font-mono">{fmtAddr(arb)}</span>
              <span className={VOTE_COLOR[d.votes[i]]}>
                {VOTE_LABEL[d.votes[i]]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Vote progress */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 bg-arena-border rounded-full h-1.5">
          <div
            className="bg-arena-purple h-1.5 rounded-full transition-all"
            style={{ width: `${(d.voteCount / 3) * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">{d.voteCount}/3 voted</span>
      </div>

      {/* Voting buttons (arbitrators only) */}
      {canVote && (
        <div className="flex gap-2">
          <button
            className="flex-1 py-2 rounded-lg border border-arena-green text-arena-green text-sm hover:bg-arena-green/10 transition-colors"
            onClick={() => onVote(d.id, true)}
            disabled={acting}
          >
            ✓ Favor Buyer
          </button>
          <button
            className="flex-1 py-2 rounded-lg border border-arena-purple text-arena-purple text-sm hover:bg-arena-purple/10 transition-colors"
            onClick={() => onVote(d.id, false)}
            disabled={acting}
          >
            ✓ Favor Seller
          </button>
        </div>
      )}
      {d.isArbitrator && d.myVote !== 0 && (
        <div className="text-center text-sm text-gray-500">
          You voted: <span className={VOTE_COLOR[d.myVote]}>{VOTE_LABEL[d.myVote]}</span>
        </div>
      )}
      {d.isBuyer && !d.resolved && (
        <p className="text-xs text-gray-600 mt-2">
          You are the buyer in this dispute. Arbitrators will vote within 48 hours.
        </p>
      )}
      {d.isSeller && !d.resolved && (
        <p className="text-xs text-gray-600 mt-2">
          You are the seller in this dispute. Arbitrators will vote within 48 hours.
        </p>
      )}
    </div>
  );
}

export default function DisputePage({
  disputes, isArbitrator, poolSize, stakedAmount, loading, acting, STAKE_AMOUNT,
  onFetch, onStake, onUnstake, onVote, onForceResolve,
}) {
  useEffect(() => { onFetch(); }, []);

  const active   = disputes.filter(d => !d.resolved);
  const resolved = disputes.filter(d =>  d.resolved);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Dispute Resolution</h1>
      <p className="text-gray-400 text-sm mb-6">
        Staked arbitrators vote on disputed escrow trades. 3 are randomly selected per dispute.
        Majority (2 of 3) wins. Arbitrators earn 20 ARENA for voting.
      </p>

      {/* Arbitrator panel */}
      <div className="card mb-6 border-arena-gold/30">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Arbitrator Status</h2>
          <span className="text-xs text-gray-500">Pool: {poolSize} arbitrators · Minimum needed: 3</span>
        </div>

        {isArbitrator ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-arena-green font-semibold">✓ You are an active arbitrator</div>
              <div className="text-xs text-gray-500 mt-1">Staked: {stakedAmount} ARENA · Earn 20 ARENA per dispute you vote on</div>
            </div>
            <button className="btn-secondary text-sm" onClick={onUnstake} disabled={acting}>
              Unstake & Leave
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-gray-300">Stake {STAKE_AMOUNT} ARENA to join the arbitrator pool</div>
              <div className="text-xs text-gray-500 mt-1">
                You'll be randomly selected to vote on disputes and earn ARENA rewards.
              </div>
            </div>
            <button className="btn-primary text-sm" onClick={onStake} disabled={acting}>
              Stake {STAKE_AMOUNT} ARENA
            </button>
          </div>
        )}
      </div>

      {/* Active disputes */}
      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-arena-red mb-3 border-b border-arena-border pb-1">
            Active Disputes ({active.length})
          </h2>
          <div className="space-y-4">
            {active.map(d => (
              <DisputeCard key={d.id} d={d} onVote={onVote} acting={acting} />
            ))}
          </div>
        </section>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-600 mb-3 border-b border-arena-border pb-1">
            Resolved Disputes
          </h2>
          <div className="space-y-3">
            {resolved.map(d => (
              <DisputeCard key={d.id} d={d} onVote={onVote} acting={acting} />
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="space-y-4">
          {[1,2].map(i => <div key={i} className="card animate-pulse h-40" />)}
        </div>
      )}

      {!loading && disputes.length === 0 && (
        <p className="text-center text-gray-600 py-12">
          No disputes assigned to you. Stake ARENA above to become eligible as an arbitrator.
        </p>
      )}

      <div className="mt-8 card border-gray-800">
        <h2 className="text-sm font-semibold text-gray-400 mb-2">How dispute resolution works</h2>
        <ol className="text-xs text-gray-500 space-y-1 list-decimal pl-4">
          <li>A buyer raises a dispute during the escrow confirmation window.</li>
          <li>3 arbitrators are pseudo-randomly selected from the staked pool.</li>
          <li>Each arbitrator votes: Favor Buyer or Favor Seller (48-hour window).</li>
          <li>Majority wins (2 of 3). Each voter earns 20 ARENA immediately.</li>
          <li>Funds and NFT are automatically distributed by the smart contract.</li>
          <li>Loser of the dispute has their on-chain reputation slashed by 30 points.</li>
        </ol>
      </div>
    </div>
  );
}
