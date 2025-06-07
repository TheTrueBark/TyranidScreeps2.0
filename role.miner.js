const logger = require("./logger");
const memoryManager = require("manager.memory");
const { calculateCollectionTicks } = require("utils.energy");
const movementUtils = require("./utils.movement");

const roleMiner = {
  run: function (creep) {
    movementUtils.avoidSpawnArea(creep);
    // Check if mining position is correctly assigned
    if (!creep.memory.miningPosition) {
      logger.log(
        "roleMiner",
        `Miner ${creep.name} does not have a mining position assigned.`,
        3,
      );
      return;
    }

    // Ensure the mining position has all required properties
    if (
      !creep.memory.miningPosition.x ||
      !creep.memory.miningPosition.y ||
      !creep.memory.miningPosition.roomName
    ) {
      logger.log(
        "roleMiner",
        `Miner ${creep.name} has an incomplete mining position: ${JSON.stringify(
          creep.memory.miningPosition,
        )}`,
        3,
      );
      return;
    }

    const miningPos = new RoomPosition(
      creep.memory.miningPosition.x,
      creep.memory.miningPosition.y,
      creep.memory.miningPosition.roomName,
    );

    // Move to the mining position if not already there
    if (!creep.pos.isEqualTo(miningPos)) {
      creep.travelTo(miningPos, { visualizePathStyle: { stroke: "#ffaa00" } });
      return;
    }
    if (!creep.memory.sourceId) {
      const sources = miningPos.findInRange(FIND_SOURCES, 1);
      if (sources.length > 0) {
        creep.memory.sourceId = sources[0].id;
      } else {
        logger.log(
          "roleMiner",
          `Miner ${creep.name} could not find a source at the mining position.`,
          3,
        );
        return;
      }
    }

    // Mine the assigned source
    const source = Game.getObjectById(creep.memory.sourceId);
    if (source) {
      const harvestResult = creep.harvest(source);
      if (harvestResult === OK) {
        logger.log(
          "roleMiner",
          `Miner ${creep.name} harvesting from source ${source.id}`,
          2,
        );
      } else if (
        harvestResult !== ERR_NOT_ENOUGH_RESOURCES &&
        harvestResult !== ERR_NOT_IN_RANGE
      ) {
        logger.log(
          "roleMiner",
          `Miner ${creep.name} failed to harvest source with result ${harvestResult}`,
          3,
        );
      }
    } else {
      logger.log(
        "roleMiner",
        `Miner ${creep.name} does not have a valid source to mine.`,
        3,
      );
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

    logger.log(
      "roleMiner",
      `Miner ${creep.name} at position (${creep.pos.x}, ${creep.pos.y}) mining source ${source.id} and managing energy`,
      2,
    );
  },

  onDeath: function (creep) {
    memoryManager.releaseMiningPosition(creep);
    // Cleanup stale reservations in case the miner died unexpectedly
    memoryManager.cleanUpReservedPositions();
  },
};

module.exports = roleMiner;
