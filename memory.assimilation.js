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
  if (!Memory.rooms) return;
  for (const roomName of Object.keys(Memory.rooms)) {
    const roomMem = Memory.rooms[roomName];
    if (Array.isArray(roomMem.structures)) {
      roomMem.structures = roomMem.structures.filter((s) => s.id !== structureId);
    }
    if (Array.isArray(roomMem.buildingQueue)) {
      roomMem.buildingQueue = roomMem.buildingQueue.filter((entry) => entry.id !== structureId);
    }
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
    removeFromRoomStructureMemory(structureId);
  },
};

module.exports = assimilation;
