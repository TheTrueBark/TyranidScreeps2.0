const htm = require('./manager.htm');
const movementUtils = require('./utils.movement');
const maintenance = require('./manager.maintenance');
const statsConsole = require('console.console');
const spawnQueue = require('./manager.spawnQueue');
const {
  reserveEnergy,
  releaseEnergy,
  getReserved,
  updateReserveInfo,
  describeReserveTarget,
} = require('./utils.energyReserve');

const MAX_BUILDERS_PER_SITE = 3;
const ENERGY = typeof RESOURCE_ENERGY !== 'undefined' ? RESOURCE_ENERGY : 'energy';
const MAX_IDLE_RANGE = 0;
const ERR_NOT_IN_RANGE_CODE =
  typeof ERR_NOT_IN_RANGE !== 'undefined' ? ERR_NOT_IN_RANGE : -9;
const ERR_NOT_ENOUGH_ENERGY_CODE =
  typeof ERR_NOT_ENOUGH_ENERGY !== 'undefined' ? ERR_NOT_ENOUGH_ENERGY : -6;
const ERR_INVALID_TARGET_CODE =
  typeof ERR_INVALID_TARGET !== 'undefined' ? ERR_INVALID_TARGET : -7;
function getGlobalConstant(name, fallback) {
  if (typeof global !== 'undefined' && Object.prototype.hasOwnProperty.call(global, name)) {
    return global[name];
  }
  if (
    typeof globalThis !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(globalThis, name)
  ) {
    return globalThis[name];
  }
  return fallback;
}

const FINDERS = {
  DROPPED: () => getGlobalConstant('FIND_DROPPED_RESOURCES', 'FIND_DROPPED_RESOURCES'),
  TOMBSTONES: () => getGlobalConstant('FIND_TOMBSTONES', 'FIND_TOMBSTONES'),
  RUINS: () => getGlobalConstant('FIND_RUINS', 'FIND_RUINS'),
  STRUCTURES: () => getGlobalConstant('FIND_STRUCTURES', 'FIND_STRUCTURES'),
  MY_SPAWNS: () => getGlobalConstant('FIND_MY_SPAWNS', 'FIND_MY_SPAWNS'),
  SOURCES: () => getGlobalConstant('FIND_SOURCES', 'FIND_SOURCES'),
};
const STRUCTURE_TYPES = {
  CONTAINER: typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container',
  STORAGE: typeof STRUCTURE_STORAGE !== 'undefined' ? STRUCTURE_STORAGE : 'storage',
  LINK: typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link',
  TERMINAL: typeof STRUCTURE_TERMINAL !== 'undefined' ? STRUCTURE_TERMINAL : 'terminal',
  FACTORY: typeof STRUCTURE_FACTORY !== 'undefined' ? STRUCTURE_FACTORY : 'factory',
  LAB: typeof STRUCTURE_LAB !== 'undefined' ? STRUCTURE_LAB : 'lab',
  POWER_SPAWN: typeof STRUCTURE_POWER_SPAWN !== 'undefined' ? STRUCTURE_POWER_SPAWN : 'powerSpawn',
};

if (!Memory.constructionReservations) Memory.constructionReservations = {};

function ensureConstructionEntry(siteId, info = {}) {
  const reservations = Memory.constructionReservations;
  if (!reservations[siteId]) {
    reservations[siteId] = {
      creeps: {},
      lastSeen: Game.time,
      priority: info.priority || 0,
      roomName: info.roomName || null,
    };
  }
  const entry = reservations[siteId];
  if (info.priority !== undefined) entry.priority = info.priority;
  if (info.roomName && !entry.roomName) entry.roomName = info.roomName;
  entry.lastSeen = Game.time;
  return entry;
}

function removeConstructionEntry(siteId) {
  if (!siteId) return;
  const reservations = Memory.constructionReservations;
  delete reservations[siteId];
}

function assignConstruction(siteId, creepName, info = {}) {
  if (!siteId || !creepName) return false;
  const entry = ensureConstructionEntry(siteId, info);
  if (!entry.creeps) entry.creeps = {};
  if (entry.creeps[creepName]) return true;
  const assigned = Object.keys(entry.creeps);
  if (assigned.length >= MAX_BUILDERS_PER_SITE) return false;
  entry.creeps[creepName] = {
    assignedAt: Game.time,
  };
  entry.lastSeen = Game.time;
  return true;
}

