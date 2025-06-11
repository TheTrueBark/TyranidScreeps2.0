const statsConsole = require('console.console');
const movementUtils = require('./utils.movement');

/**
 * Simplified upgrader behavior.
 * Creep collects the closest available energy until full then
 * upgrades the room controller from within a three tile radius.
 */

function findClosestEnergy(creep) {
  const options = [];

  let dropped = null;
  if (creep.pos.findClosestByRange) {
    dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
      filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
    });
  } else if (creep.room && creep.room.find) {
    dropped = creep.room
      .find(FIND_DROPPED_RESOURCES)
      .find(r => r.resourceType === RESOURCE_ENERGY && r.amount > 0) || null;
  }
  if (dropped) {
    options.push({ target: dropped, type: 'pickup', range: creep.pos.getRangeTo(dropped) });
  }

  let container = null;
  if (creep.pos.findClosestByRange) {
    container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: s =>
        (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
        s.store && s.store[RESOURCE_ENERGY] > 0,
    });
  }
  if (!container && creep.room && creep.room.controller && creep.room.controller.pos && creep.room.controller.pos.findInRange) {
    container = creep.room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
      filter: s =>
        (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
        s.store && s.store[RESOURCE_ENERGY] > 0,
    })[0];
  }
  if (container) {
    options.push({ target: container, type: 'withdraw', range: creep.pos.getRangeTo(container) });
  }

  let source = null;
  if (creep.pos.findClosestByRange) {
    source = creep.pos.findClosestByRange(FIND_SOURCES);
  } else if (creep.room && creep.room.find) {
    source = creep.room.find(FIND_SOURCES)[0] || null;
  }
  if (source) {
    options.push({ target: source, type: 'harvest', range: creep.pos.getRangeTo(source) });
  }

  if (options.length === 0) return null;
  options.sort((a, b) => a.range - b.range);
  return options[0];
}

function gatherEnergy(creep) {
  const choice = findClosestEnergy(creep);
  if (!choice) return;

  if (choice.type === 'pickup') {
    if (creep.pickup(choice.target) === ERR_NOT_IN_RANGE) {
      creep.travelTo(choice.target, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
  } else if (choice.type === 'withdraw') {
    if (creep.withdraw(choice.target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.travelTo(choice.target, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
  } else if (creep.harvest(choice.target) === ERR_NOT_IN_RANGE) {
    creep.travelTo(choice.target, { visualizePathStyle: { stroke: '#ffaa00' } });
  }
}

function upgrade(creep) {
  const controller = creep.room.controller;
  if (!controller) return;

  const range = creep.pos.getRangeTo(controller);
  if (range > 3) {
    creep.travelTo(controller, { range: 3, visualizePathStyle: { stroke: '#ffffff' } });
  }
  if (creep.pos.getRangeTo(controller) <= 3) {
    creep.upgradeController(controller);
  }
}

const roleUpgrader = {
  run(creep) {
    const start = Game.cpu.getUsed();
    movementUtils.avoidSpawnArea(creep);

    if (creep.memory.working === undefined) {
      let capacity = 0;
      if (creep.store.getCapacity) {
        capacity = creep.store.getCapacity(RESOURCE_ENERGY);
      } else if (creep.store.getFreeCapacity) {
        capacity = creep.store[RESOURCE_ENERGY] + creep.store.getFreeCapacity(RESOURCE_ENERGY);
      } else {
        capacity = creep.storeCapacity || 0;
      }
      creep.memory.working = creep.store[RESOURCE_ENERGY] >= capacity;
    }
    if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
    if (
      creep.store.getFreeCapacity
        ? creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0
        : creep.store[RESOURCE_ENERGY] >= creep.storeCapacity
    ) {
      creep.memory.working = true;
    }

    if (creep.memory.working) {
      upgrade(creep);
    } else {
      gatherEnergy(creep);
    }

    statsConsole.run([[
      'role.upgrader',
      Game.cpu.getUsed() - start,
    ]]);
  },

  onDeath() {},
};

module.exports = roleUpgrader;
