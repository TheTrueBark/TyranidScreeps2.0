const htm = require('./manager.htm');
const movementUtils = require('./utils.movement');
const maintenance = require('./manager.maintenance');
const lifecycleControl = require('./creep.lifecycle');
const statsConsole = require('console.console');
const spawnQueue = require('./manager.spawnQueue');
const {
  reserveEnergy,
  releaseEnergy,
  getReserved,
  updateReserveInfo,
  describeReserveTarget,
} = require('./utils.energyReserve');

const MAX_BUILDERS_PER_SITE = 4;
const ENERGY = typeof RESOURCE_ENERGY !== 'undefined' ? RESOURCE_ENERGY : 'energy';
const MAX_IDLE_RANGE = 0;
const ERR_NOT_IN_RANGE_CODE =
  typeof ERR_NOT_IN_RANGE !== 'undefined' ? ERR_NOT_IN_RANGE : -9;
const ERR_NOT_ENOUGH_ENERGY_CODE =
  typeof ERR_NOT_ENOUGH_ENERGY !== 'undefined' ? ERR_NOT_ENOUGH_ENERGY : -6;
const ERR_INVALID_TARGET_CODE =
  typeof ERR_INVALID_TARGET !== 'undefined' ? ERR_INVALID_TARGET : -7;
const OK_CODE = typeof OK !== 'undefined' ? OK : 0;
const DEFAULT_CLUSTER_BUILD_RANGE = 3;
const SOURCE_CONTAINER_CLUSTER_BUILD_RANGE = 2;
const QUAD_CLUSTER_SIZE = 4;

function isBuilderRoleMemory(memory) {
  if (!memory) return false;
  if (memory.role === 'builder' || memory.primaryRole === 'builder') return true;
  // Migration/test-safe fallback: if role is unset but the creep is actively
  // assigned to a build task, treat it as builder-capable for cluster logic.
  if (!memory.role && memory.constructionTask && memory.constructionTask.id) {
    return true;
  }
  return false;
}

function ensureBuilderClusterReservationMap(roomName) {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  const roomMem = Memory.rooms[roomName];
  if (!roomMem.builderClusterReservations || typeof roomMem.builderClusterReservations !== 'object') {
    roomMem.builderClusterReservations = {};
  }
  return roomMem.builderClusterReservations;
}

function reservationKey(taskId, x, y) {
  return `${taskId}:${x}:${y}`;
}

function reserveBuilderClusterSlot(creep, taskId, slot) {
  if (!creep || !creep.room || !slot) return;
  const reservations = ensureBuilderClusterReservationMap(creep.room.name);
  const key = reservationKey(taskId, slot.x, slot.y);
  reservations[key] = {
    taskId,
    x: slot.x,
    y: slot.y,
    roomName: slot.roomName || creep.room.name,
    occupant: creep.name,
    reservedAt: Game.time,
  };
}

function releaseBuilderClusterReservationBySlot(roomName, taskId, slot) {
  if (!roomName || !slot || !taskId) return;
  const reservations = ensureBuilderClusterReservationMap(roomName);
  const key = reservationKey(taskId, slot.x, slot.y);
  delete reservations[key];
}

function cleanupBuilderClusterReservations(roomName) {
  if (!Memory.rooms || !Memory.rooms[roomName]) return;
  const reservations = ensureBuilderClusterReservationMap(roomName);
  for (const key in reservations) {
    const entry = reservations[key];
    if (!entry || !entry.occupant || !entry.taskId) {
      delete reservations[key];
      continue;
    }
    const creep = Game.creeps && Game.creeps[entry.occupant];
    if (!creep || !creep.memory || !creep.room || creep.room.name !== roomName) {
      delete reservations[key];
      continue;
    }
    const slot = creep.memory.builderClusterSlot;
    if (
      !slot ||
      slot.taskId !== entry.taskId ||
      slot.x !== entry.x ||
      slot.y !== entry.y ||
      (slot.roomName || roomName) !== (entry.roomName || roomName)
    ) {
      delete reservations[key];
      continue;
    }
    const site = typeof Game.getObjectById === 'function' ? Game.getObjectById(entry.taskId) : null;
    if (!site) {
      delete reservations[key];
      continue;
    }
  }
}
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

