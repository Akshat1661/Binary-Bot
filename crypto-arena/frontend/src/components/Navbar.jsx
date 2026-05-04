import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/",            label: "⚔️  My Army"      },
  { to: "/battle",      label: "🥊  Battle",       challengeKey: true },
  { to: "/marketplace", label: "🏪  Market"        },
  { to: "/tournaments", label: "🏆  Tournaments"   },
  { to: "/items",       label: "⚗️  Items"         },
  { to: "/escrow",      label: "🔒  Escrow"        },
  { to: "/disputes",    label: "⚖️  Disputes"      },
  { to: "/treasury",    label: "🏛️  Treasury"      },
];

export default function Navbar({
  account, arenaBalance, reputation,
  connecting, isCorrectChain,
  onConnect, onSwitchNetwork,
  incomingChallengeCount,
}) {
  const short = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : null;

  return (
    <header className="sticky top-0 z-50 bg-arena-bg/80 backdrop-blur border-b border-arena-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <span className="text-xl font-bold text-white tracking-tight select-none whitespace-nowrap">
          Crypto<span className="text-arena-purple">Arena</span>
        </span>

        {/* Nav links */}
        <nav className="flex gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
          {NAV.map(({ to, label, challengeKey }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `relative px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-arena-purple/20 text-arena-purple font-semibold"
                    : "text-gray-400 hover:text-white hover:bg-arena-border"
                }`
              }
            >
              {label}
              {challengeKey && incomingChallengeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {incomingChallengeCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 text-sm flex-shrink-0">
          {account && (
            <div className="text-right hidden sm:block">
              <div className="text-arena-gold font-semibold text-xs">
                {Number(arenaBalance).toFixed(1)} ARENA
              </div>
              {reputation > 0 && (
                <div className="text-[10px] text-gray-500">⭐ {reputation} Rep</div>
              )}
            </div>
          )}

          {!account ? (
            <button className="btn-primary text-sm" onClick={onConnect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          ) : !isCorrectChain ? (
            <button className="btn-danger text-sm" onClick={onSwitchNetwork}>
              Wrong Network
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-arena-card border border-arena-border rounded-lg px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-arena-green animate-pulse" />
              <span className="text-gray-300 font-mono text-xs">{short}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
