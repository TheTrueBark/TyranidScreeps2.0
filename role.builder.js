const htm = require('./manager.htm');

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

const roleBuilder = {
  run: function (creep) {
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
      creep.memory.working = false;
      creep.say("🔄 collect");
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
      creep.say("⚡ build/repair");
    }

    if (creep.memory.working) {
      const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
      if (constructionSites.length > 0) {
        if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE) {
          creep.travelTo(constructionSites[0], {
            visualizePathStyle: { stroke: "#ffffff" },
          });
        }
      } else {
        const structuresNeedingRepair = creep.room.find(FIND_STRUCTURES, {
          filter: (object) => object.hits < object.hitsMax,
        });

        structuresNeedingRepair.sort((a, b) => a.hits - b.hits);

        if (structuresNeedingRepair.length > 0) {
          if (creep.repair(structuresNeedingRepair[0]) === ERR_NOT_IN_RANGE) {
            creep.travelTo(structuresNeedingRepair[0], {
              visualizePathStyle: { stroke: "#ffffff" },
            });
          }
        } else {
          if (
            creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE
          ) {
            creep.travelTo(creep.room.controller, {
              visualizePathStyle: { stroke: "#ffffff" },
            });
          }
        }
      }
    } else {
      if (creep.store[RESOURCE_ENERGY] === 0) {
        requestEnergy(creep);
      }
    }
  },
};

module.exports = roleBuilder;
