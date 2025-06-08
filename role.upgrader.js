const statsConsole = require("console.console");
const htm = require("./manager.htm");
const movementUtils = require("./utils.movement");

function getUpgradePos(creep) {
  if (creep.memory.upgradePos) {
    const p = creep.memory.upgradePos;
    return new RoomPosition(p.x, p.y, p.roomName);
  }
  let container = null;
  if (
    creep.room.controller &&
    creep.room.controller.pos &&
    typeof creep.room.controller.pos.findInRange === 'function'
  ) {
    container = creep.room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
      filter: s => s.structureType === STRUCTURE_CONTAINER,
    })[0];
  }
  const pos = container
    ? container.pos
    : creep.room.controller && creep.room.controller.pos
      ? creep.room.controller.pos
      : creep.pos;
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
}

const roleUpgrader = {
  run: function (creep) {
    movementUtils.avoidSpawnArea(creep);
    if (creep.store[RESOURCE_ENERGY] === 0) {
      const pos = getUpgradePos(creep);
      if (!creep.pos.isEqualTo || !creep.pos.isEqualTo(pos)) {
        creep.travelTo(pos, { visualizePathStyle: { stroke: '#ffaa00' } });
        return;
      }
      requestEnergy(creep);
      return;
    }

    const pos = getUpgradePos(creep);
    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
      creep.travelTo(pos, { visualizePathStyle: { stroke: '#ffffff' } });
    }
  },
};

module.exports = roleUpgrader;
