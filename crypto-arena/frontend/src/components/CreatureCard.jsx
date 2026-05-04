import StatBar from "./StatBar.jsx";
import { ELEMENT_CLASSES } from "../config.js";

export default function CreatureCard({ creature, selected, onClick, actions, compact = false }) {
  if (!creature) return null;
  const { name, level, xp, winCount, lossCount, elementName, elementEmoji, rarityName, rarityColor, stats, avatarUrl } = creature;

  const xpNeeded = level * level * 10;
  const xpPct    = Math.min(100, (xp / xpNeeded) * 100);
  const elClass  = ELEMENT_CLASSES[creature.element] || "";

  return (
    <div
      className={`creature-card card cursor-pointer transition-all duration-200 select-none
        ${selected ? "border-arena-purple ring-1 ring-arena-purple" : "hover:border-gray-600"}
        ${compact ? "p-3" : ""}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-white truncate max-w-[120px]" title={name}>{name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="badge" style={{ background: rarityColor + "22", color: rarityColor }}>
              {rarityName}
            </span>
            <span className={`text-sm font-semibold ${elClass}`}>
              {elementEmoji} {elementName}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-arena-gold font-bold">Lv {level}</div>
          <div className="text-xs text-gray-500">#{creature.id}</div>
        </div>
      </div>

      {/* Avatar */}
      <div className="flex justify-center mb-3">
        <div className="relative">
          <img
            src={avatarUrl}
            alt={name}
            className="w-24 h-24 rounded-xl object-cover bg-arena-border"
            loading="lazy"
            onError={(e) => { e.target.src = `https://robohash.org/${creature.id}?set=set1&size=200x200`; }}
          />
          {selected && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-arena-purple rounded-full border-2 border-arena-bg" />
          )}
        </div>
      </div>

      {/* XP bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>XP</span>
          <span>{xp} / {xpNeeded}</span>
        </div>
        <div className="stat-bar-track">
          <div className="stat-bar-fill bg-arena-purple" style={{ width: `${xpPct}%` }} />
        </div>
      </div>

      {!compact && (
        <>
          {/* Stats */}
          <div className="space-y-1.5 mb-3">
            {["atk", "def", "spd", "hp"].map(s => (
              <StatBar key={s} stat={s} value={stats[s]} />
            ))}
          </div>

          {/* Win / Loss */}
          <div className="flex gap-3 text-xs text-gray-500 mb-3">
            <span className="text-green-400 font-semibold">{winCount}W</span>
            <span className="text-red-400 font-semibold">{lossCount}L</span>
            <span className="ml-auto">
              {winCount + lossCount > 0
                ? `${((winCount / (winCount + lossCount)) * 100).toFixed(0)}% win`
                : "No battles"}
            </span>
          </div>
        </>
      )}

      {/* Actions */}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
