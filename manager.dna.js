const memoryManager = require("./manager.memory");

/**
 * Determine body parts for basic roles based on room energy.
 * This acts as a simple DNA builder for creeps.
 *
 * @param {string} role - Role name (miner, hauler, allPurpose).
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
    case "allPurpose":
    default:
      return buildAllPurpose(available, panic);
  }
}

function buildMiner(energy, panic) {
  const body = [];
  let workParts = panic ? 1 : Math.min(5, Math.floor(energy / BODYPART_COST[WORK]));
  if (workParts < 1) workParts = 1;
  // Reserve energy for move parts
  const moveParts = Math.max(1, Math.ceil(workParts / 2));
  while (workParts > 0 && energy < workParts * BODYPART_COST[WORK] + moveParts * BODYPART_COST[MOVE]) {
    workParts--;
  }
  for (let i = 0; i < workParts; i++) body.push(WORK);
  for (let i = 0; i < moveParts; i++) body.push(MOVE);
  return body;
}

function buildHauler(energy, panic) {
  const body = [];
  const pairCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
  let pairs = panic ? 1 : Math.floor(energy / pairCost);
  if (pairs < 1) pairs = 1;
  for (let i = 0; i < pairs; i++) {
    body.push(CARRY, MOVE);
  }
  return body;
}

function buildAllPurpose(energy, panic) {
  const body = [];
  const setCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
  let sets = panic ? 1 : Math.floor(energy / setCost);
  if (sets < 1) sets = 1;
  for (let i = 0; i < sets; i++) {
    body.push(WORK, CARRY, MOVE);
  }
  return body;
}

module.exports = {
  getBodyParts,
};
