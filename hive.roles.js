const htm = require('./manager.htm');
const spawnQueue = require('./manager.spawnQueue');
const dna = require('./manager.dna');
const statsConsole = require('console.console');
const _ = require('lodash');
const TASK_STARTER_COUPLE = 'spawnStarterCouple';

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
    const minerWorkParts = minerBody.filter(p => p === WORK).length;
    const sources = room.find(FIND_SOURCES);
    let minersNeeded = 0;
    let desiredMiners = 0;
    for (const source of sources) {
      const positions =
        Memory.rooms &&
        Memory.rooms[roomName] &&
        Memory.rooms[roomName].miningPositions &&
        Memory.rooms[roomName].miningPositions[source.id]
          ? Memory.rooms[roomName].miningPositions[source.id].positions
          : null;
      if (!positions) continue;
      // Limit miners by available positions with a hard cap of five per source
      const maxMiners = Math.min(Object.keys(positions).length, 5);
      desiredMiners += maxMiners;

      const liveCreeps = _.filter(
        Game.creeps,
        c => c.memory.role === 'miner' && c.memory.source === source.id,
      );
      const liveWork = _.sum(liveCreeps, c =>
        typeof c.getActiveBodyparts === 'function'
          ? c.getActiveBodyparts(WORK)
          : _.filter(c.body, p => p.type === WORK || p === WORK).length,
      );
      const queued = spawnQueue.queue.filter(
        q => q.memory.role === 'miner' && q.memory.source === source.id && q.room === roomName,
      );
      const queuedWork = _.sum(queued, q => q.bodyParts.filter(p => p === WORK).length);
      const requiredWork = Math.ceil(
        (source.energyCapacity / ENERGY_REGEN_TIME) / HARVEST_POWER,
      );

      const workShortage = Math.max(0, requiredWork - liveWork - queuedWork);
      const minersByWork = Math.ceil(workShortage / minerWorkParts);
      const minersBySlots = Math.max(0, maxMiners - (liveCreeps.length + queued.length));
      minersNeeded += Math.min(minersByWork, minersBySlots);
    }
    const minerTask = tasks.find(t => t.name === 'spawnMiner' && t.manager === 'spawnManager');
    const coupleTask = tasks.find(t => t.name === TASK_STARTER_COUPLE && t.manager === 'spawnManager');
    const minerTaskAmount = minerTask ? minerTask.amount || 0 : 0;
    const coupleAmount = coupleTask ? coupleTask.amount || 0 : 0;
    const minersToQueue = Math.max(0, minersNeeded - minerTaskAmount - coupleAmount);
    if (minersToQueue > 0) {
      if (room.energyCapacityAvailable < 550) {
        if (coupleTask) coupleTask.amount += minersToQueue;
        else
          htm.addColonyTask(
            roomName,
            TASK_STARTER_COUPLE,
            {},
            0,
            50,
            minersToQueue,
            'spawnManager',
          );
        statsConsole.log(`RoleEval queued ${minersToQueue} starter couple(s) for ${roomName}`, 2);
      } else {
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
    } else if ((minerTask || coupleTask) && minersNeeded === 0) {
      if (minerTask) {
        const idx = container.tasks.indexOf(minerTask);
        if (idx !== -1) container.tasks.splice(idx, 1);
      }
      if (coupleTask) {
        const idx = container.tasks.indexOf(coupleTask);
        if (idx !== -1) container.tasks.splice(idx, 1);
      }
    }

    // --- Upgrader calculation ---
    const availableSpots =
      (Memory.rooms[roomName] && Memory.rooms[roomName].controllerUpgradeSpots) || 1;
    const activeBuilders = _.filter(
      Game.creeps,
      c => c.memory.role === 'builder' && c.room.name === roomName,
    ).length;
    let desiredUpgraders = Math.min(4, Math.max(1, availableSpots - activeBuilders));
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
          4,
          20,
          upgradersNeeded,
          'spawnManager',
        );
      statsConsole.log(`RoleEval queued ${upgradersNeeded} upgrader(s) for ${roomName}`, 2);
    }

    // --- Builder calculation ---
    const sites = room.find(FIND_CONSTRUCTION_SITES);
    let desiredBuilders = Math.min(6, sites.length * 2);
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
          3,
          20,
          buildersNeeded,
          'spawnManager',
        );
      statsConsole.log(`RoleEval queued ${buildersNeeded} builder(s) for ${roomName}`, 2);
    } else if (builderTask && desiredBuilders === 0) {
      const idx = container.tasks.indexOf(builderTask);
      if (idx !== -1) container.tasks.splice(idx, 1);
    }

    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    if (!Memory.rooms[roomName].spawnLimits)
      Memory.rooms[roomName].spawnLimits = {};
    Memory.rooms[roomName].spawnLimits.miners = desiredMiners;
    Memory.rooms[roomName].spawnLimits.upgraders = desiredUpgraders;
    Memory.rooms[roomName].spawnLimits.builders = desiredBuilders;

    Memory.roleEval.lastRun = Game.time;
  },
};

module.exports = roles;
