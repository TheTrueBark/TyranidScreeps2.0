const logger = require('./logger');

const DEFAULT_TASK_TTL = 100;
// Default cooldown ticks after a task is claimed. HiveMind waits this many
// ticks plus the manager provided estimate before re-queuing the same task.
const DEFAULT_CLAIM_COOLDOWN = 15;

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
   * Check if a task with matching coordinates exists.
   * Used to prevent duplicate BUILD_LAYOUT_PART requests.
   *
   * @param {string} level
   * @param {string} id
   * @param {string} name
   * @param {{x:number,y:number,structureType:string}} data
   * @returns {boolean}
   */
  taskExistsAt(level, id, name, data) {
    const container = this._getContainer(level, id);
    if (!container || !container.tasks) return false;
    return container.tasks.some(
      (t) =>
        t.name === name &&
        t.data &&
        t.data.x === data.x &&
        t.data.y === data.y &&
        t.data.structureType === data.structureType,
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

  /**
   * Queue a task on the global hive layer.
   *
   * @param {string} name - Task name.
   * @param {Object} [data] - Custom data for the handler.
   * @param {number} [priority=1] - Lower values execute first.
   * @param {number} [ttl=DEFAULT_TASK_TTL] - Expiration in ticks.
   * @param {number} [amount=1] - How many times the task should run.
   * @param {string|null} [manager=null] - Owning manager module.
   * @param {object} [origin] - Metadata about who created the task.
   * @codex-owner htm
   * @codex-path Memory.htm.hive.tasks
   */
  addHiveTask(
    name,
    data = {},
    priority = 1,
    ttl = DEFAULT_TASK_TTL,
    amount = 1,
    manager = null,
    origin = {},
    options = {},
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
      origin,
      options,
    );
  },

  /**
   * Queue a task for a cluster.
   * @param {string} clusterId - Cluster identifier.
   * @param {string} name - Task name.
   * @param {Object} [data] - Custom task data.
   * @param {number} [priority=1] - Lower values execute first.
   * @param {number} [ttl=DEFAULT_TASK_TTL] - Expiration in ticks.
   * @param {number} [amount=1] - How many times the task should run.
   * @param {string|null} [manager=null] - Owning manager module.
   * @codex-owner htm
   * @codex-path Memory.htm.clusters
   */
  addClusterTask(
    clusterId,
    name,
    data = {},
    priority = 1,
    ttl = DEFAULT_TASK_TTL,
    amount = 1,
    manager = null,
    origin = {},
    options = {},
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
      origin,
      options,
    );
  },

  /**
   * Queue a task for a specific colony.
   *
   * @param {string} colonyId - Target colony identifier.
   * @param {string} name - Task name.
   * @param {Object} [data] - Custom task data.
   * @param {number} [priority=1] - Lower values execute first.
   * @param {number} [ttl=DEFAULT_TASK_TTL] - Expiration in ticks.
   * @param {number} [amount=1] - How many times the task should run.
   * @param {string|null} [manager=null] - Owning manager module.
   * @codex-owner htm
   * @codex-path Memory.htm.colonies
   */
  addColonyTask(
    colonyId,
    name,
    data = {},
    priority = 1,
    ttl = DEFAULT_TASK_TTL,
    amount = 1,
    manager = null,
    origin = {},
    options = {},
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
      origin,
      options,
    );
  },

  /**
   * Queue a task directly on a creep memory container.
   *
   * @param {string} creepName - Target creep name.
   * @param {string} name - Task name.
   * @param {Object} [data] - Custom task data.
   * @param {number} [priority=1] - Lower values execute first.
   * @param {number} [ttl=DEFAULT_TASK_TTL] - Expiration in ticks.
   * @param {number} [amount=1] - How many times the task should run.
   * @param {string|null} [manager=null] - Owning manager module.
   * @codex-owner htm
   * @codex-path Memory.htm.creeps
   */
  addCreepTask(
    creepName,
    name,
    data = {},
    priority = 1,
    ttl = DEFAULT_TASK_TTL,
    amount = 1,
    manager = null,
    origin = {},
    options = {},
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
      origin,
      options,
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
   * @param {number} cooldown - Base cooldown before HiveMind may requeue.
   * @param {number} expectedTicks - Additional ticks estimated by the manager
   *   before the task can be attempted again (e.g. spawn time).
   */
  claimTask(
    level,
    id,
    name,
    manager = null,
    cooldown = DEFAULT_CLAIM_COOLDOWN,
    expectedTicks = 0,
  ) {
    const container = this._getContainer(level, id);
    if (!container) return;
    const task = container.tasks.find(
      (t) => t.name === name && (!manager || t.manager === manager),
    );
    if (!task) return;
    task.amount -= 1;
    task.claimedUntil = Game.time + cooldown + expectedTicks;
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

  /**
   * Remove creep containers that no longer correspond to living creeps.
   * Prevents uncontrolled growth of Memory.htm.creeps.
   */
  cleanupDeadCreeps() {
    if (!Memory.htm || !Memory.htm.creeps) return;
    for (const name in Memory.htm.creeps) {
      if (!Game.creeps[name]) delete Memory.htm.creeps[name];
    }
  },

  /**
   * Return a flat list of all active tasks for introspection.
   */
  listTasks() {
    this.init();
    const tasks = [];
    const pushFrom = (level, id, container) => {
      if (!container || !container.tasks) return;
      for (const t of container.tasks) {
        tasks.push({
          level,
          id,
          name: t.name,
          ttl: t.ttl,
          age: t.age,
          manager: t.manager,
          origin: t.origin,
          claimedUntil: t.claimedUntil,
          id: t.id,
        });
      }
    };
    pushFrom(HTM_LEVELS.HIVE, 'hive', Memory.htm.hive);
    for (const cid in Memory.htm.clusters) {
      pushFrom(HTM_LEVELS.CLUSTER, cid, Memory.htm.clusters[cid]);
    }
    for (const cid in Memory.htm.colonies) {
      pushFrom(HTM_LEVELS.COLONY, cid, Memory.htm.colonies[cid]);
    }
    for (const cname in Memory.htm.creeps) {
      pushFrom(HTM_LEVELS.CREEP, cname, Memory.htm.creeps[cname]);
    }
    return tasks;
  },

  // --- Internal helpers ---

  _addTask(
    level,
    id,
    name,
    data,
    priority,
    ttl,
    amount = 1,
    manager = null,
    origin = {},
    options = {},
  ) {
    const task = {
      id: `${Game.time}-${Math.floor(Math.random() * 10000)}`,
      name,
      data,
      priority,
      ttl,
      age: 0,
      amount,
      manager,
      claimedUntil: 0,
      origin: {
        module: origin.module || manager || 'unknown',
        createdBy: origin.createdBy || 'unknown',
        tickCreated: origin.tickCreated || Game.time,
      },
      parentTaskId: options.parentTaskId || null,
      subtaskIds: options.subtaskIds || [],
      subOrder: options.subOrder !== undefined ? options.subOrder : null,
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
      let handler = null;
      if (this.handlers && this.handlers[level]) {
        handler = this.handlers[level][task.name];
      }
      const start = Game.cpu.getUsed();
      if (typeof handler === 'function') {
        try {
          handler(task.data);
          logger.log('HTM', `Executed ${level} task ${task.name} (${id})`, 2);
          this._logExecution(task, level, id, Game.cpu.getUsed() - start, 'ok');
        } catch (err) {
          logger.log('HTM', `Error executing ${task.name}: ${err}`, 4);
          this._logExecution(task, level, id, Game.cpu.getUsed() - start, 'err', err.toString());
        }
      } else {
        logger.log('HTM', `No handler for ${level} task ${task.name}`, 3);
        this._logExecution(task, level, id, Game.cpu.getUsed() - start, 'missing');
      }
    }
  },

  _logExecution(task, level, id, cpu, result, reason = '') {
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.taskLogs) Memory.stats.taskLogs = [];
    Memory.stats.taskLogs.push({
      tick: Game.time,
      level,
      id,
      name: task.name,
      result,
      cpu: Math.round(cpu * 100) / 100,
      reason,
    });
    const limit = 20;
    if (Memory.stats.taskLogs.length > limit) Memory.stats.taskLogs.shift();
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
htm.DEFAULT_CLAIM_COOLDOWN = DEFAULT_CLAIM_COOLDOWN;

module.exports = htm;
