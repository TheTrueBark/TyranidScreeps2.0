const memoryManager = require("./manager.memory");

/**
 * Determine body parts for basic roles based on room energy.
 * This acts as a simple DNA builder for creeps.
 *
 * @param {string} role - Role name (miner, hauler, builder, upgrader).
 * @param {Room} room  - Room to base calculations on.
 * @param {boolean} panic - If true, spawn the smallest viable creep.
 * @returns {BodyPartConstant[]} Array of body parts.
 */
function getBodyParts(role, room, panic = false) {
  if (!room) return [];
  memoryManager.initializeRoomMemory(room);
  const available = room.energyCapacityAvailable;

  switch (role) {
    case "miner":
      return buildMiner(available, panic);
    case "hauler":
      return buildHauler(available, panic);
    case "baseDistributor":
      return buildBaseDistributor();
    case "builder":
      return buildWorker(available, panic);
    case "upgrader":
      return buildWorker(available, panic);
    default:
      return buildWorker(available, panic);
  }
}

function buildMiner(energy, panic) {
  if (energy < 550) {
    return [WORK, MOVE];
  }
  const body = [];
  const moveCost = BODYPART_COST[MOVE];
  let availableEnergy = energy - moveCost;
  if (availableEnergy < 0) availableEnergy = 0;
  let workParts = panic
    ? 1
    : Math.min(5, Math.floor(availableEnergy / BODYPART_COST[WORK]));
  if (workParts < 1) workParts = 1;

  for (let i = 0; i < workParts; i++) body.push(WORK);
  body.push(MOVE);
  return body;
}

function buildHauler(energy, panic) {
  if (energy < 550) {
    return [CARRY, MOVE];
  }
  const body = [];
  const pairCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
  let pairs = panic ? 1 : Math.floor(energy / pairCost);
  if (pairs < 1) pairs = 1;
  for (let i = 0; i < pairs; i++) {
    body.push(CARRY, MOVE);
  }
  return body;
}

function buildWorker(energy, panic) {
  const body = [];
  const setCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
  let sets = panic ? 1 : Math.floor(energy / setCost);
  if (sets < 1) sets = 1;
  for (let i = 0; i < sets; i++) {
    body.push(WORK, CARRY, MOVE);
  }
  return body;
}

function buildBaseDistributor() {
  return [CARRY, CARRY, MOVE, MOVE];
}

module.exports = {
  getBodyParts,
};
