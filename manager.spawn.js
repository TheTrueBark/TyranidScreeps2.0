const memoryManager = require("manager.memory");
const dna = require("./manager.dna");
const spawnQueue = require("manager.spawnQueue");
const htm = require("./manager.htm");
const { DEFAULT_CLAIM_COOLDOWN } = htm;
const { calculateCollectionTicks } = require("utils.energy");
const logger = require("./logger");
const energyRequests = require("./manager.energyRequests");

// Default spawn priorities per role
const ROLE_PRIORITY = {
  allPurpose: 1,
  miner: 2,
  hauler: 3,
  builder: 4,
  upgrader: 5,
};

// Direction deltas for checking adjacent tiles around a spawn
const directionDelta = {
  [TOP]: { x: 0, y: -1 },
  [TOP_RIGHT]: { x: 1, y: -1 },
  [RIGHT]: { x: 1, y: 0 },
  [BOTTOM_RIGHT]: { x: 1, y: 1 },
  [BOTTOM]: { x: 0, y: 1 },
  [BOTTOM_LEFT]: { x: -1, y: 1 },
  [LEFT]: { x: -1, y: 0 },
  [TOP_LEFT]: { x: -1, y: -1 },
};

// Determine the best spawn direction based on available space
function getBestSpawnDirections(spawn, targetPos) {
  const terrain = spawn.room.getTerrain();
  const directions = [
    TOP,
    TOP_RIGHT,
    RIGHT,
    BOTTOM_RIGHT,
    BOTTOM,
    BOTTOM_LEFT,
    LEFT,
    TOP_LEFT,
  ];

  let best = null;
  let bestRange = Infinity;

  for (const dir of directions) {
    const delta = directionDelta[dir];
    const x = spawn.pos.x + delta.x;
    const y = spawn.pos.y + delta.y;

    if (x < 0 || x > 49 || y < 0 || y > 49) continue;
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
    if (
      spawn.room
        .lookForAt(LOOK_STRUCTURES, x, y)
        .some((s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType))
    ) {
      continue;
    }
    if (spawn.room.lookForAt(LOOK_CREEPS, x, y).length > 0) continue;

    if (!targetPos) {
      return [dir];
    }

    const range = new RoomPosition(x, y, spawn.room.name).getRangeTo(targetPos);
    if (range < bestRange) {
      best = dir;
      bestRange = range;
    }
  }

  return best !== null ? [best] : undefined;
}

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

    // Issue energy delivery requests for spawns and extensions
    energyRequests.run(room);

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
              bodySize: bodyParts.length,
              distanceToSpawn,
              energyProducedPerTick,
              collectionTicks,
            },
            spawn.id,
            0,
            ROLE_PRIORITY.miner,
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
    const bodyParts = dna.getBodyParts("hauler", room);
    spawnQueue.addToQueue(
      "hauler",
      room.name,
      bodyParts,
      { role: "hauler" },
      spawn.id,
      0,
      ROLE_PRIORITY.hauler,
    );
    logger.log(
      "spawnManager",
      `Added hauler creep to spawn queue in room ${room.name}`,
      2,
    );
  },

  /**
   * Spawns an upgrader with the appropriate body parts based on energy.
   * @param {StructureSpawn} spawn - Spawn structure to use.
   * @param {Room} room - Room context for calculations.
   */
  spawnUpgrader(spawn, room) {
    const bodyParts = dna.getBodyParts("upgrader", room);
    spawnQueue.addToQueue(
      "upgrader",
      room.name,
      bodyParts,
      { role: "upgrader" },
      spawn.id,
      0,
      ROLE_PRIORITY.upgrader,
    );
    logger.log(
      "spawnManager",
      `Added upgrader creep to spawn queue in room ${room.name}`,
      2,
    );
  },

  /**
   * Spawns a builder with the appropriate body parts based on energy.
   * @param {StructureSpawn} spawn - Spawn structure to use.
   * @param {Room} room - Room context for calculations.
   */
  spawnBuilder(spawn, room) {
    const bodyParts = dna.getBodyParts("builder", room);
    spawnQueue.addToQueue(
      "builder",
      room.name,
      bodyParts,
      { role: "builder" },
      spawn.id,
      0,
      ROLE_PRIORITY.builder,
    );
    logger.log(
      "spawnManager",
      `Added builder creep to spawn queue in room ${room.name}`,
      2,
    );
  },

  /**
   * Spawn an allPurpose worker and pre-assign a mining position if possible.
   * @param {StructureSpawn} spawn - The spawn to create the request for.
   * @param {Room} room - The room context.
   * @param {boolean} panic - Whether to use panic sized body.
   * @returns {number} Body size spawned or 0 on failure.
   */
  spawnAllPurpose(spawn, room, panic = false) {
    const bodyParts = dna.getBodyParts("allPurpose", room, panic);
    const sources = room.find(FIND_SOURCES);
    if (sources.length === 0) return 0;

    for (const source of sources) {
      const creepMemory = {
        role: "allPurpose",
        source: source.id,
        working: false,
        desiredPosition: {},
      };
      if (memoryManager.assignMiningPosition(creepMemory, room)) {
        creepMemory.sourcePosition = {
          x: source.pos.x,
          y: source.pos.y,
          roomName: source.pos.roomName,
        };
        creepMemory.desiredPosition = {
          x: creepMemory.miningPosition.x,
          y: creepMemory.miningPosition.y,
          roomName: creepMemory.miningPosition.roomName,
        };
        spawnQueue.addToQueue(
          "allPurpose",
          room.name,
          bodyParts,
          creepMemory,
          spawn.id,
          0,
          ROLE_PRIORITY.allPurpose,
        );
        return bodyParts.length;
      }
    }

    const fallback = sources[0];
    spawnQueue.addToQueue(
      "allPurpose",
      room.name,
      bodyParts,
      {
        role: "allPurpose",
        source: fallback.id,
        working: false,
        desiredPosition: {
          x: fallback.pos.x,
          y: fallback.pos.y,
          roomName: fallback.pos.roomName,
        },
        sourcePosition: {
          x: fallback.pos.x,
          y: fallback.pos.y,
          roomName: fallback.pos.roomName,
        },
      },
      spawn.id,
      0,
      ROLE_PRIORITY.allPurpose,
    );
    return bodyParts.length;
  },

  /**
   * Spawn a minimal allPurpose creep using currently available energy.
   * Used when haulers are absent but energy is on the ground.
   * @param {StructureSpawn} spawn - Spawn structure to use.
   * @param {Room} room - Room context.
   */
  spawnEmergencyCollector(spawn, room) {
    if (room.energyAvailable < BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) return 0;
    const bodyParts = [CARRY, MOVE];
    spawnQueue.addToQueue(
      "allPurpose",
      room.name,
      bodyParts,
      { role: "allPurpose", emergency: true },
      spawn.id,
      0,
      ROLE_PRIORITY.allPurpose,
    );
    return bodyParts.length;
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
      if (spawn.memory.currentSpawnRole) {
        delete spawn.memory.currentSpawnRole;
      }

      const nextSpawn = spawnQueue.getNextSpawn(spawn.id); // Ensure this fetches the next spawn in the global queue for this spawn
      if (
        nextSpawn &&
        nextSpawn.category === 'miner' &&
        !this.isMinerStillNeeded(spawn.room, nextSpawn)
      ) {
        spawnQueue.removeSpawnFromQueue(nextSpawn.requestId);
        return;
      }
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
        let spawnPos;
        if (
          memory.miningPosition &&
          memory.miningPosition.x !== undefined &&
          memory.miningPosition.roomName
        ) {
          // Normal case when assignMiningPosition stored the room name
          spawnPos = new RoomPosition(
            memory.miningPosition.x,
            memory.miningPosition.y,
            memory.miningPosition.roomName,
          );
        } else if (
          memory.sourcePosition &&
          memory.sourcePosition.x !== undefined &&
          memory.sourcePosition.roomName
        ) {
          spawnPos = new RoomPosition(
            memory.sourcePosition.x,
            memory.sourcePosition.y,
            memory.sourcePosition.roomName,
          );
        } else if (
          memory.miningPosition &&
          memory.miningPosition.x !== undefined &&
          !memory.miningPosition.roomName
        ) {
          // Backwards compatibility for legacy memory lacking roomName
          memory.miningPosition.roomName = spawn.room.name;
          spawnPos = new RoomPosition(
            memory.miningPosition.x,
            memory.miningPosition.y,
            spawn.room.name,
          );
        } else if (
          memory.sourcePosition &&
          memory.sourcePosition.x !== undefined &&
          !memory.sourcePosition.roomName
        ) {
          memory.sourcePosition.roomName = spawn.room.name;
          spawnPos = new RoomPosition(
            memory.sourcePosition.x,
            memory.sourcePosition.y,
            spawn.room.name,
          );
        }

        const options = { memory };
        const dirs = getBestSpawnDirections(spawn, spawnPos);
        if (dirs) options.directions = dirs;

        const result = spawn.spawnCreep(bodyParts, newName, options);
        if (result === OK) {
          logger.log(
            "spawnManager",
            `Spawning new ${category}: ${newName}`,
            2,
          );
          if (!spawn.memory) spawn.memory = {};
          spawn.memory.currentSpawnRole = memory.role;
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
   * Determine if a queued miner is still required before spawning.
   * @param {Room} room - The room context.
   * @param {object} request - Spawn queue entry.
   * @returns {boolean} True if the miner should be spawned.
   */
  isMinerStillNeeded(room, request) {
    if (!request.memory || !request.memory.source) return true;
    const sourceId = request.memory.source;
    const sourceMem =
      Memory.rooms[room.name] &&
      Memory.rooms[room.name].miningPositions &&
      Memory.rooms[room.name].miningPositions[sourceId];
    if (!sourceMem) return true;

    const available = Object.keys(sourceMem.positions).length;
    const energyPerTick = request.bodyParts.filter(p => p === WORK).length * HARVEST_POWER;
    const required = Math.min(available, Math.ceil(10 / energyPerTick));
    const live = _.filter(
      Game.creeps,
      c => c.memory.role === 'miner' && c.memory.source === sourceId,
    ).length;
    const queued = spawnQueue.queue.filter(
      q =>
        q.requestId !== request.requestId &&
        q.memory.role === 'miner' &&
        q.memory.source === sourceId &&
        q.room === room.name,
    ).length;
    return live + queued < required;
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
        case 'spawnUpgrader':
          this.spawnUpgrader(spawn, room);
          htm.claimTask(
            htm.LEVELS.COLONY,
            room.name,
            task.name,
            'spawnManager',
            DEFAULT_CLAIM_COOLDOWN,
            dna.getBodyParts('upgrader', room).length * CREEP_SPAWN_TIME,
          );
          break;
        case 'spawnBuilder':
          this.spawnBuilder(spawn, room);
          htm.claimTask(
            htm.LEVELS.COLONY,
            room.name,
            task.name,
            'spawnManager',
            DEFAULT_CLAIM_COOLDOWN,
            dna.getBodyParts('builder', room).length * CREEP_SPAWN_TIME,
          );
          break;
        case 'spawnBootstrap':
          const role = task.data.role || 'allPurpose';
          let size = 0;
          if (role === 'allPurpose') {
            size = this.spawnAllPurpose(spawn, room, task.data.panic);
          } else {
            const body = dna.getBodyParts(role, room, task.data.panic);
            spawnQueue.addToQueue(
              role,
              room.name,
              body,
              { role },
              spawn.id,
              0,
              ROLE_PRIORITY[role] || 5,
            );
            size = body.length;
          }
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
        default:
          break;
      }
    }
  },
};

module.exports = spawnManager;