function releaseConstruction(siteId, creepName) {
  if (!siteId || !creepName) return;
  const reservations = Memory.constructionReservations;
  const entry = reservations[siteId];
  if (!entry || !entry.creeps) return;
  delete entry.creeps[creepName];
  entry.lastSeen = Game.time;
  if (Object.keys(entry.creeps).length === 0) {
    removeConstructionEntry(siteId);
  }
}

function constructionAssignmentsCount(siteId) {
  const entry = Memory.constructionReservations[siteId];
  if (!entry || !entry.creeps) return 0;
  return Object.keys(entry.creeps).length;
}

function cleanupConstructionReservations(room) {
  const reservations = Memory.constructionReservations;
  for (const siteId in reservations) {
    const entry = reservations[siteId];
    const site = typeof Game.getObjectById === 'function' ? Game.getObjectById(siteId) : null;
    if (!site || (room && site.pos.roomName !== room.name)) {
      removeConstructionEntry(siteId);
      continue;
    }
    const creeps = entry.creeps || {};
    for (const name in creeps) {
      if (!Game.creeps[name]) {
        delete creeps[name];
      }
    }
    if (Object.keys(creeps).length === 0) {
      removeConstructionEntry(siteId);
    } else {
      entry.creeps = creeps;
      entry.lastSeen = Game.time;
    }
  }
}

function requestEnergy(creep) {
  if (
    htm.hasTask(htm.LEVELS.CREEP, creep.name, 'deliverEnergy', 'hauler') ||
    Game.time % 10 !== 0
  )
    return;
  const spawn = creep.room.find(FINDERS.MY_SPAWNS())[0];
  const distance = spawn ? spawn.pos.getRangeTo(creep) : 10;
  htm.addCreepTask(
    creep.name,
    'deliverEnergy',
    { pos: { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name }, ticksNeeded: distance * 2 },
    1,
    50,
    1,
    'hauler',
  );
  const demand = require('./manager.hivemind.demand');
  const amount = creep.store.getFreeCapacity ? creep.store.getFreeCapacity(ENERGY) : 0;
  demand.recordRequest(creep.name, amount, creep.room.name);
}

function getStructureEnergy(target) {
  if (!target) return 0;
  const store = target.store;
  if (store) {
    if (typeof store.getUsedCapacity === 'function') {
      return store.getUsedCapacity(ENERGY) || 0;
    }
    if (typeof store[ENERGY] === 'number') {
      return store[ENERGY];
    }
  }
  if (typeof target.energy === 'number') return target.energy;
  return 0;
}

function getSpawnQueueEnergy(spawn) {
  if (!spawn || !spawn.id) return 0;
  let queue;
  try {
    queue = spawnQueue && spawnQueue.queue;
  } catch (error) {
    queue = [];
  }
  if (!Array.isArray(queue) || queue.length === 0) return 0;
  let total = 0;
  for (const request of queue) {
    if (!request || request.spawnId !== spawn.id) continue;
    const amount =
      typeof request.energyRequired === 'number' && Number.isFinite(request.energyRequired)
        ? request.energyRequired
        : 0;
    if (amount > 0) total += amount;
  }
  return total;
}

