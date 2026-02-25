const logger = require('./logger');
const incidentDebug = require('./debug.incident');
const { DomainQueueScheduler } = require('./scheduler.domainQueues');

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

let htmQueueScheduler = new DomainQueueScheduler();

function inferTaskDomain(name) {
  const upper = String(name || '').toUpperCase();
  if (upper.indexOf('DEFEND') !== -1 || upper.indexOf('HOSTILE') !== -1) return 'combat';
  if (upper.indexOf('SPAWN') !== -1 || upper.indexOf('ENERGY') !== -1 || upper.indexOf('DELIVER') !== -1) return 'econ';
  if (upper.indexOf('HAUL') !== -1 || upper.indexOf('LOGISTIC') !== -1) return 'logistics';
  if (upper.indexOf('BUILD') !== -1 || upper.indexOf('REPAIR') !== -1) return 'build';
  if (upper.indexOf('SCOUT') !== -1 || upper.indexOf('REMOTE') !== -1 || upper.indexOf('RESERVE') !== -1) return 'scout';
  if (upper.indexOf('PLAN') !== -1 || upper.indexOf('INTENT_PLAN_PHASE_') !== -1) return 'planner';
  return 'misc';
}

function inferPipelineBucket(domain, name) {
  const upper = String(name || '').toUpperCase();
  if (domain === 'combat') return 'critical';
  if (upper.indexOf('INTENT_PLAN_PHASE_') === 0 || upper.indexOf('PLAN_LAYOUT') === 0) return 'burstOnly';
  if (domain === 'planner') return 'background';
  return 'realtime';
}

