// role.hauler.js

const htm = require('manager.htm');
const logger = require('./logger');
const movementUtils = require('./utils.movement');
const demand = require("./manager.hivemind.demand");

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

function deliverEnergy(creep, target = null) {
  const structure =
    target ||
    creep.pos.findClosestByPath(FIND_STRUCTURES, {
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
      const target = Game.creeps[creep.memory.task.target] ||
        Game.getObjectById(creep.memory.task.target);
      if (!target) {
        htm.addCreepTask(
          creep.memory.task.target,
          'deliverEnergy',
          { pos: creep.memory.task.pos, amount: creep.memory.task.reserved },
          1,
          20,
          1,
          'hauler',
        );
        delete creep.memory.task;
      } else if (creep.store[RESOURCE_ENERGY] > 0) {
        const before = creep.store[RESOURCE_ENERGY];
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(target, { visualizePathStyle: { stroke: "#ffffff" } });
        } else {
          const delivered = before - creep.store[RESOURCE_ENERGY];
          creep.memory.task.reserved = Math.max(0, creep.memory.task.reserved - delivered);
          if (
            creep.memory.task.reserved === 0 ||
            (target.store && target.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
          ) {
            demand.recordDelivery(
              creep.memory.task.target,
              Game.time - creep.memory.task.startTime,
              creep.memory.task.initial,
              target.room.name,
              creep.name,
              'hauler',
            );
            delete creep.memory.task;
          }
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
    const available = [];
    for (const name in creepTasks) {
      const container = creepTasks[name];
      if (!container.tasks) continue;
      const task = container.tasks.find(
        (t) => t.name === 'deliverEnergy' && Game.time >= t.claimedUntil,
      );
      if (task) available.push({ name, task });
    }

    available.sort(
      (a, b) => (a.task.data.ticksNeeded || 0) - (b.task.data.ticksNeeded || 0),
    );

    for (const entry of available) {
      const { name, task } = entry;
      const estimate = task.data.ticksNeeded || 0;
      const pos = new RoomPosition(
        task.data.pos.x,
        task.data.pos.y,
        task.data.pos.roomName,
      );
      const travel = creep.pos.getRangeTo(pos) * 2;
      const required = Math.max(estimate, travel);
      if (creep.ticksToLive && creep.ticksToLive <= required) continue;
      htm.claimTask(
        htm.LEVELS.CREEP,
        name,
        'deliverEnergy',
        'hauler',
        htm.DEFAULT_CLAIM_COOLDOWN,
        estimate,
      );
      let deliver = creep.store.getCapacity ? creep.store.getCapacity() : 0;
      if (task.data.amount !== undefined) {
        deliver = Math.min(deliver, task.data.amount);
        task.data.amount -= deliver;
        if (task.data.amount <= 0) {
          const idx = creepTasks[name].tasks.indexOf(task);
          if (idx !== -1) creepTasks[name].tasks.splice(idx, 1);
        }
      }
      creep.memory.task = {
        name: "deliverEnergy",
        target: name,
        pos: task.data.pos,
        reserved: deliver,
        startTime: Game.time,
        initial: deliver,
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
      return;
    }

    const spawn = creep.room.find ? creep.room.find(FIND_MY_SPAWNS)[0] : null;
    if (creep.store[RESOURCE_ENERGY] === 0) {
      const miners = Object.values(Game.creeps).filter(
        c => c.memory && c.memory.role === 'miner' && c.room.name === creep.room.name,
      );
      if (miners.length > 0) {
        const target = creep.pos.findClosestByRange(miners);
        if (target) {
          creep.travelTo(target, { range: 2 });
          return;
        }
      }
    } else if (spawn) {
      creep.travelTo(spawn, { range: 2 });
      return;
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
