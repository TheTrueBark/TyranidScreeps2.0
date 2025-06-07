const statsConsole = require("console.console");
const htm = require("./manager.htm");
const movementUtils = require("./utils.movement");

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
      requestEnergy(creep);
      return;
    }

    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
      creep.travelTo(creep.room.controller, {
        visualizePathStyle: { stroke: "#ffffff" },
      });
    }
  },
};

module.exports = roleUpgrader;
