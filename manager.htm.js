const logger = require('./logger');

const DEFAULT_TASK_TTL = 100;
// Default cooldown ticks after a task is claimed. HiveMind will not requeue the
// same task until this expires.
const DEFAULT_CLAIM_COOLDOWN = 5;

const HTM_LEVELS = {
  HIVE: 'hive',
  CLUSTER: 'cluster',
  COLONY: 'colony',
  CREEP: 'creep',
};

const htm = {
  /** Ensure the HTM memory structure exists */
  init() {
    if (!Memory.htm) {
      Memory.htm = {
        hive: { tasks: [] },
        clusters: {},
        colonies: {},
        creeps: {},
      };
    }
  },

  /**
   * Check if a given container already has a task with the name.
   * @param {string} level - Level of the task container.
   * @param {string} id - Identifier for the container.
   * @param {string} name - Task name to look for.
   * @returns {boolean} True if a task exists.
   */
  hasTask(level, id, name, manager) {
    const container = this._getContainer(level, id);
    if (!container || !container.tasks) return false;
    return container.tasks.some(
      (t) => t.name === name && (!manager || t.manager === manager),
    );
  },

  /**
   * Register a task handler for a specific level and task name.
   * Handlers can be used to execute logic when tasks are processed.
   */
  registerHandler(level, name, handler) {
    if (!this.handlers) this.handlers = {};
    if (!this.handlers[level]) this.handlers[level] = {};
    this.handlers[level][name] = handler;
  },

  /** Add a new task to the hive level */
  addHiveTask(
    name,
    data = {},
    priority = 1,
    ttl = DEFAULT_TASK_TTL,
    amount = 1,
    manager = null,
  ) {
    this._addTask(
      HTM_LEVELS.HIVE,
      'hive',
      name,
      data,
      priority,
      ttl,
      amount,
      manager,
    );
  },

  /** Add a new task to a cluster */
  addClusterTask(
    clusterId,
    name,
    data = {},
    priority = 1,
    ttl = DEFAULT_TASK_TTL,
    amount = 1,
    manager = null,
  ) {
    if (!Memory.htm.clusters[clusterId]) Memory.htm.clusters[clusterId] = { tasks: [] };
    this._addTask(
      HTM_LEVELS.CLUSTER,
      clusterId,
      name,
      data,
      priority,
      ttl,
      amount,
      manager,
    );
  },

  /** Add a new task to a colony */
  addColonyTask(
    colonyId,
    name,
    data = {},
    priority = 1,
    ttl = DEFAULT_TASK_TTL,
    amount = 1,
    manager = null,
  ) {
    if (!Memory.htm.colonies[colonyId]) Memory.htm.colonies[colonyId] = { tasks: [] };
    this._addTask(
      HTM_LEVELS.COLONY,
      colonyId,
      name,
      data,
      priority,
      ttl,
      amount,
      manager,
    );
  },

  /** Add a new task to a creep */
  addCreepTask(
    creepName,
    name,
    data = {},
    priority = 1,
    ttl = DEFAULT_TASK_TTL,
    amount = 1,
    manager = null,
  ) {
    if (!Memory.htm.creeps[creepName]) Memory.htm.creeps[creepName] = { tasks: [] };
    this._addTask(
      HTM_LEVELS.CREEP,
      creepName,
      name,
      data,
      priority,
      ttl,
      amount,
      manager,
    );
  },

  /**
   * Mark a task as claimed so HiveMind does not immediately requeue it.
   * Amount is decreased and the task removed when it reaches zero.
   *
   * @param {string} level - HTM level of the task container.
   * @param {string} id - Identifier for the container.
   * @param {string} name - Task name to claim.
   * @param {string|null} manager - Manager claiming the task.
   * @param {number} cooldown - Ticks until the task can be queued again.
   */
  claimTask(level, id, name, manager = null, cooldown = DEFAULT_CLAIM_COOLDOWN) {
    const container = this._getContainer(level, id);
    if (!container) return;
    const task = container.tasks.find(
      (t) => t.name === name && (!manager || t.manager === manager),
    );
    if (!task) return;
    task.amount -= 1;
    task.claimedUntil = Game.time + cooldown;
    if (task.amount <= 0) {
      const idx = container.tasks.indexOf(task);
      if (idx !== -1) container.tasks.splice(idx, 1);
    }
  },

  /** Main processing entry triggered by the scheduler each tick */
  run() {
    this.init();
    this._processLevel(HTM_LEVELS.HIVE, 'hive');
    for (const clusterId in Memory.htm.clusters) {
      this._processLevel(HTM_LEVELS.CLUSTER, clusterId);
    }
    for (const colonyId in Memory.htm.colonies) {
      this._processLevel(HTM_LEVELS.COLONY, colonyId);
    }
    for (const creepName in Memory.htm.creeps) {
      this._processLevel(HTM_LEVELS.CREEP, creepName);
    }
  },

  // --- Internal helpers ---

  _addTask(level, id, name, data, priority, ttl, amount = 1, manager = null) {
    const task = {
      name,
      data,
      priority,
      ttl,
      age: 0,
      amount,
      manager,
      claimedUntil: 0,
    };
    const container = this._getContainer(level, id);
    if (!this.hasTask(level, id, name, manager)) {
      container.tasks.push(task);
      logger.log('HTM', `Added ${level} task ${name} (${id})`, 2);
    }
  },

  _processLevel(level, id) {
    const container = this._getContainer(level, id);
    if (!container || !container.tasks) return;

    // Age tasks and remove expired ones
    for (let i = container.tasks.length - 1; i >= 0; i--) {
      const task = container.tasks[i];
      task.age += 1;
      if (task.age >= task.ttl) {
        container.tasks.splice(i, 1);
        logger.log('HTM', `Removed expired ${level} task ${task.name} (${id})`, 3);
        continue;
      }
      if (task.amount <= 0) {
        container.tasks.splice(i, 1);
        continue;
      }
    }

    // Sort by priority (lower value = higher priority)
    container.tasks.sort((a, b) => a.priority - b.priority);

    // Execute tasks that are not claimed
    for (const task of container.tasks) {
      if (Game.time < task.claimedUntil) continue;
      const handler = this.handlers?.[level]?.[task.name];
      if (typeof handler === 'function') {
        try {
          handler(task.data);
          logger.log('HTM', `Executed ${level} task ${task.name} (${id})`, 2);
        } catch (err) {
          logger.log('HTM', `Error executing ${task.name}: ${err}`, 4);
        }
      } else {
        logger.log('HTM', `No handler for ${level} task ${task.name}`, 3);
      }
    }
  },

  _getContainer(level, id) {
    switch (level) {
      case HTM_LEVELS.HIVE:
        return Memory.htm.hive;
      case HTM_LEVELS.CLUSTER:
        return Memory.htm.clusters[id];
      case HTM_LEVELS.COLONY:
        return Memory.htm.colonies[id];
      case HTM_LEVELS.CREEP:
        return Memory.htm.creeps[id];
      default:
        return null;
    }
  },
};

// expose constants for external modules
htm.LEVELS = HTM_LEVELS;

module.exports = htm;
