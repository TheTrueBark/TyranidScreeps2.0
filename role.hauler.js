// role.hauler.js

const htm = require('manager.htm');
const logger = require('./logger');
const movementUtils = require('./utils.movement');

function findEnergySource(creep) {
  const needed = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  if (needed === 0) return null;
  const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount >= needed,
  });
  if (dropped) return { type: 'pickup', target: dropped };

  const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store[RESOURCE_ENERGY] >= needed,
  });
  if (container) return { type: 'withdraw', target: container };

  if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] >= needed) {
    return { type: 'withdraw', target: creep.room.storage };
  }
  return null;
}

function deliverEnergy(creep) {
  const structure = creep.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: s =>
      (s.structureType === STRUCTURE_EXTENSION ||
        s.structureType === STRUCTURE_SPAWN) &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });
  if (structure) {
    if (creep.transfer(structure, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.travelTo(structure, { visualizePathStyle: { stroke: '#ffffff' } });
    }
    return true;
  }

  const ctrlContainer =
    creep.room.controller &&
    creep.room.controller.pos
      .findInRange(FIND_STRUCTURES, 3, {
        filter: s =>
          s.structureType === STRUCTURE_CONTAINER &&
          s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
      })[0];
  if (ctrlContainer) {
    if (creep.transfer(ctrlContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.travelTo(ctrlContainer, { visualizePathStyle: { stroke: '#ffffff' } });
    }
    return true;
  }

  if (creep.room.storage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.travelTo(creep.room.storage, { visualizePathStyle: { stroke: '#ffffff' } });
    }
    return true;
  }
  return false;
}

module.exports = {
  run: function (creep) {
    movementUtils.avoidSpawnArea(creep);
    // Active delivery task takes priority
    if (creep.memory.task && creep.memory.task.name === 'deliverEnergy') {
      const target = Game.creeps[creep.memory.task.target];
      if (!target) {
        htm.addCreepTask(
          creep.memory.task.target,
          'deliverEnergy',
          { pos: creep.memory.task.pos },
          1,
          20,
          1,
          'hauler',
        );
        delete creep.memory.task;
      } else if (creep.store[RESOURCE_ENERGY] > 0) {
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
        } else if (creep.store[RESOURCE_ENERGY] === 0) {
          delete creep.memory.task;
        }
        return;
      } else {
        const source = findEnergySource(creep);
        if (source) {
          if (source.type === 'pickup') {
            if (creep.pickup(source.target) === ERR_NOT_IN_RANGE) {
              creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
          } else if (creep.withdraw(source.target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
          }
        }
        return;
      }
    }

    // Look for delivery tasks
    const creepTasks = Memory.htm && Memory.htm.creeps ? Memory.htm.creeps : {};
    for (const name in creepTasks) {
      const container = creepTasks[name];
      if (!container.tasks) continue;
      const task = container.tasks.find(
        (t) => t.name === 'deliverEnergy' && Game.time >= t.claimedUntil,
      );
      if (!task) continue;
      const estimate = task.data.ticksNeeded || 0;
      if (creep.ticksToLive && creep.ticksToLive <= estimate) continue;
      htm.claimTask(htm.LEVELS.CREEP, name, 'deliverEnergy', 'hauler', htm.DEFAULT_CLAIM_COOLDOWN, estimate);
      creep.memory.task = {
        name: 'deliverEnergy',
        target: name,
        pos: task.data.pos,
      };
      break;
    }

    if (creep.store[RESOURCE_ENERGY] > 0) {
      if (deliverEnergy(creep)) return;
    }

    const source = findEnergySource(creep);
    if (source) {
      if (source.type === 'pickup') {
        if (creep.pickup(source.target) === ERR_NOT_IN_RANGE) {
          creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
      } else if (creep.withdraw(source.target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
      }
    }
  },
  onDeath: function (creep) {
    if (creep.memory.task && creep.memory.task.name === 'deliverEnergy') {
      htm.addCreepTask(
        creep.memory.task.target,
        'deliverEnergy',
        { pos: creep.memory.task.pos },
        1,
        20,
        1,
        'hauler',
      );
    }
  },
};
