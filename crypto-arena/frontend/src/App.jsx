import { Routes, Route } from "react-router-dom";
import { useEffect, useRef } from "react";
import Navbar           from "./components/Navbar.jsx";
import Dashboard        from "./pages/Dashboard.jsx";
import Battle           from "./pages/Battle.jsx";
import MarketplacePage  from "./pages/MarketplacePage.jsx";
import Tournaments      from "./pages/Tournaments.jsx";
import GameItemsPage    from "./pages/GameItemsPage.jsx";
import EscrowPage       from "./pages/EscrowPage.jsx";
import DisputePage      from "./pages/DisputePage.jsx";
import TreasuryPage     from "./pages/TreasuryPage.jsx";
import { useWallet }    from "./hooks/useWallet.js";
import { useContracts } from "./hooks/useContracts.js";
import { useCreatures } from "./hooks/useCreatures.js";
import { useBattle }    from "./hooks/useBattle.js";
import { useMarketplace } from "./hooks/useMarketplace.js";
import { useReputation }  from "./hooks/useReputation.js";
import { useTreasury }    from "./hooks/useTreasury.js";
import { useGameItems }   from "./hooks/useGameItems.js";
import { useEscrow }      from "./hooks/useEscrow.js";
import { useDispute }     from "./hooks/useDispute.js";

