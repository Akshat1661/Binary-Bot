import { useEffect, useState } from "react";
import CreatureCard from "../components/CreatureCard.jsx";
import Modal from "../components/Modal.jsx";

export default function Dashboard({ creatures, loading, arenaBalance, reputation, onMint, onBreed, onLevelUp, onRefresh, account }) {
  const [mintModal, setMintModal]   = useState(false);
  const [breedModal, setBreedModal] = useState(false);
  const [mintName, setMintName]     = useState("");
  const [breedName, setBreedName]   = useState("");
  const [parent1, setParent1]       = useState(null);
  const [parent2, setParent2]       = useState(null);

  const handleMint = () => {
    if (!mintName.trim()) return;
    onMint(mintName.trim());
    setMintName("");
    setMintModal(false);
  };

  const handleBreed = () => {
    if (!parent1 || !parent2 || !breedName.trim()) return;
    onBreed(parent1.id, parent2.id, breedName.trim());
    setParent1(null); setParent2(null); setBreedName("");
    setBreedModal(false);
  };

  const selectParent = (creature) => {
    if (!parent1 || (parent1 && parent2)) {
      setParent1(creature); setParent2(null);
    } else if (parent1.id !== creature.id) {
      setParent2(creature);
    }
  };

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="text-6xl">⚔️</div>
        <h1 className="text-3xl font-bold text-white">CryptoArena</h1>
        <p className="text-gray-400 max-w-sm">
          Collect, breed, and battle unique on-chain creatures. Connect your wallet to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">My Army</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {creatures.length} creature{creatures.length !== 1 ? "s" : ""} · {Number(arenaBalance).toFixed(2)} ARENA
            {reputation > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-arena-gold">
                · ⭐ {reputation} Rep
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={onRefresh} disabled={loading} title="Refresh">
            {loading ? "…" : "↻"}
          </button>
          <button className="btn-secondary" onClick={() => setBreedModal(true)} disabled={creatures.length < 2}>
            🧬 Breed
          </button>
          <button className="btn-primary" onClick={() => setMintModal(true)}>
            + Mint Creature
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse h-80 bg-arena-border/20" />
          ))}
        </div>
      ) : creatures.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">🥚</div>
          <p className="text-gray-400">No creatures yet. Mint your first one!</p>
          <button className="btn-primary mt-4" onClick={() => setMintModal(true)}>
            Mint Creature (0.01 ETH)
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {creatures.map(c => (
            <CreatureCard
              key={c.id}
              creature={c}
              actions={
                <>
                  <button
                    className="btn-secondary text-xs flex-1"
                    onClick={(e) => { e.stopPropagation(); onLevelUp(c.id); }}
                    title="Costs 20 ARENA"
                  >
                    ↑ Level Up (20 ARENA)
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      {/* Mint Modal */}
      <Modal open={mintModal} onClose={() => setMintModal(false)} title="Mint New Creature">
        <p className="text-gray-400 text-sm mb-4">
          Cost: <span className="text-white font-semibold">0.01 ETH</span>. DNA and stats are randomly
          generated on-chain. Element, rarity, ATK/DEF/SPD/HP encoded in your creature's DNA.
        </p>
        <label className="block text-sm text-gray-400 mb-1">Creature Name</label>
        <input
          className="input mb-4"
          placeholder="e.g. BlazeFang"
          value={mintName}
          onChange={e => setMintName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleMint()}
          maxLength={32}
        />
        <button className="btn-primary w-full" onClick={handleMint} disabled={!mintName.trim()}>
          Mint (0.01 ETH)
        </button>
      </Modal>

      {/* Breed Modal */}
      <Modal open={breedModal} onClose={() => { setBreedModal(false); setParent1(null); setParent2(null); }} title="Breed Creatures">
        <p className="text-gray-400 text-sm mb-3">
          Select two parents. Child DNA is a blend of both.
          Costs ARENA tokens (50–500 based on rarity).
        </p>
        <div className="text-xs text-arena-red bg-arena-red/10 border border-arena-red/20 rounded-lg px-3 py-2 mb-3">
          ⚠️ Both parent creatures will be <strong>permanently destroyed</strong> after breeding.
        </div>
        <div className="flex gap-2 mb-3">
          {[parent1, parent2].map((p, i) => (
            <div key={i} className={`flex-1 card text-center py-3 text-sm ${p ? "border-arena-purple" : "border-dashed"}`}>
              {p ? (
                <>
                  <img src={p.avatarUrl} className="w-12 h-12 rounded-lg mx-auto mb-1" alt="" />
                  <div className="font-semibold text-white text-xs">{p.name}</div>
                  <div className="text-gray-500 text-xs">Lv {p.level}</div>
                </>
              ) : (
                <span className="text-gray-600">Parent {i + 1}</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mb-2">Click a creature to select parent:</p>
        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto mb-3">
          {creatures.map(c => (
            <button
              key={c.id}
              onClick={() => selectParent(c)}
              className={`card text-center p-2 text-xs hover:border-arena-purple transition-colors
                ${(parent1?.id === c.id || parent2?.id === c.id) ? "border-arena-purple" : ""}`}
            >
              <img src={c.avatarUrl} className="w-8 h-8 rounded mx-auto mb-1" alt="" />
              <div className="text-gray-300 truncate">{c.name}</div>
            </button>
          ))}
        </div>
        <label className="block text-sm text-gray-400 mb-1">Child Name</label>
        <input
          className="input mb-4"
          placeholder="e.g. ShadowPup"
          value={breedName}
          onChange={e => setBreedName(e.target.value)}
          maxLength={32}
        />
        <button
          className="btn-primary w-full"
          onClick={handleBreed}
          disabled={!parent1 || !parent2 || !breedName.trim()}
        >
          Breed 🧬
        </button>
      </Modal>
    </div>
  );
}