function collectEnergyCandidates(creep) {
  if (!creep.room || typeof creep.room.find !== 'function') return [];
  const freeCapacity = creep.store.getFreeCapacity
    ? creep.store.getFreeCapacity(ENERGY)
    : (creep.storeCapacity || 0) - (creep.store[ENERGY] || 0);
  if (freeCapacity <= 0) return [];
  const result = [];

  const addCandidate = (target, type, priority, amountOverride) => {
    if (!target || !target.pos) return;
    const id = target.id || `${type}-${target.pos.x}-${target.pos.y}-${target.pos.roomName}`;
    const total =
      amountOverride !== undefined ? amountOverride : getStructureEnergy(target) || target.amount || 0;
    const reserved = getReserved(id);
    const available = total - reserved;
    if (available <= 0) return;
    if (target.id && type !== 'harvest') {
      const descriptor = describeReserveTarget(target, type, { room: creep.room });
      updateReserveInfo(target.id, {
        available: Math.max(0, total),
        type: descriptor.type,
        haulersMayWithdraw: descriptor.haulersMayWithdraw,
        haulersMayDeposit: descriptor.haulersMayDeposit,
        buildersMayWithdraw: descriptor.buildersMayWithdraw,
        buildersMayDeposit: descriptor.buildersMayDeposit,
      });
    }
    const distance =
      typeof creep.pos.getRangeTo === 'function'
        ? creep.pos.getRangeTo(target)
        : Infinity;
    result.push({
      id,
      target,
      type,
      available,
      priority,
      distance,
    });
  };

  const drops = creep.room.find(FINDERS.DROPPED(), {
    filter: res => res.resourceType === ENERGY && res.amount > 0,
  });
  for (const drop of drops || []) {
    if (!drop || drop.resourceType !== ENERGY || !(drop.amount > 0)) continue;
    addCandidate(drop, 'pickup', 0, drop.amount);
  }

  const tombstones = creep.room.find(FINDERS.TOMBSTONES(), {
    filter: tomb => getStructureEnergy(tomb) > 0,
  });
  for (const tomb of tombstones || []) {
    if (!tomb || getStructureEnergy(tomb) <= 0) continue;
    addCandidate(tomb, 'withdraw', 1);
  }

  const ruins = creep.room.find(FINDERS.RUINS(), {
    filter: ruin => getStructureEnergy(ruin) > 0,
  });
  for (const ruin of ruins || []) {
    if (!ruin || getStructureEnergy(ruin) <= 0) continue;
    addCandidate(ruin, 'withdraw', 1);
  }

  const structures = creep.room.find(FINDERS.STRUCTURES(), {
    filter: structure => {
      if (!structure || !structure.structureType) return false;
      const types = [
        STRUCTURE_TYPES.CONTAINER,
        STRUCTURE_TYPES.STORAGE,
        STRUCTURE_TYPES.LINK,
        STRUCTURE_TYPES.TERMINAL,
        STRUCTURE_TYPES.FACTORY,
        STRUCTURE_TYPES.LAB,
        STRUCTURE_TYPES.POWER_SPAWN,
      ];
      if (!types.includes(structure.structureType)) return false;
      return getStructureEnergy(structure) > 0;
    },
  });
  for (const structure of structures || []) {
    if (!structure || !structure.structureType) continue;
    const allowedTypes = [
      STRUCTURE_TYPES.CONTAINER,
      STRUCTURE_TYPES.STORAGE,
      STRUCTURE_TYPES.LINK,
      STRUCTURE_TYPES.TERMINAL,
      STRUCTURE_TYPES.FACTORY,
      STRUCTURE_TYPES.LAB,
      STRUCTURE_TYPES.POWER_SPAWN,
    ];
    if (!allowedTypes.includes(structure.structureType)) continue;
    if (getStructureEnergy(structure) <= 0) continue;
    const base =
      structure.structureType === STRUCTURE_TYPES.CONTAINER ? 2 : 3;
    addCandidate(structure, 'withdraw', base);
  }

  const spawns = creep.room.find(FINDERS.MY_SPAWNS(), {
    filter: spawn => getStructureEnergy(spawn) > 0,
  });
  for (const spawn of spawns || []) {
    if (!spawn) continue;
    const energy = getStructureEnergy(spawn);
    if (energy <= 0) continue;
    const reserved = getSpawnQueueEnergy(spawn);
    const withdrawable = energy - reserved;
    if (withdrawable <= 0) continue;
    addCandidate(spawn, 'withdraw', 4, withdrawable);
  }

  if (result.length === 0) {
    const sources = creep.room.find(FINDERS.SOURCES(), {
      filter: source =>
        source &&
        ((typeof source.energy === 'number' && source.energy > 0) ||
          (typeof source.ticksToRegeneration === 'number' && source.ticksToRegeneration === 0)),
    });
    for (const source of sources || []) {
      const amount =
        typeof source.energy === 'number'
          ? source.energy
          : typeof source.energyCapacity === 'number'
          ? source.energyCapacity
          : 0;
      addCandidate(source, 'harvest', 5, amount);
    }
  }

  const hasBuildAssignment =
    (creep.memory && creep.memory.constructionTask) ||
    (creep.memory && creep.memory.mainTask && creep.memory.mainTask.type === 'build');

  if (
    result.length === 0 &&
    hasBuildAssignment &&
    creep.pos &&
    typeof creep.pos.findClosestByRange === 'function'
  ) {
    const closest = creep.pos.findClosestByRange(FINDERS.SOURCES(), {
      filter: source =>
        source &&
        ((typeof source.energy === 'number' && source.energy > 0) ||
          (typeof source.ticksToRegeneration === 'number' && source.ticksToRegeneration === 0)),
    });
    if (closest) {
      const inferred =
        typeof closest.energy === 'number'
          ? closest.energy
          : typeof closest.energyCapacity === 'number'
          ? closest.energyCapacity
          : freeCapacity;
      addCandidate(closest, 'harvest', 5, inferred || freeCapacity || 1);
    }
  }

  return result;
}

