/**
 * Hierarchical Memory Manager (HMM)
 * =================================
 *
 * The hive uses a fixed, multi-level schema to store all persistent data.
 * Keeping the layout uniform helps debugging and allows easy extension.
 *
 * Memory.hive = {
 *   version: MEMORY_VERSION,          // schema version
 *   clusters: {
 *     [clusterId]: {
 *       meta: {},                     // cluster specific information
 *       colonies: {
 *         [colonyId]: {
 *           meta: {},                 // colony specific information
 *           creeps: {},               // per-creep data
 *           structures: {},           // structure information
 *           tasks: {},                // persistent colony tasks
 *         }
 *       }
 *     }
 *   }
 * };
 *
 * At startup each owned room forms its own cluster and colony. The functions
 * in this module guarantee that the above structure exists before data is
 * written.
 */

const { MEMORY_VERSION, runMigrations } = require('./memory.migrations');

const DEFAULT_COLONY_MEMORY = {
  creeps: {},
  structures: {},
  tasks: {},
  meta: {},
};

const DEFAULT_CLUSTER_MEMORY = {
  colonies: {},
  meta: {},
};

const memoryManager = {
  /**
   * Initialize per-room containers and ensure the hive hierarchy exists.
   *
   * @param {Room} room - The room object to initialize.
   */
  /**
   * Prepare Memory.rooms and link the room into the hive hierarchy.
   * @param {Room} room - The room object to initialize.
   * @codex-owner memoryManager
   * @codex-path Memory.rooms
   */
  initializeRoomMemory(room) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room.name]) {
      Memory.rooms[room.name] = {
        miningPositions: {},
        reservedPositions: {},
        restrictedArea: [],
        controllerUpgradeSpots: 0,
      };
    }

    // Use the room name for cluster and colony identifiers by default
    this.initializeHiveMemory(room.name, room.name);
  },

  /**
   * Ensure the rigid hive memory layout is present.
   *
   * @param {string} clusterId - Identifier for the cluster.
   * @param {string} colonyId  - Identifier for the colony.
   * @codex-owner memoryManager
   * @codex-path Memory.hive
   */
  initializeHiveMemory(clusterId, colonyId) {
    if (!Memory.hive) {
      Memory.hive = {
        version: MEMORY_VERSION,
        clusters: {},
      };
    } else if (Memory.hive.version === undefined) {
      Memory.hive.version = MEMORY_VERSION;
    } else if (Memory.hive.version < MEMORY_VERSION) {
      runMigrations(Memory.hive.version);
    }

    if (!Memory.hive.clusters) {
      Memory.hive.clusters = {};
    }

    if (!Memory.hive.clusters[clusterId]) {
      Memory.hive.clusters[clusterId] = {
        colonies: {},
        meta: {},
      };
    }

    if (!Memory.hive.clusters[clusterId].colonies[colonyId]) {
      Memory.hive.clusters[clusterId].colonies[colonyId] = {
        creeps: {},
        structures: {},
        tasks: {},
        meta: {},
      };
    }
  },

  /**
   * Removes stale reserved positions from all rooms.
   */
  cleanUpReservedPositions() {
    for (const roomName in Memory.rooms) {
      const reserved = Memory.rooms[roomName].reservedPositions;
      if (!reserved) continue;

      for (const pos in reserved) {
        if (!Game.creeps[reserved[pos]]) {
          delete reserved[pos];
        }
      }
    }
  },

  /**
   * Remove stale entries from Memory.energyReserves.
   * Objects that no longer exist or contain no energy are cleared.
   */
  cleanUpEnergyReserves() {
    if (!Memory.energyReserves) return;
    for (const id in Memory.energyReserves) {
      const obj = Game.getObjectById(id);
      const hasEnergy = obj && ((obj.amount || (obj.store && obj.store[RESOURCE_ENERGY])) > 0);
      if (!obj || !hasEnergy) {
        delete Memory.energyReserves[id];
      }
    }
  },

  /**
   * Assigns an available mining position to a creep.
   *
   * @param {Object} creepMemory - The creep's memory object.
   * @param {Room} room         - Room containing the mining positions.
   * @returns {boolean} True if a position was assigned.
   */
  assignMiningPosition(creepMemory, room) {
    if (!creepMemory || !creepMemory.source) {
      const logger = require("./logger");
      logger.log(
        "memoryManager",
        "Error: Creep memory or source is undefined in assignMiningPosition",
        4,
      );
      return false;
    }

    const sourceId = creepMemory.source;
    const sourceMemory = Memory.rooms[room.name].miningPositions[sourceId];
    if (!sourceMemory) return false;

    const positions = sourceMemory.positions;
    for (const key in positions) {
      const position = positions[key];
      if (position && !position.reserved) {
        position.reserved = true;
        // Ensure roomName is available for later release and Position usage
        creepMemory.miningPosition = {
          x: position.x,
          y: position.y,
          roomName: room.name,
          reserved: position.reserved,
        };
        return true;
      }
    }

    return false;
  },

  /**
   * Releases a previously reserved mining position for a creep.
   *
   * @param {Creep} creep - The creep whose mining position should be freed.
   */
  releaseMiningPosition(creep) {
    if (
      !creep ||
      !creep.memory ||
      !creep.memory.miningPosition ||
      !creep.memory.miningPosition.roomName
    ) {
      return;
    }

    const { x, y, roomName } = creep.memory.miningPosition;
    const roomMemory = Memory.rooms && Memory.rooms[roomName];
    if (!roomMemory || !roomMemory.miningPositions) return;

    for (const sourceId in roomMemory.miningPositions) {
      const source = roomMemory.miningPositions[sourceId];
      for (const key in source.positions) {
        const pos = source.positions[key];
        if (pos && pos.x === x && pos.y === y) {
          source.positions[key].reserved = false;
        }
      }
    }

    delete creep.memory.miningPosition;
  },

  /**
   * Frees a mining position without modifying creep memory.
   * Useful when preparing a replacement miner before the current
   * occupant expires.
   *
   * @param {object} pos - {x, y, roomName} position to free.
   */
  freeMiningPosition(pos) {
    if (!pos || pos.x === undefined || pos.y === undefined || !pos.roomName) {
      return;
    }
    const roomMemory = Memory.rooms && Memory.rooms[pos.roomName];
    if (!roomMemory || !roomMemory.miningPositions) return;

    for (const sourceId in roomMemory.miningPositions) {
      const source = roomMemory.miningPositions[sourceId];
      for (const key in source.positions) {
        const p = source.positions[key];
        if (p && p.x === pos.x && p.y === pos.y) {
          source.positions[key].reserved = false;
        }
      }
    }
  },

  /**
   * Ensure mining position reservations reflect currently alive creeps.
   * Iterates over all reserved spots in the room and releases any that are
   * no longer claimed by a living creep.
   *
   * @param {string} roomName - Room whose reservations should be verified.
   */
  verifyMiningReservations(roomName) {
    const roomMemory = Memory.rooms && Memory.rooms[roomName];
    if (!roomMemory || !roomMemory.miningPositions) return;

    const active = new Set();
    for (const name in Game.creeps) {
      const c = Game.creeps[name];
      if (
        c.memory &&
        c.memory.miningPosition &&
        c.memory.miningPosition.roomName === roomName
      ) {
        const pos = c.memory.miningPosition;
        active.add(`${pos.x}:${pos.y}`);
      }
    }

    for (const sourceId in roomMemory.miningPositions) {
      const source = roomMemory.miningPositions[sourceId];
      for (const key in source.positions) {
        const pos = source.positions[key];
        if (pos && pos.reserved && !active.has(`${pos.x}:${pos.y}`)) {
          source.positions[key].reserved = false;
        }
      }
    }
  },

  /**
   * Reset log count aggregation to limit memory usage.
   * Called periodically by the scheduler.
   */
  purgeConsoleLogCounts() {
    if (Memory.stats && Memory.stats.logCounts) {
      Memory.stats.logCounts = {};
    }
  },

  /**
   * Return version status for all registered schemas.
   */
  getVersionStatus() {
    const schemas = require('./memory.schemas');
    const getPath = (path) => {
      const parts = path.split('.').slice(1); // remove 'Memory'
      let obj = Memory;
      for (const p of parts) {
        if (!obj) return undefined;
        obj = obj[p];
      }
      return obj;
    };
    const report = [];
    for (const key in schemas) {
      const entry = schemas[key];
      const mem = getPath(entry.path);
      const current = mem && mem.version !== undefined ? mem.version : undefined;
      report.push({ path: entry.path, expected: entry.version, current });
    }
    return report;
  },
};

module.exports = memoryManager;
