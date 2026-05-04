const STAT_META = {
  atk: { label: "ATK", color: "bg-red-500",    max: 400 },
  def: { label: "DEF", color: "bg-blue-500",   max: 400 },
  spd: { label: "SPD", color: "bg-green-400",  max: 400 },
  hp:  { label: "HP",  color: "bg-yellow-400", max: 4000 },
};

export default function StatBar({ stat, value }) {
  const meta  = STAT_META[stat];
  const pct   = Math.min(100, (value / meta.max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 text-gray-400 font-semibold">{meta.label}</span>
      <div className="stat-bar-track flex-1">
        <div className={`stat-bar-fill ${meta.color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-gray-300">{value}</span>
    </div>
  );
}
