const _ = require('lodash');
const logger = require("./logger");
const scheduler = require('./scheduler');

if (!Memory.spawnQueue) {
  Memory.spawnQueue = [];
}
// Counter to ensure unique spawn request IDs across ticks
if (Memory.nextSpawnRequestId === undefined) {
  Memory.nextSpawnRequestId = 0;
}

const DEFAULT_PRIORITY = 70;
const IMMEDIATE_THRESHOLD = 0;

const toNumber = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const getPriority = (req) => toNumber(req.priority, DEFAULT_PRIORITY);
const hasParent = (req) =>
  req.parentTaskId !== undefined && req.parentTaskId !== null;
const getTicks = (req) => (
  typeof req.ticksToSpawn === "number" && Number.isFinite(req.ticksToSpawn)
    ? req.ticksToSpawn
    : 0
);
const isImmediate = (req) => getTicks(req) <= IMMEDIATE_THRESHOLD;
const getParentTick = (req) => toNumber(req.parentTick, Number.POSITIVE_INFINITY);
const getSubOrder = (req) => toNumber(req.subOrder, Number.POSITIVE_INFINITY);
const getRequestId = (req) => (req.requestId || '');

const buildGroupPriorityMap = (requests) => {
  const map = new Map();
  for (const req of requests) {
    if (!hasParent(req)) continue;
    const priority =
      typeof req.groupPriorityHint === 'number'
        ? req.groupPriorityHint
        : getPriority(req);
    const current = map.get(req.parentTaskId);
    if (current === undefined || priority < current) {
      map.set(req.parentTaskId, priority);
    }
  }
  return map;
};

const resolveGroupPriority = (req, priorityMap) => {
  if (hasParent(req) && priorityMap.has(req.parentTaskId)) {
    return priorityMap.get(req.parentTaskId);
  }
  if (typeof req.groupPriorityHint === 'number') {
    return req.groupPriorityHint;
  }
  return getPriority(req);
};

