const htm = require('./manager.htm');
const movementUtils = require('./utils.movement');

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
  const amount = creep.store.getFreeCapacity
    ? creep.store.getFreeCapacity(RESOURCE_ENERGY)
    : 0;
  demand.recordRequest(creep.name, amount, creep.room.name);
}

function findNearbyEnergy(creep) {
  const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 15, {
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
  })[0];
  if (dropped) return { type: 'pickup', target: dropped };

  const container = creep.pos.findInRange(FIND_STRUCTURES, 15, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store[RESOURCE_ENERGY] > 0,
  })[0];
  if (container) return { type: 'withdraw', target: container };

  const storage = creep.pos.findInRange(FIND_STRUCTURES, 15, {
    filter: s =>
      s.structureType === STRUCTURE_STORAGE &&
      s.store &&
      s.store[RESOURCE_ENERGY] > 0,
  })[0];
  if (storage) return { type: 'withdraw', target: storage };

  return null;
}

function gatherEnergy(creep) {
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

function chooseSite(creep) {
  const queue = (creep.room.memory && creep.room.memory.buildingQueue) || [];
  for (const entry of queue) {
    const site = Game.getObjectById(entry.id);
    if (site) return site;
  }
  if (creep.pos.findClosestByRange) {
    return creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
  }
  return null;
}

const roleBuilder = {
  run(creep) {
    movementUtils.avoidSpawnArea(creep);

    if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
    if (!creep.memory.working && creep.store[RESOURCE_ENERGY] > 0) creep.memory.working = true;

    if (!creep.memory.working) {
      gatherEnergy(creep);
      return;
    }

    let target = creep.memory.targetId ? Game.getObjectById(creep.memory.targetId) : null;
    if (!target) {
      target = chooseSite(creep);
      creep.memory.targetId = target ? target.id : null;
    }

    if (target && target.progress >= target.progressTotal) {
      target = chooseSite(creep);
      creep.memory.targetId = target ? target.id : null;
    }

    if (target) {
      if (creep.pos.isEqualTo(target.pos)) {
        if (!movementUtils.stepOff(creep) && typeof creep.move === 'function') {
          creep.move(1);
        }
      }
      if (creep.build(target) === ERR_NOT_IN_RANGE) {
        creep.travelTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
      }
      return;
    }

    if (creep.upgradeController && creep.room.controller) {
      if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        creep.travelTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
      }
    }
  },
  onDeath(creep) {
    delete creep.memory.targetId;
  },
};

module.exports = roleBuilder;
