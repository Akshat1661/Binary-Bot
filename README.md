# CryptoZombies DApp — CPSC 559 Midterm Project

## Binary Bots
### Akshat Sureshbhai Desai (820501773)
### Jiya Prashant Desai (817816879)

A Web3 decentralized application built on top of the CryptoZombies tutorial smart contract, extended with custom gameplay features and an on-chain NFT marketplace. Runs on a local Ganache blockchain with MetaMask for wallet integration.

---

## Demo Video

[Binary Bots Demo Video](https://drive.google.com/file/d/1z4NTEP-Iqwb0rx8W8IeHwXSdYtahWxp8/view?usp=drive_link)

## Github Link

[Binary Bots Repo Link](https://github.com/Akshat1661/Binary-Bot)

---

## Features

### Starter Pack Features (from CryptoZombies tutorial)

**1.1 Create Zombie**
The base tutorial provided a `createRandomZombie` function that generates a zombie with a pseudo-random DNA from the zombie's name. Our change: the player now enters a custom name for their zombie through a modal input, giving each zombie a personal identity rather than a system-assigned one.

**1.2 Level Up (0.001 ETH)**
Pays 0.001 ETH to the contract to increment a zombie's level by 1. Higher levels unlock additional features like DNA mutation (Level 5+).

**1.3 Show Zombie Army**
The tutorial required manually pressing a button to refresh and display the zombie list. Our change: zombie data is fetched and rendered automatically on wallet connection and after every on-chain action (create, battle, buy, sell, gift, fuse, mutate). Additionally, a polling mechanism checks the blockchain every second and auto-refreshes the view if any state has changed — so both wallets stay in sync without a manual page reload.

---

### Custom Features

**2.1 Zombie Avatar**
Every zombie has a unique visual avatar generated from its 16-digit DNA using the [RoboHash API](https://robohash.org). Since each DNA maps to a deterministic image, two zombies with identical DNA will look exactly identical. The avatar updates live in the UI whenever DNA changes.

**2.2 Website UI**
A custom dark-themed UI was built from scratch using CSS. Zombie cards are displayed in a responsive grid. Each card shows the zombie's avatar, name, DNA, level, win/loss stats, and battle readiness. Modals handle all user interactions (create, fuse, gift, sell) to keep the main view clean. Action buttons on each card adapt dynamically based on the zombie's current state (e.g., listed, on cooldown, level-locked).

**2.3 Zombie Battle Arena**
A zombie can enter battle against a randomly generated wild zombie. The wild zombie's level is a random number from 1 to `(your zombie's level + 2)`, generated on-chain using `keccak256` hashing. If the wild zombie's level is greater than or equal to your zombie's level, it's a defeat — no level change. If your zombie's level is strictly greater, it wins — the zombie's level increases by 1 at no cost, and its win count increments. All outcomes are broadcast via the `BattleOutcome` event.

**2.4 Cooldown Timer**
After every battle, a 1-minute cooldown is written to the zombie's `readyTime` field on-chain. The `isReady` modifier enforces this at the contract level — attempting to battle before the timer expires will revert the transaction. On the frontend, each zombie card shows either "Ready to battle!" or a live countdown (minutes and seconds) that ticks in real time. The battle button is disabled during the cooldown period.

**2.5 DNA Mutation**
A paid feature (cost: 0.01 ETH) unlocked at Level 5+. The player types a new 16-digit DNA string into an inline panel on the zombie card. As each digit is entered, the zombie's avatar updates in real time to preview what the new DNA will look like — digit by digit. Submitting confirms the mutation on-chain and permanently changes the zombie's DNA and appearance. Since the avatar is fully deterministic from the DNA, two zombies with the same DNA will render as identical twins.

**2.6 Zombie Fusion**
Allows a player to select any two of their own zombies and fuse them into a brand new zombie. The new zombie's DNA is the average of both parents' DNA values (rounded to the nearest 100 to strip the last two digits). Its level is a random number between `min(level1, level2)` and `min(level1, level2) + max(level1, level2)`, computed on-chain using `keccak256`. For example, fusing a Level 25 and a Level 50 zombie produces a new zombie anywhere between Level 25 and Level 75. The fusion is a paid function: cost = `(level1 + level2) × 0.001 ETH`. Upon fusion, both parent zombies are made permanently unreachable — their ownership is set to the zero address (`address(0)`) and their count is decremented from the owner's balance — effectively burning them. The fused zombie is then minted as a new entry and assigned to the caller's wallet.

**2.7 Gift Zombie**
Transfers full ERC-721 ownership of a zombie to any other wallet address. Implemented using the standard `transferFrom` function from the ERC-721 contract. Once transferred, the zombie is removed from the sender's army and appears in the recipient's army. To prevent accidental transfers, a two-step confirmation modal is used: the user enters the recipient address once, then must re-type it exactly to confirm — any mismatch blocks the transfer. The gift is irreversible once confirmed on-chain.

**2.8 NFT Marketplace**

**2.8.1 Sell Zombie**
Any zombie can be listed for sale on the shared marketplace. The owner sets a price in ETH. Once listed, the zombie is locked — level up, battle, mutate, and gift are all blocked for that zombie, and only an "Unlist" button is shown on the card. The owner can delist the zombie at any time if it hasn't been sold yet, which restores all action buttons.

**2.8.2 Buy Zombie / Marketplace Section**
All wallets on the network share access to the same marketplace, which lists every zombie currently for sale. When a buyer clicks "Buy", a single on-chain transaction handles everything atomically: the contract first transfers ownership of the zombie to the buyer (state change before any ETH moves, preventing re-entrancy), then sends the exact listed price to the seller's wallet using `seller.transfer(price)`. Any ETH sent above the listed price is automatically refunded to the buyer. After the transaction confirms, the zombie appears in the buyer's army and disappears from the marketplace.

**2.8.3 Buyer-Seller Conflict Prevention**
All wallets see the same marketplace listings. However, a seller's own listed zombies are hidden from their marketplace view so they cannot attempt to buy their own zombie. This is enforced at both the frontend (filter by `owner !== userAccount`) and the smart contract level (`require(seller != msg.sender)`), providing double protection.

---

## Tech Stack

| Layer            | Technology                       |
| ---------------- | -------------------------------- |
| Smart Contracts  | Solidity 0.4.25, Truffle         |
| Local Blockchain | Ganache (port 7545)              |
| Frontend         | HTML, CSS, jQuery, Web3.js 1.2.7 |
| Wallet           | MetaMask                         |

---

## Contract Architecture

```
ZombieFactory
    └── ZombieFeeding
            └── ZombieHelper      ← all custom features live here
                    └── ZombieAttack
                            └── ZombieOwnership (ERC-721)
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v14+
- [Truffle](https://trufflesuite.com/) — `npm install -g truffle`
- [Ganache](https://trufflesuite.com/ganache/) — desktop app or CLI
- [MetaMask](https://metamask.io/) browser extension

---

## Local Setup & Deployment

**1. Install dependencies**
```bash
npm install
```

**2. Start Ganache**
Open the Ganache desktop app and start a workspace on port `7545`, or run:
```bash
npx ganache-cli -p 7545
```

**3. Compile contracts**
```bash
truffle compile
```

**4. Deploy contracts to Ganache**
```bash
truffle migrate --reset --network development
```
Copy the deployed `ZombieOwnership` contract address from the migration output.

**5. Update the contract address**
Open `index.html` and update the address in `startApp()`:
```javascript
var cryptoZombiesAddress = "0xYourDeployedContractAddress";
```

**6. Connect MetaMask**
- Network: `Localhost 7545` (`HTTP://127.0.0.1:7545`)
- Chain ID: `1337`
- Import Ganache accounts using their private keys.

**7. Open the app**
Open `index.html` directly in your browser — no server required.

---

## Run Tests

```bash
truffle test --network development
```
