/**
 * Hierarchical Memory Manager (HMM)
 * =================================
 *
 * The hive uses a fixed, multi-level schema to store all persistent data.
 * Keeping the layout uniform helps debugging and allows easy extension.
 *
 * Memory.hive = {
 *   version: 1,                       // schema version
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

const statsConsole = require("console.console");

const HIVE_MEMORY_VERSION = 1;

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
  initializeRoomMemory(room) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room.name]) {
      Memory.rooms[room.name] = {
        miningPositions: {},
        reservedPositions: {},
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
   */
  initializeHiveMemory(clusterId, colonyId) {
    if (!Memory.hive) {
      Memory.hive = {
        version: HIVE_MEMORY_VERSION,
        clusters: {},
      };
    } else if (Memory.hive.version !== HIVE_MEMORY_VERSION) {
      // Upgrade logic could be added here when versions change
      Memory.hive.version = HIVE_MEMORY_VERSION;
    }

    if (!Memory.hive.clusters[clusterId]) {
      Memory.hive.clusters[clusterId] = {
        ...DEFAULT_CLUSTER_MEMORY,
        colonies: {},
      };
    }

    if (!Memory.hive.clusters[clusterId].colonies[colonyId]) {
      Memory.hive.clusters[clusterId].colonies[colonyId] = {
        ...DEFAULT_COLONY_MEMORY,
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
   * Assigns an available mining position to a creep.
   *
   * @param {Object} creepMemory - The creep's memory object.
   * @param {Room} room         - Room containing the mining positions.
   * @returns {boolean} True if a position was assigned.
   */
  assignMiningPosition(creepMemory, room) {
    if (!creepMemory || !creepMemory.source) {
      statsConsole.log(
        "Error: Creep memory or source is undefined in assignMiningPosition",
        3,
        { module: 'memoryManager', room: room.name },
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
        creepMemory.miningPosition = position;
        return true;
      }
    }

    return false;
  },
};

module.exports = memoryManager;
