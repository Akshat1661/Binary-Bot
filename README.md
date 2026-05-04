# CryptoArena - CPSC 559 Final Project

## Binary Bots
### Akshat Sureshbhai Desai (820501773)
### Jiya Prashant Desai (817816879)

A full-stack Web3 decentralized application built from scratch with 10 original Solidity smart contracts, a React + Vite frontend, and MetaMask wallet integration. CryptoArena is a creature-battling NFT game where players mint, train, battle, trade, and compete with on-chain creatures - all governed by smart contracts on a local Hardhat blockchain (or Sepolia testnet for live demo).

**Midterm Repo:** [https://github.com/Akshat1661/Binary-Bot](https://github.com/Akshat1661/Binary-Bot)

---

## Table of Contents

1. [Features](#features)
2. [Smart Contracts](#smart-contracts)
3. [Contract Architecture](#contract-architecture)
4. [Tech Stack](#tech-stack)
5. [Local Setup & Run Instructions](#local-setup--run-instructions)
6. [Deploying to Vercel + Sepolia](#deploying-to-vercel--sepolia)
7. [MetaMask Configuration](#metamask-configuration)

## Features

### Dashboard - My Army
- **Mint a Creature** - Pay 10 ARENA tokens to mint a new creature NFT. DNA, element (Fire/Water/Earth/Air/Light/Dark), rarity (Common/Uncommon/Rare/Legendary), and stats (ATK/DEF/SPD/HP) are generated pseudo-randomly on-chain.
- **Level Up** - Spend ARENA tokens to increase a creature's level (10 ARENA × current level). Higher levels improve stats.
- **Breed Creatures** - Combine two creatures to produce an offspring that inherits averaged stats from both parents. Costs 20 ARENA per breed.
- **Live Avatars** - Each creature renders a unique avatar via RoboHash, deterministically derived from its on-chain DNA. Rarity shown with color-coded borders.

### Battle Arena
- **1v1 Battles** - Challenge any creature from any wallet. Winner is decided by a stat comparison with ±15% random variance using `block.prevrandao`.
- **Challenge System** - Send, accept, decline, or cancel challenges. Challenged player sees incoming challenge requests in real time.
- **Cooldown Timer** - After a battle, a 1-minute cooldown is enforced on-chain. Frontend shows a live countdown per creature.
- **Reputation** - Winners earn +15 on-chain reputation points; losers earn +5 participation reputation. Reputation is stored in `ReputationSystem.sol`.
- **ARENA Rewards** - Winners earn 10 ARENA tokens per battle win.

### NFT Marketplace
- **Fixed-Price Listings** - List any creature at a set ETH price. A 2.5% platform fee is deducted on every sale, routed to the Treasury.
- **Auctions** - List a creature with a reserve price and duration (1 minute / 1 hour / 24 hours). Anyone can place bids. Winner takes the creature; reserve-unmet auctions refund the bidder.
- **Batch Operations** - List multiple creatures at once (`batchListFixed`) or buy multiple fixed-price listings in one transaction (`batchBuy`).
- **Royalties** - Creators earn 5% royalty on every secondary sale (ERC-2981).
- **My Listings vs Others** - Tab view separates your active listings from the broader marketplace.

### Tournaments
- **Create a Tournament** - Set ETH entry fee, max participants, and registration window.
- **Join with a Creature** - Pay the ETH entry fee to register a creature in the tournament bracket.
- **Round-by-Round Results** - Each round is advanced manually after a 60-second delay. Every match shows "Creature A vs Creature B → Creature A won" with the loser struck through.
- **Prizes** - Winner earns 100% of the ETH prize pool plus 500 ARENA.
- **Reputation & XP** - Tournament winner gains +20 reputation and 200 XP on-chain.

### Game Items Shop
- **XP Potion** - Instantly grants 100 XP to any of your creatures (cost: 10 ARENA).
- **Breed Boost** - Grants 200 XP simulating an offspring bonus (cost: 25 ARENA).
- **Battle Boost** - Grants 50 XP and records an extra win (cost: 15 ARENA).
- Items are ERC-1155 tokens. Admins can mint items via `adminMint`.

### Escrow Trades
- **Peer-to-Peer Escrow** - Seller locks a creature NFT in escrow; buyer deposits ETH. Neither party can back out mid-trade.
- **Confirm Delivery** - Buyer confirms they received the creature, releasing ETH to the seller.
- **Auto-Release** - If buyer doesn't act within 48 hours, ETH auto-releases to seller.
- **Dispute** - Buyer can raise a dispute before the deadline, triggering arbitration.
- **Cancel** - The seller can cancel before the escrow is accepted.

### Dispute Resolution
- **Staked Arbitrators** - Any user can stake 100 ARENA to join the arbitrator pool. Minimum 3 needed for any dispute.
- **Exclusion** - Buyer and seller are automatically excluded from their own dispute's arbitrator selection.
- **Majority Vote** - 3 arbitrators are randomly selected. Each votes "Favor Buyer" or "Favor Seller". 2-of-3 majority wins. 48-hour voting window.
- **Rewards** - Each voting arbitrator earns 20 ARENA immediately on vote submission.
- **Reputation Slash** - Losing party of a dispute has their on-chain reputation slashed by 30 points.
- **Outcome Display** - After resolution, the result shows "Buyer Won (2-1 votes)" or "Seller Won".

### Platform Treasury
- **Fee Collection** - All 2.5% marketplace fees are automatically routed to the Treasury contract's `receive()` function.
- **On-Chain History** - Every allocation is permanently recorded on-chain with recipient, amount, reason, and timestamp.
- **Admin Allocation** - Only the deployer wallet (Account #0) holds `ADMIN_ROLE` and can call `allocate()`.
- **Utilization Bar** - Shows what % of all received ETH has been allocated.

---

## Smart Contracts

All 10 contracts live in `crypto-arena/contracts/`.

| Contract                | Purpose                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArenaToken.sol`        | ERC-20 token (ARENA). Minted by game contracts as rewards. `grantMinterRole` controls who can mint.                                                       |
| `CreatureNFT.sol`       | ERC-721 + ERC-2981 NFT. Stores all creature stats (atk, def, spd, hp, element, rarity, xp, level). `grantGameRole` lets game contracts modify stats.      |
| `BattleEngine.sol`      | 1v1 battles and challenge system. Uses `block.prevrandao` for ±15% variance. Awards ARENA + reputation on win.                                            |
| `Marketplace.sol`       | Fixed-price and auction listings. 2.5% fee to Treasury. Royalty support via ERC-2981. `batchListFixed` and `batchBuy` for gas-efficient multi-ops.        |
| `TournamentManager.sol` | Round-by-round bracket tournaments. `startTournament()` runs Round 1; `advanceRound()` runs subsequent rounds (60s delay). Emits `MatchPlayed` per fight. |
| `ReputationSystem.sol`  | On-chain reputation scores per wallet. Callable only by whitelisted game contracts via `REP_CALLER_ROLE`.                                                 |
| `GameItems.sol`         | ERC-1155 consumable items (XP Potion, Breed Boost, Battle Boost). Purchased with ARENA. Items apply stat changes to creatures.                            |
| `Escrow.sol`            | Peer-to-peer ETH ↔ NFT trade escrow with confirmation window, auto-release, and dispute hook.                                                             |
| `DisputeResolution.sol` | Stake-to-arbitrate system. Excludes buyer/seller from selection pool. 3-arbitrator majority vote. ARENA rewards on vote.                                  |
| `Treasury.sol`          | Receives marketplace fees via `receive()`. `allocate()` sends ETH to any address with on-chain audit trail. AccessControl admin-only.                     |

---

## Contract Architecture

```
ArenaToken (ERC-20)
    ├── MINTER_ROLE → BattleEngine, TournamentManager, DisputeResolution
    └── balanceOf / mint / approve / transferFrom

CreatureNFT (ERC-721 + ERC-2981)
    ├── GAME_ROLE  → BattleEngine, TournamentManager, GameItems
    └── addXP / levelUp / recordWin / setStats / royaltyInfo

ReputationSystem
    └── REP_CALLER_ROLE → BattleEngine, Marketplace, TournamentManager,
                          Escrow, DisputeResolution

BattleEngine ──────────────────── reads: CreatureNFT
    └── challenge / acceptChallenge / battle  writes: ReputationSystem, ArenaToken

Marketplace ───────────────────── reads: CreatureNFT
    └── listFixed / listAuction / buy / bid   writes: ReputationSystem
    └── 2.5% fee ──────────────────────────→ Treasury.receive()

TournamentManager ─────────────── reads: CreatureNFT
    └── create / join / startTournament       writes: ArenaToken, ReputationSystem
    └── advanceRound (60s delay)

GameItems (ERC-1155)
    └── buy / useXPPotion / useBreedBoost / useBattleBoost  writes: CreatureNFT

Escrow ─────────────────────────── holds: CreatureNFT (NFT lock)
    └── create / accept / confirmDelivery / raiseDispute → DisputeResolution
    └── writes: ReputationSystem

DisputeResolution
    ├── stakeToArbitrate / unstake
    ├── createDispute (excludes buyer+seller from pool)
    ├── vote (3 arbitrators, 48hr window) → writes: ArenaToken (rewards)
    └── _finalize → Escrow.resolveDispute → writes: ReputationSystem

Treasury
    └── receive() ← Marketplace fees
    └── allocate() ← ADMIN_ROLE only
```

---

## Tech Stack

| Layer            | Technology                                    |
| ---------------- | --------------------------------------------- |
| Smart Contracts  | Solidity ^0.8.24, Hardhat 2.x, OpenZeppelin 5 |
| Local Blockchain | Hardhat Network (chainId 31337, port 8545)    |
| Frontend         | React 18, Vite, Tailwind CSS, ethers.js v6    |
| Wallet           | MetaMask                                      |
| Notifications    | react-hot-toast                               |
| Avatars          | RoboHash API (deterministic from DNA)         |
| Deployment       | Vercel (frontend) + Alchemy RPC (Sepolia)     |

---

## Local Setup & Run Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [MetaMask](https://metamask.io/) browser extension

### Step 1 - Install dependencies

```bash
cd crypto-arena
npm install
cd frontend
npm install
cd ..
```

### Step 2 - Compile contracts

```bash
npx hardhat compile
```

### Step 3 - Start the local Hardhat node

Open a **dedicated terminal** and keep it running:

```bash
npx hardhat node
```

This starts a local blockchain at `http://127.0.0.1:8545` with 20 pre-funded accounts (10,000 ETH each). The terminal will print all 20 account addresses and private keys - copy at least 5 of them for testing.

### Step 4 - Deploy contracts

Open a **second terminal** (keep the node running in the first):

```bash
npx hardhat run scripts/deploy.js --network localhost
```

This will:
- Deploy all 10 contracts in dependency order
- Wire all cross-contract roles automatically
- Distribute 10,000 ARENA tokens to accounts 0–9
- Mint test GameItems (XP Potions, Breed Boosts, Battle Boosts) to accounts 0–4
- Write `frontend/src/config.js` with all contract addresses
- Copy compiled ABIs to `frontend/src/abi/`

**Important:** You must re-run this step every time you restart the Hardhat node, because the node resets all state on restart.

### Step 5 - Start the frontend

Open a **third terminal**:

```bash
cd frontend
npm run dev
```

The app will be available at `http://localhost:5173`.

### Step 6 - Configure MetaMask

See the [MetaMask Configuration](#metamask-configuration) section below.

### Daily workflow summary

```bash
# Terminal 1 (keep open)
cd crypto-arena && npx hardhat node

# Terminal 2 (run once per node restart)
cd crypto-arena && npx hardhat run scripts/deploy.js --network localhost

# Terminal 3 (keep open)
cd crypto-arena/frontend && npm run dev
```

---

## Deploying to Vercel + Sepolia

This section is optional. For the final demo, we used the local Hardhat network. Vercel requires contracts to be deployed on a public testnet such as Sepolia, which needs testnet ETH and extra setup.

### Prerequisites

- [Alchemy account](https://www.alchemy.com/) (free tier is fine)
- [Vercel account](https://vercel.com/) (free tier is fine)
- [Vercel CLI](https://vercel.com/docs/cli): `npm install -g vercel`
- Sepolia ETH for the deployer - get from [https://sepoliafaucet.com](https://sepoliafaucet.com) or [https://faucet.quicknode.com/ethereum/sepolia](https://faucet.quicknode.com/ethereum/sepolia)

### Step 1 - Get an Alchemy RPC URL

1. Log in to [https://www.alchemy.com/](https://www.alchemy.com/)
2. Create a new app → select **Ethereum** → select **Sepolia**
3. Copy the **HTTPS** URL (looks like `https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY`)

### Step 2 - Add Sepolia network to hardhat.config.js

Open `crypto-arena/hardhat.config.js` and add:

```js
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: "https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY",   // ← paste your Alchemy URL
      accounts: ["0xYOUR_DEPLOYER_PRIVATE_KEY"],                   // ← MetaMask deployer private key
      chainId: 11155111,
    },
  },
};
```

**Never commit your private key.** Use a `.env` file instead:

```bash
# .env (add to .gitignore!)
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
DEPLOYER_KEY=0xYOUR_PRIVATE_KEY
```

```js
// hardhat.config.js with dotenv
require("dotenv").config();
module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC,
      accounts: [process.env.DEPLOYER_KEY],
      chainId: 11155111,
    },
  },
};
```

### Step 3 - Deploy contracts to Sepolia

```bash
cd crypto-arena
npx hardhat run scripts/deploy.js --network sepolia
```

The script automatically writes `frontend/src/config.js` with the live Sepolia addresses and sets `rpcUrl` to the Alchemy endpoint. Wait for the script to finish (may take 1–3 minutes on Sepolia).

**Update the RPC URL in config.js:** After deployment, open `frontend/src/config.js` and make sure `rpcUrl` matches your Alchemy endpoint and `chainId` is `11155111`.

```js
export const CHAIN_CONFIG = {
  chainId: 11155111,
  name: "sepolia",
  rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY",
};
```

### Step 4 - Build the frontend

```bash
cd crypto-arena/frontend
npm run build
```

This creates a `dist/` folder with the production-optimized app.

### Step 5 - Deploy to Vercel

```bash
cd crypto-arena/frontend
vercel
```

Follow the prompts:
- **Set up and deploy?** → Y
- **Which scope?** → your personal account
- **Link to existing project?** → N (first time)
- **Project name** → `crypto-arena` (or anything)
- **Directory** → `./` (you're already in the frontend folder)
- **Override build command?** → N (Vercel auto-detects Vite)
- **Override output directory?** → N

After deploy completes, Vercel will print a URL like `https://crypto-arena-xyz.vercel.app`. That's your live app.

For future deployments after code changes:

```bash
cd crypto-arena/frontend
npm run build
vercel --prod
```

### Step 6 - Share with participants

Send all 5 participants:
1. The Vercel URL
2. Instructions to add Sepolia to MetaMask (see below)
3. A small amount of Sepolia ETH (for gas) - send from the deployer wallet
4. The deployer's wallet already has 10,000 ARENA from deploy script; mint more if needed via `arenaToken.mint(address, amount)`

---

## MetaMask Configuration

### For local Hardhat network

1. Open MetaMask → click the network dropdown → **Add a network manually**
2. Fill in:
   - **Network Name:** `Hardhat Local`
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency Symbol:** `ETH`
3. Click Save and switch to **Hardhat Local**

**Import test accounts:**
When you run `npx hardhat node`, it prints 20 accounts with their private keys. Import the accounts you want to test with:
- MetaMask → click the account icon → **Import Account** → paste the private key

Account #0 is the deployer and the only Treasury admin.

### For Sepolia testnet

1. MetaMask → **Add a network manually**
2. Fill in:
   - **Network Name:** `Sepolia`
   - **RPC URL:** `https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY` (your Alchemy key)
   - **Chain ID:** `11155111`
   - **Currency Symbol:** `ETH`
   - **Block Explorer URL:** `https://sepolia.etherscan.io`
3. Click Save

**Get Sepolia ETH (testnet only, no real value):**
- [https://sepoliafaucet.com](https://sepoliafaucet.com)
- [https://faucet.quicknode.com/ethereum/sepolia](https://faucet.quicknode.com/ethereum/sepolia)

---

## Notes for Graders / Participants

- **Treasury Admin** - Only Account #0 (the deployer) can call `allocate()`. Switching to any other account will show "Switch to the deployer wallet (Account #0) to allocate."
- **Arbitrator Pool** - At least 3 *different* wallets must call `stakeToArbitrate()` before any dispute can be raised. The buyer and seller are automatically excluded from their own dispute's arbitrators.
- **Auction Timing** - The 1-minute auction option is available for quick demos. On Hardhat, block timestamps can be advanced with `npx hardhat node --mining-interval 0` or `evm_increaseTime` if needed.
- **Tournament Rounds** - After `startTournament()`, each subsequent round requires clicking "Next Round" once 60 seconds have passed. The button appears automatically with a countdown.
- **Re-deploying** - Every time you restart `npx hardhat node`, you must re-run `deploy.js` to get fresh addresses. The frontend config is overwritten automatically.
