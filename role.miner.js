const debugConfig = require("console.debugLogs");
const memoryManager = require("manager.memory");
const pathfinder = require("manager.pathfinder");
const { calculateCollectionTicks } = require("utils.energy");

const roleMiner = {
  run: function (creep) {
    // Check if mining position is correctly assigned
    if (!creep.memory.miningPosition) {
      if (debugConfig.roleMiner) {
        console.log(
          `Miner ${creep.name} does not have a mining position assigned.`,
        );
      }
      return;
    }

    // Ensure the mining position has all required properties
    if (
      !creep.memory.miningPosition.x ||
      !creep.memory.miningPosition.y ||
      !creep.memory.miningPosition.roomName
    ) {
      if (debugConfig.roleMiner) {
        console.log(
          `Miner ${creep.name} has an incomplete mining position:`,
          creep.memory.miningPosition,
        );
      }
      return;
    }

    const miningPos = new RoomPosition(
      creep.memory.miningPosition.x,
      creep.memory.miningPosition.y,
      creep.memory.miningPosition.roomName,
    );

    // Move to the mining position if not already there
    if (!creep.pos.isEqualTo(miningPos)) {
      const nextPos = pathfinder.calculateNextPosition(creep, miningPos);
      if (nextPos) {
        creep.registerMove(nextPos);
        creep.moveTo(nextPos.x, nextPos.y, {
          visualizePathStyle: { stroke: "#ffaa00" },
        });
      }
      return;
    }

    // Ensure the source ID is set
    if (!creep.memory.sourceId) {
      const sources = miningPos.findInRange(FIND_SOURCES, 1);
      if (sources.length > 0) {
        creep.memory.sourceId = sources[0].id;
      } else {
        if (debugConfig.roleMiner) {
          console.log(
            `Miner ${creep.name} could not find a source at the mining position.`,
          );
        }
        return;
      }
    }

    // Mine the assigned source
    const source = Game.getObjectById(creep.memory.sourceId);
    if (source) {
      const harvestResult = creep.harvest(source);
      if (harvestResult === OK) {
        if (debugConfig.roleMiner) {
          console.log(
            `Miner ${creep.name} harvesting from source ${source.id}`,
          );
        }
      } else if (
        harvestResult !== ERR_NOT_ENOUGH_RESOURCES &&
        harvestResult !== ERR_NOT_IN_RANGE
      ) {
        if (debugConfig.roleMiner) {
          console.log(
            `Miner ${creep.name} failed to harvest source with result ${harvestResult}`,
          );
        }
      }
    } else {
      if (debugConfig.roleMiner) {
        console.log(
          `Miner ${creep.name} does not have a valid source to mine.`,
        );
      }
      return;
    }

    // Calculate distance to spawn once in miner's lifetime
    if (!creep.memory.distanceToSpawn) {
      const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
      creep.memory.distanceToSpawn = creep.pos.getRangeTo(spawn);
    }

    // Deposit energy in link or container if available
    const structures = creep.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: (structure) => {
        return (
          (structure.structureType === STRUCTURE_LINK ||
            structure.structureType === STRUCTURE_CONTAINER) &&
          structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
      },
    });

    if (structures.length > 0) {
      creep.transfer(structures[0], RESOURCE_ENERGY);
    } else {
      // Drop energy if no storage structure is available
      creep.drop(RESOURCE_ENERGY);
    }

    if (debugConfig.roleMiner) {
      console.log(
        `Miner ${creep.name} at position (${creep.pos.x}, ${creep.pos.y}) mining source ${source.id} and managing energy`,
      );
    }
  },

  onDeath: function (creep) {
    memoryManager.releaseMiningPosition(creep);
  },
};

module.exports = roleMiner;
