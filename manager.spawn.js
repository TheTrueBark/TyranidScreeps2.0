const memoryManager = require("manager.memory");
const dna = require("./manager.dna");
const spawnQueue = require("manager.spawnQueue");
const htm = require("./manager.htm");
const { DEFAULT_CLAIM_COOLDOWN } = htm;
const { calculateCollectionTicks } = require("utils.energy");
const logger = require("./logger");

// Calculate the effective energy capacity excluding incomplete extensions
const calculateEffectiveEnergyCapacity = (room) => {
  let effectiveEnergyCapacity = room.energyCapacityAvailable;

  const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: (site) => site.structureType === STRUCTURE_EXTENSION,
  });

  if (constructionSites.length > 0) {
    const incompleteExtensions =
      constructionSites.length *
      EXTENSION_ENERGY_CAPACITY[room.controller.level];
    effectiveEnergyCapacity -= incompleteExtensions;
  }

  return effectiveEnergyCapacity;
};

const spawnManager = {
  /**
   * Main function called each tick to manage spawning in the given room.
   * @param {Room} room - The room object to manage spawning for.
   */
  run(room) {
    logger.log("spawnManager", `Running spawnManager for room: ${room.name}`, 2);

    // Process HTM tasks directed to the spawn manager before normal checks
    this.processHTMTasks(room);

    if (Game.cpu.bucket === 10000) {
      logger.log(
        "spawnManager",
        `CPU bucket is full, initializing room memory for ${room.name}`,
        3,
      );
      memoryManager.initializeRoomMemory(room);
      memoryManager.cleanUpReservedPositions();
    }

    const spawns = room.find(FIND_MY_SPAWNS);
    for (const spawn of spawns) {
      this.processSpawnQueue(spawn);
    }

    // Adjust priorities dynamically
    spawnQueue.adjustPriorities(room);
  },


  /**
   * Spawns a miner with the appropriate body parts based on the available energy.
   * @param {StructureSpawn} spawn - The spawn structure to add requests for.
   * @param {Room} room - The room object to check state for.
   * @param {number} energyCapacityAvailable - The available energy capacity.
   */
  // Spawn a single miner if any source lacks the required workforce.
  // Returns body size or 0 when nothing was queued.
  spawnMiner(spawn, room, energyCapacityAvailable) {
    const sources = room.find(FIND_SOURCES);
    if (!Array.isArray(sources)) {
      logger.log("spawnManager", `No sources found in room ${room.name}`, 3);
      return 0;
    }

    for (const source of sources) {
      if (
        !Memory.rooms ||
        !Memory.rooms[room.name] ||
        !Memory.rooms[room.name].miningPositions ||
        !Memory.rooms[room.name].miningPositions[source.id]
      ) {
        logger.log(
          "spawnManager",
          `Missing mining positions data for room ${room.name} and source ${source.id}`,
          3,
        );
        continue;
      }

      const availablePositions = Object.keys(
        Memory.rooms[room.name].miningPositions[source.id].positions,
      ).length;
      const minersAtSource = _.filter(
        Game.creeps,
        (creep) =>
          creep.memory.role === "miner" && creep.memory.source === source.id,
      ).length;
      const queuedMiners = spawnQueue.queue.filter(
        (req) =>
          req.memory.role === "miner" && req.memory.source === source.id && req.room === room.name,
      ).length;

      const bodyParts = dna.getBodyParts("miner", room);
      const energyPerTick =
        bodyParts.filter((part) => part === WORK).length * HARVEST_POWER;
      const requiredMiners = Math.min(
        availablePositions,
        Math.ceil(10 / energyPerTick),
      );

      if (minersAtSource + queuedMiners >= requiredMiners) {
        continue;
      }

      const creepMemory = { source: source.id };
      const miningPositionAssigned = memoryManager.assignMiningPosition(
        creepMemory,
        room,
      );

      if (miningPositionAssigned) {
        const distanceToSpawn = spawn.pos.getRangeTo(
          Game.getObjectById(source.id).pos,
        );
        const energyProducedPerTick = energyPerTick;
        const collectionTicks = calculateCollectionTicks(energyProducedPerTick);

        if (
          !spawnQueue.queue.some(
            (req) =>
              req.memory.source === source.id &&
              JSON.stringify(req.bodyParts) === JSON.stringify(bodyParts),
          )
        ) {
          spawnQueue.addToQueue(
            "miner",
            room.name,
            bodyParts,
            {
              role: "miner",
              source: source.id,
              miningPosition: creepMemory.miningPosition,
              distanceToSpawn,
              energyProducedPerTick,
              collectionTicks,
            },
            spawn.id,
          );
          return bodyParts.length;
        }
      }
    }
    return 0;
  },

  /**
   * Spawns a hauler with the appropriate body parts based on the available energy.
   * @param {StructureSpawn} spawn - The spawn structure to add requests for.
   * @param {Room} room - The room object to check state for.
   * @param {number} energyCapacityAvailable - The available energy capacity.
   */
  spawnHauler(spawn, room, energyCapacityAvailable) {
    const currentHaulers = _.filter(
      Game.creeps,
      (creep) =>
        creep.memory.role === "hauler" && creep.room.name === room.name,
    ).length;
    const queuedHaulers = spawnQueue.queue.filter(
      (req) => req.memory.role === "hauler" && req.room === room.name,
    ).length;

    if (currentHaulers + queuedHaulers < 6) {
      // Maximum of 6 haulers
      const bodyParts = dna.getBodyParts("hauler", room);
      spawnQueue.addToQueue(
        "hauler",
        room.name,
        bodyParts,
        { role: "hauler" },
        spawn.id,
      );
      logger.log(
        "spawnManager",
        `Added hauler creep to spawn queue in room ${room.name}`,
        2,
      );
    } else {
      logger.log(
        "spawnManager",
        `Maximum number of haulers reached for room ${room.name}`,
        2,
      );
    }
  },


  /**
   * Processes the spawn queue for a given spawn structure.
   * Attempts to spawn the next creep in the queue if enough energy is available.
   * @param {StructureSpawn} spawn - The spawn structure to process the queue for.
   */
  processSpawnQueue(spawn) {
    logger.log(
      "spawnManager",
      `Processing spawn queue for ${spawn.name}`,
      2,
    );
    if (!spawn.spawning) {
      const nextSpawn = spawnQueue.getNextSpawn(spawn.id); // Ensure this fetches the next spawn in the global queue for this spawn
      if (nextSpawn && spawn.room.energyAvailable >= nextSpawn.energyRequired) {
        logger.log(
          "spawnManager",
          `Next spawn: ${JSON.stringify(nextSpawn)}`,
          3,
        );
        const { category, bodyParts, memory, requestId } = nextSpawn;
        const newName = `${category}_${Game.time}`;
        logger.log(
          "spawnManager",
          `Attempting to spawn ${newName} with body parts: ${JSON.stringify(bodyParts)}`,
          3,
        );
        const result = spawn.spawnCreep(bodyParts, newName, { memory });
        if (result === OK) {
          logger.log(
            "spawnManager",
            `Spawning new ${category}: ${newName}`,
            2,
          );
          spawnQueue.removeSpawnFromQueue(requestId);
        } else {
          logger.log(
            "spawnManager",
            `Failed to spawn ${category}: ${result}`,
            4,
          );
        }
      } else {
        logger.log(
          "spawnManager",
          `Not enough energy to spawn: ${JSON.stringify(nextSpawn)}`,
          3,
        );
      }
    } else {
      logger.log(
        "spawnManager",
        `${spawn.name} is currently spawning a creep`,
        2,
      );
    }
  },

  /**
   * Read colony level tasks from HTM directed to the spawn manager and
   * convert them into spawn queue requests. Each claim sets a short cooldown
   * to prevent the HiveMind from reissuing immediately.
   */
  processHTMTasks(room) {
    const container = htm._getContainer(htm.LEVELS.COLONY, room.name);
    if (!container || !container.tasks) return;

    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return;
    const spawn = spawns[0];
    const energyCapacityAvailable = calculateEffectiveEnergyCapacity(room);

    for (const task of container.tasks) {
      if (task.manager !== 'spawnManager' || Game.time < task.claimedUntil) {
        continue;
      }

      switch (task.name) {
        case 'spawnMiner': {
          const size = this.spawnMiner(spawn, room, energyCapacityAvailable);
          if (size > 0) {
            htm.claimTask(
              htm.LEVELS.COLONY,
              room.name,
              task.name,
              'spawnManager',
              DEFAULT_CLAIM_COOLDOWN,
              size * CREEP_SPAWN_TIME,
            );
          }
          break;
        }
        case 'spawnHauler':
          this.spawnHauler(spawn, room, energyCapacityAvailable);
          htm.claimTask(
            htm.LEVELS.COLONY,
            room.name,
            task.name,
            'spawnManager',
            DEFAULT_CLAIM_COOLDOWN,
            dna.getBodyParts('hauler', room).length * CREEP_SPAWN_TIME,
          );
          break;
        case 'spawnBootstrap':
          const role = task.data.role || 'allPurpose';
          const body = dna.getBodyParts(role, room, task.data.panic);
          spawnQueue.addToQueue(role, room.name, body, { role }, spawn.id);
          htm.claimTask(
            htm.LEVELS.COLONY,
            room.name,
            task.name,
            'spawnManager',
            DEFAULT_CLAIM_COOLDOWN,
            body.length * CREEP_SPAWN_TIME,
          );
          break;
        default:
          break;
      }
    }
  },
};

module.exports = spawnManager;
