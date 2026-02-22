const logger = require('./logger');
const maintenance = require('./manager.maintenance');
const spawnQueue = require('./manager.spawnQueue');

const ENERGY = typeof RESOURCE_ENERGY !== 'undefined' ? RESOURCE_ENERGY : 'energy';
const CREEP_LIFE = typeof CREEP_LIFE_TIME !== 'undefined' ? CREEP_LIFE_TIME : 1500;
const OK_CODE = typeof OK !== 'undefined' ? OK : 0;
const ERR_NOT_IN_RANGE_CODE =
  typeof ERR_NOT_IN_RANGE !== 'undefined' ? ERR_NOT_IN_RANGE : -9;
const ERR_BUSY_CODE = typeof ERR_BUSY !== 'undefined' ? ERR_BUSY : -4;
const ERR_NOT_ENOUGH_ENERGY_CODE =
  typeof ERR_NOT_ENOUGH_ENERGY !== 'undefined' ? ERR_NOT_ENOUGH_ENERGY : -6;
const ERR_FULL_CODE = typeof ERR_FULL !== 'undefined' ? ERR_FULL : -8;
const SERVICE_REQUEST_TTL = 25;

const ROLE_CAP_KEYS = {
  hauler: ['maxHaulers', 'haulers'],
  builder: ['builders'],
};

const RETIREABLE_ROLES = new Set(['hauler', 'builder']);
const REBIRTH_ROLES = new Set(['hauler', 'builder']);
const RENEW_WINDOW_RANGE = 2;

function getBodySize(creep) {
  if (!creep) return 0;
  if (Array.isArray(creep.body) && creep.body.length > 0) return creep.body.length;
  if (creep.memory && Array.isArray(creep.memory.body) && creep.memory.body.length > 0) {
    return creep.memory.body.length;
  }
  return 0;
}

function getRenewGain(creep) {
  const bodySize = getBodySize(creep);
  if (!bodySize) return 0;
  return Math.max(1, Math.floor(600 / bodySize));
}

function canUseFullRenewTick(creep) {
  if (!creep || typeof creep.ticksToLive !== 'number') return false;
  const gain = getRenewGain(creep);
  if (gain > 0) {
    return creep.ticksToLive <= Math.max(0, CREEP_LIFE - gain);
  }
  // Fallback for tests/mocks lacking body detail.
  const ttlLimit =
    Memory.settings && typeof Memory.settings.rebirthMaxTtl === 'number'
      ? Memory.settings.rebirthMaxTtl
      : 180;
  return creep.ticksToLive <= ttlLimit;
}

function isIdleCreep(creep, role) {
  if (!creep || !creep.memory) return false;
  if (creep.memory.retiring) return false;
  if (role === 'hauler') {
    return !creep.memory.task && !creep.memory.reserving;
  }
  if (role === 'builder') {
    return !creep.memory.mainTask && !creep.memory.refilling;
  }
  return false;
}

function queuedForSpawn(spawnId) {
  if (!spawnId || !spawnQueue || !Array.isArray(spawnQueue.queue)) return 0;
  return spawnQueue.queue.filter((entry) => entry && entry.spawnId === spawnId).length;
}

function hasRenewWindow(spawn, creep, role) {
  if (!spawn || spawn.spawning) return false;
  const range = rangeTo(creep.pos, spawn);
  if (range <= RENEW_WINDOW_RANGE) return true;
  const busyThreshold =
    Memory.settings && typeof Memory.settings.renewQueueBusyThreshold === 'number'
      ? Memory.settings.renewQueueBusyThreshold
      : 1;
  return isIdleCreep(creep, role) && queuedForSpawn(spawn.id) <= busyThreshold;
}

function getStoreValue(store, key) {
  if (!store) return 0;
  if (typeof store[key] === 'number') return store[key];
  if (typeof store.getUsedCapacity === 'function') {
    const used = store.getUsedCapacity(key);
    return typeof used === 'number' ? used : 0;
  }
  return 0;
}

function ensureUrgentBucket(spawnId) {
  if (!Memory.spawnUrgentRequests) Memory.spawnUrgentRequests = {};
  if (!Memory.spawnUrgentRequests[spawnId]) Memory.spawnUrgentRequests[spawnId] = [];
  return Memory.spawnUrgentRequests[spawnId];
}

function getNearestSpawn(creep, options = {}) {
  const { idleOnly = false } = options;
  const room = creep.room;
  if (!room || typeof room.find !== 'function' || typeof FIND_MY_SPAWNS === 'undefined') {
    return null;
  }
  const spawns = (room.find(FIND_MY_SPAWNS) || []).filter(
    (spawn) => spawn && (!idleOnly || !spawn.spawning),
  );
  if (!spawns.length) return null;
  return spawns.sort((a, b) => rangeTo(creep.pos, a) - rangeTo(creep.pos, b))[0];
}