function isWalkableTile(room, x, y) {
  if (!room || x < 0 || x > 49 || y < 0 || y > 49) return false;
  if (typeof room.getTerrain === 'function') {
    const terrain = room.getTerrain();
    if (terrain && typeof terrain.get === 'function') {
      const mask = terrain.get(x, y);
      if (
        typeof TERRAIN_MASK_WALL !== 'undefined' &&
        mask === TERRAIN_MASK_WALL
      ) {
        return false;
      }
    }
  }
  if (typeof room.lookForAt === 'function') {
    const structures = room.lookForAt(LOOK_STRUCTURES, x, y) || [];
    for (const structure of structures) {
      if (!structure || !structure.structureType) continue;
      if (
        typeof OBSTACLE_OBJECT_TYPES !== 'undefined' &&
        Array.isArray(OBSTACLE_OBJECT_TYPES) &&
        OBSTACLE_OBJECT_TYPES.includes(structure.structureType)
      ) {
        return false;
      }
      const roadType =
        typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road';
      if (
        structure.structureType === STRUCTURE_TYPES.CONTAINER ||
        structure.structureType === roadType
      ) {
        continue;
      }
    }
  }
  return true;
}

function resolveBuilderAnchor(room, site) {
  const spawnFinder = FINDERS.MY_SPAWNS();
  let spawn =
    typeof room.find === 'function'
      ? (room.find(spawnFinder) || [])[0]
      : null;
  if (!spawn && Game && Game.spawns) {
    spawn = Object.values(Game.spawns).find(
      s => s && s.room && s.room.name === room.name,
    );
  }
  if (spawn && spawn.pos) return spawn.pos;
  const basePos =
    Memory.hive &&
    Memory.hive.clusters &&
    Memory.hive.clusters[room.name] &&
    Memory.hive.clusters[room.name].colonies &&
    Memory.hive.clusters[room.name].colonies[room.name] &&
    Memory.hive.clusters[room.name].colonies[room.name].meta &&
    Memory.hive.clusters[room.name].colonies[room.name].meta.basePos;
  if (basePos && typeof basePos.x === 'number' && typeof basePos.y === 'number') {
    return new RoomPosition(basePos.x, basePos.y, basePos.roomName || room.name);
  }
  return site.pos;
}

function isSourceAdjacentContainerSite(site, room) {
  if (!site || !site.pos) return false;
  if (site.structureType !== STRUCTURE_TYPES.CONTAINER) return false;
  if (typeof site.pos.findInRange === 'function') {
    const nearby = site.pos.findInRange(FINDERS.SOURCES(), 1) || [];
    if (nearby.length > 0) return true;
  }
  if (!room || typeof room.find !== 'function') return false;
  const sources = room.find(FINDERS.SOURCES()) || [];
  return sources.some((source) => {
    if (!source || !source.pos) return false;
    const dx = Math.abs(source.pos.x - site.pos.x);
    const dy = Math.abs(source.pos.y - site.pos.y);
    return Math.max(dx, dy) <= 1;
  });
}

function getClusterBuildRange(site, room) {
  if (isSourceAdjacentContainerSite(site, room)) {
    // Keep builder quads one tile closer for source-container projects so
    // local miner drops/withdrawals stay reachable.
    return SOURCE_CONTAINER_CLUSTER_BUILD_RANGE;
  }
  return DEFAULT_CLUSTER_BUILD_RANGE;
}

function computeBuilderClusterSlots(site, room) {
  if (!site || !site.pos || !room) return [];
  const buildRange = getClusterBuildRange(site, room);
  const spawnPos = resolveBuilderAnchor(room, site);
  let best = null;
  let bestScore = Infinity;
  const reachableToSite = (slot) => {
    if (typeof PathFinder === 'undefined' || typeof PathFinder.search !== 'function') return true;
    const search = PathFinder.search(
      new RoomPosition(slot.x, slot.y, room.name),
      { pos: site.pos, range: buildRange },
      { swampCost: 2, plainCost: 2, maxOps: 2000 },
    );
    return !!search && !search.incomplete;
  };

  const minX = Math.max(0, site.pos.x - buildRange);
  const maxX = Math.min(48, site.pos.x + buildRange);
  const minY = Math.max(0, site.pos.y - buildRange);
  const maxY = Math.min(48, site.pos.y + buildRange);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const block = [
        { x, y, roomName: room.name },
        { x: x + 1, y, roomName: room.name },
        { x, y: y + 1, roomName: room.name },
        { x: x + 1, y: y + 1, roomName: room.name },
      ];
      let valid = true;
      for (const slot of block) {
        const range = Math.max(
          Math.abs(slot.x - site.pos.x),
          Math.abs(slot.y - site.pos.y),
        );
        if (range > buildRange || !isWalkableTile(room, slot.x, slot.y)) {
          valid = false;
          break;
        }
        if (!reachableToSite(slot)) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;

      const anchorDistances = block.map((slot) =>
        Math.max(Math.abs(slot.x - spawnPos.x), Math.abs(slot.y - spawnPos.y)),
      );
      const minAnchorDistance = Math.min(...anchorDistances);
      const avgAnchorDistance =
        anchorDistances.reduce((sum, value) => sum + value, 0) / anchorDistances.length;
      const avgSiteDistance =
        block.reduce(
          (sum, slot) =>
            sum +
            (Math.abs(slot.x - site.pos.x) + Math.abs(slot.y - site.pos.y)),
          0,
        ) / block.length;
      // Prefer anchor-proximate blocks first, then keep the cluster close to the site.
      const score = minAnchorDistance * 100 + avgAnchorDistance * 10 + avgSiteDistance;
      if (score < bestScore) {
        bestScore = score;
        best = block;
      }
    }
  }

  if (!best) return [];
  best.sort((a, b) => {
    const da = Math.max(Math.abs(a.x - spawnPos.x), Math.abs(a.y - spawnPos.y));
    const db = Math.max(Math.abs(b.x - spawnPos.x), Math.abs(b.y - spawnPos.y));
    if (da !== db) return da - db;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });
  return best;
}

