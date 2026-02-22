const _ = require('lodash');
const logger = require("./logger");
const scheduler = require('./scheduler');
const incidentDebug = require('./debug.incident');

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
const isReplacement = (req) => Boolean(req && req.isReplacement);

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
  const aReplacement = isReplacement(a);
  const bReplacement = isReplacement(b);

  if (aImmediate) {
    if (aReplacement !== bReplacement) return aReplacement ? -1 : 1;
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
    if (aReplacement !== bReplacement) return aReplacement ? -1 : 1;
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
      ignoreRestriction: Boolean(options.ignoreRestriction),
      isReplacement: Boolean(options.isReplacement),
      replacementFor: options.replacementFor || null,
      spawnReason: options.spawnReason || null,
      dedupeKey: options.dedupeKey || null,
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
    if (
      Memory.rooms &&
      Memory.rooms[room.name] &&
      Memory.rooms[room.name].spawnLimits
    ) {
      const spawnLimits = Memory.rooms[room.name].spawnLimits;
      const haulerCap =
        typeof spawnLimits.maxHaulers === 'number'
          ? spawnLimits.maxHaulers
          : spawnLimits.haulers;
      const replacementAllowance =
        typeof spawnLimits.haulerReplacementAllowance === 'number'
          ? Math.max(0, Math.floor(spawnLimits.haulerReplacementAllowance))
          : 0;
      const liveHaulers = Object.values(Game.creeps || {}).filter(
        (creep) =>
          creep &&
          creep.memory &&
          creep.memory.role === 'hauler' &&
          creep.room &&
          creep.room.name === room.name,
      ).length;
      if (typeof haulerCap === 'number' && Number.isFinite(haulerCap)) {
        this.dedupeRole(room.name, 'hauler');
        this.pruneRole(room.name, 'hauler', haulerCap, {
          liveCount: liveHaulers,
          allowedReplacementCount: replacementAllowance,
        });
      }
    }
    this.queue = this.getOrderedQueue(this.queue);
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
          if (result !== ERR_NOT_ENOUGH_ENERGY) {
            incidentDebug.captureAuto('spawn-failure', {
              requestId,
              category,
              spawn: spawn.name,
              room: spawn.room && spawn.room.name,
              code: result,
            }, {
              minInterval: 20,
              windowTicks: Memory.settings && Memory.settings.incidentLogWindow,
            });
          }
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

  /**
   * Trim queued requests for a role in a specific room so that the number of
   * pending spawns aligns with the provided limit once alive creeps (and
   * optionally delayed requests) are considered.
   *
   * @param {string} roomName Room to evaluate.
   * @param {string} role Role/category to prune (matches queue.category or memory.role).
   * @param {number} limit Maximum combined alive + queued creeps for the role.
   * @param {object} options Optional configuration.
   * @param {number} [options.liveCount=0] Number of living creeps already filling the role.
   * @param {boolean} [options.respectDelayed=true] Whether to keep requests with ticksToSpawn > 0.
   * @returns {number} Amount of requests removed.
   */
  pruneRole(roomName, role, limit, options = {}) {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) return 0;
    const {
      liveCount = 0,
      respectDelayed = true,
      allowedReplacementCount = 0,
    } = options;
    const relevant = this.queue.filter(
      (req) =>
        req.room === roomName &&
        (req.category === role ||
          (req.memory && req.memory.role === role)),
    );
    if (relevant.length === 0) return 0;

    let delayedCount = 0;
    const immediateRegular = [];
    const immediateReplacement = [];
    for (const req of relevant) {
      if (req.ignoreRestriction) continue;
      const delay =
        typeof req.ticksToSpawn === 'number' ? req.ticksToSpawn : 0;
      if (respectDelayed && delay > 0) delayedCount += 1;
      else if (isReplacement(req)) immediateReplacement.push(req);
      else immediateRegular.push(req);
    }

    const allowedRegular = Math.max(
      0,
      Math.floor(limit) - liveCount - delayedCount,
    );
    const allowedReplacement = Math.max(0, Math.floor(allowedReplacementCount));
    const overage =
      Math.max(0, immediateRegular.length - allowedRegular) +
      Math.max(0, immediateReplacement.length - allowedReplacement);
    if (overage === 0) return 0;

    const immediate = [...immediateRegular, ...immediateReplacement];
    const priorityMap = buildGroupPriorityMap(immediate);
    const comparator = compareRequestsFactory(priorityMap);
    const ordered = immediate.slice().sort(comparator);

    let removed = 0;
    let regularToRemove = Math.max(0, immediateRegular.length - allowedRegular);
    let replacementToRemove = Math.max(
      0,
      immediateReplacement.length - allowedReplacement,
    );
    for (let i = ordered.length - 1; i >= 0 && removed < overage; i--) {
      const req = ordered[i];
      if (isReplacement(req) && replacementToRemove <= 0) continue;
      if (!isReplacement(req) && regularToRemove <= 0) continue;
      const index = this.queue.indexOf(req);
      if (index !== -1) {
        this.queue.splice(index, 1);
        if (isReplacement(req)) replacementToRemove -= 1;
        else regularToRemove -= 1;
        removed += 1;
      }
    }

    if (removed > 0) {
      logger.log(
        'spawnQueue',
        `Trimmed ${removed} ${role} request(s) for ${roomName} to satisfy cap ${limit}`,
        2,
      );
    }
    return removed;
  },

  /**
   * Remove duplicate queued requests for a role in a room using a stable signature
   * (dedupeKey, replacement group, parent task, assignment route).
   * Keeps the highest-priority request per signature.
   */
  dedupeRole(roomName, role) {
    const relevant = this.queue.filter(
      (req) =>
        req.room === roomName &&
        (req.category === role || (req.memory && req.memory.role === role)),
    );
    if (relevant.length <= 1) return 0;

    const signatureOf = (req) => {
      if (req.dedupeKey) return `key:${req.dedupeKey}`;
      if (req.isReplacement && req.parentTaskId) return `repl-parent:${req.parentTaskId}`;
      if (req.isReplacement && req.replacementFor) return `repl-creep:${req.replacementFor}`;
      if (
        req.memory &&
        req.memory.assignment &&
        req.memory.assignment.routeId
      ) {
        const prefix = req.isReplacement ? 'repl-route' : 'route';
        return `${prefix}:${req.memory.assignment.routeId}`;
      }
      if (req.parentTaskId) return `parent:${req.parentTaskId}:${role}`;
      return null;
    };

    const groups = new Map();
    for (const req of relevant) {
      const signature = signatureOf(req);
      if (!signature) continue;
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push(req);
    }

    let removed = 0;
    for (const [, items] of groups.entries()) {
      if (items.length <= 1) continue;
      const priorityMap = buildGroupPriorityMap(items);
      const comparator = compareRequestsFactory(priorityMap);
      const ordered = items.slice().sort(comparator);
      for (let i = 1; i < ordered.length; i++) {
        const idx = this.queue.indexOf(ordered[i]);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          removed += 1;
        }
      }
    }

    if (removed > 0) {
      logger.log(
        'spawnQueue',
        `Deduped ${removed} ${role} request(s) in ${roomName}`,
        2,
      );
      if (removed >= 5) {
        incidentDebug.captureAuto(
          'spawn-queue-hauler-spam',
          { room: roomName, role, removed },
          {
            minInterval: 50,
            windowTicks: Memory.settings && Memory.settings.incidentLogWindow,
          },
        );
      }
    }
    return removed;
  },

  /**
   * Remove replacement queue entries linked to a specific living creep.
   * Useful when a renew succeeded and the replacement is no longer needed.
   *
   * @param {string} roomName
   * @param {string} role
   * @param {object} creep
   * @returns {number}
   */
  removeReplacementForCreep(roomName, role, creep) {
    if (!creep || !creep.name) return 0;
    const routeId =
      creep.memory &&
      creep.memory.assignment &&
      creep.memory.assignment.routeId
        ? creep.memory.assignment.routeId
        : null;
    const parentKey = routeId ? `haulerReplacement:${roomName}:${routeId}` : null;
    const before = this.queue.length;
    this.queue = this.queue.filter((req) => {
      if (
        req.room !== roomName ||
        (req.category !== role && (!req.memory || req.memory.role !== role))
      ) {
        return true;
      }
      if (!req.isReplacement) return true;
      if (req.replacementFor && req.replacementFor === creep.name) return false;
      if (req.memory && req.memory.originCreep === creep.name) return false;
      if (parentKey && req.parentTaskId === parentKey) return false;
      return true;
    });
    const removed = before - this.queue.length;
    if (removed > 0) {
      logger.log(
        'spawnQueue',
        `Removed ${removed} replacement ${role} request(s) after renew for ${creep.name}`,
        2,
      );
    }
    return removed;
  },

  /**
   * Return a sorted copy of the provided requests using the queue comparator.
   * @param {Array<object>} requests
   * @returns {Array<object>} sorted requests
   */
  getOrderedQueue(requests = []) {
    const list = Array.isArray(requests) ? [...requests] : [];
    if (list.length === 0) return list;
    const priorityMap = buildGroupPriorityMap(list);
    const comparator = compareRequestsFactory(priorityMap);
    return list.sort(comparator);
  },
};

module.exports = spawnQueue;
