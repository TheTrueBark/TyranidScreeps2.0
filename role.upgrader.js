const statsConsole = require("console.console");
const htm = require("./manager.htm");
const movementUtils = require("./utils.movement");

const MAX_UPGRADERS_PER_CONTAINER = 4;

function assignContainer(creep) {
  if (creep.memory.containerId) {
    const obj = Game.getObjectById(creep.memory.containerId);
    if (obj) return obj;
    delete creep.memory.containerId;
  }
  const controller = creep.room.controller;
  if (!controller || !controller.pos || !controller.pos.findInRange) return null;
  const container = controller.pos.findInRange(FIND_STRUCTURES, 2, {
    filter: s => s.structureType === STRUCTURE_CONTAINER,
  })[0];
  if (!container) return null;
  const roomMemory = Memory.rooms && Memory.rooms[creep.room.name];
  if (!roomMemory) return null;
  if (!roomMemory.upgradeAssignments) roomMemory.upgradeAssignments = {};
  const assigned = roomMemory.upgradeAssignments[container.id] || 0;
  if (assigned >= MAX_UPGRADERS_PER_CONTAINER) return null;
  creep.memory.containerId = container.id;
  roomMemory.upgradeAssignments[container.id] = assigned + 1;
  return container;
}

function getUpgradePos(creep) {
  const container = assignContainer(creep);
  if (container) {
    creep.memory.upgradePos = {
      x: container.pos.x,
      y: container.pos.y,
      roomName: container.pos.roomName,
    };
    return container.pos;
  }
  if (creep.memory.upgradePos) {
    const p = creep.memory.upgradePos;
    return new RoomPosition(p.x, p.y, p.roomName);
  }

  let pos = null;
  if (creep.room.controller && creep.room.controller.pos) {
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && spawn.pos) {
      const path = creep.room.findPath(creep.room.controller.pos, spawn.pos, {
        ignoreCreeps: true,
      });
      if (path.length >= 2) {
        const step = path[1];
        pos = new RoomPosition(step.x, step.y, creep.room.name);
      }
    }
    if (!pos) pos = creep.room.controller.pos;
  } else {
    pos = creep.pos;
  }
  creep.memory.upgradePos = { x: pos.x, y: pos.y, roomName: pos.roomName };
  return pos;
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
  demand.recordRequest(creep.name, creep.store.getCapacity ? creep.store.getCapacity() : 0, creep.room.name);
}

const roleUpgrader = {
  run: function (creep) {
    movementUtils.avoidSpawnArea(creep);
    const pos = getUpgradePos(creep);
    const container = creep.memory.containerId
      ? Game.getObjectById(creep.memory.containerId)
      : null;

    if (
      container &&
      container.store[RESOURCE_ENERGY] > 0 &&
      creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
      creep.pos.getRangeTo(container) <= 1
    ) {
      if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.travelTo(container, { visualizePathStyle: { stroke: '#ffaa00' } });
      }
      if (
        creep.store[RESOURCE_ENERGY] > 0 &&
        creep.room.controller &&
        creep.pos.getRangeTo(creep.room.controller) <= 3
      ) {
        creep.upgradeController(creep.room.controller);
      }
      return;
    }

    if (creep.store[RESOURCE_ENERGY] === 0) {

      // Withdraw if close enough, otherwise move toward the upgrade position
      if (
        container &&
        container.store[RESOURCE_ENERGY] > 0 &&
        creep.pos.getRangeTo(container) <= 1
      ) {
        if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(container, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
      } else {
        creep.travelTo(pos, { visualizePathStyle: { stroke: '#ffaa00' } });
      }
      if (
        creep.store[RESOURCE_ENERGY] > 0 &&
        creep.room.controller &&
        creep.pos.getRangeTo(creep.room.controller) <= 3
      ) {
        creep.upgradeController(creep.room.controller);
      }
      return;
    }

    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
      creep.travelTo(pos, { visualizePathStyle: { stroke: '#ffffff' } });
    }
  },
  onDeath: function (creep) {
    const roomMemory = Memory.rooms && Memory.rooms[creep.room.name];
    if (
      roomMemory &&
      roomMemory.upgradeAssignments &&
      creep.memory.containerId &&
      roomMemory.upgradeAssignments[creep.memory.containerId]
    ) {
      roomMemory.upgradeAssignments[creep.memory.containerId] = Math.max(
        0,
        (roomMemory.upgradeAssignments[creep.memory.containerId] || 1) - 1,
      );
    }
  },
};

module.exports = roleUpgrader;
