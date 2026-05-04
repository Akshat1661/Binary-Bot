import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ELEMENT_CLASSES } from "../config.js";

const ELEMENT_ADVANTAGES = [
  "🔥 Fire beats 🌍 Earth,  weak to 💧",
  "💧 Water beats 🔥 Fire,  weak to 🌍",
  "🌍 Earth beats 💧 Water & 🌪️ Air,  weak to 🔥",
  "🌪️ Air beats 🌍 Earth,  weak to 🔥",
  "✨ Light beats 🌑 Dark",
  "🌑 Dark beats ✨ Light",
];

function fmtMs(ms) {
  if (ms <= 0) return null;
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function MiniCard({ creature, draggable, onDragStart, dim, cooldownMs, badge }) {
  const elClass = ELEMENT_CLASSES[creature.element] || "";
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      className={`card p-2 text-center select-none transition-opacity relative
        ${dim ? "opacity-40 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:border-gray-500"}`}
    >
      {badge && (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-arena-purple" title={badge} />
      )}
      <img
        src={creature.avatarUrl}
        alt={creature.name}
        className="w-14 h-14 rounded-lg mx-auto mb-1 object-cover bg-arena-border"
        loading="lazy"
        onError={e => { e.target.src = `https://robohash.org/${creature.id}?set=set1`; }}
      />
      <div className="font-semibold text-white text-xs truncate">{creature.name}</div>
      <div className={`text-xs ${elClass}`}>{creature.elementEmoji} Lv {creature.level}</div>
      <div className="text-xs text-gray-600">#{creature.id}</div>
      {cooldownMs > 0 && (
        <div className="absolute inset-0 rounded-xl bg-black/65 flex items-center justify-center">
          <span className="text-arena-red text-xs font-bold">{fmtMs(cooldownMs)}</span>
        </div>
      )}
    </div>
  );
}

function DropSlot({ label, icon, creature, dragOver, cooldownMs, onDragOver, onDragLeave, onDrop, onClear }) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(e); }}
      className={`rounded-xl border-2 border-dashed transition-colors min-h-[260px] flex flex-col items-center justify-center
        ${dragOver
          ? "border-arena-purple bg-arena-purple/10"
          : creature
            ? "border-arena-purple/50 bg-arena-border/20"
            : "border-gray-700 bg-arena-border/10"
        }`}
    >
      {creature ? (
        <div className="w-full p-4">
          <img
            src={creature.avatarUrl}
            alt={creature.name}
            className="w-24 h-24 rounded-xl mx-auto mb-3 object-cover bg-arena-border"
            onError={e => { e.target.src = `https://robohash.org/${creature.id}?set=set1`; }}
          />
          <div className="text-center">
            <div className="font-bold text-white">{creature.name}</div>
            <div className={`text-sm ${ELEMENT_CLASSES[creature.element] || ""}`}>
              {creature.elementEmoji} {creature.elementName}
            </div>
            <div className="text-arena-gold text-sm">Lv {creature.level}</div>
            <div className="text-xs text-gray-500 mt-1">
              ATK {creature.stats.atk} · DEF {creature.stats.def} · HP {creature.stats.hp}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {creature.winCount}W / {creature.lossCount}L
            </div>
            {cooldownMs > 0 && (
              <div className="mt-2 text-arena-red text-xs font-semibold">
                ⏱ On cooldown: {fmtMs(cooldownMs)}
              </div>
            )}
          </div>
          <button
            onClick={onClear}
            className="mt-3 w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ✕ remove
          </button>
        </div>
      ) : (
        <div className="text-center p-6 select-none">
          <div className="text-4xl mb-3 opacity-40">{icon}</div>
          <div className="text-gray-500 text-sm font-medium">{label}</div>
          <div className="text-gray-600 text-xs mt-1">drag a card here</div>
        </div>
      )}
    </div>
  );
}

