function getAssimilation() {
  return require('./memory.assimilation');
}

const DEFAULT_THRESHOLD = 0.75;
const CLEAR_RATIO = 0.98;

const STRUCTURE_CONTAINER_TYPE =
  typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container';
const STRUCTURE_EXTENSION_TYPE =
  typeof STRUCTURE_EXTENSION !== 'undefined' ? STRUCTURE_EXTENSION : 'extension';
const STRUCTURE_SPAWN_TYPE =
  typeof STRUCTURE_SPAWN !== 'undefined' ? STRUCTURE_SPAWN : 'spawn';
const STRUCTURE_STORAGE_TYPE =
  typeof STRUCTURE_STORAGE !== 'undefined' ? STRUCTURE_STORAGE : 'storage';
const STRUCTURE_LINK_TYPE =
  typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link';

const STRUCTURE_THRESHOLDS = {
  [STRUCTURE_CONTAINER_TYPE]: 0.75,
  [STRUCTURE_EXTENSION_TYPE]: 0.85,
  [STRUCTURE_SPAWN_TYPE]: 0.9,
  [STRUCTURE_STORAGE_TYPE]: 0.9,
  [STRUCTURE_LINK_TYPE]: 0.9,
};

function ensureMemory() {
  if (!Memory.maintenance) Memory.maintenance = { rooms: {} };
  if (!Memory.maintenance.rooms) Memory.maintenance.rooms = {};
}

function ensureRoomMemory(roomName) {
  ensureMemory();
  if (!Memory.maintenance.rooms[roomName]) {
    Memory.maintenance.rooms[roomName] = { requests: {}, lastRun: 0 };
  }
  return Memory.maintenance.rooms[roomName];
}

function getRoomMemory(roomName) {
  ensureMemory();
  return Memory.maintenance.rooms[roomName] || null;
}

function getThreshold(structureType) {
  return STRUCTURE_THRESHOLDS[structureType] || DEFAULT_THRESHOLD;
}

function shouldTrack(structure) {
  if (!structure || !structure.structureType) return false;
  const threshold = getThreshold(structure.structureType);
  return threshold > 0 && typeof structure.hits === 'number' && typeof structure.hitsMax === 'number';
}

function sanitizeAssignment(request) {
  if (!request || !request.assignedTo) return;
  if (!Game.creeps || !Game.creeps[request.assignedTo]) {
    request.assignedTo = null;
  }
}

function updateRequest(room, structure, roomMem) {
  if (!shouldTrack(structure)) return;
  if (!structure.hitsMax) return;

  const threshold = getThreshold(structure.structureType);
  const ratio = structure.hits / Math.max(1, structure.hitsMax);
  const id = structure.id;
  const existing = roomMem.requests[id];

  if (!existing && ratio >= threshold) {
    return;
  }

  if (ratio >= CLEAR_RATIO) {
    if (existing) delete roomMem.requests[id];
    return;
  }

  const missingHits = Math.max(0, structure.hitsMax - structure.hits);
  const assignedTo = existing && existing.assignedTo ? existing.assignedTo : null;
  const request = {
    id,
    structureType: structure.structureType,
    hits: structure.hits,
    hitsMax: structure.hitsMax,
    missingHits,
    ratio,
    threshold,
    lastSeen: Game.time,
    assignedTo,
    pos: { x: structure.pos.x, y: structure.pos.y, roomName: room.name },
  };
  sanitizeAssignment(request);
  roomMem.requests[id] = request;
}

function pruneMissingStructures(room, roomMem, seenIds) {
  const toRemove = [];
  for (const id of Object.keys(roomMem.requests)) {
    const request = roomMem.requests[id];
    sanitizeAssignment(request);
    if (seenIds.has(id)) continue;
    const structure = typeof Game.getObjectById === 'function' ? Game.getObjectById(id) : null;
    if (!structure) {
      toRemove.push(id);
    }
  }
  for (const id of toRemove) {
    delete roomMem.requests[id];
    getAssimilation().assimilateStructure(id);
  }
}

function releaseAssignmentsForCreep(creepName) {
  if (!creepName) return;
  ensureMemory();
  for (const roomName of Object.keys(Memory.maintenance.rooms)) {
    const roomMem = Memory.maintenance.rooms[roomName];
    for (const id of Object.keys(roomMem.requests)) {
      const request = roomMem.requests[id];
      if (request.assignedTo === creepName) {
        request.assignedTo = null;
      }
    }
  }
}

function assignRepairTarget(roomName, creepName) {
  const roomMem = getRoomMemory(roomName);
  if (!roomMem) return null;
  let request = Object.values(roomMem.requests).find(
    (entry) => entry.assignedTo === creepName,
  );

  if (request) {
    sanitizeAssignment(request);
    if (request.assignedTo === creepName) return request;
  }

  let best = null;
  for (const entry of Object.values(roomMem.requests)) {
    sanitizeAssignment(entry);
    if (entry.assignedTo && entry.assignedTo !== creepName) continue;
    if (!best || entry.ratio < best.ratio) {
      best = entry;
    }
  }

  if (best) {
    best.assignedTo = creepName;
    return best;
  }
  return null;
}

function completeRepair(roomName, structureId, creepName = null) {
  const roomMem = getRoomMemory(roomName);
  if (!roomMem || !roomMem.requests[structureId]) return;
  const request = roomMem.requests[structureId];
  if (creepName && request.assignedTo === creepName) {
    request.assignedTo = null;
  }
  delete roomMem.requests[structureId];
}

function abandonRepair(roomName, structureId, creepName = null) {
  const roomMem = getRoomMemory(roomName);
  if (!roomMem || !roomMem.requests[structureId]) return;
  const request = roomMem.requests[structureId];
  if (creepName && request.assignedTo === creepName) {
    request.assignedTo = null;
  }
  request.lastSeen = Game.time;
}

function getRoomRepairSummary(roomName) {
  const roomMem = getRoomMemory(roomName);
  if (!roomMem) return [];
  return Object.values(roomMem.requests)
    .map((entry) => ({
      id: entry.id,
      structureType: entry.structureType,
      outstanding: entry.missingHits,
      ratio: entry.ratio,
      assignedTo: entry.assignedTo || null,
    }))
    .sort((a, b) => b.outstanding - a.outstanding);
}

function getActiveRepairDemand(roomName) {
  const roomMem = getRoomMemory(roomName);
  if (!roomMem) return 0;
  return Object.keys(roomMem.requests || {}).length;
}

function removeStructure(structureId) {
  ensureMemory();
  for (const roomName of Object.keys(Memory.maintenance.rooms)) {
    const roomMem = Memory.maintenance.rooms[roomName];
    if (roomMem.requests && roomMem.requests[structureId]) {
      delete roomMem.requests[structureId];
    }
  }
}

function run(room) {
  if (!room || !room.controller || !room.controller.my) return;
  const roomMem = ensureRoomMemory(room.name);
  roomMem.lastRun = Game.time;
  const seenIds = new Set();

  const structures = room.find ? room.find(FIND_STRUCTURES) : [];
  for (const structure of structures) {
    if (!shouldTrack(structure)) continue;
    seenIds.add(structure.id);
    updateRequest(room, structure, roomMem);
  }

  pruneMissingStructures(room, roomMem, seenIds);
}

module.exports = {
  run,
  assignRepairTarget,
  completeRepair,
  abandonRepair,
  getRoomRepairSummary,
  getActiveRepairDemand,
  releaseAssignmentsForCreep,
  removeStructure,
  CLEAR_RATIO,
};