export default function App() {
  const { signer, account, connecting, isCorrectChain, connect, switchNetwork } = useWallet();
  const contracts = useContracts(signer);

  const {
    creatures, loading: loadingCreatures, arenaBalance,
    fetchMyCreatures, mintCreature, breedCreatures, levelUpCreature, parseCreature,
  } = useCreatures(contracts, account);

  const {
    battleResult, battling,
    allCreatures, loadingAll,
    incomingChallenges, outgoingChallenges,
    fetchAllCreatures, fetchChallenges, doBattle,
    createChallenge, acceptChallenge, cancelChallenge, declineChallenge,
    cooldownMap,
  } = useBattle(contracts, parseCreature, account);

  const {
    myListings, otherListings, loading: loadingMarket,
    fetchListings, listFixed, listAuction, buyFixed, placeBid, finalizeAuction, cancelListing,
    batchListFixed, batchBuy,
  } = useMarketplace(contracts, account, parseCreature);

  const {
    reputation, fetchReputation,
  } = useReputation(contracts, account);

  const {
    balance: treasuryBalance, totalReceived, totalAllocated, allocations,
    isAdmin: isTreasuryAdmin, loading: loadingTreasury, fetchTreasury, allocateFunds,
  } = useTreasury(contracts, account);

  const {
    items, loading: loadingItems, fetchItems, buyItem,
    useXPPotion, useBreedBoost, useBattleBoost,
  } = useGameItems(contracts, account);

  const {
    escrows, loading: loadingEscrow, acting: actingEscrow, fetchEscrows,
    createEscrow, acceptEscrow, confirmDelivery, raiseDispute, autoRelease, cancelEscrow,
  } = useEscrow(contracts, account);

  const {
    disputes, isArbitrator, poolSize, stakedAmount, loading: loadingDispute, acting: actingDispute,
    fetchDisputes, stake, unstake, vote, forceResolve, STAKE_AMOUNT,
  } = useDispute(contracts, account);

  // ── Ref-based auto-refresh on every new block ─────────────────────────────
  const refreshRef = useRef(null);
  refreshRef.current = {
    fetchMyCreatures, fetchAllCreatures, fetchListings, fetchChallenges,
    fetchReputation, fetchItems, fetchEscrows, fetchDisputes, fetchTreasury,
  };

  // Initial fetch on wallet connect
  useEffect(() => {
    if (account && contracts.creatureNFT) {
      fetchMyCreatures();
      fetchAllCreatures();
      fetchListings();
      fetchChallenges();
      fetchReputation();
      fetchItems();
      fetchEscrows();
      fetchDisputes();
      fetchTreasury();
    }
  }, [account, contracts.creatureNFT]);

  // Block-event refresh — fires whenever a new block is mined (every tx on Hardhat)
  useEffect(() => {
    if (!account || !contracts.creatureNFT) return;

    const doRefresh = () => {
      const r = refreshRef.current;
      r.fetchMyCreatures();
      r.fetchAllCreatures();
      r.fetchListings();
      r.fetchChallenges();
      r.fetchReputation();
      r.fetchItems();
      r.fetchEscrows();
      r.fetchDisputes();
      r.fetchTreasury();
    };

    const provider = signer?.provider;
    if (provider) provider.on("block", doRefresh);

    return () => {
      if (provider) provider.off("block", doRefresh);
    };
  }, [account, contracts.creatureNFT, signer]);

  // ── Marketplace wrappers that also refresh My Army ─────────────────────────
  const handleBuyFixed = async (listingId, price) => {
    await buyFixed(listingId, price);
    fetchMyCreatures();
  };

  const handleFinalizeAuction = async (listingId) => {
    await finalizeAuction(listingId);
    fetchMyCreatures();
  };

  const handleBatchBuy = async (listingIds) => {
    await batchBuy(listingIds);
    fetchMyCreatures();
  };

  return (
    <div className="min-h-screen">
      <Navbar
        account={account}
        arenaBalance={arenaBalance}
        reputation={reputation}
        connecting={connecting}
        isCorrectChain={isCorrectChain}
        onConnect={connect}
        onSwitchNetwork={switchNetwork}
        incomingChallengeCount={incomingChallenges.length}
      />

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                creatures={creatures}
                loading={loadingCreatures}
                arenaBalance={arenaBalance}
                reputation={reputation}
                account={account}
                onMint={mintCreature}
                onBreed={breedCreatures}
                onLevelUp={levelUpCreature}
                onRefresh={fetchMyCreatures}
              />
            }
          />
          <Route
            path="/battle"
            element={
              <Battle
                myCreatures={creatures}
                allCreatures={allCreatures}
                loadingAll={loadingAll}
                battling={battling}
                battleResult={battleResult}
                cooldownMap={cooldownMap}
                incomingChallenges={incomingChallenges}
                outgoingChallenges={outgoingChallenges}
                onFetchAll={fetchAllCreatures}
                onBattle={doBattle}
                onCreateChallenge={createChallenge}
                onAcceptChallenge={acceptChallenge}
                onDeclineChallenge={declineChallenge}
                onCancelChallenge={cancelChallenge}
                onRefresh={fetchMyCreatures}
              />
            }
          />
          <Route
            path="/marketplace"
            element={
              <MarketplacePage
                myCreatures={creatures}
                myListings={myListings}
                otherListings={otherListings}
                loading={loadingMarket}
                account={account}
                onFetch={fetchListings}
                onListFixed={listFixed}
                onListAuction={listAuction}
                onBuy={handleBuyFixed}
                onBid={placeBid}
                onFinalize={handleFinalizeAuction}
                onCancel={cancelListing}
                onBatchListFixed={batchListFixed}
                onBatchBuy={handleBatchBuy}
              />
            }
          />
          <Route
            path="/tournaments"
            element={
              <Tournaments
                contracts={contracts}
                account={account}
                myCreatures={creatures}
                onRefreshArmy={fetchMyCreatures}
              />
            }
          />
          <Route
            path="/items"
            element={
              <GameItemsPage
                items={items}
                creatures={creatures}
                arenaBalance={arenaBalance}
                loading={loadingItems}
                onFetch={fetchItems}
                onBuy={buyItem}
                onUseXP={useXPPotion}
                onUseBreed={useBreedBoost}
                onUseBattle={useBattleBoost}
              />
            }
          />
          <Route
            path="/escrow"
            element={
              <EscrowPage
                escrows={escrows}
                myCreatures={creatures}
                loading={loadingEscrow}
                acting={actingEscrow}
                account={account}
                onFetch={fetchEscrows}
                onCreateEscrow={createEscrow}
                onAcceptEscrow={acceptEscrow}
                onConfirmDelivery={confirmDelivery}
                onRaiseDispute={raiseDispute}
                onAutoRelease={autoRelease}
                onCancelEscrow={cancelEscrow}
              />
            }
          />
          <Route
            path="/disputes"
            element={
              <DisputePage
                disputes={disputes}
                isArbitrator={isArbitrator}
                poolSize={poolSize}
                stakedAmount={stakedAmount}
                loading={loadingDispute}
                acting={actingDispute}
                STAKE_AMOUNT={STAKE_AMOUNT}
                onFetch={fetchDisputes}
                onStake={stake}
                onUnstake={unstake}
                onVote={vote}
                onForceResolve={forceResolve}
              />
            }
          />
          <Route
            path="/treasury"
            element={
              <TreasuryPage
                balance={treasuryBalance}
                totalReceived={totalReceived}
                totalAllocated={totalAllocated}
                allocations={allocations}
                isAdmin={isTreasuryAdmin}
                loading={loadingTreasury}
                onFetch={fetchTreasury}
                onAllocate={allocateFunds}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