const compareRequestsFactory = (priorityMap) => (a, b) => {
  const aImmediate = isImmediate(a);
  const bImmediate = isImmediate(b);
  if (aImmediate !== bImmediate) return aImmediate ? -1 : 1;

  const aTicks = getTicks(a);
  const bTicks = getTicks(b);
  const aGroupPriority = resolveGroupPriority(a, priorityMap);
  const bGroupPriority = resolveGroupPriority(b, priorityMap);
  const aParentTick = getParentTick(a);
  const bParentTick = getParentTick(b);
  const aPriority = getPriority(a);
  const bPriority = getPriority(b);

  if (aImmediate) {
    if (aGroupPriority !== bGroupPriority) return aGroupPriority - bGroupPriority;
    if (aParentTick !== bParentTick) return aParentTick - bParentTick;

    if (hasParent(a) && hasParent(b)) {
      if (a.parentTaskId !== b.parentTaskId) {
        return String(a.parentTaskId).localeCompare(String(b.parentTaskId));
      }
      const aSub = getSubOrder(a);
      const bSub = getSubOrder(b);
      if (aSub !== bSub) return aSub - bSub;
    }

    if (aPriority !== bPriority) return aPriority - bPriority;
    if (aTicks !== bTicks) return aTicks - bTicks;
  } else {
    if (aTicks !== bTicks) return aTicks - bTicks;
    if (aGroupPriority !== bGroupPriority) return aGroupPriority - bGroupPriority;
    if (aParentTick !== bParentTick) return aParentTick - bParentTick;

    if (hasParent(a) && hasParent(b)) {
      if (a.parentTaskId !== b.parentTaskId) {
        return String(a.parentTaskId).localeCompare(String(b.parentTaskId));
      }
      const aSub = getSubOrder(a);
      const bSub = getSubOrder(b);
      if (aSub !== bSub) return aSub - bSub;
    }

    if (aPriority !== bPriority) return aPriority - bPriority;
  }

  return getRequestId(a).localeCompare(getRequestId(b));
};

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
  addToQueue(
    category,
    room,
    bodyParts,
    memory,
    spawnId,
    ticksToSpawn = 0,
    priority = DEFAULT_PRIORITY,
    options = {},
  ) {
    // Combine current tick with an incrementing counter to avoid collisions
    const requestId = `${Game.time}-${Memory.nextSpawnRequestId++}`;
    const energyRequired = _.reduce(
      bodyParts,
      (total, part) => total + (BODYPART_COST[part] || 0),
      0,
    );

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

    const entry = {
      requestId,
      category,
      room,
      bodyParts,
      memory,
      spawnId,
      ticksToSpawn,
      energyRequired,
      priority,
      parentTaskId: options.parentTaskId || null,
      subOrder:
        options.subOrder !== undefined ? options.subOrder : Number.POSITIVE_INFINITY,
      parentTick:
        options.parentTick !== undefined ? options.parentTick : Number.POSITIVE_INFINITY,
      groupPriorityHint: priority,
    };
    this.queue.push(entry);

    if (entry.parentTaskId) {
      const members = this.queue.filter((req) => req.parentTaskId === entry.parentTaskId);
      const minPriority = Math.min(...members.map(getPriority));
      for (const member of members) {
        member.groupPriorityHint = minPriority;
      }
    }
    logger.log(
      "spawnQueue",
      `Added to spawn queue: category=${category}, room=${room}, bodyParts=${JSON.stringify(
        bodyParts,
      )}, memory=${JSON.stringify(memory)}, spawnId=${spawnId}, ticksToSpawn=${ticksToSpawn}, priority=${priority}, energyRequired=${energyRequired}`,
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
    const filtered = this.queue.filter((req) => req.spawnId === spawnId);
    if (filtered.length === 0) return null;
    const priorityMap = buildGroupPriorityMap(filtered);
    const comparator = compareRequestsFactory(priorityMap);
    filtered.sort(comparator);
    const nextSpawn = filtered[0];
    if (!nextSpawn.memory) {
      logger.log(
        "spawnQueue",
        `Warning: Memory object missing for spawn request: ${JSON.stringify(nextSpawn)}`,
        4,
      );
    }
    return nextSpawn;
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
      `Sorting queue for room ${room.name} by priority and ticksToSpawn`,
      2,
    );
    const priorityMap = buildGroupPriorityMap(this.queue);
    const comparator = compareRequestsFactory(priorityMap);
    this.queue.sort(comparator);
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

  /**
   * Remove spawn requests older than the provided age in ticks.
   * @param {number} maxAge - Maximum age to keep (default 1000).
   */
  cleanUp(maxAge = 1000) {
    const cutoff = Game.time - maxAge;
    const before = this.queue.length;
    let staleRemoved = 0;
    let orphanRemoved = 0;
    this.queue = this.queue.filter((req) => {
      const created = parseInt(req.requestId.split('-')[0], 10);
      if (created < cutoff) {
        staleRemoved += 1;
        return false;
      }
      if (
        req.spawnId &&
        typeof Game.getObjectById === 'function' &&
        !Game.getObjectById(req.spawnId)
      ) {
        orphanRemoved += 1;
        logger.log(
          'spawnQueue',
          `Removed orphaned spawn request ${req.requestId} for missing spawn ${req.spawnId}`,
          3,
        );
        return false;
      }
      return true;
    });
    const removed = before - this.queue.length;
    if (staleRemoved > 0) {
      logger.log('spawnQueue', `Pruned ${staleRemoved} stale spawn requests`, 2);
    }
    if (orphanRemoved > 0) {
      logger.log('spawnQueue', `Removed ${orphanRemoved} orphaned spawn requests`, 3);
    }
    if (removed === 0) return;
    if (removed > staleRemoved + orphanRemoved) {
      logger.log('spawnQueue', `Pruned ${removed} stale spawn requests`, 2);
    }
  },
};

module.exports = spawnQueue;

