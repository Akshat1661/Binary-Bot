const { expect } = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-network-helpers");

describe("CryptoArena", function () {
  let owner, alice, bob;
  let arenaToken, creatureNFT, battleEngine, marketplace, tournament;

  const MINT_FEE = ethers.parseEther("0.01");

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    const ArenaToken = await ethers.getContractFactory("ArenaToken");
    arenaToken = await ArenaToken.deploy(owner.address);

    const CreatureNFT = await ethers.getContractFactory("CreatureNFT");
    creatureNFT = await CreatureNFT.deploy(owner.address, await arenaToken.getAddress());

    const BattleEngine = await ethers.getContractFactory("BattleEngine");
    battleEngine = await BattleEngine.deploy(
      owner.address,
      await creatureNFT.getAddress(),
      await arenaToken.getAddress()
    );

    const Marketplace = await ethers.getContractFactory("Marketplace");
    marketplace = await Marketplace.deploy(owner.address, await creatureNFT.getAddress());

    const TournamentManager = await ethers.getContractFactory("TournamentManager");
    tournament = await TournamentManager.deploy(
      owner.address,
      await creatureNFT.getAddress()
    );

    // Wire roles
    await creatureNFT.grantGameRole(await battleEngine.getAddress());
    await arenaToken.grantMinterRole(await battleEngine.getAddress());
    await creatureNFT.grantGameRole(await tournament.getAddress());
  });

  // ── ArenaToken ──────────────────────────────────────────────────────────────

  describe("ArenaToken", () => {
    it("deploys with 100M initial supply to owner", async () => {
      const balance = await arenaToken.balanceOf(owner.address);
      expect(balance).to.equal(ethers.parseEther("100000000"));
    });

    it("only MINTER_ROLE can mint", async () => {
      await expect(arenaToken.connect(alice).mint(alice.address, 1000))
        .to.be.revertedWithCustomError(arenaToken, "AccessControlUnauthorizedAccount");
    });

    it("respects MAX_SUPPLY cap", async () => {
      const cap = await arenaToken.MAX_SUPPLY();
      const current = await arenaToken.totalSupply();
      await expect(arenaToken.mint(owner.address, cap - current + 1n))
        .to.be.revertedWith("ArenaToken: cap exceeded");
    });
  });

  // ── CreatureNFT ─────────────────────────────────────────────────────────────

  describe("CreatureNFT", () => {
    it("mints a creature and assigns correct owner", async () => {
      await creatureNFT.connect(alice).mintCreature("Blazer", { value: MINT_FEE });
      expect(await creatureNFT.ownerOf(1)).to.equal(alice.address);
    });

    it("reverts if mint fee is insufficient", async () => {
      await expect(
        creatureNFT.connect(alice).mintCreature("Blazer", { value: 0 })
      ).to.be.revertedWith("CreatureNFT: insufficient mint fee");
    });

    it("getStats returns non-zero values", async () => {
      await creatureNFT.connect(alice).mintCreature("Blazer", { value: MINT_FEE });
      const stats = await creatureNFT.getStats(1);
      expect(stats.atk).to.be.gt(0);
      expect(stats.hp).to.be.gt(0);
    });

    it("getOwnerCreatures returns correct token IDs", async () => {
      await creatureNFT.connect(alice).mintCreature("A", { value: MINT_FEE });
      await creatureNFT.connect(alice).mintCreature("B", { value: MINT_FEE });
      const ids = await creatureNFT.getOwnerCreatures(alice.address);
      expect(ids.length).to.equal(2);
    });

    it("allows breeding two owned creatures — parents are burned, child is created", async () => {
      await creatureNFT.connect(alice).mintCreature("A", { value: MINT_FEE });
      await creatureNFT.connect(alice).mintCreature("B", { value: MINT_FEE });
      // Give alice enough ARENA for worst-case Legendary breed cost (500 ARENA)
      await arenaToken.transfer(alice.address, ethers.parseEther("1000"));
      await arenaToken.connect(alice).approve(await creatureNFT.getAddress(), ethers.parseEther("1000"));
      await expect(creatureNFT.connect(alice).breed(1, 2, "Child")).to.emit(creatureNFT, "CreatureBred");
      // Parents should be burned; only the child remains
      const ids = await creatureNFT.getOwnerCreatures(alice.address);
      expect(ids.length).to.equal(1); // only child
      await expect(creatureNFT.ownerOf(1)).to.be.reverted; // parent1 burned
      await expect(creatureNFT.ownerOf(2)).to.be.reverted; // parent2 burned
    });
  });

  // ── BattleEngine ─────────────────────────────────────────────────────────────

  describe("BattleEngine", () => {
    let aliceId, bobId;
    beforeEach(async () => {
      await creatureNFT.connect(alice).mintCreature("AliceBot", { value: MINT_FEE });
      await creatureNFT.connect(bob).mintCreature("BobBot", { value: MINT_FEE });
      aliceId = 1n; bobId = 2n;
    });

    it("completes a battle and emits BattleResult", async () => {
      await expect(battleEngine.connect(alice).battle(aliceId, bobId))
        .to.emit(battleEngine, "BattleResult");
    });

    it("mints ARENA to the winner", async () => {
      const tx = await battleEngine.connect(alice).battle(aliceId, bobId);
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => {
        try { return battleEngine.interface.parseLog(l).name === "BattleResult"; } catch { return false; }
      });
      const parsed = battleEngine.interface.parseLog(event);
      const winnerOwner = parsed.args.winnerOwner;
      const arenaBalance = await arenaToken.balanceOf(winnerOwner);
      expect(arenaBalance).to.be.gt(0);
    });

    it("enforces cooldown between battles", async () => {
      await battleEngine.connect(alice).battle(aliceId, bobId);
      await expect(battleEngine.connect(alice).battle(aliceId, bobId))
        .to.be.revertedWith("BattleEngine: creature on cooldown");
    });

    it("reverts if caller does not own the creature", async () => {
      await expect(battleEngine.connect(bob).battle(aliceId, bobId))
        .to.be.revertedWith("BattleEngine: not your creature");
    });
  });

  // ── Marketplace ──────────────────────────────────────────────────────────────

  describe("Marketplace", () => {
    beforeEach(async () => {
      await creatureNFT.connect(alice).mintCreature("AliceBot", { value: MINT_FEE });
      await creatureNFT.connect(alice).approve(await marketplace.getAddress(), 1);
    });

    it("allows fixed-price listing and buying", async () => {
      const price = ethers.parseEther("0.1");
      await marketplace.connect(alice).listFixed(1, price);
      await expect(
        marketplace.connect(bob).buy(1, { value: price })
      ).to.emit(marketplace, "Sold");
      expect(await creatureNFT.ownerOf(1)).to.equal(bob.address);
    });

    it("allows auction listing, bidding and finalisation", async () => {
      const startPrice = ethers.parseEther("0.05");
      const duration = 3600; // 1 hour
      await marketplace.connect(alice).listAuction(1, startPrice, duration);

      await marketplace.connect(bob).bid(1, { value: startPrice });
      await time.increase(3601);

      await expect(marketplace.connect(owner).finalizeAuction(1))
        .to.emit(marketplace, "AuctionFinalized");
      expect(await creatureNFT.ownerOf(1)).to.equal(bob.address);
    });

    it("prevents seller from buying their own listing", async () => {
      await marketplace.connect(alice).listFixed(1, ethers.parseEther("0.1"));
      await expect(
        marketplace.connect(alice).buy(1, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Marketplace: seller cannot buy");
    });

    it("returns NFT to seller when auction ends with no bids", async () => {
      await marketplace.connect(alice).listAuction(1, ethers.parseEther("0.05"), 3600);
      await time.increase(3601);
      await marketplace.connect(owner).finalizeAuction(1);
      expect(await creatureNFT.ownerOf(1)).to.equal(alice.address);
    });
  });

  // ── TournamentManager ────────────────────────────────────────────────────────

  describe("TournamentManager", () => {
    it("creates a tournament and accepts registrations", async () => {
      await tournament.createTournament("Cup #1", 0, 4, 3600);
      await creatureNFT.connect(alice).mintCreature("A", { value: MINT_FEE });
      await tournament.connect(alice).register(1, 1);
      const parts = await tournament.getParticipants(1);
      expect(parts.length).to.equal(1);
    });

    it("reverts registration after deadline", async () => {
      await tournament.createTournament("Cup #2", 0, 4, 60);
      await creatureNFT.connect(alice).mintCreature("A", { value: MINT_FEE });
      await time.increase(61);
      await expect(tournament.connect(alice).register(1, 1))
        .to.be.revertedWith("TournamentManager: registration closed");
    });
  });
});
