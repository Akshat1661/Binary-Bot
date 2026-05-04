import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import Modal from "../components/Modal.jsx";

// States: Open(0) InProgress(1) Finished(2) Cancelled(3)
const STATE_LABEL = ["Open", "In Progress", "Finished", "Cancelled"];
const STATE_COLOR = [
  "text-green-400 bg-green-400/10",
  "text-arena-purple bg-arena-purple/10",
  "text-arena-gold bg-arena-gold/10",
  "text-red-400 bg-red-400/10",
];

function fmtCountdown(ms) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default function Tournaments({ contracts, account, myCreatures, onRefreshArmy }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [acting, setActing]           = useState({});
  const [joinModal, setJoinModal]     = useState(null);
  const [joinCreature, setJoinCreature] = useState("");
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: "", entryFee: "0", size: "4", window: "60" });
  const [now, setNow]   = useState(Date.now());
  const autoStartedRef  = useRef(new Set());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchTournaments = useCallback(async () => {
    if (!contracts.tournamentManager || !contracts.creatureNFT) return;
    setLoading(true);
    try {
      const count = Number(await contracts.tournamentManager.getTournamentCount());
      const list  = [];
      for (let i = 1; i <= count; i++) {
        const t     = await contracts.tournamentManager.tournaments(i);
        const parts = await contracts.tournamentManager.getParticipants(i);

        const participantData = await Promise.all(
          parts.map(async (pid) => {
            try {
              const c = await contracts.creatureNFT.getCreature(pid);
              return {
                id:        Number(pid),
                name:      c.creatureName,
                avatarUrl: `https://robohash.org/${c.dna}?set=set2&size=200x200`,
              };
            } catch {
              return { id: Number(pid), name: `Creature #${Number(pid)}`, avatarUrl: null };
            }
          })
        );

        const state = Number(t.state);
        // Load match + round events for InProgress (1) and Finished (2)
        let matches = [];
        if (state === 1 || state === 2) {
          try {
            const matchFilter = contracts.tournamentManager.filters.MatchPlayed(i);
            const matchEvents = await contracts.tournamentManager.queryFilter(matchFilter);
            matches = matchEvents.map(ev => ({
              round:    Number(ev.args.round),
              fighter1: Number(ev.args.fighter1),
              fighter2: Number(ev.args.fighter2),
              winner:   Number(ev.args.winner),
            })).sort((a, b) => a.round - b.round);
          } catch { /* query errors are non-fatal */ }
        }

        list.push({
          id:             i,
          name:           t.name,
          entryFee:       t.entryFee,
          entryFeeEth:    (Number(t.entryFee) / 1e18).toFixed(4),
          maxParts:       Number(t.maxParticipants),
          partCount:      Number(t.participantCount),
          prizePool:      Number(t.prizePool) / 1e18,
          state,
          deadline:       Number(t.registrationDeadline) * 1000,
          winner:         Number(t.winner),
          winnerAddress:  t.winnerAddress,
          currentRound:   Number(t.currentRoundNum),
          nextRoundTime:  Number(t.nextRoundTime) * 1000,
          participants:   parts.map(Number),
          participantData,
          matches,
        });
      }
      setTournaments(list.reverse());
    } catch (e) {
      console.error(e);
      toast.error("Failed to load tournaments");
    } finally {
      setLoading(false);
    }
  }, [contracts.tournamentManager, contracts.creatureNFT]);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  // ── Auto-start ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!account) return;
    tournaments.forEach(tour => {
      const readyToStart =
        tour.state === 0 &&
        tour.deadline - now <= 0 &&
        tour.partCount >= 2 &&
        !acting[tour.id] &&
        !autoStartedRef.current.has(tour.id);
      if (readyToStart) {
        autoStartedRef.current.add(tour.id);
        handleStart(tour.id);
      }
    });
  }, [tournaments, now, account]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleJoin = async () => {
    if (!contracts.tournamentManager || !joinCreature) return;
    const t = toast.loading("Joining tournament…");
    try {
      const tour = tournaments.find(x => x.id === joinModal);
      await (await contracts.tournamentManager.register(
        joinModal, Number(joinCreature), { value: tour.entryFee }
      )).wait();
      toast.success("Registered!", { id: t });
      setJoinModal(null); setJoinCreature("");
      fetchTournaments();
    } catch (e) { toast.error(e.reason || e.message, { id: t }); }
  };

  const handleCreate = async () => {
    if (!contracts.tournamentManager) return;
    const t = toast.loading("Creating tournament…");
    try {
      const fee = BigInt(Math.floor(parseFloat(form.entryFee || "0") * 1e18));
      await (await contracts.tournamentManager.createTournament(
        form.name, fee, Number(form.size), Number(form.window)
      )).wait();
      toast.success("Tournament created!", { id: t });
      setCreateModal(false);
      fetchTournaments();
    } catch (e) { toast.error(e.reason || e.message, { id: t }); }
  };

  const handleStart = async (tid) => {
    if (!contracts.tournamentManager) return;
    setActing(s => ({ ...s, [tid]: true }));
    const t = toast.loading("Starting tournament — Round 1 in progress…");
    try {
      const tx      = await contracts.tournamentManager.startTournament(tid);
      const receipt = await tx.wait();

      const iface = contracts.tournamentManager.interface;
      const finLog = receipt.logs.find(l => { try { return iface.parseLog(l).name === "TournamentFinished"; } catch { return false; } });
      if (finLog) {
        const ev    = iface.parseLog(finLog);
        const arena = (Number(ev.args.arenaReward) / 1e18).toFixed(0);
        const eth   = (Number(ev.args.ethPrize)   / 1e18).toFixed(4);
        toast.success(`Round 1 complete & tournament done! Winner gets ${eth} ETH + ${arena} ARENA!`, { id: t, duration: 8000 });
      } else {
        toast.success("Round 1 complete! Wait 60 s then advance to the next round.", { id: t, duration: 6000 });
      }
      fetchTournaments();
      onRefreshArmy?.();
    } catch (e) {
      if (e.reason?.includes("not open") || e.message?.includes("not open")) {
        toast.dismiss(t);
        fetchTournaments();
      } else {
        toast.error(e.reason || e.message, { id: t });
      }
    } finally {
      setActing(s => ({ ...s, [tid]: false }));
    }
  };

  const handleAdvanceRound = async (tid) => {
    if (!contracts.tournamentManager) return;
    setActing(s => ({ ...s, [tid]: true }));
    const t = toast.loading("Advancing to next round…");
    try {
      const tx      = await contracts.tournamentManager.advanceRound(tid);
      const receipt = await tx.wait();

      const iface  = contracts.tournamentManager.interface;
      const finLog = receipt.logs.find(l => { try { return iface.parseLog(l).name === "TournamentFinished"; } catch { return false; } });
      if (finLog) {
        const ev    = iface.parseLog(finLog);
        const arena = (Number(ev.args.arenaReward) / 1e18).toFixed(0);
        const eth   = (Number(ev.args.ethPrize)   / 1e18).toFixed(4);
        toast.success(`Tournament complete! Winner gets ${eth} ETH + ${arena} ARENA!`, { id: t, duration: 8000 });
      } else {
        toast.success("Round complete! Wait 60 s for the next round.", { id: t });
      }
      fetchTournaments();
      onRefreshArmy?.();
    } catch (e) {
      toast.error(e.reason || e.message, { id: t });
    } finally {
      setActing(s => ({ ...s, [tid]: false }));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tournaments</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Register · Registration closes · Round 1 auto-starts · Advance rounds every 60 s ·
            Winner takes <span className="text-arena-gold">ETH prize</span> + <span className="text-arena-purple">500 ARENA</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={fetchTournaments}>↻ Refresh</button>
          {account && (
            <button className="btn-primary" onClick={() => setCreateModal(true)}>+ Create</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-28" />)}
        </div>
      ) : tournaments.length === 0 ? (
        <div className="card text-center py-16 text-gray-500">
          <div className="text-3xl mb-2">🏟️</div>
          No tournaments yet. Create one!
        </div>
      ) : (
        <div className="space-y-4">
          {tournaments.map(tour => {
            const deadlineMs   = tour.deadline - now;
            const regOpen      = tour.state === 0 && deadlineMs > 0;
            const isFull       = tour.partCount >= tour.maxParts;
            const eligible     = myCreatures.filter(c => !tour.participants.includes(c.id));
            const winnerData   = tour.participantData?.find(p => p.id === tour.winner);
            const canAdvance   = tour.state === 1 && now >= tour.nextRoundTime;
            const advanceIn    = tour.state === 1 ? Math.max(0, tour.nextRoundTime - now) : 0;

            // Group matches by round
            const roundMap = {};
            (tour.matches || []).forEach(m => {
              if (!roundMap[m.round]) roundMap[m.round] = [];
              roundMap[m.round].push(m);
            });
            const rounds = Object.entries(roundMap)
              .map(([r, ms]) => ({ round: Number(r), matches: ms }))
              .sort((a, b) => a.round - b.round);

            return (
              <div key={tour.id} className={`card ${tour.state === 2 ? "border-arena-gold/40" : tour.state === 1 ? "border-arena-purple/30" : ""}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">

                    {/* Title + badges */}
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="font-bold text-white text-lg">{tour.name}</h3>
                      <span className={`badge ${STATE_COLOR[tour.state]}`}>{STATE_LABEL[tour.state]}</span>
                      {regOpen && (
                        <span className="badge text-arena-purple bg-arena-purple/10 font-mono">
                          ⏱ {fmtCountdown(deadlineMs)} left
                        </span>
                      )}
                      {tour.state === 0 && deadlineMs <= 0 && tour.partCount < 2 && (
                        <span className="badge text-red-400 bg-red-400/10">Need ≥2 to start</span>
                      )}
                      {tour.state === 0 && deadlineMs <= 0 && tour.partCount >= 2 && (
                        <span className="badge text-arena-gold bg-arena-gold/10 animate-pulse">⚙️ Resolving…</span>
                      )}
                      {tour.state === 1 && (
                        <span className="badge text-arena-purple bg-arena-purple/10 font-mono">
                          Round {tour.currentRound}
                          {advanceIn > 0 && ` · next in ${fmtCountdown(advanceIn)}`}
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-400 mb-3">
                      <span>Participants: <b className="text-white">{tour.partCount}/{tour.maxParts}</b></span>
                      <span>Entry: <b className="text-arena-gold">{tour.entryFeeEth} ETH</b></span>
                      <span>Prize pool: <b className="text-arena-gold">{tour.prizePool.toFixed(4)} ETH + 500 ARENA</b></span>
                    </div>

                    {/* Winner banner */}
                    {tour.state === 2 && tour.winner > 0 && (
                      <div className="mb-3 p-3 rounded-lg bg-arena-gold/10 border border-arena-gold/30">
                        <div className="flex items-center gap-3">
                          {winnerData?.avatarUrl && (
                            <img src={winnerData.avatarUrl} className="w-12 h-12 rounded-full border-2 border-arena-gold object-cover bg-arena-border" alt="" onError={e => { e.target.style.display = "none"; }} />
                          )}
                          <span className="text-2xl">🏆</span>
                          <div>
                            <div className="text-arena-gold font-bold text-base">
                              Champion: {winnerData?.name || `Creature #${tour.winner}`}
                            </div>
                            <div className="text-xs text-gray-400">
                              {tour.winnerAddress?.slice(0, 6)}…{tour.winnerAddress?.slice(-4)} received{" "}
                              <span className="text-arena-gold font-semibold">{tour.prizePool.toFixed(4)} ETH</span>{" "}
                              + <span className="text-arena-purple font-semibold">500 ARENA</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Round-by-round bracket with per-match results */}
                    {rounds.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">
                          Bracket Results
                        </div>
                        <div className="space-y-3">
                          {rounds.map(({ round, matches }) => (
                            <div key={round}>
                              <div className="text-xs text-gray-600 mb-1">
                                {round === rounds.length && tour.state === 2 ? `Round ${round} — Final` : `Round ${round}`}
                              </div>
                              <div className="space-y-1.5">
                                {matches.map((m, mi) => {
                                  const f1 = tour.participantData?.find(p => p.id === m.fighter1);
                                  const f2 = tour.participantData?.find(p => p.id === m.fighter2);
                                  const isF1Win = m.winner === m.fighter1;
                                  return (
                                    <div key={mi} className="flex items-center gap-2 text-xs bg-arena-border/10 rounded-lg px-3 py-1.5">
                                      <span className={isF1Win ? "text-white font-semibold" : "text-gray-500 line-through"}>
                                        {f1?.name || `#${m.fighter1}`}
                                      </span>
                                      <span className="text-gray-600">vs</span>
                                      <span className={!isF1Win ? "text-white font-semibold" : "text-gray-500 line-through"}>
                                        {f2?.name || `#${m.fighter2}`}
                                      </span>
                                      <span className="ml-auto text-arena-green font-semibold">
                                        → {(isF1Win ? f1 : f2)?.name || `#${m.winner}`} won
                                        {m.winner === tour.winner && tour.state === 2 ? " 🏆" : ""}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Participant avatars */}
                    {tour.participantData?.length > 0 && (
                      <div className="flex gap-2 flex-wrap items-end">
                        {tour.participantData.map(p => {
                          const isChamp = p.id === tour.winner;
                          return (
                            <div key={p.id} title={p.name} className={`flex flex-col items-center transition-all ${isChamp ? "scale-125" : ""}`}>
                              <div className={`w-8 h-8 rounded-full bg-arena-border overflow-hidden border-2 ${isChamp ? "border-arena-gold" : "border-arena-border"}`}>
                                {p.avatarUrl
                                  ? <img src={p.avatarUrl} className="w-full h-full object-cover" alt={p.name} onError={e => { e.target.style.display = "none"; }} />
                                  : <span className="flex items-center justify-center w-full h-full text-xs text-gray-500">{p.name.slice(0, 2)}</span>
                                }
                              </div>
                              <span className="text-xs text-gray-500 mt-0.5 max-w-[44px] truncate text-center">{p.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    {regOpen && account && !isFull && eligible.length > 0 && (
                      <button className="btn-primary text-sm" onClick={() => setJoinModal(tour.id)}>
                        Join
                      </button>
                    )}
                    {regOpen && account && eligible.length === 0 && myCreatures.length > 0 && (
                      <span className="text-xs text-arena-purple text-center py-1">✓ Entered</span>
                    )}
                    {/* Advance Round button for InProgress tournaments */}
                    {tour.state === 1 && account && (
                      canAdvance ? (
                        <button
                          className="btn-primary text-sm"
                          onClick={() => handleAdvanceRound(tour.id)}
                          disabled={acting[tour.id]}
                        >
                          {acting[tour.id] ? "⏳ Running…" : "⚔️ Next Round"}
                        </button>
                      ) : (
                        <div className="text-xs text-center text-gray-500">
                          Next round in<br/>
                          <span className="text-arena-purple font-mono font-semibold">{fmtCountdown(advanceIn)}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Join Modal */}
      <Modal open={!!joinModal} onClose={() => setJoinModal(null)} title="Join Tournament">
        <p className="text-gray-400 text-sm mb-4">Select the creature to enter. Entry fee is deducted from your wallet.</p>
        <label className="block text-sm text-gray-400 mb-1">Your Creature</label>
        <select className="input mb-4" value={joinCreature} onChange={e => setJoinCreature(e.target.value)}>
          <option value="">-- select --</option>
          {myCreatures
            .filter(c => !tournaments.find(t => t.id === joinModal)?.participants.includes(c.id))
            .map(c => <option key={c.id} value={c.id}>#{c.id} {c.name} (Lv {c.level}, {c.elementEmoji})</option>)
          }
        </select>
        <button className="btn-primary w-full" onClick={handleJoin} disabled={!joinCreature}>
          Enter Tournament
        </button>
      </Modal>

      {/* Create Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Tournament">
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Arena Cup #1" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Entry Fee (ETH)</label>
            <input className="input" value={form.entryFee} onChange={e => setForm(f => ({ ...f, entryFee: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Max Participants</label>
            <select className="input" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))}>
              {["4","8","16","32"].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Registration Window</label>
            <select className="input" value={form.window} onChange={e => setForm(f => ({ ...f, window: e.target.value }))}>
              <option value="60">1 minute (demo)</option>
              <option value="300">5 minutes</option>
              <option value="600">10 minutes</option>
              <option value="3600">1 hour</option>
            </select>
          </div>
          <div className="text-xs text-gray-500 bg-arena-border/20 rounded-lg p-2">
            After registration closes, Round 1 resolves automatically. Each subsequent round requires 60 s delay then click "Next Round". Winner gets the full ETH prize + 500 ARENA.
          </div>
          <button className="btn-primary w-full" onClick={handleCreate} disabled={!form.name.trim()}>
            Create Tournament
          </button>
        </div>
      </Modal>
    </div>
  );
}
