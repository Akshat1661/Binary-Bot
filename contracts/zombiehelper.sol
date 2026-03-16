pragma solidity ^0.4.25;

import "./zombiefeeding.sol";

contract ZombieHelper is ZombieFeeding {

  uint levelUpFee = 0.001 ether;
  mapping(uint => uint) public zombiePrice;

  event ZombieListed(uint zombieId, uint price);
  event ZombieDelisted(uint zombieId);
  event ZombieSold(uint zombieId, address from, address to, uint price);
  event BattleOutcome(uint zombieId, bool victory, uint wildLevel);
  modifier aboveLevel(uint _level, uint _zombieId) {
    require(zombies[_zombieId].level >= _level);
    _;
  }

  function withdraw() external onlyOwner {
    address _owner = owner();
    _owner.transfer(address(this).balance);
  }

  function setLevelUpFee(uint _fee) external onlyOwner {
    levelUpFee = _fee;
  }

  function levelUp(uint _zombieId) external payable {
    require(msg.value == levelUpFee);
    zombies[_zombieId].level = zombies[_zombieId].level.add(1);
  }

  function changeName(uint _zombieId, string _newName) external aboveLevel(2, _zombieId) onlyOwnerOf(_zombieId) {
    zombies[_zombieId].name = _newName;
  }

  function changeDna(uint _zombieId, uint _newDna) external payable aboveLevel(5, _zombieId) onlyOwnerOf(_zombieId) {
    require(msg.value >= 0.01 ether, "Must send 0.01 ETH to mutate");
    zombies[_zombieId].dna = _newDna;
  }

  function _calcFusedLevel(uint _id1, uint _id2) internal returns(uint32) {
    uint32 lvl1 = zombies[_id1].level;
    uint32 lvl2 = zombies[_id2].level;
    uint32 minLvl = lvl1 < lvl2 ? lvl1 : lvl2;
    uint32 maxLvl = lvl1 > lvl2 ? lvl1 : lvl2;
    return minLvl + uint32(randMod(uint(maxLvl) + 1));
  }

  function fuseZombies(uint _id1, uint _id2, string _name) external payable onlyOwnerOf(_id1) {
    require(zombieToOwner[_id2] == msg.sender, "Not owner of second zombie");
    require(_id1 != _id2, "Cannot fuse a zombie with itself");
    uint totalLevels = uint(zombies[_id1].level) + uint(zombies[_id2].level);
    require(msg.value >= totalLevels.mul(levelUpFee), "Insufficient ETH for fusion");

    uint newDna = zombies[_id1].dna.add(zombies[_id2].dna) / 2;
    newDna = newDna - newDna % 100;
    uint32 newLevel = _calcFusedLevel(_id1, _id2);

    zombieToOwner[_id1] = address(0);
    zombieToOwner[_id2] = address(0);
    ownerZombieCount[msg.sender] = ownerZombieCount[msg.sender].sub(2);

    uint newId = zombies.push(Zombie(_name, newDna, newLevel, uint32(now), 0, 0)) - 1;
    zombieToOwner[newId] = msg.sender;
    ownerZombieCount[msg.sender] = ownerZombieCount[msg.sender].add(1);
    emit NewZombie(newId, _name, newDna);
  }

  function listForSale(uint _zombieId, uint _price) external onlyOwnerOf(_zombieId) {
    require(_price > 0, "Price must be > 0");
    zombiePrice[_zombieId] = _price;
    emit ZombieListed(_zombieId, _price);
  }

  function delistZombie(uint _zombieId) external onlyOwnerOf(_zombieId) {
    require(zombiePrice[_zombieId] > 0, "Not listed");
    zombiePrice[_zombieId] = 0;
    emit ZombieDelisted(_zombieId);
  }

  function buyZombie(uint _zombieId) external payable {
    uint price = zombiePrice[_zombieId];
    require(price > 0, "Not for sale");
    require(msg.value >= price, "Insufficient ETH");
    address seller = zombieToOwner[_zombieId];
    require(seller != msg.sender, "Cannot buy own zombie");
    require(seller != address(0), "Invalid zombie");
    zombiePrice[_zombieId] = 0;
    zombieToOwner[_zombieId] = msg.sender;
    ownerZombieCount[seller] = ownerZombieCount[seller].sub(1);
    ownerZombieCount[msg.sender] = ownerZombieCount[msg.sender].add(1);
    seller.transfer(price);
    if (msg.value > price) {
      msg.sender.transfer(msg.value - price);
    }
    emit ZombieSold(_zombieId, seller, msg.sender, price);
  }

  function getListedZombies() external view returns(uint[]) {
    uint count = 0;
    for (uint i = 0; i < zombies.length; i++) {
      if (zombiePrice[i] > 0 && zombieToOwner[i] != address(0)) count++;
    }
    uint[] memory result = new uint[](count);
    uint idx = 0;
    for (uint j = 0; j < zombies.length; j++) {
      if (zombiePrice[j] > 0 && zombieToOwner[j] != address(0)) {
        result[idx] = j;
        idx++;
      }
    }
    return result;
  }

  function getZombiesByOwner(address _owner) external view returns(uint[]) {
    uint[] memory result = new uint[](ownerZombieCount[_owner]);
    uint counter = 0;
    for (uint i = 0; i < zombies.length; i++) {
      if (zombieToOwner[i] == _owner) {
        result[counter] = i;
        counter++;
      }
    }
    return result;
  }

  // --- FEATURE 4: ACTION COOLDOWN TIMERS ---
  modifier isReady(uint _zombieId) {
    require(zombies[_zombieId].readyTime <= uint32(now), "Your zombie is resting!");
    _;
  }

  function _triggerCooldown(uint _zombieId) internal {
    zombies[_zombieId].readyTime = uint32(now + cooldownTime);
  }

  // --- FEATURE 3: PvE BATTLE ARENA ---
  uint randNonce = 0;

  function randMod(uint _modulus) internal returns(uint) {
    randNonce++;
    return uint(keccak256(abi.encodePacked(now, msg.sender, randNonce))) % _modulus;
  }

  function battleWildZombie(uint _zombieId) external onlyOwnerOf(_zombieId) isReady(_zombieId) {
    Zombie storage myZombie = zombies[_zombieId];
    uint wildZombieLevel = randMod(myZombie.level + 2) + 1;

    if (myZombie.level > wildZombieLevel) {
      myZombie.winCount++;
      myZombie.level++;
      emit BattleOutcome(_zombieId, true, wildZombieLevel);
    } else {
      myZombie.lossCount++;
      emit BattleOutcome(_zombieId, false, wildZombieLevel);
    }
    _triggerCooldown(_zombieId);
  }
}
