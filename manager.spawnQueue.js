const logger = require("./logger");
const scheduler = require('./scheduler');

if (!Memory.spawnQueue) {
  Memory.spawnQueue = [];
}
// Counter to ensure unique spawn request IDs across ticks
if (Memory.nextSpawnRequestId === undefined) {
  Memory.nextSpawnRequestId = 0;
}

const spawnQueue = {
  get queue() {
    if (!Memory.spawnQueue) {
      Memory.spawnQueue = [];
    }
    return Memory.spawnQueue;
  },

  set queue(value) {
    Memory.spawnQueue = value;
  },

  /**
   * Adds a spawn request to the queue.
   *
   * @param {string} category - Category of the spawn request.
   * @param {string} room - Room where the spawn is requested.
   * @param {Array} bodyParts - Array of body parts for the creep.
   * @param {object} memory - Memory object to be assigned to the creep.
   * @param {string} spawnId - ID of the spawn to handle this request.
   * @param {number} ticksToSpawn - Number of ticks to delay the spawn (default is 0).
   */
  addToQueue(category, room, bodyParts, memory, spawnId, ticksToSpawn = 0) {
    // Combine current tick with an incrementing counter to avoid collisions
    const requestId = `${Game.time}-${Memory.nextSpawnRequestId++}`;
    const energyRequired = _.sum(bodyParts, (part) => BODYPART_COST[part]);

    // Validate positional data includes roomName to avoid undefined errors later
    if (
      memory &&
      memory.miningPosition &&
      memory.miningPosition.x !== undefined &&
      !memory.miningPosition.roomName
    ) {
      logger.log(
        "spawnQueue",
        `Rejected spawn request ${requestId}: miningPosition missing roomName`,
        4,
      );
      return;
    }
    if (
      memory &&
      memory.sourcePosition &&
      memory.sourcePosition.x !== undefined &&
      !memory.sourcePosition.roomName
    ) {
      logger.log(
        "spawnQueue",
        `Rejected spawn request ${requestId}: sourcePosition missing roomName`,
        4,
      );
      return;
    }

    this.queue.push({
      requestId,
      category,
      room,
      bodyParts,
      memory,
      spawnId,
      ticksToSpawn,
      energyRequired,
    });
    logger.log(
      "spawnQueue",
      `Added to spawn queue: category=${category}, room=${room}, bodyParts=${JSON.stringify(bodyParts)}, memory=${JSON.stringify(memory)}, spawnId=${spawnId}, ticksToSpawn=${ticksToSpawn}, energyRequired=${energyRequired}`,
      2,
    );
  },

  /**
   * Retrieves the next spawn request from the queue for a specific spawn.
   *
   * @param {string} spawnId - ID of the spawn to fetch the request for.
   * @returns {object|null} - The next spawn request or null if the queue is empty.
   */
  getNextSpawn(spawnId) {
    const sortedQueue = this.queue
      .filter((req) => req.spawnId === spawnId)
      .sort((a, b) => a.ticksToSpawn - b.ticksToSpawn);
    if (sortedQueue.length > 0) {
      const nextSpawn = sortedQueue[0];
      if (!nextSpawn.memory) {
        logger.log(
          "spawnQueue",
          `Warning: Memory object missing for spawn request: ${JSON.stringify(nextSpawn)}`,
          4,
        );
      }
      return nextSpawn;
    }
    return null;
  },

  /**
   * Removes a spawn request from the queue based on its unique identifier.
   *
   * @param {number} requestId - The unique identifier of the spawn request to remove.
   * @returns {object|null} - The removed spawn request or null if not found.
   */
  removeSpawnFromQueue(requestId) {
    const index = this.queue.findIndex((req) => req.requestId === requestId);
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
      logger.log(
        "spawnQueue",
        `Removed from spawn queue: ${JSON.stringify(removed)}`,
        2,
      );
      return removed;
    }
    return null;
  },

  /**
   * Remove all queued spawns for a specific room.
   * Used in panic situations when the colony needs to bootstrap.
   *
   * @param {string} roomName - Room to purge from the queue.
   * @returns {number} Amount of removed requests.
   */
  clearRoom(roomName) {
    const before = this.queue.length;
    this.queue = this.queue.filter((req) => req.room !== roomName);
    const removed = before - this.queue.length;
    if (removed > 0) {
      logger.log(
        "spawnQueue",
        `Cleared ${removed} queued spawn(s) for room ${roomName}`,
        2,
      );
    }
    return removed;
  },

  /**
   * Sorts the queue based on `ticksToSpawn` so earlier requests run first.
   * Future implementations may modify `ticksToSpawn` to reprioritize.
   *
   * @param {Room} room - The room whose queue is being sorted.
   */
  adjustPriorities(room) {
    logger.log(
      "spawnQueue",
      `Sorting queue for room ${room.name} by ticksToSpawn`,
      2,
    );
    // Future logic could adjust ticksToSpawn here
    this.queue.sort((a, b) => a.ticksToSpawn - b.ticksToSpawn);
  },

  /**
   * Processes the spawn queue for a given spawn structure.
   * Attempts to spawn the next creep in the queue if enough energy is available.
   *
   * @param {StructureSpawn} spawn - The spawn to process the queue for.
   */
  processQueue(spawn) {
    if (!spawn.spawning) {
      const nextSpawn = this.getNextSpawn(spawn.id);
      if (nextSpawn && spawn.room.energyAvailable >= nextSpawn.energyRequired) {
        const { category, bodyParts, memory, requestId } = nextSpawn;
        const newName = `${category}_${Game.time}`;
        logger.log(
          "spawnQueue",
          `Attempting to spawn ${newName} with body parts: ${JSON.stringify(bodyParts)}`,
          3,
        );
        const result = spawn.spawnCreep(bodyParts, newName, { memory });
        if (result === OK) {
          logger.log("spawnQueue", `Spawning new ${category}: ${newName}` , 3);
          this.removeSpawnFromQueue(requestId);
          scheduler.triggerEvent('roleUpdate', { room: spawn.room.name });
          require("manager.demand").evaluateRoomNeeds(spawn.room); // Reevaluate room needs after each spawn
        } else {
          logger.log("spawnQueue", `Failed to spawn ${category}: ${result}` , 4);
        }
      }
    }
  },
};

module.exports = spawnQueue;
