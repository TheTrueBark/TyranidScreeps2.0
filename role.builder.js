const htm = require('./manager.htm');
const movementUtils = require('./utils.movement');

function getIdlePos(creep) {
  if (creep.memory.mainTask && creep.memory.mainTask.type === 'build') {
    const target = Game.getObjectById(creep.memory.mainTask.id);
    if (target) return target.pos;
  }
  const roomMemory = Memory.rooms && Memory.rooms[creep.room.name];
  const queue = (roomMemory && roomMemory.buildingQueue) || [];
  for (const entry of queue) {
    const site = Game.getObjectById(entry.id);
    if (site) return site.pos;
  }
  const site =
    creep.pos.findClosestByRange &&
    creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
  return site ? site.pos : null;
}

function requestEnergy(creep) {
  if (htm.hasTask(htm.LEVELS.CREEP, creep.name, 'deliverEnergy', 'hauler')) return;
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const distance = spawn ? spawn.pos.getRangeTo(creep) : 10;
  htm.addCreepTask(
    creep.name,
    'deliverEnergy',
    {
      pos: { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name },
      ticksNeeded: distance * 2,
    },
    1,
    50,
    1,
    'hauler',
  );
  const demand = require('./manager.hivemind.demand');
  // Request only the missing amount so hauler demand reflects actual needs
  const amount = creep.store.getFreeCapacity
    ? creep.store.getFreeCapacity(RESOURCE_ENERGY)
    : 0;
  demand.recordRequest(creep.name, amount, creep.room.name);
}

/**
 * Look for nearby energy that the builder can collect on its own.
 * Returns an object describing the pickup/withdraw action or null if none.
 */
function findNearbyEnergy(creep) {
  // Prefer dropped resources nearby to limit travel time
  const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 20, {
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
  })[0];
  if (dropped) return { type: 'pickup', target: dropped };

  // Check nearby containers with available energy
  const container = creep.pos.findInRange(FIND_STRUCTURES, 20, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store[RESOURCE_ENERGY] > 0,
  })[0];
  if (container) return { type: 'withdraw', target: container };

  // Fallback to storage within reasonable distance
  const storage = creep.pos.findInRange(FIND_STRUCTURES, 20, {
    filter: s =>
      s.structureType === STRUCTURE_STORAGE &&
      s.store &&
      s.store[RESOURCE_ENERGY] > 0,
  })[0];
  if (storage) return { type: 'withdraw', target: storage };

  return null;
}

function assignBuildTask(creep, entry, site, roomMemory) {
  creep.memory.buildTarget = entry.id;
  creep.memory.mainTask = { type: 'build', id: entry.id };
  if (!roomMemory.siteAssignments) roomMemory.siteAssignments = {};
  roomMemory.siteAssignments[entry.id] = (roomMemory.siteAssignments[entry.id] || 0) + 1;
  htm.addCreepTask(
    creep.name,
    'buildStructure',
    {
      id: entry.id,
      pos: { x: site.pos.x, y: site.pos.y, roomName: site.pos.roomName },
    },
    1,
    50,
    1,
    'builder',
  );
}

function clearBuildTask(creep, roomMemory) {
  if (creep.memory.buildTarget && roomMemory && roomMemory.siteAssignments) {
    roomMemory.siteAssignments[creep.memory.buildTarget] = Math.max(
      0,
      (roomMemory.siteAssignments[creep.memory.buildTarget] || 1) - 1,
    );
  }
  delete creep.memory.buildTarget;
  delete creep.memory.mainTask;
}

function gatherEnergy(creep) {
  const idlePos = getIdlePos(creep);
  if (idlePos && creep.pos.getRangeTo(idlePos) > 1) {
    creep.travelTo(idlePos, { visualizePathStyle: { stroke: '#aaaaaa' }, range: 1 });
    return;
  }
  const source = findNearbyEnergy(creep);
  if (source) {
    if (source.type === 'pickup') {
      if (creep.pickup(source.target) === ERR_NOT_IN_RANGE) {
        creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
      }
    } else if (creep.withdraw(source.target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
  } else {
    requestEnergy(creep);
  }
}

function buildSite(creep, site) {
  if (!site) return false;
  if (creep.pos.isEqualTo(site.pos)) {
    if (!movementUtils.stepOff(creep) && typeof creep.move === 'function') {
      creep.move(1);
    }
    return true;
  }
  if (creep.build(site) === ERR_NOT_IN_RANGE) {
    creep.travelTo(site, { visualizePathStyle: { stroke: '#ffffff' } });
  }
  return true;
}

const roleBuilder = {
  run: function (creep) {
    movementUtils.avoidSpawnArea(creep);
    const roomMemory = (Memory.rooms && Memory.rooms[creep.room.name]) || {};

    if (creep.store[RESOURCE_ENERGY] === 0) {
      creep.memory.working = false;
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
    }
    if (!creep.memory.working && creep.store[RESOURCE_ENERGY] > 0) {
      creep.memory.working = true;
    }

    const task = creep.memory.mainTask;

    if (!task || (task.type === 'build' && !Game.getObjectById(task.id))) {
      clearBuildTask(creep, roomMemory);
    }

    if (!creep.memory.mainTask) {
      const queue = (creep.room.memory && creep.room.memory.buildingQueue) || [];
      for (const entry of queue) {
        const assigned = (roomMemory.siteAssignments && roomMemory.siteAssignments[entry.id]) || 0;
        if (assigned < 4) {
          const site = Game.getObjectById(entry.id);
          if (site) {
            assignBuildTask(creep, entry, site, roomMemory);
            break;
          }
        }
      }
      if (!creep.memory.mainTask && queue.length === 0) {
        creep.memory.mainTask = { type: 'upgrade', id: creep.room.controller.id };
      }
    }

    if (!creep.memory.working) {
      gatherEnergy(creep);
      return;
    }

    if (creep.memory.mainTask && creep.memory.mainTask.type === 'build') {
      const site = Game.getObjectById(creep.memory.mainTask.id);
      if (!buildSite(creep, site)) {
        clearBuildTask(creep, roomMemory);
      }
    } else {
      if (creep.repair) {
        const structuresNeedingRepair = creep.room.find(FIND_STRUCTURES, {
          filter: o => o.hits < o.hitsMax,
        });
        structuresNeedingRepair.sort((a, b) => a.hits - b.hits);
        if (structuresNeedingRepair.length > 0) {
          if (creep.repair(structuresNeedingRepair[0]) === ERR_NOT_IN_RANGE) {
            creep.travelTo(structuresNeedingRepair[0], { visualizePathStyle: { stroke: '#ffffff' } });
          }
          return;
        }
      }
      if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        creep.travelTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
      }
    }
  },
  onDeath: function (creep) {
    const roomMemory = Memory.rooms && Memory.rooms[creep.room.name];
    if (creep.memory.mainTask && creep.memory.mainTask.type === 'build') {
      clearBuildTask(creep, roomMemory);
    }
  },
};

module.exports = roleBuilder;