export default function Battle({
  myCreatures, allCreatures, loadingAll,
  battling, battleResult,
  cooldownMap,
  incomingChallenges, outgoingChallenges,
  onFetchAll, onBattle,
  onCreateChallenge, onAcceptChallenge, onDeclineChallenge, onCancelChallenge,
  onRefresh,
}) {
  const [left, setLeft]   = useState(null);
  const [right, setRight] = useState(null);
  const [dragOverLeft, setDragOverLeft]   = useState(false);
  const [dragOverRight, setDragOverRight] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { onFetchAll(); }, []);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const cdMs = (id) => {
    if (!id) return 0;
    const end = cooldownMap[id];
    return end ? Math.max(0, end - now) : 0;
  };

  const isMine = (c) => myCreatures.some(m => m.id === c.id);

  const handleDragStart = (e, creature) => {
    e.dataTransfer.setData("creatureId", String(creature.id));
  };

  const resolveCreature = (e) => {
    const id = Number(e.dataTransfer.getData("creatureId"));
    return allCreatures.find(c => c.id === id) || myCreatures.find(c => c.id === id);
  };

  const handleDropLeft = (e) => {
    const c = resolveCreature(e);
    if (!c) return setDragOverLeft(false);
    if (!isMine(c)) {
      toast.error("Left slot is for YOUR creatures only.");
      return setDragOverLeft(false);
    }
    if (c.id !== right?.id) setLeft(c);
    setDragOverLeft(false);
  };

  const handleDropRight = (e) => {
    const c = resolveCreature(e);
    if (!c) return setDragOverRight(false);
    if (isMine(c)) {
      toast.error("Right slot is for OPPONENT creatures. Drag yours to the left slot.");
      return setDragOverRight(false);
    }
    if (c.id !== left?.id) setRight(c);
    setDragOverRight(false);
  };

  const leftCd  = cdMs(left?.id);
  const rightCd = cdMs(right?.id);
  const canAct  = left && right && !battling && leftCd === 0 && rightCd === 0;

  // When right slot has an opponent's creature → challenge flow
  const rightIsOpponent = right && !isMine(right);

  const handleAction = () => {
    if (!canAct) return;
    if (rightIsOpponent) {
      // Send a challenge — opponent must accept
      onCreateChallenge(left.id, right.id);
    } else {
      // Direct battle (both mine, e.g. testing)
      onBattle(left.id, right.id, () => { onRefresh?.(); onFetchAll(); });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Battle Arena</h1>
      <p className="text-gray-400 text-sm mb-4">
        Drag <span className="text-arena-purple">your creature</span> to the left slot and an{" "}
        <span className="text-arena-gold">opponent's creature</span> to the right.
        Send a challenge — they must accept. Winner earns XP + 10 ARENA.
      </p>

      {/* Element reference */}
      <div className="card mb-6 py-2">
        <div className="flex flex-wrap gap-x-5 gap-y-0.5">
          {ELEMENT_ADVANTAGES.map(t => (
            <span key={t} className="text-xs text-gray-500">{t}</span>
          ))}
        </div>
      </div>

      {/* Drop slots + VS */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        {/* Left — MY fighter */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-2">🤺 My Fighter <span className="text-xs text-arena-purple">(your creature)</span></h2>
          <DropSlot
            label="Your Creature"
            icon="🤺"
            creature={left}
            dragOver={dragOverLeft}
            cooldownMs={leftCd}
            onDragOver={() => setDragOverLeft(true)}
            onDragLeave={() => setDragOverLeft(false)}
            onDrop={handleDropLeft}
            onClear={() => setLeft(null)}
          />
        </div>

        {/* VS + action button */}
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="text-6xl font-black text-arena-purple/50 select-none tracking-tighter">VS</div>

          {canAct ? (
            <div className="text-center">
              {rightIsOpponent ? (
                <button className="btn-primary px-8 py-3 text-lg" onClick={handleAction}>
                  📨 Send Challenge
                </button>
              ) : (
                <button className="btn-primary px-10 py-3 text-lg" onClick={handleAction}>
                  ⚔️ Battle!
                </button>
              )}
              {rightIsOpponent && (
                <p className="text-xs text-gray-500 mt-2 max-w-[160px] text-center">
                  Opponent must accept from their Requests tab
                </p>
              )}
            </div>
          ) : battling ? (
            <div className="text-center">
              <div className="text-2xl animate-bounce mb-2">⚔️</div>
              <p className="text-arena-purple text-sm animate-pulse">Fighting…</p>
            </div>
          ) : (left && leftCd > 0) || (right && rightCd > 0) ? (
            <div className="text-center text-sm">
              <p className="text-arena-red">Cooldown active</p>
              {left  && leftCd  > 0 && <p className="text-gray-500 text-xs">My fighter: {fmtMs(leftCd)}</p>}
              {right && rightCd > 0 && <p className="text-gray-500 text-xs">Opponent:   {fmtMs(rightCd)}</p>}
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center">
              Drop your creature left,<br/>opponent right
            </p>
          )}

          {/* Battle result */}
          {battleResult && (
            <div className={`card text-center py-3 px-4 w-full border-2 ${
              battleResult.winnerId === battleResult.myId ? "border-arena-green" : "border-arena-red"
            }`}>
              {battleResult.winnerId === battleResult.myId ? (
                <>
                  <div className="text-3xl">🏆</div>
                  <div className="text-arena-green font-bold">Victory!</div>
                  <div className="text-gray-400 text-xs mt-1">
                    +{(Number(battleResult.reward) / 1e18).toFixed(0)} ARENA earned
                  </div>
                </>
              ) : (
                <>
                  <div className="text-3xl">💀</div>
                  <div className="text-arena-red font-bold">Defeat</div>
                  <div className="text-gray-400 text-xs mt-1">+10 XP consolation</div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right — opponent */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-2">🎯 Opponent <span className="text-xs text-arena-gold">(another wallet)</span></h2>
          <DropSlot
            label="Opponent's Creature"
            icon="🎯"
            creature={right}
            dragOver={dragOverRight}
            cooldownMs={rightCd}
            onDragOver={() => setDragOverRight(true)}
            onDragLeave={() => setDragOverRight(false)}
            onDrop={handleDropRight}
            onClear={() => setRight(null)}
          />
        </div>
      </div>

      {/* ── Incoming Challenges ───────────────────────────────────────────── */}
      {incomingChallenges.length > 0 && (
        <div className="card mb-4 border-arena-purple/40">
          <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-arena-red text-white text-xs flex items-center justify-center font-bold">
              {incomingChallenges.length}
            </span>
            Incoming Challenges — Accept to Battle
          </h2>
          <div className="space-y-3">
            {incomingChallenges.map(ch => (
              <div key={ch.id} className="flex items-center gap-3 p-3 rounded-lg bg-arena-border/20 flex-wrap">
                <img
                  src={ch.challengerCreature.avatarUrl}
                  className="w-10 h-10 rounded-lg object-cover bg-arena-border"
                  onError={e => { e.target.src = `https://robohash.org/${ch.challengerTokenId}?set=set1`; }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-semibold">
                    {ch.challengerCreature.name} <span className="text-gray-400 font-normal">challenges</span> {ch.targetCreature.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    from {ch.challenger.slice(0, 6)}…{ch.challenger.slice(-4)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-primary text-xs px-4 py-1.5"
                    onClick={() => onAcceptChallenge(ch.id, ch.targetTokenId, () => { onRefresh?.(); onFetchAll(); })}
                    disabled={battling}
                  >
                    ⚔️ Accept
                  </button>
                  <button
                    className="btn-secondary text-xs px-3 py-1.5"
                    onClick={() => onDeclineChallenge(ch.id)}
                    disabled={battling}
                  >
                    ✕ Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            By accepting, you pre-approve: your ARENA and XP will update automatically based on the outcome.
          </p>
        </div>
      )}

      {/* ── Outgoing Challenges ───────────────────────────────────────────── */}
      {outgoingChallenges.length > 0 && (
        <div className="card mb-6 border-arena-border">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">📤 Challenges You Sent ({outgoingChallenges.length} pending)</h2>
          <div className="space-y-2">
            {outgoingChallenges.map(ch => (
              <div key={ch.id} className="flex items-center gap-3 p-2 rounded-lg bg-arena-border/10">
                <div className="flex-1 text-sm text-gray-300">
                  <span className="text-white font-medium">{ch.challengerCreature.name}</span>
                  <span className="text-gray-500"> → </span>
                  <span>{ch.targetCreature.name}</span>
                  <span className="text-gray-600 ml-2 text-xs">· waiting for opponent…</span>
                </div>
                <button
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  onClick={() => onCancelChallenge(ch.id)}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Creature pool — two columns ───────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-6">

        {/* Left column — MY creatures */}
        <div>
          <div className="border-b border-arena-purple/40 mb-3 pb-1 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-arena-purple" />
            <h2 className="text-sm font-semibold text-arena-purple">My Creatures</h2>
            <span className="text-xs text-gray-600">— drag to left slot</span>
            <span className="ml-auto text-xs text-gray-600">{myCreatures.length} owned</span>
          </div>

          {loadingAll ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-28" />)}
            </div>
          ) : myCreatures.length === 0 ? (
            <p className="text-xs text-gray-600 py-4 text-center">No creatures — mint one on the Dashboard.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {myCreatures.map(c => {
                const selected = left?.id === c.id || right?.id === c.id;
                const cd = cdMs(c.id);
                return (
                  <MiniCard
                    key={c.id}
                    creature={c}
                    draggable={!selected}
                    onDragStart={e => handleDragStart(e, c)}
                    dim={selected}
                    cooldownMs={cd}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Right column — OPPONENT creatures */}
        <div>
          <div className="border-b border-arena-gold/40 mb-3 pb-1 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-arena-gold" />
            <h2 className="text-sm font-semibold text-arena-gold">Opponents</h2>
            <span className="text-xs text-gray-600">— drag to right slot</span>
            <span className="ml-auto text-xs text-gray-600">
              {allCreatures.filter(c => !isMine(c)).length} creatures
            </span>
          </div>

          {loadingAll ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-28" />)}
            </div>
          ) : allCreatures.filter(c => !isMine(c)).length === 0 ? (
            <p className="text-xs text-gray-600 py-4 text-center">No other creatures found — other wallets must mint first.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {allCreatures.filter(c => !isMine(c)).map(c => {
                const selected = left?.id === c.id || right?.id === c.id;
                const cd = cdMs(c.id);
                return (
                  <MiniCard
                    key={c.id}
                    creature={c}
                    draggable={!selected}
                    onDragStart={e => handleDragStart(e, c)}
                    dim={selected}
                    cooldownMs={cd}
                  />
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
