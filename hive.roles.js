const htm = require('./manager.htm');
const spawnQueue = require('./manager.spawnQueue');
const dna = require('./manager.dna');
const statsConsole = require('console.console');
const maintenance = require('./manager.maintenance');
const _ = require('lodash');
const TASK_STARTER_COUPLE = 'spawnStarterCouple';

const DEFAULT_BODY_COSTS = {
  move: 50,
  work: 100,
  carry: 50,
  attack: 80,
  ranged_attack: 150,
  tough: 10,
  heal: 250,
  claim: 600,
};

const ENERGY_REGEN = typeof ENERGY_REGEN_TIME !== 'undefined' ? ENERGY_REGEN_TIME : 300;

function partCost(part) {
  if (typeof BODYPART_COST !== 'undefined' && BODYPART_COST[part] !== undefined) {
    return BODYPART_COST[part];
  }
  const key = typeof part === 'string' ? part.toLowerCase() : part;
  return DEFAULT_BODY_COSTS[key] || 0;
}

function calculateBodyCost(parts = []) {
  return parts.reduce((total, part) => total + partCost(part), 0);
}

function countWorkParts(parts = []) {
  const workConstant = typeof WORK !== 'undefined' ? WORK : 'work';
  return parts.filter(part => part === workConstant).length;
}

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
    const manualLimits =
      (Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].manualSpawnLimits) || {};

    // --- Miner calculation ---
    const minerBody = dna.getBodyParts('miner', room);
    const minerWorkParts = minerBody.filter(p => p === WORK).length;
    const sources = room.find(FIND_SOURCES);
    let minersNeeded = 0;
    let desiredMiners = 0;
    let liveMinersTotal = 0;
    let queuedMinersTotal = 0;
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
      liveMinersTotal += liveCreeps.length;
      const liveWork = _.reduce(
        liveCreeps,
        (total, creep) =>
          total +
          (typeof creep.getActiveBodyparts === 'function'
            ? creep.getActiveBodyparts(WORK)
            : _.filter(
                creep.body,
                (p) => p.type === WORK || p === WORK,
              ).length),
        0,
      );
      const queued = spawnQueue.queue.filter(
        q => q.memory.role === 'miner' && q.memory.source === source.id && q.room === roomName,
      );
      queuedMinersTotal += queued.length;
      const queuedWork = _.reduce(
        queued,
        (total, request) =>
          total + request.bodyParts.filter((p) => p === WORK).length,
        0,
      );
      const requiredWork = Math.ceil(
        (source.energyCapacity / ENERGY_REGEN_TIME) / HARVEST_POWER,
      );

      const workShortage = Math.max(0, requiredWork - liveWork - queuedWork);
      const minersByWork = Math.ceil(workShortage / minerWorkParts);
      const minersBySlots = Math.max(0, maxMiners - (liveCreeps.length + queued.length));
      minersNeeded += Math.min(minersByWork, minersBySlots);
    }
    if (manualLimits.miners !== undefined && manualLimits.miners !== 'auto') {
      const target = manualLimits.miners;
      minersNeeded = Math.max(0, target - (liveMinersTotal + queuedMinersTotal));
      desiredMiners = target;
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

    // --- Worker (builder/upgrader) calculation ---
    const workerBody = dna.getBodyParts('builder', room);
    const workPartsPerBody = Math.max(1, countWorkParts(workerBody));
    const workerBodyCost = calculateBodyCost(workerBody);
    const roomSources = room.find(FIND_SOURCES) || [];
    const energyPerTick = roomSources.reduce((total, source) => {
      const capacity =
        typeof source.energyCapacity === 'number' && source.energyCapacity > 0
          ? source.energyCapacity
          : 3000;
      return total + capacity / ENERGY_REGEN;
    }, 0);
    const maxWorkParts = Math.max(1, Math.floor(energyPerTick * 0.75));
    const capByEnergy = Math.max(1, Math.floor(maxWorkParts / workPartsPerBody));
    const availableSpots =
      (Memory.rooms[roomName] && Memory.rooms[roomName].controllerUpgradeSpots) || 1;
    const hardCap = Math.max(1, availableSpots);
    let dynamicCap = Math.max(1, Math.min(hardCap, capByEnergy));

    const buildingQueue = (room.memory && room.memory.buildingQueue) || [];
    const constructionSites =
      buildingQueue.length > 0
        ? buildingQueue.length
        : room.find(FIND_CONSTRUCTION_SITES).length;
    const repairDemand = maintenance.getActiveRepairDemand(roomName);
    let baselineWorkers =
      constructionSites > 0
        ? Math.min(dynamicCap, Math.min(6, constructionSites * 2))
        : 1;
    if (repairDemand > 0) baselineWorkers = Math.max(baselineWorkers, 1);

    const liveBuilders = _.filter(
      Game.creeps,
      c => c.memory.role === 'builder' && c.room.name === roomName,
    ).length;
    const liveUpgraders = _.filter(
      Game.creeps,
      c => c.memory.role === 'upgrader' && c.room.name === roomName,
    ).length;
    const liveWorkers = liveBuilders + liveUpgraders;

    const queuedWorkers = spawnQueue.queue.filter(
      q =>
        q.room === roomName &&
        q.memory &&
        (q.memory.role === 'builder' || q.memory.role === 'upgrader'),
    ).length;

    let manualWorkerLimit =
      manualLimits.workers !== undefined && manualLimits.workers !== 'auto'
        ? manualLimits.workers
        : null;
    if (manualWorkerLimit === null) {
      const manualBuilderLimit =
        manualLimits.builders !== undefined && manualLimits.builders !== 'auto'
          ? manualLimits.builders
          : null;
      const manualUpgraderLimit =
        manualLimits.upgraders !== undefined && manualLimits.upgraders !== 'auto'
          ? manualLimits.upgraders
          : null;
      if (manualBuilderLimit !== null && manualUpgraderLimit !== null) {
        manualWorkerLimit = Math.max(manualBuilderLimit, manualUpgraderLimit);
      } else if (manualBuilderLimit !== null) {
        manualWorkerLimit = manualBuilderLimit;
      } else if (manualUpgraderLimit !== null) {
        manualWorkerLimit = manualUpgraderLimit;
      }
    }

    let targetWorkers = Math.min(dynamicCap, Math.max(1, baselineWorkers));
    if (manualWorkerLimit !== null) {
      targetWorkers = manualWorkerLimit;
      dynamicCap = Math.max(0, manualWorkerLimit);
    } else {
      const roomQueue = spawnQueue.queue.filter(req => req.room === roomName);
      const queueEmpty = roomQueue.length === 0;
      const canSpawnWorker = room.energyAvailable >= workerBodyCost;
      if (
        queueEmpty &&
        canSpawnWorker &&
        targetWorkers < dynamicCap &&
        liveWorkers + queuedWorkers < dynamicCap
      ) {
        targetWorkers = Math.min(
          dynamicCap,
          Math.max(targetWorkers, liveWorkers + queuedWorkers + 1),
        );
      }
    }
    if (manualWorkerLimit !== null) {
      targetWorkers = Math.max(0, Math.min(dynamicCap, targetWorkers));
    } else {
      targetWorkers = Math.max(1, Math.min(dynamicCap, targetWorkers));
    }

    let desiredUpgraders = Math.min(targetWorkers, 1);
    if (constructionSites === 0 && targetWorkers > 1) {
      desiredUpgraders = Math.min(
        targetWorkers,
        Math.min(hardCap, Math.max(1, Math.ceil(targetWorkers / 2))),
      );
    }
    const desiredBuilders = Math.max(0, targetWorkers - desiredUpgraders);

    const queuedBuilders = spawnQueue.queue.filter(
      q => q.room === roomName && q.memory && q.memory.role === 'builder',
    ).length;
    const queuedUpgraders = spawnQueue.queue.filter(
      q => q.room === roomName && q.memory && q.memory.role === 'upgrader',
    ).length;

    const upgraderTask = tasks.find(t => t.name === 'spawnUpgrader' && t.manager === 'spawnManager');
    const upgraderTaskAmount = upgraderTask ? upgraderTask.amount || 0 : 0;
    const totalPlannedUpgraders = liveUpgraders + queuedUpgraders + upgraderTaskAmount;
    const upgradersNeeded = Math.max(0, desiredUpgraders - totalPlannedUpgraders);
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

    const builderTask = tasks.find(t => t.name === 'spawnBuilder' && t.manager === 'spawnManager');
    const builderTaskAmount = builderTask ? builderTask.amount || 0 : 0;
    const totalPlannedBuilders = liveBuilders + queuedBuilders + builderTaskAmount;
    const buildersNeeded = Math.max(0, desiredBuilders - totalPlannedBuilders);
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
    Memory.rooms[roomName].spawnLimits.workers = targetWorkers;
    Memory.rooms[roomName].spawnLimits.upgraders = desiredUpgraders;
    Memory.rooms[roomName].spawnLimits.builders = desiredBuilders;

    if (!Memory.rooms[roomName].manualSpawnLimits)
      Memory.rooms[roomName].manualSpawnLimits = {};
    if (manualLimits.miners !== undefined) {
      Memory.rooms[roomName].manualSpawnLimits.miners = manualLimits.miners;
    }
    if (manualLimits.workers !== undefined) {
      Memory.rooms[roomName].manualSpawnLimits.workers = manualLimits.workers;
    } else if (manualWorkerLimit !== null) {
      Memory.rooms[roomName].manualSpawnLimits.workers = manualWorkerLimit;
    } else {
      Memory.rooms[roomName].manualSpawnLimits.workers = 'auto';
    }
    if (manualLimits.builders !== undefined) {
      Memory.rooms[roomName].manualSpawnLimits.builders = manualLimits.builders;
    }
    if (manualLimits.upgraders !== undefined) {
      Memory.rooms[roomName].manualSpawnLimits.upgraders = manualLimits.upgraders;
    }

    Memory.roleEval.lastRun = Game.time;
  },
};

module.exports = roles;
