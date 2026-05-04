# CryptoArena — Blockchain Gaming Ecosystem
**Advanced Blockchain Final Project — Spring 2026**
Team: Akshat Desai & Jiya Desai

---

## Overview
CryptoArena is a full-stack decentralised gaming DApp where players collect, breed, and battle unique NFT creatures. Each creature has on-chain DNA encoding its element type, base stats, and rarity. The ecosystem includes:

- **5 Smart Contracts** (Solidity 0.8.24 / OpenZeppelin v5)
- **React + Vite frontend** with Tailwind CSS & ethers.js v6
- **Local Hardhat node** for development; **Sepolia testnet** for demo
- **Vercel** for frontend hosting

---

## Features
| # | Feature | Contract |
|---|---------|----------|
| 1 | ERC-721 NFT creature minting with on-chain DNA | CreatureNFT |
| 2 | Genetic breeding (bitwise DNA blend + mutation) | CreatureNFT |
| 3 | 6-element type system (Fire/Water/Earth/Air/Light/Dark) | CreatureNFT + BattleEngine |
| 4 | PvP battle engine with element advantages (±50%) | BattleEngine |
| 5 | XP & levelling system (quadratic XP curve) | CreatureNFT |
| 6 | Play-to-earn ARENA token (ERC-20) | ArenaToken |
| 7 | Fixed-price marketplace listings | Marketplace |
| 8 | English auction with auto-refund of outbid deposits | Marketplace |
| 9 | ERC-2981 on-chain royalties (5% to original minter) | Marketplace + CreatureNFT |
| 10 | 2.5% platform fee on all sales | Marketplace |
| 11 | Tournament system — single elimination brackets | TournamentManager |
| 12 | Prize pool distribution (60/25/10/5 split) | TournamentManager |
| 13 | Battle cooldown (10 min per creature) | BattleEngine |
| 14 | ARENA token rewards for battle wins | BattleEngine |
| 15 | Breed cooldown + max breed count per creature | CreatureNFT |
| 16 | Role-based access control (GAME_ROLE, MINTER_ROLE) | All contracts |
| 17 | Reentrancy guards on all ETH-handling functions | All contracts |
| 18 | Auto-refund of overpayment (mint fee, entry fee, buy) | All contracts |

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity ^0.8.24, OpenZeppelin v5 |
| Framework | Hardhat v2, hardhat-toolbox |
| Frontend | React 18, Vite, Tailwind CSS v3 |
| Web3 | ethers.js v6 |
| Wallet | MetaMask |
| Avatar | RoboHash API |
| Hosting | Vercel (frontend) |

---

## Local Setup

### 1. Clone / open the project
```bash
cd crypto-arena
```

### 2. Install Hardhat dependencies
```bash
npm install
```

### 3. Start local Hardhat node
```bash
npx hardhat node
```
This starts a local blockchain at `http://127.0.0.1:8545` (chainId 31337).

### 4. Deploy contracts (new terminal)
```bash
npx hardhat run scripts/deploy.js --network localhost
```
This will:
- Deploy all 5 contracts
- Wire roles between contracts
- Write contract addresses + ABIs to `frontend/src/`

### 5. Install & start the frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000`

### 6. MetaMask setup
1. Add network: RPC `http://127.0.0.1:8545`, ChainID `31337`, symbol `ETH`
2. Import a Hardhat test account (private key printed by `npx hardhat node`)
3. Connect wallet in the app

---

## Testnet (Sepolia) Deployment

1. Copy `.env.example` → `.env` and fill in your keys
2. Deploy: `npx hardhat run scripts/deploy.js --network sepolia`
3. Update `frontend/src/config.js` with the new addresses
4. Deploy frontend to Vercel: `cd frontend && npx vercel`

---

## Running Tests
```bash
npx hardhat test
```
18 tests covering all contracts.

---

## Contract Architecture
```
ArenaToken (ERC-20)
    ↑ MINTER_ROLE
BattleEngine ──→ CreatureNFT (ERC-721 + ERC-2981)
                     ↑ GAME_ROLE
              TournamentManager
Marketplace  ──→ CreatureNFT
```

## DNA Encoding
```
bits  0-2   element   (% 6 → Fire/Water/Earth/Air/Light/Dark)
bits  3-9   baseATK   (+ 50 floor)
bits 10-16  baseDEF   (+ 30 floor)
bits 17-23  baseSPD   (+ 20 floor)
bits 24-30  baseHP    (* 5 + 100 floor)
bits 31-32  rarity    (Common/Uncommon/Rare/Legendary)
bits 33-40  trait1    (color palette — used by avatar URL)
bits 41-48  trait2    (body type)
bits 49+    uniqueness (mixed in from breeding mutation)
```