function inferCostEst(domain, name) {
  const upper = String(name || '').toUpperCase();
  if (domain === 'planner' || upper.indexOf('INTENT_PLAN_PHASE_') === 0) return 'high';
  if (domain === 'build' || domain === 'scout') return 'medium';
  return 'low';
}

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

  _humanizeTaskName(name) {
    return String(name || 'Task')
      .replace(/^INTENT_/, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\w/, (match) => match.toUpperCase());
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
   * @param {object} options - Optional claim filters.
   * @param {string|null} options.taskId - Exact task id to claim.
   */
  claimTask(
    level,
    id,
    name,
    manager = null,
    cooldown = DEFAULT_CLAIM_COOLDOWN,
    expectedTicks = 0,
    options = {},
  ) {
    const container = this._getContainer(level, id);
    if (!container) return;
    const task = container.tasks.find((t) => {
      if (options.taskId && t.id !== options.taskId) return false;
      return t.name === name && (!manager || t.manager === manager);
    });
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
   * Tick-model aware HTM execution.
   * Tasks are enqueued into domain queues and executed with budget gates.
   */
  runScheduled(options = {}) {
    this.init();
    htmQueueScheduler.startTick(Game.time);
    this._enqueueLevelTasks(HTM_LEVELS.HIVE, 'hive');
    for (const clusterId in Memory.htm.clusters) {
      this._enqueueLevelTasks(HTM_LEVELS.CLUSTER, clusterId);
    }
    for (const colonyId in Memory.htm.colonies) {
      this._enqueueLevelTasks(HTM_LEVELS.COLONY, colonyId);
    }
    for (const creepName in Memory.htm.creeps) {
      this._enqueueLevelTasks(HTM_LEVELS.CREEP, creepName);
    }

    const mode = String(options.mode || 'NORMAL').toUpperCase();
    const allowedPipelines = Array.isArray(options.allowedPipelines) && options.allowedPipelines.length
      ? options.allowedPipelines.slice()
      : mode === 'LOW_BUCKET'
        ? ['critical', 'realtime']
        : mode === 'BURST'
          ? ['critical', 'realtime', 'background', 'burstOnly']
          : ['critical', 'realtime', 'background'];
    const startCpu = Game.cpu.getUsed();
    const softBudget =
      typeof options.softBudget === 'number' && options.softBudget > 0
        ? options.softBudget
        : Game.cpu.tickLimit;
    const reserve = Math.max(0, Number(options.reserveCpu || 1.5));
    const budget = Math.max(0, softBudget - startCpu - reserve);
    const result = htmQueueScheduler.runPhase(
      'htm-execution',
      budget,
      (queueTask) => this._executeScheduledTask(queueTask),
      { pipelines: allowedPipelines },
    );
    const stats = htmQueueScheduler.getStats();
    const compactStats = {
      push: Number(stats.push || 0),
      pop: Number(stats.pop || 0),
      executed: Number(stats.executed || 0),
      staleDrops: Number(stats.staleDrops || 0),
      blockedSkips: Number(stats.blockedSkips || 0),
      avgCostEst: Number(stats.avgCostEst || 0),
      costEst: stats.costEst || { low: 0, medium: 0, high: 0, total: 0 },
    };
    if (options && options.includeQueueSizes === true) {
      compactStats.queueSizes = stats.queueSizes || {};
    }
    return {
      executed: Number(result.executed || 0),
      cpu: Number((Game.cpu.getUsed() - startCpu).toFixed(4)),
      budget: Number(budget.toFixed(4)),
      pipelines: allowedPipelines,
      schedulerStats: compactStats,
    };
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

  _forEachContainer(callback) {
    this.init();
    callback(HTM_LEVELS.HIVE, 'hive', Memory.htm.hive);
    for (const cid in Memory.htm.clusters) {
      callback(HTM_LEVELS.CLUSTER, cid, Memory.htm.clusters[cid]);
    }
    for (const cid in Memory.htm.colonies) {
      callback(HTM_LEVELS.COLONY, cid, Memory.htm.colonies[cid]);
    }
    for (const cname in Memory.htm.creeps) {
      callback(HTM_LEVELS.CREEP, cname, Memory.htm.creeps[cname]);
    }
  },

  getRunnableSummary() {
    const summary = {
      totalActive: 0,
      totalRunnable: 0,
      runnableByPipeline: {
        critical: 0,
        realtime: 0,
        background: 0,
        burstOnly: 0,
      },
    };
    this._forEachContainer((level, id, container) => {
      if (!container || !Array.isArray(container.tasks)) return;
      for (const task of container.tasks) {
        if (!task || Number(task.amount || 0) <= 0) continue;
        summary.totalActive += 1;
        if (typeof task.validUntil === 'number' && task.validUntil > 0 && Game.time > task.validUntil) continue;
        if (task.cooldownUntil && Game.time < Number(task.cooldownUntil || 0)) continue;
        if (task.claimedUntil && Game.time < Number(task.claimedUntil || 0)) continue;
        summary.totalRunnable += 1;
        const pipeline = String(task.pipelineBucket || inferPipelineBucket(task.domain, task.name) || 'realtime');
        if (summary.runnableByPipeline[pipeline] === undefined) summary.runnableByPipeline[pipeline] = 0;
        summary.runnableByPipeline[pipeline] += 1;
      }
    });
    return summary;
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
    const domain = inferTaskDomain(name);
    const pipelineBucket = inferPipelineBucket(domain, name);
    const costEst = inferCostEst(domain, name);
    const priorityBase = Number(priority || 0);
    const priorityDyn =
      options && typeof options.priorityDyn === 'number' ? options.priorityDyn : 0;
    const task = {
      id: `${Game.time}-${Math.floor(Math.random() * 10000)}`, // legacy field
      taskId: `${Game.time}-${Math.floor(Math.random() * 10000)}`,
      name,
      type: String(name || 'UNKNOWN'),
      domain,
      pipelineBucket,
      ownerId: String(id || ''),
      roomName:
        level === HTM_LEVELS.COLONY || level === HTM_LEVELS.CLUSTER
          ? String(id || '')
          : options.roomName || null,
      data,
      priority,
      priorityBase,
      priorityDyn,
      priorityBand:
        options && typeof options.priorityBand === 'number'
          ? Math.max(0, Math.min(3, Math.floor(options.priorityBand)))
          : Math.max(0, Math.min(3, Math.floor(priorityBase))),
      deadlineTick:
        options && typeof options.deadlineTick === 'number'
          ? Math.floor(options.deadlineTick)
          : null,
      costEst,
      ttl,
      age: 0,
      amount,
      manager,
      claimedUntil: 0,
      cooldownUntil:
        options && typeof options.cooldownUntil === 'number'
          ? Math.floor(options.cooldownUntil)
          : 0,
      validUntil:
        options && typeof options.validUntil === 'number'
          ? Math.floor(options.validUntil)
          : Game.time + Math.max(1, ttl),
      maxAssignees:
        options && typeof options.maxAssignees === 'number'
          ? Math.max(1, Math.floor(options.maxAssignees))
          : 1,
      assigned: [],
      state: 'NEW',
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
    const duplicateAllowed = Boolean(options && options.allowDuplicate);
    if (duplicateAllowed || !this.hasTask(level, id, name, manager)) {
      container.tasks.push(task);
      logger.log('HTM', `Added ${level} task ${name} (${id})`, 2);
    }
  },

  _ageAndPruneContainerTasks(level, id, container) {
    if (!container || !container.tasks) return;
    for (let i = container.tasks.length - 1; i >= 0; i--) {
      const task = container.tasks[i];
      task.age = Number(task.age || 0) + 1;
      if (!task.state) task.state = 'NEW';
      if (task.age >= task.ttl) {
        task.state = 'STALE';
        container.tasks.splice(i, 1);
        logger.log('HTM', `Removed expired ${level} task ${task.name} (${id})`, 3);
        continue;
      }
      if (typeof task.validUntil === 'number' && task.validUntil > 0 && Game.time > task.validUntil) {
        task.state = 'STALE';
        container.tasks.splice(i, 1);
        continue;
      }
      if (task.amount <= 0) {
        task.state = 'DONE';
        container.tasks.splice(i, 1);
      }
    }
  },

  _enqueueLevelTasks(level, id) {
    const container = this._getContainer(level, id);
    if (!container || !container.tasks || container.tasks.length === 0) return;
    this._ageAndPruneContainerTasks(level, id, container);
    for (const task of container.tasks) {
      const taskId = String(task.taskId || task.id || `${task.name}:${id}`);
      task.taskId = taskId;
      htmQueueScheduler.enqueue({
        taskId,
        level,
        containerId: id,
        type: String(task.type || task.name || 'UNKNOWN'),
        name: String(task.name || 'UNKNOWN'),
        domain: task.domain || inferTaskDomain(task.name),
        pipeline: task.pipelineBucket || inferPipelineBucket(task.domain, task.name),
        priorityBand:
          typeof task.priorityBand === 'number'
            ? Math.max(0, Math.min(3, Math.floor(task.priorityBand)))
            : Math.max(0, Math.min(3, Math.floor(Number(task.priorityBase || task.priority || 0)))),
        priorityBase: Number(task.priorityBase || task.priority || 0),
        priorityDyn: Number(task.priorityDyn || 0),
        deadlineTick:
          typeof task.deadlineTick === 'number' ? Math.floor(task.deadlineTick) : undefined,
        costEst: task.costEst || inferCostEst(task.domain, task.name),
        cooldownUntil: Number(task.cooldownUntil || 0),
        validUntil: Number(task.validUntil || 0),
      });
    }
  },

  _executeScheduledTask(queueTask) {
    if (!queueTask) return { invalidate: true };
    const level = queueTask.level;
    const id = queueTask.containerId;
    const container = this._getContainer(level, id);
    if (!container || !container.tasks || !container.tasks.length) {
      return { invalidate: true };
    }
    const task = container.tasks.find(
      (entry) => String(entry.taskId || entry.id) === String(queueTask.taskId),
    );
    if (!task) return { invalidate: true };
    if (typeof task.validUntil === 'number' && task.validUntil > 0 && Game.time > task.validUntil) {
      task.state = 'STALE';
      task.amount = 0;
      task.cooldownUntil = 0;
      this._logExecution(task, level, id, 0, 'stale', 'stale-blocked-timeout');
      return { invalidate: true };
    }
    if (task.cooldownUntil && Game.time < task.cooldownUntil) return { deferUntil: task.cooldownUntil };
    if (Game.time < Number(task.claimedUntil || 0)) return { deferUntil: Number(task.claimedUntil || 0) };
    const out = this._runTaskHandler(task, level, id);
    if (out === 'invalidate') return { invalidate: true };
    if (task.cooldownUntil && task.cooldownUntil > Game.time) return { deferUntil: task.cooldownUntil };
    return {};
  },

  _runTaskHandler(task, level, id) {
    task.state = 'READY';
    let handler = null;
    if (this.handlers && this.handlers[level]) {
      handler = this.handlers[level][task.name];
    }
    const start = Game.cpu.getUsed();
    if (typeof handler === 'function') {
      try {
        task.state = 'RUNNING';
        const handlerResult = handler(task.data, task) || null;
        if (handlerResult && typeof handlerResult.deferTicks === 'number' && handlerResult.deferTicks > 0) {
          task.claimedUntil = Game.time + Math.max(1, Math.floor(handlerResult.deferTicks));
          task.cooldownUntil = task.claimedUntil;
          task.state = 'BLOCKED';
        }
        if (handlerResult && handlerResult.complete === true) {
          task.amount = 0;
          task.state = 'DONE';
        } else if (task.state !== 'BLOCKED') {
          task.state = 'READY';
        }
        logger.log('HTM', `Executed ${level} task ${task.name} (${id})`, 2);
        this._logExecution(task, level, id, Game.cpu.getUsed() - start, 'ok');
      } catch (err) {
        task.state = 'FAILED';
        task.cooldownUntil = Game.time + 2;
        logger.log('HTM', `Error executing ${task.name}: ${err}`, 4);
        this._logExecution(task, level, id, Game.cpu.getUsed() - start, 'err', err.toString());
        incidentDebug.captureAuto('htm-task-error', {
          level,
          containerId: id,
          taskName: task.name,
          manager: task.manager || null,
          reason: err && err.toString ? err.toString() : String(err),
        }, {
          minInterval: 25,
          windowTicks: Memory.settings && Memory.settings.incidentLogWindow,
        });
      }
      return 'handled';
    }
    task.state = 'STALE';
    task.amount = 0;
    logger.log('HTM', `No handler for ${level} task ${task.name}`, 3);
    this._logExecution(task, level, id, Game.cpu.getUsed() - start, 'missing');
    return 'invalidate';
  },

  _processLevel(level, id) {
    const container = this._getContainer(level, id);
    if (!container || !container.tasks) return;

    this._ageAndPruneContainerTasks(level, id, container);

    // Sort by priority (lower value = higher priority) only when needed.
    if (container.tasks.length > 1) {
      container.tasks.sort((a, b) => a.priority - b.priority);
    }

    // Execute tasks that are not claimed
    for (const task of container.tasks) {
      if (task.cooldownUntil && Game.time < task.cooldownUntil) continue;
      if (Game.time < task.claimedUntil) continue;
      this._runTaskHandler(task, level, id);
    }
  },

  _logExecution(task, level, id, cpu, result, reason = '') {
    if (Memory.settings && Memory.settings.enableTaskProfiling === false) return;
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.taskLogs) Memory.stats.taskLogs = [];
    const humanTaskName = this._humanizeTaskName(task && task.name);
    const profileName = `HTM::HTM Tasks (Middle)::${humanTaskName}`;
    this._appendTaskLog({
      tick: Game.time,
      level,
      id,
      name: profileName,
      rawTaskName: task && task.name ? String(task.name) : '',
      result,
      cpu: Number(cpu.toFixed(4)),
      reason,
    });
  },

  logSubtaskExecution(name, cpu, context = {}) {
    if (Memory.settings && Memory.settings.enableTaskProfiling === false) return;
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.taskLogs) Memory.stats.taskLogs = [];
    this._appendTaskLog({
      tick: Game.time,
      level: context.level || 'subtask',
      id: context.id || context.roomName || 'n/a',
      name: String(name || 'HTM_SUBTASK_UNKNOWN'),
      result: context.result || 'subtask',
      cpu: Number(Number(cpu || 0).toFixed(4)),
      reason: context.reason || '',
      parent: context.parent || '',
    });
  },

  _appendTaskLog(entry) {
    Memory.stats.taskLogs.push(entry);
    if (!Memory.stats.taskAverages) Memory.stats.taskAverages = {};
    const key = String(entry && entry.name ? entry.name : 'unknown');
    if (!Memory.stats.taskAverages[key]) {
      Memory.stats.taskAverages[key] = { totalCpu: 0, calls: 0, avgCpu: 0, lastCpu: 0, lastTick: 0 };
    }
    const avg = Memory.stats.taskAverages[key];
    const cpu = Number(entry && entry.cpu ? entry.cpu : 0);
    avg.totalCpu += cpu;
    avg.calls += 1;
    avg.avgCpu = avg.calls > 0 ? avg.totalCpu / avg.calls : 0;
    avg.lastCpu = cpu;
    avg.lastTick = Game.time;
    const limit = 200;
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
