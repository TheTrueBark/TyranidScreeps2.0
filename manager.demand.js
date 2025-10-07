const logger = require("./logger");
const spawnManager = require("./manager.spawn");
const spawnQueue = require('./manager.spawnQueue');

const demandManager = {
  /**
   * Sets the inDemand state for a room based on the current needs.
   * @param {Room} room - The room to evaluate.
   */
  evaluateRoomNeeds(room) {
    const miners = _.filter(
      Game.creeps,
      (creep) => creep.memory.role === "miner" && creep.room.name === room.name,
    ).length;
    const queuedMiners = spawnQueue.queue.filter(
      (q) =>
        q.room === room.name &&
        (q.category === 'miner' || (q.memory && q.memory.role === 'miner')),
    ).length;
    const haulers = _.filter(
      Game.creeps,
      (creep) =>
        creep.memory.role === "hauler" && creep.room.name === room.name,
    ).length;
    const queuedHaulers = spawnQueue.queue.filter(
      (q) =>
        q.room === room.name &&
        (q.category === 'hauler' || (q.memory && q.memory.role === 'hauler')),
    ).length;
    const upgraders = _.filter(
      Game.creeps,
      (creep) =>
        creep.memory.role === "upgrader" && creep.room.name === room.name,
    ).length;

    const sources = room.find(FIND_SOURCES);
    let requiredMiners = 0;
    for (const source of sources) {
      requiredMiners += spawnManager.calculateRequiredMiners(room, source);
    }

    const totalMiners = miners + queuedMiners;
    const totalHaulers = haulers + queuedHaulers;

    let inDemand = "none";

    if (totalMiners < requiredMiners) {
      inDemand = totalMiners <= totalHaulers ? "miner" : "hauler";
    } else if (totalHaulers < totalMiners) {
      inDemand = "hauler";
    } else if (upgraders < 2) {
      // Adjust this number as needed
      inDemand = "upgrader";
    }

    Memory.rooms[room.name].inDemand = inDemand;

    logger.log(
      "demandManager",
      `Updated inDemand for room ${room.name}: ${inDemand}`,
      2,
    );
  },
};

module.exports = demandManager;
