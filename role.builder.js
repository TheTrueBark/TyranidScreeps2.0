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

/**
 * Look for nearby energy that the builder can collect on its own.
 * Returns an object describing the pickup/withdraw action or null if none.
 */
function findNearbyEnergy(creep) {
  // Prefer dropped resources adjacent to the creep
  const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 2, {
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
  })[0];
  if (dropped) return { type: 'pickup', target: dropped };

  // Check nearby containers with available energy
  const container = creep.pos.findInRange(FIND_STRUCTURES, 2, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store[RESOURCE_ENERGY] > 0,
  })[0];
  if (container) return { type: 'withdraw', target: container };

  return null;
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
    }
  },
};

module.exports = roleBuilder;
