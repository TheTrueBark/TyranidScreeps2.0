const logger = require('./logger');
const energyDemand = require('./manager.hivemind.demand');
const energyRequests = require('./manager.energyRequests');

const roleModules = {};
const roleLoaders = {
  upgrader: () => require('./role.upgrader'),
  miner: () => require('./role.miner'),
  builder: () => require('./role.builder'),
  hauler: () => require('./role.hauler'),
  remoteMiner: () => require('./role.remoteMiner'),
  reservist: () => require('./role.reservist'),
  baseDistributor: () => require('./role.baseDistributor'),
};

function getRoleModule(role) {
  if (!role || !roleLoaders[role]) return null;
  if (!roleModules[role]) {
    try {
      roleModules[role] = roleLoaders[role]();
    } catch (error) {
      logger.log('memory', `Failed to load role module for ${role}: ${error}`, 4);
      roleModules[role] = null;
    }
  }
  return roleModules[role];
}

function safeInvoke(fn, context, name) {
  if (typeof fn !== 'function') return;
  try {
    fn(context);
  } catch (error) {
    logger.log('memory', `Assimilation handler error for ${name}: ${error}`, 4);
  }
}

function removeFromRoomStructureMemory(structureId) {
  const removed = [];
  if (!Memory.rooms) return removed;
  for (const roomName of Object.keys(Memory.rooms)) {
    const roomMem = Memory.rooms[roomName];
    if (Array.isArray(roomMem.structures)) {
      const remaining = [];
      for (const entry of roomMem.structures) {
        if (entry && entry.id === structureId) {
          removed.push({
            roomName,
            id: entry.id,
            structureType: entry.structureType,
            pos: entry.pos
              ? {
                  x: entry.pos.x,
                  y: entry.pos.y,
                  roomName: entry.pos.roomName || roomName,
                }
              : null,
          });
        } else {
          remaining.push(entry);
        }
      }
      roomMem.structures = remaining;
    }
    if (Array.isArray(roomMem.buildingQueue)) {
      roomMem.buildingQueue = roomMem.buildingQueue.filter((entry) => entry.id !== structureId);
    }
  }
  return removed;
}

function queueStructureRebuilds(entries) {
  if (!entries || entries.length === 0) return;
  for (const entry of entries) {
    if (!entry || !entry.roomName || !entry.structureType || !entry.pos) continue;
    const roomMem = Memory.rooms && Memory.rooms[entry.roomName];
    if (!roomMem) continue;
    roomMem.rebuildQueue = roomMem.rebuildQueue || [];
    const exists = roomMem.rebuildQueue.some(
      (queued) =>
        queued &&
        queued.structureType === entry.structureType &&
        queued.pos &&
        queued.pos.x === entry.pos.x &&
        queued.pos.y === entry.pos.y &&
        (queued.pos.roomName || entry.roomName) === entry.pos.roomName,
    );
    if (exists) continue;
    roomMem.rebuildQueue.push({
      structureType: entry.structureType,
      pos: {
        x: entry.pos.x,
        y: entry.pos.y,
        roomName: entry.pos.roomName || entry.roomName,
      },
      queued:
        typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
      reason: 'assimilation',
    });
  }
}

function releaseMaintenanceAssignments(creepName) {
  if (!Memory.maintenance || !Memory.maintenance.rooms) return;
  for (const roomName of Object.keys(Memory.maintenance.rooms)) {
    const roomMem = Memory.maintenance.rooms[roomName];
    if (!roomMem.requests) continue;
    for (const requestId of Object.keys(roomMem.requests)) {
      const request = roomMem.requests[requestId];
      if (request && request.assignedTo === creepName) {
        request.assignedTo = null;
      }
    }
  }
}

function purgeMaintenanceRequest(structureId) {
  if (!Memory.maintenance || !Memory.maintenance.rooms) return;
  for (const roomName of Object.keys(Memory.maintenance.rooms)) {
    const roomMem = Memory.maintenance.rooms[roomName];
    if (roomMem.requests && roomMem.requests[structureId]) {
      delete roomMem.requests[structureId];
    }
  }
}

const assimilation = {
  assimilateCreep(name) {
    const creepMemory = Memory.creeps && Memory.creeps[name];
    const role = creepMemory && creepMemory.role;
    const roleModule = getRoleModule(role);
    if (roleModule && typeof roleModule.onDeath === 'function') {
      safeInvoke(roleModule.onDeath, { name, memory: creepMemory }, name);
    }

    logger.log('memory', `Assimilating dead creep ${name}`, 2);

    energyDemand.cleanupCreep(name);
    releaseMaintenanceAssignments(name);

    if (Memory.creeps) delete Memory.creeps[name];
    if (Memory.htm && Memory.htm.creeps && Memory.htm.creeps[name]) {
      delete Memory.htm.creeps[name];
    }
  },

  assimilateStructure(structureId) {
    if (!structureId) return;
    logger.log('memory', `Assimilating missing structure ${structureId}`, 3);

    energyRequests.clearStructure(structureId);
    energyDemand.cleanupRequester(structureId);
    purgeMaintenanceRequest(structureId);
    const removed = removeFromRoomStructureMemory(structureId);
    queueStructureRebuilds(removed);
  },
};

module.exports = assimilation;