function reserveEnergyForTask(creep, candidate) {
  const freeCapacity = creep.store.getFreeCapacity
    ? creep.store.getFreeCapacity(ENERGY)
    : (creep.storeCapacity || 0) - (creep.store[ENERGY] || 0);
  if (freeCapacity <= 0) return null;
  const desired = Math.min(candidate.available, freeCapacity);
  if (desired <= 0) return null;
  if (candidate.type !== 'harvest') {
    reserveEnergy(candidate.id, desired);
  }
  creep.memory.energyTask = {
    id: candidate.id,
    type: candidate.type,
    reserved: candidate.type !== 'harvest' ? desired : undefined,
    structureType: candidate.target.structureType || null,
    pos: candidate.target.pos
      ? {
          x: candidate.target.pos.x,
          y: candidate.target.pos.y,
          roomName: candidate.target.pos.roomName,
        }
      : null,
  };
  return candidate;
}

function executeEnergyTask(creep) {
  const task = creep.memory.energyTask;
  if (!task || !task.id) return false;
  let target = typeof Game.getObjectById === 'function' ? Game.getObjectById(task.id) : null;
  if (!target && creep.room) {
    if (task.type === 'pickup') {
      const drops = creep.room.find(FINDERS.DROPPED(), {
        filter: res =>
          res.id === task.id ||
          (task.pos &&
            res.pos &&
            res.pos.x === task.pos.x &&
            res.pos.y === task.pos.y &&
            res.pos.roomName === task.pos.roomName),
      });
      target = drops && drops[0];
    } else if (task.type === 'harvest') {
      const sources = creep.room.find(FINDERS.SOURCES(), {
        filter: source =>
          source.id === task.id ||
          (task.pos &&
            source.pos &&
            source.pos.x === task.pos.x &&
            source.pos.y === task.pos.y &&
            source.pos.roomName === task.pos.roomName),
      });
      target = sources && sources[0];
    } else if (task.structureType) {
      const structures = creep.room.find(FINDERS.STRUCTURES(), {
        filter: s =>
          s.id === task.id ||
          (task.pos &&
            s.pos &&
            s.pos.x === task.pos.x &&
            s.pos.y === task.pos.y &&
            s.pos.roomName === task.pos.roomName &&
            (!task.structureType || s.structureType === task.structureType)),
      });
      target = structures && structures[0];
    }
  }
  if (!target) {
    if (task.type !== 'harvest') {
      releaseEnergy(task.id, task.reserved || 0);
    }
    delete creep.memory.energyTask;
    return false;
  }

  const moveOpts = { visualizePathStyle: { stroke: '#ffaa00' } };
  let result = ERR_INVALID_TARGET_CODE;

  if (task.type === 'pickup') {
    if (typeof creep.pickup !== 'function') {
      if (task.type !== 'harvest') {
        releaseEnergy(task.id, task.reserved || 0);
      }
      delete creep.memory.energyTask;
      return false;
    }
    result = creep.pickup(target);
  } else if (task.type === 'withdraw') {
    if (typeof creep.withdraw !== 'function') {
      releaseEnergy(task.id, task.reserved || 0);
      delete creep.memory.energyTask;
      return false;
    }
    result = creep.withdraw(target, ENERGY);
  } else if (task.type === 'harvest') {
    if (typeof creep.harvest !== 'function') {
      delete creep.memory.energyTask;
      return false;
    }
    result = creep.harvest(target);
  }

  if (result === ERR_NOT_IN_RANGE_CODE) {
    creep.travelTo(target, moveOpts);
    return true;
  }

  if (result === OK) {
    if (task.type !== 'harvest') {
      releaseEnergy(task.id, task.reserved || 0);
    }
    delete creep.memory.energyTask;
    return true;
  }

  if (result === ERR_NOT_ENOUGH_ENERGY_CODE || result === ERR_INVALID_TARGET_CODE) {
    if (task.type !== 'harvest') {
      releaseEnergy(task.id, task.reserved || 0);
    }
    delete creep.memory.energyTask;
    return false;
  }

  return false;
}