function queueUrgentRequest(creep, spawn, action, role, priority = 0) {
  if (!spawn || !spawn.id || !creep || !creep.name) return false;
  const bucket = ensureUrgentBucket(spawn.id);
  const existing = bucket.find(
    (req) => req && req.creepName === creep.name && req.action === action,
  );
  const expiresAt = Game.time + SERVICE_REQUEST_TTL;
  if (existing) {
    existing.expiresAt = Math.max(existing.expiresAt || 0, expiresAt);
    existing.priority = Math.min(
      typeof existing.priority === 'number' ? existing.priority : priority,
      priority,
    );
    return true;
  }
  bucket.push({
    id: `${action}:${creep.name}:${Game.time}`,
    action,
    role,
    creepName: creep.name,
    createdAt: Game.time,
    expiresAt,
    priority,
  });
  return true;
}

function canReachWithOverhead(creep, spawn, overhead) {
  if (!creep || typeof creep.ticksToLive !== 'number' || !spawn) return false;
  const distance = rangeTo(creep.pos, spawn);
  if (!Number.isFinite(distance)) return false;
  return creep.ticksToLive > distance + overhead;
}

function rangeTo(origin, target) {
  if (!origin || !target) return Infinity;
  if (typeof origin.getRangeTo === 'function') return origin.getRangeTo(target);
  const tx = target.x !== undefined ? target.x : target.pos && target.pos.x;
  const ty = target.y !== undefined ? target.y : target.pos && target.pos.y;
  if (typeof origin.x !== 'number' || typeof origin.y !== 'number') return Infinity;
  if (typeof tx !== 'number' || typeof ty !== 'number') return Infinity;
  return Math.max(Math.abs(origin.x - tx), Math.abs(origin.y - ty));
}

