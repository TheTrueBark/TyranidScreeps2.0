const htm = require('./manager.htm');
const spawnQueue = require('./manager.spawnQueue');
const dna = require('./manager.dna');
const statsConsole = require('console.console');
const maintenance = require('./manager.maintenance');
const _ = require('lodash');
const TASK_STARTER_COUPLE = 'spawnStarterCouple';

const ENERGY_REGEN = typeof ENERGY_REGEN_TIME !== 'undefined' ? ENERGY_REGEN_TIME : 300;
const MAX_BUILDERS = 4;
const BUILDER_DEMAND_HOLD_TICKS = 100;

function countWorkParts(parts = []) {
  const workConstant = typeof WORK !== 'undefined' ? WORK : 'work';
  return parts.filter(part => part === workConstant).length;
}

function countValidMiningPositions(positions) {
  if (!positions || typeof positions !== 'object') return 0;
  let count = 0;
  for (const key in positions) {
    const pos = positions[key];
    if (pos && typeof pos === 'object') {
      count += 1;
    }
  }
  return count;
}

function getFeasibleMiningPositionCap(roomName) {
  const roomMem = Memory.rooms && Memory.rooms[roomName];
  if (!roomMem) return 0;
  if (
    typeof roomMem.feasibleMiningPositions === 'number' &&
    Number.isFinite(roomMem.feasibleMiningPositions)
  ) {
    return Math.max(0, Math.floor(roomMem.feasibleMiningPositions));
  }
  const miningPositions = roomMem.miningPositions || {};
  let total = 0;
  for (const sourceId in miningPositions) {
    const sourceMem = miningPositions[sourceId];
    total += countValidMiningPositions(sourceMem && sourceMem.positions);
  }
  return total;
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
      const maxMiners = Math.min(countValidMiningPositions(positions), 5);
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
    } else {
      const feasibleCap = getFeasibleMiningPositionCap(roomName);
      if (feasibleCap > 0) {
        desiredMiners = Math.min(desiredMiners, feasibleCap);
      }
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

    const roomMem = Memory.rooms[roomName] || (Memory.rooms[roomName] = {});
    const buildingQueue = (room.memory && room.memory.buildingQueue) || [];
    const liveConstructionSites = room.find(FIND_CONSTRUCTION_SITES) || [];
    const constructionSites =
      buildingQueue.length > 0
        ? buildingQueue.length
        : liveConstructionSites.length;
    const roadType = typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road';
    const nonRoadConstructionSites =
      liveConstructionSites.length > 0
        ? liveConstructionSites.filter(site => site && site.structureType !== roadType).length
        : constructionSites;
    const onlyRoadConstruction =
      constructionSites > 0 && nonRoadConstructionSites === 0;
    const repairDemand = maintenance.getActiveRepairDemand(roomName);
    if (constructionSites > 0 || repairDemand > 0) {
      roomMem.builderDemandUntil = Game.time + BUILDER_DEMAND_HOLD_TICKS;
    }
    const builderDemandActive =
      typeof roomMem.builderDemandUntil === 'number' &&
      roomMem.builderDemandUntil > Game.time;
    let baselineWorkers =
      constructionSites > 0
        ? Math.min(dynamicCap, Math.min(6, constructionSites * 2))
        : 1;
    if (onlyRoadConstruction) baselineWorkers = 1;
    if (repairDemand > 0) baselineWorkers = Math.max(baselineWorkers, 1);
    const hasOwnedStructures =
      typeof FIND_MY_STRUCTURES !== 'undefined'
        ? (room.find(FIND_MY_STRUCTURES) || []).length > 0
        : false;

    const liveBuilders = _.filter(
      Game.creeps,
      c => c.memory.role === 'builder' && c.room.name === roomName,
    ).length;
    const liveUpgraders = _.filter(
      Game.creeps,
      c => c.memory.role === 'upgrader' && c.room.name === roomName,
    ).length;
    const manualBuilderLimit =
      manualLimits.builders !== undefined && manualLimits.builders !== 'auto'
        ? Math.max(0, manualLimits.builders)
        : null;
    const manualUpgraderLimit =
      manualLimits.upgraders !== undefined && manualLimits.upgraders !== 'auto'
        ? Math.max(0, manualLimits.upgraders)
        : null;

    // Evaluate builder and upgrader caps independently by role label.
    let desiredUpgraders =
      manualUpgraderLimit !== null ? manualUpgraderLimit : 1;
    desiredUpgraders = Math.max(0, desiredUpgraders);
    const previousBuilderLimit =
      roomMem && roomMem.spawnLimits && typeof roomMem.spawnLimits.builders === 'number'
        ? roomMem.spawnLimits.builders
        : 0;
    let desiredBuilders;
    if (manualBuilderLimit !== null) {
      desiredBuilders = manualBuilderLimit;
    } else if (constructionSites > 0) {
      if (onlyRoadConstruction) {
        desiredBuilders = 1;
      } else {
        desiredBuilders = Math.max(1, baselineWorkers - desiredUpgraders);
      }
    } else {
      desiredBuilders = 0;
      if (repairDemand > 0 || hasOwnedStructures) {
        desiredBuilders = 1;
      }
    }
    desiredBuilders = Math.min(MAX_BUILDERS, desiredBuilders);
    if (hasOwnedStructures) desiredBuilders = Math.max(1, desiredBuilders);

    const queuedBuilders = spawnQueue.queue.filter(
      q => q.room === roomName && q.memory && q.memory.role === 'builder',
    ).length;
    const queuedUpgraders = spawnQueue.queue.filter(
      q => q.room === roomName && q.memory && q.memory.role === 'upgrader',
    ).length;

    const upgraderTask = tasks.find(t => t.name === 'spawnUpgrader' && t.manager === 'spawnManager');
    if (upgraderTask) {
      const capped = Math.max(0, desiredUpgraders - (liveUpgraders + queuedUpgraders));
      if ((upgraderTask.amount || 0) > capped) {
        upgraderTask.amount = capped;
      }
      if ((upgraderTask.amount || 0) <= 0) {
        const idx = container.tasks.indexOf(upgraderTask);
        if (idx !== -1) container.tasks.splice(idx, 1);
      }
    }
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
    if (builderTask) {
      const capped = Math.max(0, desiredBuilders - (liveBuilders + queuedBuilders));
      if ((builderTask.amount || 0) > capped) {
        builderTask.amount = capped;
      }
      if ((builderTask.amount || 0) <= 0 && desiredBuilders <= liveBuilders + queuedBuilders) {
        const idx = container.tasks.indexOf(builderTask);
        if (idx !== -1) container.tasks.splice(idx, 1);
      }
    }
    const builderTaskAmount = builderTask ? builderTask.amount || 0 : 0;
    if (
      constructionSites === 0 &&
      repairDemand <= 0 &&
      builderDemandActive &&
      liveBuilders + queuedBuilders + builderTaskAmount > 0
    ) {
      desiredBuilders = Math.max(1, desiredBuilders);
    }
    if (
      builderDemandActive &&
      (manualLimits.builders === undefined || manualLimits.builders === 'auto') &&
      previousBuilderLimit > desiredBuilders
    ) {
      desiredBuilders = Math.min(MAX_BUILDERS, previousBuilderLimit);
    }
    const totalPlannedBuilders = liveBuilders + queuedBuilders + builderTaskAmount;
    const buildersNeeded = Math.max(0, desiredBuilders - totalPlannedBuilders);
    const blockersInQueue = spawnQueue.queue.some(
      q =>
        q.room === roomName &&
        q.memory &&
        (q.memory.role === 'miner' || q.memory.role === 'hauler'),
    );
    const builderSpawnBlocked = minersToQueue > 0 || blockersInQueue;
    if (buildersNeeded > 0 && !builderSpawnBlocked) {
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

    if (!roomMem.spawnLimits) roomMem.spawnLimits = {};
    roomMem.spawnLimits.miners = desiredMiners;
    roomMem.spawnLimits.maxMiners = desiredMiners;
    roomMem.spawnLimits.workers = desiredBuilders + desiredUpgraders;
    roomMem.spawnLimits.upgraders = desiredUpgraders;
    roomMem.spawnLimits.builders = desiredBuilders;
    const existingHaulerCap = roomMem.spawnLimits.maxHaulers;
    const existingHaulerTarget = roomMem.spawnLimits.haulers;
    const fallbackHaulerTarget = Math.max(
      1,
      Math.min(desiredMiners || 1, getFeasibleMiningPositionCap(roomName) || desiredMiners || 1),
    );
    if (
      typeof existingHaulerTarget !== 'number' ||
      !Number.isFinite(existingHaulerTarget)
    ) {
      roomMem.spawnLimits.haulers = fallbackHaulerTarget;
    }
    if (
      typeof existingHaulerCap !== 'number' ||
      !Number.isFinite(existingHaulerCap)
    ) {
      roomMem.spawnLimits.maxHaulers = fallbackHaulerTarget;
    }

    if (!roomMem.manualSpawnLimits) roomMem.manualSpawnLimits = {};
    if (manualLimits.miners !== undefined) {
      roomMem.manualSpawnLimits.miners = manualLimits.miners;
    }
    roomMem.manualSpawnLimits.workers =
      manualLimits.workers !== undefined ? manualLimits.workers : 'auto';
    if (manualLimits.builders !== undefined) {
      roomMem.manualSpawnLimits.builders = manualLimits.builders;
    }
    if (manualLimits.upgraders !== undefined) {
      roomMem.manualSpawnLimits.upgraders = manualLimits.upgraders;
    }
    if (manualLimits.haulers !== undefined) {
      roomMem.manualSpawnLimits.haulers = manualLimits.haulers;
    }

    Memory.roleEval.lastRun = Game.time;
  },
};

module.exports = roles;
