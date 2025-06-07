// role.hauler.js

const htm = require('manager.htm');
const logger = require('./logger');

module.exports = {
  run: function (creep) {
    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (spawn && creep.pos.isNearTo(spawn)) {
      const nearbyDemand = spawn.pos
        .findInRange(FIND_STRUCTURES, 1, {
          filter: (s) =>
            (s.structureType === STRUCTURE_EXTENSION ||
              s.structureType === STRUCTURE_SPAWN) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        })
        .length;
      if (nearbyDemand === 0) {
        creep.travelTo(spawn, { range: 2 });
        return;
      }
    }
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
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: (structure) =>
            structure.structureType === STRUCTURE_CONTAINER &&
            structure.store[RESOURCE_ENERGY] > 0,
        });
        if (container) {
          if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.travelTo(container, { visualizePathStyle: { stroke: '#ffaa00' } });
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

    // Check if creep is carrying energy and is not already transferring energy
    if (creep.store[RESOURCE_ENERGY] > 0) {
      // Prioritize filling extensions first, then the spawn
      const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: (structure) => {
          return (
            (structure.structureType === STRUCTURE_EXTENSION ||
              structure.structureType === STRUCTURE_SPAWN) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
          );
        },
      });
      if (target) {
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(target, { visualizePathStyle: { stroke: "#ffffff" } });
        }
        return;
      }

      // If no valid target, deposit energy in storage
      const storage = creep.room.storage;
      if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(storage, { visualizePathStyle: { stroke: "#ffffff" } });
        }
        return;
      }
    } else {
      // Otherwise, find dropped energy or energy in containers
      const droppedEnergy = creep.pos.findClosestByPath(
        FIND_DROPPED_RESOURCES,
        {
          filter: (resource) => resource.resourceType === RESOURCE_ENERGY,
        },
      );
      if (droppedEnergy) {
        if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
          creep.travelTo(droppedEnergy, {
            visualizePathStyle: { stroke: "#ffaa00" },
          });
        }
        return;
      }

      const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: (structure) => {
          return (
            structure.structureType === STRUCTURE_CONTAINER &&
            structure.store[RESOURCE_ENERGY] > 0
          );
        },
      });
      if (container) {
        if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(container, {
            visualizePathStyle: { stroke: "#ffaa00" },
          });
        }
        return;
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