function roleCap(roomName, role) {
  const roomMem = Memory.rooms && Memory.rooms[roomName];
  const limits = roomMem && roomMem.spawnLimits;
  if (!limits) return null;
  const keys = ROLE_CAP_KEYS[role] || [];
  for (const key of keys) {
    const value = limits[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  }
  return null;
}

function countRole(roomName, role) {
  return Object.values(Game.creeps || {}).filter(
    (creep) =>
      creep &&
      creep.memory &&
      creep.memory.role === role &&
      creep.room &&
      creep.room.name === roomName,
  ).length;
}

function shouldRetireByOverCap(creep, role) {
  const cap = roleCap(creep.room.name, role);
  if (cap === null) return false;
  const alive = countRole(creep.room.name, role);
  const over = alive - cap;
  if (over <= 0) return false;

  const sorted = Object.values(Game.creeps || {})
    .filter(
      (other) =>
        other &&
        other.memory &&
        other.memory.role === role &&
        other.room &&
        other.room.name === creep.room.name,
    )
    .sort((a, b) => {
      const ttlA = typeof a.ticksToLive === 'number' ? a.ticksToLive : CREEP_LIFE;
      const ttlB = typeof b.ticksToLive === 'number' ? b.ticksToLive : CREEP_LIFE;
      if (ttlA !== ttlB) return ttlA - ttlB;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  return sorted.slice(0, over).some((candidate) => candidate.name === creep.name);
}

function builderPurposeDone(creep) {
  const room = creep.room;
  if (!room || typeof room.find !== 'function') return false;
  const roomMem = Memory.rooms && Memory.rooms[room.name];
  if (
    roomMem &&
    typeof roomMem.builderDemandUntil === 'number' &&
    roomMem.builderDemandUntil > Game.time
  ) {
    return false;
  }
  const queue = (room.memory && room.memory.buildingQueue) || [];
  const hasSites =
    queue.length > 0 ||
    (typeof FIND_CONSTRUCTION_SITES !== 'undefined' &&
      (room.find(FIND_CONSTRUCTION_SITES) || []).length > 0);
  const repairs = maintenance.getActiveRepairDemand(room.name);
  return !hasSites && repairs <= 0;
}

function shouldRetire(creep, role) {
  if (!creep || !creep.room || !RETIREABLE_ROLES.has(role)) return false;
  if (creep.memory && creep.memory.rebirthLock) return false;
  if (shouldRetireByOverCap(creep, role)) return true;
  if (role === 'builder' && builderPurposeDone(creep)) {
    const cap = roleCap(creep.room.name, role);
    if (cap === 0) return true;
  }
  return false;
}

function getDeliveryTarget(creep) {
  const room = creep.room;
  if (!room || typeof room.find !== 'function') return null;
  if (typeof FIND_MY_STRUCTURES === 'undefined') return null;
  const structures = room.find(FIND_MY_STRUCTURES) || [];
  const allowed = new Set(
    [
      typeof STRUCTURE_SPAWN !== 'undefined' ? STRUCTURE_SPAWN : 'spawn',
      typeof STRUCTURE_EXTENSION !== 'undefined' ? STRUCTURE_EXTENSION : 'extension',
      typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container',
      typeof STRUCTURE_STORAGE !== 'undefined' ? STRUCTURE_STORAGE : 'storage',
      typeof STRUCTURE_TERMINAL !== 'undefined' ? STRUCTURE_TERMINAL : 'terminal',
      typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link',
    ].filter(Boolean),
  );
  return structures
    .filter((structure) => {
      if (!structure || !allowed.has(structure.structureType)) return false;
      if (structure.store && typeof structure.store.getFreeCapacity === 'function') {
        return structure.store.getFreeCapacity(ENERGY) > 0;
      }
      if (
        typeof structure.energy === 'number' &&
        typeof structure.energyCapacity === 'number'
      ) {
        return structure.energy < structure.energyCapacity;
      }
      return false;
    })
    .sort((a, b) => rangeTo(creep.pos, a) - rangeTo(creep.pos, b))[0];
}

function fallbackDropAndDie(creep) {
  const energy = getStoreValue(creep.store, ENERGY);
  if (energy <= 0) {
    creep.suicide();
    return true;
  }

  const spawn =
    typeof FIND_MY_SPAWNS !== 'undefined' &&
    creep.room &&
    typeof creep.room.find === 'function'
      ? (creep.room.find(FIND_MY_SPAWNS) || [])[0]
      : null;

  if (spawn) {
    const range = rangeTo(creep.pos, spawn);
    if (range !== 2) {
      creep.travelTo(spawn, { range: 2 });
      return true;
    }
  }

  if (typeof creep.drop === 'function') {
    creep.drop(ENERGY);
  }
  creep.suicide();
  return true;
}

function runRetirement(creep) {
  const energy = getStoreValue(creep.store, ENERGY);
  if (energy <= 0) {
    creep.suicide();
    return true;
  }

  const target = getDeliveryTarget(creep);
  if (target) {
    const result = creep.transfer(target, ENERGY);
    if (result === OK_CODE) {
      if (getStoreValue(creep.store, ENERGY) <= 0) creep.suicide();
      return true;
    }
    if (result === ERR_NOT_IN_RANGE_CODE) {
      creep.travelTo(target, { range: 1 });
      return true;
    }
  }

  return fallbackDropAndDie(creep);
}

function tryRebirth(creep, role) {
  if (!REBIRTH_ROLES.has(role)) return false;
  if (!Memory.settings || Memory.settings.enableRebirth === false) return false;
  if (creep.memory && creep.memory.retiring) return false;
  if (typeof creep.ticksToLive !== 'number') return false;
  if (!canUseFullRenewTick(creep)) return false;

  const spawn = getNearestSpawn(creep, { idleOnly: true });
  if (!spawn) return false;
  if (!hasRenewWindow(spawn, creep, role)) return false;
  const overhead =
    Memory.settings && typeof Memory.settings.renewOverheadTicks === 'number'
      ? Memory.settings.renewOverheadTicks
      : 10;
  if (!canReachWithOverhead(creep, spawn, overhead)) return false;
  queueUrgentRequest(creep, spawn, 'renew', role, -20);

  const range = rangeTo(creep.pos, spawn);
  if (range > 4) return false;
  if (range > 1) {
    creep.travelTo(spawn, { range: 1 });
    creep.memory.rebirthLock = true;
    return true;
  }

  const result = spawn.renewCreep(creep);
  if (result === OK_CODE) {
    spawnQueue.removeReplacementForCreep(creep.room.name, role, creep);
    creep.memory.rebirthLock = true;
    return true;
  }
  if (result === ERR_FULL_CODE) {
    spawnQueue.removeReplacementForCreep(creep.room.name, role, creep);
    delete creep.memory.rebirthLock;
    return false;
  }
  if (result === ERR_BUSY_CODE || result === ERR_NOT_ENOUGH_ENERGY_CODE) {
    delete creep.memory.rebirthLock;
    return false;
  }
  return false;
}

function tryRecycleRetirement(creep, role) {
  if (!Memory.settings || Memory.settings.enableRecycling === false) return false;
  const spawn = getNearestSpawn(creep, { idleOnly: true });
  if (!spawn) return false;
  const overhead =
    Memory.settings && typeof Memory.settings.recycleOverheadTicks === 'number'
      ? Memory.settings.recycleOverheadTicks
      : 20;
  if (!canReachWithOverhead(creep, spawn, overhead)) return false;
  queueUrgentRequest(creep, spawn, 'recycle', role, -30);
  const range = rangeTo(creep.pos, spawn);
  if (range > 1 && typeof creep.travelTo === 'function') {
    creep.travelTo(spawn, { range: 1 });
  }
  return true;
}

function handle(creep, role) {
  if (!creep || !creep.memory || !role) return false;
  if (Memory.settings && Memory.settings.enableAssimilation !== false) {
    if (creep.memory.retiring || shouldRetire(creep, role)) {
      if (!creep.memory.retiring) {
        creep.memory.retiring = true;
        logger.log('lifecycle', `Assimilation started for ${creep.name} (${role})`, 2);
      }
      if (tryRecycleRetirement(creep, role)) return true;
      return runRetirement(creep);
    }
  }
  if (tryRebirth(creep, role)) return true;
  if (creep.memory.rebirthLock && (!creep.ticksToLive || creep.ticksToLive > 250)) {
    delete creep.memory.rebirthLock;
  }
  return false;
}

module.exports = {
  handle,
  _roleCap: roleCap,
  _shouldRetireByOverCap: shouldRetireByOverCap,
  _tryRebirth: tryRebirth,
};