function gatherEnergy(creep) {
  if (executeEnergyTask(creep)) return true;
  const candidates = collectEnergyCandidates(creep);
  if (candidates.length === 0) {
    requestEnergy(creep);
    return false;
  }
  candidates.sort(
    (a, b) =>
      a.priority - b.priority || a.distance - b.distance || b.available - a.available,
  );
  const best = candidates[0];
  if (!reserveEnergyForTask(creep, best)) return false;
  return executeEnergyTask(creep);
}

function fetchRepairTarget(creep) {
  const { repairTarget } = creep.memory;
  let target = repairTarget ? Game.getObjectById(repairTarget) : null;

  if (
    target &&
    target.hits >= target.hitsMax * maintenance.CLEAR_RATIO
  ) {
    maintenance.completeRepair(creep.room.name, target.id, creep.name);
    creep.memory.repairTarget = null;
    target = null;
  }

  if (!target) {
    const request = maintenance.assignRepairTarget(creep.room.name, creep.name);
    if (request) {
      creep.memory.repairTarget = request.id;
      target = Game.getObjectById(request.id) || null;
      if (!target) {
        maintenance.completeRepair(creep.room.name, request.id, creep.name);
        creep.memory.repairTarget = null;
      }
    }
  }

  return target;
}

function maintainConstructionTask(creep) {
  cleanupConstructionReservations(creep.room);
  const taskMem = creep.memory.constructionTask;
  if (taskMem && taskMem.id) {
    const site = Game.getObjectById(taskMem.id);
    if (site) {
      assignConstruction(taskMem.id, creep.name, {
        priority: taskMem.priority || 0,
        roomName: creep.room.name,
      });
      creep.memory.mainTask = { type: 'build', id: taskMem.id };
      return site;
    }
    releaseConstruction(taskMem.id, creep.name);
    delete creep.memory.constructionTask;
    delete creep.memory.mainTask;
  }

  const queue =
    (creep.room.memory && creep.room.memory.buildingQueue) || [];

  for (const entry of queue) {
    if (!entry || !entry.id) continue;
    const site = Game.getObjectById(entry.id);
    if (!site) continue;
    if (assignConstruction(entry.id, creep.name, {
      priority: entry.priority || 0,
      roomName: creep.room.name,
    })) {
      creep.memory.constructionTask = { id: entry.id, priority: entry.priority || 0 };
      creep.memory.mainTask = { type: 'build', id: entry.id };
      return site;
    }
  }

  delete creep.memory.mainTask;
  return null;
}

function buildStructure(creep) {
  const target = maintainConstructionTask(creep);
  if (!target) return false;

  if (creep.pos.isEqualTo(target.pos)) {
    if (!movementUtils.stepOff(creep) && typeof creep.move === 'function') {
      creep.move(1);
    }
  }

  const result = creep.build(target);
  if (result === ERR_NOT_IN_RANGE_CODE) {
    creep.travelTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
    return true;
  }
  if (result === OK) {
    if (target.progress >= target.progressTotal) {
      releaseConstruction(target.id, creep.name);
      delete creep.memory.constructionTask;
      delete creep.memory.mainTask;
    }
    return true;
  }
  if (result === ERR_NOT_ENOUGH_ENERGY_CODE) {
    return true;
  }
  releaseConstruction(target.id, creep.name);
  delete creep.memory.constructionTask;
  delete creep.memory.mainTask;
  return false;
}