function requestEnergy(creep, amountOverride = null) {
  let opts = null;
  if (amountOverride && typeof amountOverride === 'object') {
    opts = amountOverride;
    amountOverride = opts.amount;
  }
  const forceImmediate = opts && opts.forceImmediate === true;
  const spawn = creep.room.find(FINDERS.MY_SPAWNS())[0];
  const distance = spawn ? spawn.pos.getRangeTo(creep) : 10;
  const demand = require('./manager.hivemind.demand');
  const fallback = creep.store.getFreeCapacity ? creep.store.getFreeCapacity(ENERGY) : 0;
  const amount =
    typeof amountOverride === 'number' && amountOverride > 0
      ? Math.max(1, Math.ceil(amountOverride))
      : fallback;
  if (!forceImmediate && Game.time % 10 !== 0) return;

  htm.init();
  const taskContainer = Memory.htm && Memory.htm.creeps ? Memory.htm.creeps[creep.name] : null;
  const existingTask = taskContainer && Array.isArray(taskContainer.tasks)
    ? taskContainer.tasks.find(t => t && t.name === 'deliverEnergy' && t.manager === 'hauler')
    : null;
  if (existingTask) {
    if (!existingTask.data) existingTask.data = {};
    existingTask.data.pos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
    existingTask.data.ticksNeeded = distance * 2;
    existingTask.data.amount = Math.max(
      1,
      Math.ceil(Math.max(existingTask.data.amount || 0, amount)),
    );
    existingTask.ttl = Math.max(existingTask.ttl || 0, 50);
  } else {
    htm.addCreepTask(
      creep.name,
      'deliverEnergy',
      {
        pos: { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name },
        ticksNeeded: distance * 2,
        amount: Math.max(1, Math.ceil(amount)),
      },
      1,
      50,
      1,
      'hauler',
    );
  }

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
  const totalCapacityRaw = creep.store.getCapacity
    ? creep.store.getCapacity(ENERGY)
    : typeof creep.storeCapacity === 'number'
      ? creep.storeCapacity
      : creep.carryCapacity || 0;
  const totalCapacity =
    typeof totalCapacityRaw === 'number' && totalCapacityRaw > 0
      ? totalCapacityRaw
      : freeCapacity + (creep.store[ENERGY] || 0);
  const result = [];

  const addCandidate = (target, type, priority, amountOverride) => {
    if (!target || !target.pos) return;
    const id = target.id || `${type}-${target.pos.x}-${target.pos.y}-${target.pos.roomName}`;
    const total =
      amountOverride !== undefined ? amountOverride : getStructureEnergy(target) || target.amount || 0;
    const reserved = getReserved(id);
    const available = total - reserved;
    if (available <= 0) return;
    let descriptor = null;
    if (target.id && type !== 'harvest') {
      descriptor = describeReserveTarget(target, type, { room: creep.room });
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
      descriptor,
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

  const controllerContainers = result.filter(
    candidate => candidate.descriptor && candidate.descriptor.type === 'controllerContainer',
  );
  let preferredContainer = null;
  for (const candidate of controllerContainers) {
    if (
      !preferredContainer ||
      candidate.available > preferredContainer.available ||
      (candidate.available === preferredContainer.available && candidate.distance < preferredContainer.distance)
    ) {
      preferredContainer = candidate;
    }
  }

  const effectiveCapacity =
    totalCapacity > 0 ? totalCapacity : freeCapacity + (creep.store[ENERGY] || 0);
  const containerThreshold = Math.max(
    50,
    Math.min(freeCapacity, Math.ceil((effectiveCapacity || freeCapacity || 0) * 0.5)),
  );
  const significantDropThreshold = Math.max(
    100,
    Math.ceil((effectiveCapacity || freeCapacity || 0) * 0.5),
  );
  const abundantLooseEnergy = result.some(
    candidate => candidate.type === 'pickup' && candidate.available >= significantDropThreshold,
  );

  if (preferredContainer) {
    preferredContainer.priority = Math.min(preferredContainer.priority, 0);
  }

  if (
    preferredContainer &&
    preferredContainer.available >= containerThreshold &&
    !abundantLooseEnergy
  ) {
    for (const candidate of result) {
      if (candidate === preferredContainer) continue;
      if (candidate.type === 'pickup') {
        candidate.priority = Math.max(preferredContainer.priority + 5, candidate.priority + 5);
      } else if (candidate.type === 'withdraw') {
        candidate.priority += 1;
      }
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

  const moveOpts = { range: 1, visualizePathStyle: { stroke: '#ffaa00' } };
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

function getClusterTask(creep) {
  if (
    !creep ||
    !creep.memory ||
    !isBuilderRoleMemory(creep.memory) ||
    !creep.memory.constructionTask ||
    !creep.memory.constructionTask.id
  ) {
    return null;
  }
  return creep.memory.constructionTask.id;
}

function getClusterDemandAmount(creep, taskId) {
  const members = getBuildersForTask(creep.room.name, taskId);
  if (!members.length) return 0;
  let missing = 0;
  for (const member of members) {
    if (!member.store) continue;
    if (typeof member.store.getFreeCapacity === 'function') {
      missing += Math.max(0, member.store.getFreeCapacity(ENERGY) || 0);
    } else {
      const cap =
        typeof member.storeCapacity === 'number'
          ? member.storeCapacity
          : member.carryCapacity || 0;
      missing += Math.max(0, cap - (member.store[ENERGY] || 0));
    }
  }
  return missing;
}

function clearDeliveryRequestTask(creepName) {
  if (!creepName || !Memory.htm || !Memory.htm.creeps) return;
  const container = Memory.htm.creeps[creepName];
  if (!container || !Array.isArray(container.tasks)) return;
  container.tasks = container.tasks.filter(
    task => !(task && task.name === 'deliverEnergy' && task.manager === 'hauler'),
  );
  if (container.tasks.length === 0) {
    delete Memory.htm.creeps[creepName];
  }
}

function clearBuilderClusterSlot(creep, taskId = null) {
  if (!creep || !creep.memory || !creep.memory.builderClusterSlot) return;
  if (taskId && creep.memory.builderClusterSlot.taskId !== taskId) return;
  releaseBuilderClusterReservationBySlot(
    creep.room && creep.room.name,
    creep.memory.builderClusterSlot.taskId,
    creep.memory.builderClusterSlot,
  );
  delete creep.memory.builderClusterSlot;
}

function shouldUseBuilderCluster(site, roomName, taskId) {
  if (!site || !site.structureType || !roomName || !taskId) return false;
  const roadType = typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road';
  if (site.structureType === roadType) return false;
  const members = getBuildersForTask(roomName, taskId);
  if (members.length < 2) return false;
  const room = Game.rooms && Game.rooms[roomName];
  if (!room) return false;
  const slots = computeBuilderClusterSlots(site, room);
  const requiredSlots = members.length >= QUAD_CLUSTER_SIZE ? QUAD_CLUSTER_SIZE : 2;
  return slots.length >= requiredSlots;
}

function isClusterCandidateStructure(site) {
  if (!site || !site.structureType) return false;
  const roadType = typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road';
  return site.structureType !== roadType;
}

function getPreferredClusterSite(creep, queue) {
  if (!creep || !creep.room || !Array.isArray(queue) || queue.length === 0) return null;
  const candidates = [];
  for (const entry of queue) {
    if (!entry || !entry.id) continue;
    const site = Game.getObjectById(entry.id);
    if (!site || !isClusterCandidateStructure(site)) continue;
    const slots = computeBuilderClusterSlots(site, creep.room);
    if (slots.length < 2) continue;
    const memberCount = getBuildersForTask(creep.room.name, entry.id).length;
    const assignmentCount = constructionAssignmentsCount(entry.id);
    const clusterCapacity = Math.min(MAX_BUILDERS_PER_SITE, QUAD_CLUSTER_SIZE, slots.length);
    const missingMembers = Math.max(0, clusterCapacity - memberCount);
    const freeAssignments = Math.max(0, MAX_BUILDERS_PER_SITE - assignmentCount);
    const distance =
      creep.pos && typeof creep.pos.getRangeTo === 'function'
        ? creep.pos.getRangeTo(site.pos)
        : Infinity;
    candidates.push({
      site,
      priority: entry.priority || 0,
      memberCount,
      missingMembers,
      freeAssignments,
      distance,
    });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aCanRefill = a.memberCount > 0 && a.missingMembers > 0 && a.freeAssignments > 0 ? 1 : 0;
    const bCanRefill = b.memberCount > 0 && b.missingMembers > 0 && b.freeAssignments > 0 ? 1 : 0;
    if (aCanRefill !== bCanRefill) return bCanRefill - aCanRefill;
    const aCanAssign = a.freeAssignments > 0 ? 1 : 0;
    const bCanAssign = b.freeAssignments > 0 ? 1 : 0;
    if (aCanAssign !== bCanAssign) return bCanAssign - aCanAssign;
    if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount;
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return String(a.site.id).localeCompare(String(b.site.id));
  });
  const best = candidates[0];
  if (!best || !best.site) return null;
  return { site: best.site, priority: best.priority };
}

function slotKey(slot) {
  if (!slot) return null;
  return `${slot.x}:${slot.y}:${slot.roomName || ''}`;
}

function chebyshevDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function selectCompactClusterSlots(slots, desiredCount) {
  if (!Array.isArray(slots) || desiredCount <= 0) return [];
  return slots.slice(0, desiredCount);
}

function assignCreepsToSlots(builders, selectedSlots) {
  if (!builders.length || !selectedSlots.length) return new Map();
  const assignments = new Map();
  const available = selectedSlots.map((slot) => Object.assign({}, slot));
  const occupiedKeys = new Set();

  // Preserve already-valid occupancy first to avoid unnecessary movement.
  for (const builder of builders) {
    const current = builder.memory && builder.memory.builderClusterSlot;
    if (!current) continue;
    const key = slotKey(current);
    const idx = available.findIndex((slot) => slotKey(slot) === key);
    if (idx === -1 || occupiedKeys.has(key)) continue;
    assignments.set(builder.name, available[idx]);
    occupiedKeys.add(key);
    available.splice(idx, 1);
  }

  const unassignedBuilders = builders.filter((builder) => !assignments.has(builder.name));
  while (unassignedBuilders.length && available.length) {
    let bestBuilderIdx = -1;
    let bestSlotIdx = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < unassignedBuilders.length; i++) {
      const builder = unassignedBuilders[i];
      const pos = builder && builder.pos ? builder.pos : null;
      for (let j = 0; j < available.length; j++) {
        const slot = available[j];
        const distance = chebyshevDistance(pos, slot);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestBuilderIdx = i;
          bestSlotIdx = j;
          continue;
        }
        if (distance !== bestDistance) continue;
        const a = unassignedBuilders[bestBuilderIdx];
        const b = builder;
        const aName = a ? String(a.name) : '';
        const bName = b ? String(b.name) : '';
        if (bName < aName) {
          bestBuilderIdx = i;
          bestSlotIdx = j;
          continue;
        }
        if (bName === aName) {
          const chosen = available[bestSlotIdx];
          const chosenKey = slotKey(chosen);
          const candKey = slotKey(slot);
          if (candKey < chosenKey) {
            bestBuilderIdx = i;
            bestSlotIdx = j;
          }
        }
      }
    }
    if (bestBuilderIdx === -1 || bestSlotIdx === -1) break;
    const builder = unassignedBuilders.splice(bestBuilderIdx, 1)[0];
    const slot = available.splice(bestSlotIdx, 1)[0];
    assignments.set(builder.name, slot);
  }
  return assignments;
}

function collectLocalClusterEnergy(creep) {
  if (!creep || !creep.room || !creep.store) return false;
  const free = typeof creep.store.getFreeCapacity === 'function'
    ? creep.store.getFreeCapacity(ENERGY)
    : 0;
  if (free <= 0) return false;
  if (typeof creep.pos.findInRange !== 'function') return false;

  const drops = creep.pos.findInRange(FINDERS.DROPPED(), 1, {
    filter: res => res && res.resourceType === ENERGY && res.amount > 0,
  }) || [];
  if (drops.length) {
    drops.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    const result = creep.pickup(drops[0]);
    if (result === ERR_NOT_IN_RANGE_CODE) {
      creep.travelTo(drops[0], { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
      return true;
    }
    if (result === OK_CODE) return true;
  }

  const structures = creep.pos.findInRange(FINDERS.STRUCTURES(), 1, {
    filter: structure =>
      structure &&
      (structure.structureType === STRUCTURE_TYPES.CONTAINER ||
        structure.structureType === STRUCTURE_TYPES.STORAGE ||
        structure.structureType === STRUCTURE_TYPES.LINK) &&
      getStructureEnergy(structure) > 0,
  }) || [];
  if (structures.length) {
    structures.sort((a, b) => (getStructureEnergy(b) - getStructureEnergy(a)));
    const result = creep.withdraw(structures[0], ENERGY);
    if (result === ERR_NOT_IN_RANGE_CODE) {
      creep.travelTo(structures[0], { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
      return true;
    }
    if (result === OK_CODE) return true;
  }
  return false;
}

function gatherEnergy(creep) {
  const taskId = getClusterTask(creep);
  if (taskId) {
    const site = typeof Game.getObjectById === 'function' ? Game.getObjectById(taskId) : null;
    const clusterActive = shouldUseBuilderCluster(site, creep.room.name, taskId);
    if (clusterActive) {
      assignBuilderClusterSlots(creep.room.name, taskId, site, creep.room);
      const leader = getBuilderClusterLeader(creep.room.name, taskId);
      if (leader && leader.name !== creep.name) {
        collectLocalClusterEnergy(creep);
        clearDeliveryRequestTask(creep.name);
        maintainBuilderClusterPosition(creep);
        shareBuilderEnergy(creep, site);
        // Non-leader builders wait for local handoff to keep a tight build cluster.
        return false;
      }
      const members = getBuildersForTask(creep.room.name, taskId);
      for (const member of members) {
        if (!member || member.name === creep.name) continue;
        clearDeliveryRequestTask(member.name);
      }
      const roomClusterDemand = getRoomBuilderClusterDemand(creep.room.name);
      const isDemandCoordinator =
        roomClusterDemand.coordinator !== null &&
        roomClusterDemand.coordinator === creep.name;
      // Leader should request hauled energy for the whole cluster instead of self-pickup.
      if (creep.memory.energyTask) {
        const task = creep.memory.energyTask;
        if (task.type !== 'harvest') {
          releaseEnergy(task.id, task.reserved || 0);
        }
        delete creep.memory.energyTask;
      }
      if (isDemandCoordinator) {
        const aggregateDemand = Math.max(
          getClusterDemandAmount(creep, taskId),
          roomClusterDemand.totalDemand,
        );
        requestEnergy(creep, {
          amount: aggregateDemand,
          forceImmediate: true,
        });
      } else {
        clearDeliveryRequestTask(creep.name);
      }
      collectLocalClusterEnergy(creep);
      shareBuilderEnergy(creep, site);
      maintainBuilderClusterPosition(creep);
      return false;
    }
    clearBuilderClusterSlot(creep, taskId);
    clearDeliveryRequestTask(creep.name);
  }

  if (executeEnergyTask(creep)) return true;
  const candidates = collectEnergyCandidates(creep);
  if (taskId) {
    const demandAmount = getClusterDemandAmount(creep, taskId);
    if (demandAmount > 0) {
      requestEnergy(creep, demandAmount);
    }
  }
  if (candidates.length === 0) {
    if (!taskId) {
      requestEnergy(creep);
    }
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
  cleanupBuilderClusterReservations(creep.room.name);
  const queue =
    (creep.room.memory && creep.room.memory.buildingQueue) || [];
  const preferredCluster = getPreferredClusterSite(creep, queue);
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
    clearBuilderClusterSlot(creep, taskMem.id);
    delete creep.memory.constructionTask;
    delete creep.memory.mainTask;
  }

  if (preferredCluster && preferredCluster.site) {
    const site = preferredCluster.site;
    if (assignConstruction(site.id, creep.name, {
      priority: preferredCluster.priority,
      roomName: creep.room.name,
    })) {
      creep.memory.constructionTask = { id: site.id, priority: preferredCluster.priority };
      creep.memory.mainTask = { type: 'build', id: site.id };
      return site;
    }
  }

  for (const entry of queue) {
    if (!entry || !entry.id) continue;
    if (preferredCluster && preferredCluster.site && entry.id !== preferredCluster.site.id) {
      // Keep focus on a single cluster-capable build target first.
      const queuedSite = Game.getObjectById(entry.id);
      if (queuedSite && isClusterCandidateStructure(queuedSite)) continue;
    }
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
    creep.travelTo(target, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
    return true;
  }
  if (result === OK) {
    if (target.progress >= target.progressTotal) {
      releaseConstruction(target.id, creep.name);
      clearBuilderClusterSlot(creep, target.id);
      delete creep.memory.constructionTask;
      delete creep.memory.mainTask;
    }
    return true;
  }
  if (result === ERR_NOT_ENOUGH_ENERGY_CODE) {
    return true;
  }
  releaseConstruction(target.id, creep.name);
  clearBuilderClusterSlot(creep, target.id);
  delete creep.memory.constructionTask;
  delete creep.memory.mainTask;
  return false;
}

function getBuildersForTask(roomName, taskId) {
  return Object.values(Game.creeps || {}).filter(
    creep =>
      creep &&
      creep.memory &&
      creep.room &&
      creep.room.name === roomName &&
      isBuilderRoleMemory(creep.memory) &&
      creep.memory.constructionTask &&
      creep.memory.constructionTask.id === taskId,
  );
}

function getRoomBuilderClusterDemand(roomName) {
  const room = Game.rooms && Game.rooms[roomName];
  if (!room) return { totalDemand: 0, coordinator: null };
  const builders = Object.values(Game.creeps || {}).filter(
    (creep) =>
      creep &&
      creep.room &&
      creep.room.name === roomName &&
      creep.memory &&
      isBuilderRoleMemory(creep.memory) &&
      creep.memory.constructionTask &&
      creep.memory.constructionTask.id,
  );
  if (!builders.length) return { totalDemand: 0, coordinator: null };

  const taskIds = [...new Set(builders.map((creep) => creep.memory.constructionTask.id))];
  let totalDemand = 0;
  const leaders = [];
  for (const taskId of taskIds) {
    const site = typeof Game.getObjectById === 'function' ? Game.getObjectById(taskId) : null;
    if (!site) continue;
    if (!shouldUseBuilderCluster(site, roomName, taskId)) continue;
    const members = getBuildersForTask(roomName, taskId);
    if (!members.length) continue;
    for (const member of members) {
      if (!member || !member.store) continue;
      if (typeof member.store.getFreeCapacity === 'function') {
        totalDemand += Math.max(0, member.store.getFreeCapacity(ENERGY) || 0);
      } else {
        const cap =
          typeof member.storeCapacity === 'number'
            ? member.storeCapacity
            : member.carryCapacity || 0;
        totalDemand += Math.max(0, cap - (member.store[ENERGY] || 0));
      }
    }
    const leader = getBuilderClusterLeader(roomName, taskId);
    if (leader) leaders.push(leader.name);
  }

  leaders.sort((a, b) => String(a).localeCompare(String(b)));
  return {
    totalDemand,
    coordinator: leaders.length ? leaders[0] : null,
  };
}

function getBuilderClusterLeader(roomName, taskId) {
  const builders = getBuildersForTask(roomName, taskId);
  if (!builders.length) return null;
  const withSlots = builders.filter(
    creep =>
      creep.memory &&
      creep.memory.builderClusterSlot &&
      creep.memory.builderClusterSlot.taskId === taskId,
  );
  if (withSlots.length) {
    withSlots.sort((a, b) => {
      const sa = a.memory.builderClusterSlot;
      const sb = b.memory.builderClusterSlot;
      const da = sa.rank !== undefined ? sa.rank : Infinity;
      const db = sb.rank !== undefined ? sb.rank : Infinity;
      if (da !== db) return da - db;
      return String(a.name).localeCompare(String(b.name));
    });
    return withSlots[0];
  }
  builders.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return builders[0] || null;
}

function assignBuilderClusterSlots(roomName, taskId, site, room) {
  const spawnPos = resolveBuilderAnchor(room, site);
  const builders = getBuildersForTask(roomName, taskId).sort((a, b) => {
    const da =
      a && a.pos
        ? Math.max(Math.abs(a.pos.x - spawnPos.x), Math.abs(a.pos.y - spawnPos.y))
        : Infinity;
    const db =
      b && b.pos
        ? Math.max(Math.abs(b.pos.x - spawnPos.x), Math.abs(b.pos.y - spawnPos.y))
        : Infinity;
    if (da !== db) return da - db;
    return String(a.name).localeCompare(String(b.name));
  });
  if (!builders.length) return [];
  const slots = computeBuilderClusterSlots(site, room);
  const requiredSlots = builders.length >= QUAD_CLUSTER_SIZE ? QUAD_CLUSTER_SIZE : 2;
  if (slots.length < requiredSlots) return [];
  const desiredCount = Math.min(builders.length, QUAD_CLUSTER_SIZE, slots.length);
  const selectedSlots = selectCompactClusterSlots(slots, desiredCount);
  const assignments = assignCreepsToSlots(builders, selectedSlots);

  for (const builder of builders) {
    const slot = assignments.get(builder.name);
    if (!slot) {
      clearBuilderClusterSlot(builder, taskId);
      continue;
    }
    const current = builder.memory && builder.memory.builderClusterSlot;
    const unchanged =
      current &&
      current.taskId === taskId &&
      current.x === slot.x &&
      current.y === slot.y &&
      (current.roomName || roomName) === (slot.roomName || roomName);
    if (unchanged) {
      reserveBuilderClusterSlot(builder, taskId, current);
      continue;
    }
    clearBuilderClusterSlot(builder, taskId);
    builder.memory.builderClusterSlot = {
      x: slot.x,
      y: slot.y,
      roomName: slot.roomName,
      taskId,
      rank: 0,
    };
    reserveBuilderClusterSlot(builder, taskId, builder.memory.builderClusterSlot);
  }
  return builders;
}

function maintainBuilderClusterPosition(creep) {
  const task = creep.memory && creep.memory.constructionTask;
  if (!task || !task.id) return false;
  const site = typeof Game.getObjectById === 'function' ? Game.getObjectById(task.id) : null;
  if (!site || !site.pos || !creep.pos || typeof creep.pos.getRangeTo !== 'function') return false;
  assignBuilderClusterSlots(creep.room.name, task.id, site, creep.room);
  const slot = creep.memory.builderClusterSlot;
  if (!slot || slot.taskId !== task.id) return false;
  const target = new RoomPosition(slot.x, slot.y, slot.roomName || creep.room.name);
  if (!creep.pos.isEqualTo || !creep.pos.isEqualTo(target)) {
    creep.travelTo(target, { range: 0, visualizePathStyle: { stroke: '#ffffff' } });
    return true;
  }
  return false;
}

function shareBuilderEnergy(creep, buildTarget) {
  if (!creep || !buildTarget || !creep.store) return false;
  if (typeof creep.transfer !== 'function') return false;
  const ownEnergy = creep.store[ENERGY] || 0;
  if (ownEnergy <= 0) return false;
  const taskId = creep.memory && creep.memory.constructionTask && creep.memory.constructionTask.id;
  if (!taskId) return false;

  const builders = getBuildersForTask(creep.room.name, taskId).filter(
    worker =>
      worker &&
      worker.pos &&
      worker.store &&
      typeof buildTarget.pos.getRangeTo === 'function' &&
      buildTarget.pos.getRangeTo(worker) <= getClusterBuildRange(buildTarget, creep.room),
  );
  if (builders.length < 2) return false;

  const totalEnergy = builders.reduce((sum, worker) => sum + (worker.store[ENERGY] || 0), 0);
  const targetPerBuilder = Math.floor(totalEnergy / builders.length);
  if (ownEnergy <= targetPerBuilder) return false;

  let recipient = null;
  let recipientEnergy = Infinity;
  for (const worker of builders) {
    if (worker.name === creep.name) continue;
    const energy = worker.store[ENERGY] || 0;
    if (energy >= targetPerBuilder) continue;
    if (energy < recipientEnergy) {
      recipient = worker;
      recipientEnergy = energy;
    }
  }
  if (!recipient) return false;

  const transferAmount = Math.max(
    1,
    Math.min(ownEnergy - targetPerBuilder, targetPerBuilder - recipientEnergy),
  );
  const result = creep.transfer(recipient, ENERGY, transferAmount);
  if (result === ERR_NOT_IN_RANGE_CODE) {
    creep.travelTo(recipient, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
    return true;
  }
  return result === OK_CODE;
}

function upgradeController(creep) {
  const controller = creep.room.controller;
  if (!controller) return false;
  creep.travelTo(controller, { range: 3, visualizePathStyle: { stroke: '#ffffff' } });
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
  const role = creep && creep.memory ? creep.memory.role : null;
  const primary = role === 'upgrader' ? 'upgrader' : 'builder';
  if (lifecycleControl.handle(creep, primary)) return;
  movementUtils.avoidSpawnArea(creep);
  cleanupBuilderClusterReservations(creep.room.name);

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
      const taskId = getClusterTask(creep);
      if (taskId) {
        const site = typeof Game.getObjectById === 'function' ? Game.getObjectById(taskId) : null;
        const clusterActive = shouldUseBuilderCluster(site, creep.room.name, taskId);
        if (clusterActive) {
          assignBuilderClusterSlots(creep.room.name, taskId, site, creep.room);
          const clusterLeader = getBuilderClusterLeader(creep.room.name, taskId);
          const movedToCluster = maintainBuilderClusterPosition(creep);
          if (movedToCluster && (!clusterLeader || clusterLeader.name !== creep.name)) {
            statsConsole.run([[`role.worker.${primary}`, Game.cpu.getUsed() - start]]);
            return;
          }
        } else {
          clearBuilderClusterSlot(creep, taskId);
        }
      }
    } else if (creep.memory.constructionTask) {
      maintainConstructionTask(creep);
    }
    gatherEnergy(creep);
    statsConsole.run([[`role.worker.${primary}`, Game.cpu.getUsed() - start]]);
    return;
  }

  const repairTarget = fetchRepairTarget(creep);
  if (repairTarget) {
    const repairResult = creep.repair(repairTarget);
    if (repairResult === ERR_NOT_IN_RANGE_CODE) {
      creep.travelTo(repairTarget, { range: 3, visualizePathStyle: { stroke: '#ffffff' } });
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
    statsConsole.run([[`role.worker.${primary}`, Game.cpu.getUsed() - start]]);
    return;
  }

  let worked = false;
  if (primary === 'builder') {
    const target = maintainConstructionTask(creep);
    const taskId = getClusterTask(creep);
    const clusterActive = shouldUseBuilderCluster(target, creep.room.name, taskId);
    if (clusterActive && maintainBuilderClusterPosition(creep)) {
      worked = true;
    } else if (!clusterActive) {
      clearBuilderClusterSlot(creep, taskId);
    }
    if (target) {
      if (clusterActive) shareBuilderEnergy(creep, target);
      if (!worked) {
        worked = buildStructure(creep);
      }
    } else {
      if (!worked) worked = false;
    }
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
  clearBuilderClusterSlot(creep);
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
