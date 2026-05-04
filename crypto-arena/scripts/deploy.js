const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ── 1. ArenaToken ──────────────────────────────────────────────────────────
  const ArenaToken = await ethers.getContractFactory("ArenaToken");
  const arenaToken = await ArenaToken.deploy(deployer.address);
  await arenaToken.waitForDeployment();
  console.log("ArenaToken deployed to:        ", await arenaToken.getAddress());

  // ── 2. CreatureNFT ─────────────────────────────────────────────────────────
  const CreatureNFT = await ethers.getContractFactory("CreatureNFT");
  const creatureNFT = await CreatureNFT.deploy(deployer.address, await arenaToken.getAddress());
  await creatureNFT.waitForDeployment();
  console.log("CreatureNFT deployed to:       ", await creatureNFT.getAddress());

  // ── 3. Treasury ────────────────────────────────────────────────────────────
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(deployer.address);
  await treasury.waitForDeployment();
  console.log("Treasury deployed to:          ", await treasury.getAddress());

  // ── 4. ReputationSystem ────────────────────────────────────────────────────
  const ReputationSystem = await ethers.getContractFactory("ReputationSystem");
  const reputationSystem = await ReputationSystem.deploy(deployer.address);
  await reputationSystem.waitForDeployment();
  console.log("ReputationSystem deployed to:  ", await reputationSystem.getAddress());

  // ── 5. BattleEngine ────────────────────────────────────────────────────────
  const BattleEngine = await ethers.getContractFactory("BattleEngine");
  const battleEngine = await BattleEngine.deploy(
    deployer.address,
    await creatureNFT.getAddress(),
    await arenaToken.getAddress(),
    await reputationSystem.getAddress()
  );
  await battleEngine.waitForDeployment();
  console.log("BattleEngine deployed to:      ", await battleEngine.getAddress());

  // ── 6. Marketplace ─────────────────────────────────────────────────────────
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(
    deployer.address,
    await creatureNFT.getAddress(),
    await reputationSystem.getAddress()
  );
  await marketplace.waitForDeployment();
  console.log("Marketplace deployed to:       ", await marketplace.getAddress());

  // ── 7. TournamentManager ───────────────────────────────────────────────────
  const TournamentManager = await ethers.getContractFactory("TournamentManager");
  const tournament = await TournamentManager.deploy(
    deployer.address,
    await creatureNFT.getAddress(),
    await arenaToken.getAddress(),
    await reputationSystem.getAddress()
  );
  await tournament.waitForDeployment();
  console.log("TournamentManager deployed to: ", await tournament.getAddress());

  // ── 8. GameItems ───────────────────────────────────────────────────────────
  const GameItems = await ethers.getContractFactory("GameItems");
  const gameItems = await GameItems.deploy(
    deployer.address,
    await arenaToken.getAddress(),
    await creatureNFT.getAddress()
  );
  await gameItems.waitForDeployment();
  console.log("GameItems deployed to:         ", await gameItems.getAddress());

  // ── 9. Escrow ──────────────────────────────────────────────────────────────
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(
    deployer.address,
    await creatureNFT.getAddress(),
    await reputationSystem.getAddress()
  );
  await escrow.waitForDeployment();
  console.log("Escrow deployed to:            ", await escrow.getAddress());

  // ── 10. DisputeResolution ──────────────────────────────────────────────────
  const DisputeResolution = await ethers.getContractFactory("DisputeResolution");
  const disputeResolution = await DisputeResolution.deploy(
    deployer.address,
    await arenaToken.getAddress(),
    await reputationSystem.getAddress()
  );
  await disputeResolution.waitForDeployment();
  console.log("DisputeResolution deployed to: ", await disputeResolution.getAddress());

  // ── Wire cross-contract references ────────────────────────────────────────
  console.log("\nWiring cross-contract references...");
  await escrow.setDisputeResolution(await disputeResolution.getAddress());
  console.log("  Escrow.disputeResolution → DisputeResolution");
  await disputeResolution.setEscrowContract(await escrow.getAddress());
  console.log("  DisputeResolution.escrow → Escrow");

  // ── Wire roles ────────────────────────────────────────────────────────────
  console.log("\nWiring roles...");

  // BattleEngine: GAME_ROLE on CreatureNFT + MINTER_ROLE on ArenaToken
  await creatureNFT.grantGameRole(await battleEngine.getAddress());
  console.log("  GAME_ROLE   → BattleEngine");
  await arenaToken.grantMinterRole(await battleEngine.getAddress());
  console.log("  MINTER_ROLE → BattleEngine");

  // TournamentManager: GAME_ROLE on CreatureNFT + MINTER_ROLE on ArenaToken
  await creatureNFT.grantGameRole(await tournament.getAddress());
  console.log("  GAME_ROLE   → TournamentManager");
  await arenaToken.grantMinterRole(await tournament.getAddress());
  console.log("  MINTER_ROLE → TournamentManager");

  // GameItems: GAME_ROLE on CreatureNFT (to call addXP, recordWin)
  await creatureNFT.grantGameRole(await gameItems.getAddress());
  console.log("  GAME_ROLE   → GameItems");

  // DisputeResolution: MINTER_ROLE on ArenaToken (arbitrator rewards)
  await arenaToken.grantMinterRole(await disputeResolution.getAddress());
  console.log("  MINTER_ROLE → DisputeResolution");

  // ReputationSystem: REP_CALLER_ROLE for all game contracts
  await reputationSystem.grantCallerRole(await marketplace.getAddress());
  console.log("  REP_CALLER  → Marketplace");
  await reputationSystem.grantCallerRole(await battleEngine.getAddress());
  console.log("  REP_CALLER  → BattleEngine");
  await reputationSystem.grantCallerRole(await tournament.getAddress());
  console.log("  REP_CALLER  → TournamentManager");
  await reputationSystem.grantCallerRole(await escrow.getAddress());
  console.log("  REP_CALLER  → Escrow");
  await reputationSystem.grantCallerRole(await disputeResolution.getAddress());
  console.log("  REP_CALLER  → DisputeResolution");

  // Point Marketplace fees to Treasury (not deployer EOA)
  await marketplace.setFeeRecipient(await treasury.getAddress());
  console.log("  Marketplace.feeRecipient → Treasury");

  // ── Distribute test ARENA tokens (accounts 0–9, 10,000 each) ─────────────
  console.log("\nDistributing test ARENA tokens...");
  const signers = await ethers.getSigners();
  const testMint = ethers.parseEther("10000");
  for (let i = 0; i < Math.min(signers.length, 10); i++) {
    await arenaToken.mint(signers[i].address, testMint);
    console.log(`  10,000 ARENA → ${signers[i].address}`);
  }

  // ── Mint test GameItems to accounts 0–4 (5 of each for demo) ─────────────
  console.log("\nMinting test GameItems...");
  for (let i = 0; i < Math.min(signers.length, 5); i++) {
    await gameItems.adminMint(signers[i].address, 0, 5); // 5 XP Potions
    await gameItems.adminMint(signers[i].address, 1, 3); // 3 Breed Boosts
    await gameItems.adminMint(signers[i].address, 2, 3); // 3 Battle Boosts
    console.log(`  5 XP Potions, 3 Breed Boosts, 3 Battle Boosts → ${signers[i].address}`);
  }

  // ── Write addresses to frontend config ────────────────────────────────────
  const addresses = {
    ArenaToken:        await arenaToken.getAddress(),
    CreatureNFT:       await creatureNFT.getAddress(),
    BattleEngine:      await battleEngine.getAddress(),
    Marketplace:       await marketplace.getAddress(),
    TournamentManager: await tournament.getAddress(),
    Treasury:          await treasury.getAddress(),
    ReputationSystem:  await reputationSystem.getAddress(),
    GameItems:         await gameItems.getAddress(),
    Escrow:            await escrow.getAddress(),
    DisputeResolution: await disputeResolution.getAddress(),
  };

  const network = await ethers.provider.getNetwork();
  const configPath = path.join(__dirname, "../frontend/src/config.js");
  const content = `// Auto-generated by deploy.js — do not edit manually
export const CONTRACT_ADDRESSES = ${JSON.stringify(addresses, null, 2)};

export const CHAIN_CONFIG = {
  chainId: ${network.chainId},
  name: "${network.name}",
  rpcUrl: "http://127.0.0.1:8545",
};

export const ELEMENT_NAMES  = ["Fire", "Water", "Earth", "Air", "Light", "Dark"];
export const RARITY_NAMES   = ["Common", "Uncommon", "Rare", "Legendary"];
export const RARITY_COLORS  = ["#9ca3af", "#4ade80", "#60a5fa", "#f59e0b"];
export const ELEMENT_EMOJIS = ["🔥", "💧", "🌍", "🌪️", "✨", "🌑"];
export const ELEMENT_CLASSES = ["el-fire", "el-water", "el-earth", "el-air", "el-light", "el-dark"];

export const ITEM_NAMES   = ["XP Potion", "Breed Boost", "Battle Boost"];
export const ITEM_EMOJIS  = ["⚗️", "🧬", "⚡"];
export const ITEM_DESCS   = [
  "Instantly grants 100 XP to a creature",
  "Grants 200 XP — simulate offspring bonus",
  "Grants 50 XP + records an extra win",
];
`;

  fs.writeFileSync(configPath, content);
  console.log("\nConfig written to frontend/src/config.js");

  // ── Copy ABIs ─────────────────────────────────────────────────────────────
  const abiDir = path.join(__dirname, "../frontend/src/abi");
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

  const contractNames = [
    "ArenaToken", "CreatureNFT", "BattleEngine", "Marketplace", "TournamentManager",
    "Treasury", "ReputationSystem", "GameItems", "Escrow", "DisputeResolution",
  ];
  for (const name of contractNames) {
    const artifact = JSON.parse(
      fs.readFileSync(path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`), "utf8")
    );
    fs.writeFileSync(path.join(abiDir, `${name}.json`), JSON.stringify(artifact.abi, null, 2));
  }
  console.log("ABIs copied to frontend/src/abi/");

  console.log("\n✅ Deployment complete!\n");
  console.log("Address summary:");
  for (const [k, v] of Object.entries(addresses)) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
