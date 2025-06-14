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
  scout: 0,
  miner: 1,
  hauler: 2,
  baseDistributor: 3,
  builder: 4,
  upgrader: 5,
  remoteMiner: 2,
  reservist: 3,
};

// Exportable priority shortcuts for remote roles
const PRIORITY_REMOTE_MINER = ROLE_PRIORITY.remoteMiner;
const PRIORITY_RESERVIST = ROLE_PRIORITY.reservist;

// Exportable priority constants for external modules
const PRIORITY_HIGH = ROLE_PRIORITY.miner;

// HTM task name for sequential miner+hauler spawning
const TASK_STARTER_COUPLE = 'spawnStarterCouple';

// Direction deltas for checking adjacent tiles around a spawn
const directionDelta = {
  [(typeof TOP !== 'undefined' ? TOP : 1)]: { x: 0, y: -1 },
  [(typeof TOP_RIGHT !== 'undefined' ? TOP_RIGHT : 2)]: { x: 1, y: -1 },
  [(typeof RIGHT !== 'undefined' ? RIGHT : 3)]: { x: 1, y: 0 },
  [(typeof BOTTOM_RIGHT !== 'undefined' ? BOTTOM_RIGHT : 4)]: { x: 1, y: 1 },
  [(typeof BOTTOM !== 'undefined' ? BOTTOM : 5)]: { x: 0, y: 1 },
  [(typeof BOTTOM_LEFT !== 'undefined' ? BOTTOM_LEFT : 6)]: { x: -1, y: 1 },
  [(typeof LEFT !== 'undefined' ? LEFT : 7)]: { x: -1, y: 0 },
  [(typeof TOP_LEFT !== 'undefined' ? TOP_LEFT : 8)]: { x: -1, y: -1 },
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

/**
 * Determine how many miners are required to saturate a source.
 * Mirrors the logic used when actually spawning miners so other
 * modules can calculate consistent workforce needs.
 *
 * @param {Room} room - Room containing the source.
 * @param {Source} source - The source to evaluate.
 * @returns {number} Required miner count for the source.
 */
function calculateRequiredMiners(room, source) {
  // Safely access mining position data without optional chaining to avoid
  // compatibility issues with older runtimes
  const sourceMem =
    Memory.rooms &&
    Memory.rooms[room.name] &&
    Memory.rooms[room.name].miningPositions &&
    Memory.rooms[room.name].miningPositions[source.id];
  if (!sourceMem) return 0;

  const availablePositions = Object.keys(sourceMem.positions || {}).length;
  const bodyParts = dna.getBodyParts('miner', room);
  const energyPerTick =
    bodyParts.filter((part) => part === WORK).length * HARVEST_POWER;
  // Cap miner count by available positions and a maximum of five per source
  return Math.min(availablePositions, 5, Math.ceil(10 / energyPerTick));
}

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
  spawnMiner(spawn, room, energyCapacityAvailable, task = null, starter = false) {
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

      const minersAtSource = _.filter(
        Game.creeps,
        (creep) =>
          creep.memory.role === "miner" && creep.memory.source === source.id,
      ).length;
      const queuedMiners = spawnQueue.queue.filter(
        (req) =>
          req.memory.role === "miner" && req.memory.source === source.id && req.room === room.name,
      ).length;

      const bodyParts = starter ? [WORK, MOVE] : dna.getBodyParts("miner", room);
      const energyPerTick =
        bodyParts.filter((part) => part === WORK).length * HARVEST_POWER;
      const requiredMiners = calculateRequiredMiners(room, source);

      if (minersAtSource + queuedMiners >= requiredMiners) {
        continue;
      }

      const creepMemory = { source: source.id };
      const miningPositionAssigned = memoryManager.assignMiningPosition(
        creepMemory,
        room,
      );

      if (miningPositionAssigned) {
        const sourceMem =
          Memory.rooms[room.name].miningPositions[source.id] || {};
        const distanceToSpawn =
          sourceMem.distanceFromSpawn !== undefined
            ? sourceMem.distanceFromSpawn
            : spawn.pos.getRangeTo(Game.getObjectById(source.id).pos);
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
            task
              ? {
                  parentTaskId: task.parentTaskId,
                  subOrder: task.subOrder,
                  parentTick: task.origin && task.origin.tickCreated,
                }
              : {}
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
  spawnHauler(spawn, room, energyCapacityAvailable, task = null, starter = false) {
    const bodyParts = starter ? [CARRY, MOVE] : dna.getBodyParts("hauler", room);
    spawnQueue.addToQueue(
      "hauler",
      room.name,
      bodyParts,
      { role: "hauler" },
      spawn.id,
      0,
      ROLE_PRIORITY.hauler,
      task
        ? {
            parentTaskId: task.parentTaskId,
            subOrder: task.subOrder,
            parentTick: task.origin && task.origin.tickCreated,
          }
        : {}
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

  spawnBaseDistributor(spawn, room) {
    const bodyParts = dna.getBodyParts('baseDistributor', room);
    spawnQueue.addToQueue(
      'baseDistributor',
      room.name,
      bodyParts,
      { role: 'baseDistributor', home: room.name },
      spawn.id,
      0,
      ROLE_PRIORITY.baseDistributor,
    );
    logger.log(
      'spawnManager',
      `Queued base distributor for room ${room.name}`,
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

  checkStorageAndSpawnBaseDistributor(room) {
    if (!room.storage) return;
    const existing = _.filter(Game.creeps, c => c.memory.role === 'baseDistributor' && c.memory.home === room.name);
    const queued = spawnQueue.queue.some(q => q.memory && q.memory.role === 'baseDistributor' && q.room === room.name);
    if (existing.length === 0 && !queued) {
      const spawn = room.find(FIND_MY_SPAWNS)[0];
      if (spawn) this.spawnBaseDistributor(spawn, room);
    }
    if (!Memory.hive || !Memory.hive.clusters || !Memory.hive.clusters[room.name]) return;
    const colony = Memory.hive.clusters[room.name].colonies[room.name];
    if (colony) {
      if (!colony.meta) colony.meta = {};
      colony.meta.distributor = existing.length ? existing[0].name : null;
    }
  },

  /**
   * Spawn a minimal hauler using currently available energy.
   * Used when haulers are absent but energy is on the ground.
   * @param {StructureSpawn} spawn - Spawn structure to use.
   * @param {Room} room - Room context.
   */
  spawnEmergencyCollector(spawn, room) {
    if (room.energyAvailable < BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) return 0;
    const bodyParts = [CARRY, MOVE];
    spawnQueue.addToQueue(
      'hauler',
      room.name,
      bodyParts,
      { role: 'hauler', emergency: true },
      spawn.id,
      0,
      ROLE_PRIORITY.hauler,
    );
    return bodyParts.length;
  },

  /**
   * Handle a spawnStarterCouple HTM task. Adds spawnMiner and spawnHauler
   * subtasks sequentially and removes the parent when finished.
   * @param {Room} room - Room context for the task.
   * @param {object} task - Parent task object with progress state in data.phase.
   */
  handleStarterCouple(room, task) {
    const container = htm._getContainer(htm.LEVELS.COLONY, room.name);
    if (!container || !container.tasks) return;

    const minerSub = container.tasks.find(
      t => t.parentTaskId === task.id && t.name === 'spawnMiner',
    );
    const haulerSub = container.tasks.find(
      t => t.parentTaskId === task.id && t.name === 'spawnHauler',
    );

    if (!task.data.phase) {
      htm.addColonyTask(
        room.name,
        'spawnMiner',
        { role: 'miner', starter: true },
        ROLE_PRIORITY.miner,
        30,
        1,
        'spawnManager',
        {},
        { parentTaskId: task.id, subOrder: 0 },
      );
      task.data.phase = 'miner';
      return;
    }

    if (task.data.phase === 'miner') {
      if (!minerSub) {
        htm.addColonyTask(
          room.name,
          'spawnHauler',
          { role: 'hauler', starter: true },
          ROLE_PRIORITY.hauler,
          30,
          1,
          'spawnManager',
          {},
          { parentTaskId: task.id, subOrder: 1 },
        );
        task.data.phase = 'hauler';
      }
      return;
    }

    if (task.data.phase === 'hauler' && !haulerSub) {
      const idx = container.tasks.indexOf(task);
      if (idx !== -1) container.tasks.splice(idx, 1);
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
        case TASK_STARTER_COUPLE:
          this.handleStarterCouple(room, task);
          break;
        case 'spawnMiner': {
          const size = this.spawnMiner(
            spawn,
            room,
            energyCapacityAvailable,
            task,
            task.data && task.data.starter,
          );
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
          this.spawnHauler(
            spawn,
            room,
            energyCapacityAvailable,
            task,
            task.data && task.data.starter,
          );
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
          const role = task.data.role || 'miner';
          let size = 0;
          if (role === 'miner') {
            size = this.spawnMiner(spawn, room, energyCapacityAvailable);
          } else if (role === 'hauler') {
            this.spawnHauler(spawn, room, energyCapacityAvailable);
            size = dna.getBodyParts('hauler', room).length;
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
module.exports.PRIORITY_HIGH = PRIORITY_HIGH;
module.exports.PRIORITY_SCOUT = ROLE_PRIORITY.scout;
module.exports.PRIORITY_REMOTE_MINER = PRIORITY_REMOTE_MINER;
module.exports.PRIORITY_RESERVIST = PRIORITY_RESERVIST;
module.exports.ROLE_PRIORITY = ROLE_PRIORITY;
module.exports.TASK_STARTER_COUPLE = TASK_STARTER_COUPLE;
module.exports.calculateRequiredMiners = calculateRequiredMiners;
