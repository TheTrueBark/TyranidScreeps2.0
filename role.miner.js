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

    let miningPos = new RoomPosition(
      creep.memory.miningPosition.x,
      creep.memory.miningPosition.y,
      creep.memory.miningPosition.roomName,
    );

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

    const source = Game.getObjectById(creep.memory.sourceId);
    if (
      source &&
      creep.getActiveBodyparts(WORK) >= 5
    ) {
      const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: s => s.structureType === STRUCTURE_CONTAINER,
      })[0];
      if (
        container &&
        (creep.memory.miningPosition.x !== container.pos.x ||
          creep.memory.miningPosition.y !== container.pos.y)
      ) {
        memoryManager.freeMiningPosition(creep.memory.miningPosition);
        const mem =
          Memory.rooms &&
          Memory.rooms[creep.room.name] &&
          Memory.rooms[creep.room.name].miningPositions &&
          Memory.rooms[creep.room.name].miningPositions[source.id];
        if (mem && mem.positions) {
          for (const k in mem.positions) {
            const p = mem.positions[k];
            if (p && p.x === container.pos.x && p.y === container.pos.y) {
              mem.positions[k].reserved = true;
            }
          }
        }
        creep.memory.miningPosition = {
          x: container.pos.x,
          y: container.pos.y,
          roomName: container.pos.roomName,
          reserved: true,
        };
        miningPos = new RoomPosition(
          container.pos.x,
          container.pos.y,
          container.pos.roomName,
        );
      }
    }

    // Move to the mining position if not already there
    if (!creep.pos.isEqualTo(miningPos)) {
      creep.travelTo(miningPos, { visualizePathStyle: { stroke: "#ffaa00" } });
      return;
    }

    // Mine the assigned source
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

    const demand = require('./manager.hivemind.demand');
    const ticks = creep.memory.lastDelivery
      ? Game.time - creep.memory.lastDelivery
      : 0;
    const delivered = creep.store[RESOURCE_ENERGY];

    if (structures.length > 0) {
      if (creep.transfer(structures[0], RESOURCE_ENERGY) === OK) {
        demand.recordSupply(creep.name, ticks, delivered, creep.room.name, 'miner');
        creep.memory.lastDelivery = Game.time;
      }
    } else if (creep.drop(RESOURCE_ENERGY) === OK) {
      // Drop energy if no storage structure is available
      demand.recordSupply(creep.name, ticks, delivered, creep.room.name, 'miner');
      creep.memory.lastDelivery = Game.time;
    }

    logger.log(
      "roleMiner",
      `Miner ${creep.name} at position (${creep.pos.x}, ${creep.pos.y}) mining source ${source.id} and managing energy`,
      2,
    );
  },

  onDeath: function (creep) {
    const roomName = creep.memory.miningPosition && creep.memory.miningPosition.roomName;
    memoryManager.releaseMiningPosition(creep);
    if (roomName) memoryManager.verifyMiningReservations(roomName);
    // Cleanup stale reservations in case the miner died unexpectedly
    memoryManager.cleanUpReservedPositions();
  },
};

module.exports = roleMiner;