function upgradeController(creep) {
  const controller = creep.room.controller;
  if (!controller) return false;
  const range = creep.pos.getRangeTo(controller);
  if (range > 3) {
    creep.travelTo(controller, { range: 3, visualizePathStyle: { stroke: '#ffffff' } });
  }
  if (creep.pos.getRangeTo(controller) <= 3) {
    creep.upgradeController(controller);
  }
  return true;
}

function moveToIdle(creep) {
  const idle = movementUtils.findIdlePosition(creep.room, 'worker', creep.name);
  if (idle && !creep.pos.isEqualTo(idle)) {
    creep.travelTo(idle, { range: MAX_IDLE_RANGE });
  }
}

function run(creep) {
  const start = Game.cpu.getUsed();
  movementUtils.avoidSpawnArea(creep);

  if (!creep.memory.primaryRole) {
    creep.memory.primaryRole = creep.memory.role === 'upgrader' ? 'upgrader' : 'builder';
  }
  const primary = creep.memory.primaryRole || 'builder';

  if (creep.store[ENERGY] === 0) creep.memory.working = false;
  if (creep.store.getFreeCapacity && typeof creep.store.getFreeCapacity === 'function') {
    if (creep.store.getFreeCapacity(ENERGY) === 0) {
      creep.memory.working = true;
    } else if (primary === 'builder' && creep.store[ENERGY] > 0) {
      creep.memory.working = true;
    }
  } else if (typeof creep.storeCapacity === 'number' && creep.storeCapacity > 0) {
    if (creep.store[ENERGY] >= creep.storeCapacity) {
      creep.memory.working = true;
    } else if (primary === 'builder' && creep.store[ENERGY] > 0) {
      creep.memory.working = true;
    }
  } else if (creep.store[ENERGY] > 0) {
    creep.memory.working = true;
  }

  if (!creep.memory.working) {
    if (primary === 'builder') {
      maintainConstructionTask(creep);
    } else if (creep.memory.constructionTask) {
      maintainConstructionTask(creep);
    }
    gatherEnergy(creep);
    statsConsole.run([[`role.worker.${creep.memory.primaryRole}`, Game.cpu.getUsed() - start]]);
    return;
  }

  const repairTarget = fetchRepairTarget(creep);
  if (repairTarget) {
    const repairResult = creep.repair(repairTarget);
    if (repairResult === ERR_NOT_IN_RANGE_CODE) {
      creep.travelTo(repairTarget, { visualizePathStyle: { stroke: '#ffffff' } });
    } else if (repairResult === OK) {
      if (
        repairTarget.hits >= repairTarget.hitsMax ||
        repairTarget.hits / repairTarget.hitsMax >= maintenance.CLEAR_RATIO
      ) {
        maintenance.completeRepair(creep.room.name, repairTarget.id, creep.name);
        creep.memory.repairTarget = null;
      }
    } else if (repairResult === ERR_NOT_ENOUGH_ENERGY_CODE) {
      creep.memory.working = false;
    }
    statsConsole.run([[`role.worker.${creep.memory.primaryRole}`, Game.cpu.getUsed() - start]]);
    return;
  }

  let worked = false;
  if (primary === 'builder') {
    worked = buildStructure(creep);
    if (!worked) {
      worked = upgradeController(creep);
    }
  } else {
    worked = upgradeController(creep);
    if (!worked) {
      worked = buildStructure(creep);
    }
  }

  if (!worked) {
    moveToIdle(creep);
  }

  statsConsole.run([[`role.worker.${primary}`, Game.cpu.getUsed() - start]]);
}

function onDeath(creep) {
  if (!creep || !creep.memory) return;
  if (creep.memory.constructionTask && creep.memory.constructionTask.id) {
    releaseConstruction(creep.memory.constructionTask.id, creep.name);
  }
  const task = creep.memory.energyTask;
  if (task && task.id) {
    releaseEnergy(task.id, task.reserved || 0);
  }
  if (creep.memory.repairTarget) {
    maintenance.completeRepair(creep.room.name, creep.memory.repairTarget, creep.name);
  }
  delete creep.memory.constructionTask;
  delete creep.memory.mainTask;
  delete creep.memory.energyTask;
  delete creep.memory.repairTarget;
}

module.exports = {
  run,
  onDeath,
};

