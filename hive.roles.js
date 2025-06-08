const htm = require('./manager.htm');
const spawnQueue = require('./manager.spawnQueue');
const dna = require('./manager.dna');
const statsConsole = require('console.console');
const _ = require('lodash');

/**
 * Evaluate workforce requirements for a room and queue HTM spawn tasks.
 * Miners, upgraders and builders are considered. Haulers are handled
 * separately by the energy demand module.
 */
const roles = {
  evaluateRoom(room) {
    if (!room || !room.controller || !room.controller.my) return;
    htm.init();
    if (!Memory.roleEval) Memory.roleEval = { lastRun: 0 };
    const roomName = room.name;
    const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
    const tasks = container && container.tasks ? container.tasks : [];

    // --- Miner calculation ---
    const minerBody = dna.getBodyParts('miner', room);
    const workParts = minerBody.filter(p => p === WORK).length;
    const harvestPerTick = workParts * HARVEST_POWER;
    const sources = room.find(FIND_SOURCES);
    let minersNeeded = 0;
    for (const source of sources) {
      const positions =
        Memory.rooms &&
        Memory.rooms[roomName] &&
        Memory.rooms[roomName].miningPositions &&
        Memory.rooms[roomName].miningPositions[source.id]
          ? Memory.rooms[roomName].miningPositions[source.id].positions
          : null;
      if (!positions) continue;
      const maxMiners = Math.min(
        Object.keys(positions).length,
        Math.ceil((source.energyCapacity / ENERGY_REGEN_TIME) / harvestPerTick),
      );
      const live = _.filter(
        Game.creeps,
        c => c.memory.role === 'miner' && c.memory.source === source.id,
      ).length;
      const queued = spawnQueue.queue.filter(
        q => q.memory.role === 'miner' && q.memory.source === source.id && q.room === roomName,
      ).length;
      minersNeeded += Math.max(0, maxMiners - live - queued);
    }
    const minerTask = tasks.find(t => t.name === 'spawnMiner' && t.manager === 'spawnManager');
    const minerTaskAmount = minerTask ? minerTask.amount || 0 : 0;
    const minersToQueue = Math.max(0, minersNeeded - minerTaskAmount);
    if (minersToQueue > 0) {
      if (minerTask) minerTask.amount += minersToQueue;
      else
        htm.addColonyTask(
          roomName,
          'spawnMiner',
          { role: 'miner' },
          1,
          30,
          minersToQueue,
          'spawnManager',
        );
      statsConsole.log(`RoleEval queued ${minersToQueue} miner(s) for ${roomName}`, 2);
    }

    // --- Upgrader calculation ---
    let controllerContainers = [];
    if (room.controller && room.controller.pos && room.controller.pos.findInRange) {
      controllerContainers = room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: s => s.structureType === STRUCTURE_CONTAINER,
      });
    }
    const desiredUpgraders = controllerContainers.length * 4;
    const liveUpgraders = _.filter(
      Game.creeps,
      c => c.memory.role === 'upgrader' && c.room.name === roomName,
    ).length;
    const queuedUpgraders = spawnQueue.queue.filter(
      q => q.memory.role === 'upgrader' && q.room === roomName,
    ).length;
    const upgraderTask = tasks.find(t => t.name === 'spawnUpgrader' && t.manager === 'spawnManager');
    const upgraderTaskAmount = upgraderTask ? upgraderTask.amount || 0 : 0;
    const upgradersNeeded = Math.max(0, desiredUpgraders - liveUpgraders - queuedUpgraders - upgraderTaskAmount);
    if (upgradersNeeded > 0) {
      if (upgraderTask) upgraderTask.amount += upgradersNeeded;
      else
        htm.addColonyTask(
          roomName,
          'spawnUpgrader',
          { role: 'upgrader' },
          3,
          20,
          upgradersNeeded,
          'spawnManager',
        );
      statsConsole.log(`RoleEval queued ${upgradersNeeded} upgrader(s) for ${roomName}`, 2);
    }

    // --- Builder calculation ---
    const sites = room.find(FIND_CONSTRUCTION_SITES);
    const important = sites.filter(
      s =>
        s.structureType === STRUCTURE_EXTENSION ||
        s.structureType === STRUCTURE_CONTAINER ||
        s.structureType === STRUCTURE_ROAD,
    );
    const general = sites.length - important.length;
    let desiredBuilders = 0;
    if (important.length > 0) desiredBuilders = Math.min(8, important.length * 4);
    else desiredBuilders = Math.min(8, general * 2);
    const liveBuilders = _.filter(
      Game.creeps,
      c => c.memory.role === 'builder' && c.room.name === roomName,
    ).length;
    const queuedBuilders = spawnQueue.queue.filter(
      q => q.memory.role === 'builder' && q.room === roomName,
    ).length;
    const builderTask = tasks.find(t => t.name === 'spawnBuilder' && t.manager === 'spawnManager');
    const builderTaskAmount = builderTask ? builderTask.amount || 0 : 0;
    const buildersNeeded = Math.max(0, desiredBuilders - liveBuilders - queuedBuilders - builderTaskAmount);
    if (buildersNeeded > 0) {
      if (builderTask) builderTask.amount += buildersNeeded;
      else
        htm.addColonyTask(
          roomName,
          'spawnBuilder',
          { role: 'builder' },
          4,
          20,
          buildersNeeded,
          'spawnManager',
        );
      statsConsole.log(`RoleEval queued ${buildersNeeded} builder(s) for ${roomName}`, 2);
    }

    Memory.roleEval.lastRun = Game.time;
  },
};

module.exports = roles;
