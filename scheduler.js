/**
 * Represents a single scheduled task.
 */
const statsConsole = require('console.console');

class Task {
  constructor(name, interval, taskFunction, options = {}) {
    this.name = name;
    this.interval = interval;
    this.taskFunction = taskFunction;
    this.nextRun = Game.time + interval;
    this.highPriority = options.highPriority || false;
    this.once = options.once || false;
    this.event = options.event || null;
    this.minBucket = options.minBucket || 0; // Minimum CPU bucket to execute
    this.executed = false; // Track if the task ran at least once
  }
}

/**
 * Scheduler coordinates all tasks in the code base.
 * It supports interval, one-time, and event based tasks.
 */
class Scheduler {
  constructor() {
    /** @type {Task[]} tasks executed on an interval */
    this.tasks = [];
    /** @type {Task[]} tasks executed before normal tasks */
    this.highPriorityTasks = [];
    /** @type {Object.<string, {high: Task[], normal: Task[]}>} event listeners */
    this.eventTasks = {};
    /** @type {Array<{eventName: string, data: any}>} events queued this tick */
    this.triggeredEvents = [];
  }

  /** Reset all scheduler state (mainly for tests) */
  reset() {
    this.tasks = [];
    this.highPriorityTasks = [];
    this.eventTasks = {};
    this.triggeredEvents = [];
  }

  /** Insert a task into a sorted array by nextRun */
  _insertTask(task, arr) {
    let i = arr.findIndex((t) => t.nextRun > task.nextRun);
    if (i === -1) arr.push(task);
    else arr.splice(i, 0, task);
  }

  /**
   * Register a new task with the scheduler.
   *
   * @param {string} name        Identifier of the task.
   * @param {number} interval    Ticks between runs. Use 0 to run every tick.
   * @param {Function} taskFunction Function to execute.
   * @param {Object} [options]    Additional options.
   * @param {boolean} [options.highPriority=false] Execute before other tasks.
   * @param {boolean} [options.once=false]  Remove task after first execution.
   * @param {string}  [options.event=null]  Event name to bind this task to.
   */
  addTask(name, interval, taskFunction, options = {}) {
    const task = new Task(name, interval, taskFunction, options);

    if (task.event) {
      if (!this.eventTasks[task.event])
        this.eventTasks[task.event] = { high: [], normal: [] };
      const group = task.highPriority
        ? this.eventTasks[task.event].high
        : this.eventTasks[task.event].normal;
      group.push(task);
    } else if (task.highPriority) {
      this._insertTask(task, this.highPriorityTasks);
    } else {
      this._insertTask(task, this.tasks);
    }
  }
  /**
   * Execute tasks according to their type and schedule.
   * High priority tasks run first, followed by regular tasks and events.
   */
  run() {
    // --- High priority tasks ---
    while (
      this.highPriorityTasks.length &&
      Game.time >= this.highPriorityTasks[0].nextRun
    ) {
      const task = this.highPriorityTasks.shift();
      if (Game.cpu.bucket >= task.minBucket && (!task.once || !task.executed)) {
        task.taskFunction();
        task.executed = true;
        if (!task.once) {
          task.nextRun = Game.time + Math.max(1, task.interval);
        }
      } else {
        task.nextRun = Game.time + Math.max(1, task.interval);
      }
      if (!task.once) {
        this._insertTask(task, this.highPriorityTasks);
      }
    }

    // Remove stale one-time high priority tasks from front
    while (this.highPriorityTasks.length && this.highPriorityTasks[0].once && this.highPriorityTasks[0].executed) {
      this.highPriorityTasks.shift();
    }

    // --- Regular interval tasks ---
    while (this.tasks.length && Game.time >= this.tasks[0].nextRun) {
      const task = this.tasks.shift();
      if (Game.cpu.bucket >= task.minBucket && (!task.once || !task.executed)) {
        task.taskFunction();
        task.executed = true;
        if (!task.once) {
          task.nextRun = Game.time + Math.max(1, task.interval);
        }
      } else {
        // postpone when bucket is low
        task.nextRun = Game.time + Math.max(1, task.interval);
      }
      if (!task.once) {
        this._insertTask(task, this.tasks);
      }
    }

    // Remove stale one-time tasks from front
    while (this.tasks.length && this.tasks[0].once && this.tasks[0].executed) {
      this.tasks.shift();
    }

    // --- Process triggered events ---
    while (this.triggeredEvents.length > 0) {
      const { eventName, data } = this.triggeredEvents.shift();
      const listeners = this.eventTasks[eventName] || { high: [], normal: [] };
      const processList = (list) => {
        for (let i = list.length - 1; i >= 0; i--) {
          const task = list[i];
          if (Game.cpu.bucket >= task.minBucket) {
            task.taskFunction(data);
          }
          if (task.once) list.splice(i, 1);
        }
      };
      processList(listeners.high);
      processList(listeners.normal);
    }
  }

  /**
   * Execute a task immediately regardless of its schedule.
   * Useful for reacting to sudden events.
   */
  runTaskNow(name) {
    const task = this._findTask(name);
    if (task) {
      task.taskFunction();
      task.nextRun = Game.time + task.interval;
    }
  }

  /** Remove a task completely */
  removeTask(name) {
    const removeFrom = (arr) => {
      const index = arr.findIndex((t) => t.name === name);
      if (index !== -1) arr.splice(index, 1);
    };
    removeFrom(this.tasks);
    removeFrom(this.highPriorityTasks);
    for (const evt in this.eventTasks) {
      removeFrom(this.eventTasks[evt].high);
      removeFrom(this.eventTasks[evt].normal);
    }
  }

  /** Update interval for an existing task */
  updateTask(name, interval) {
    const task = this._findTask(name);
    if (task) {
      task.interval = interval;
      task.nextRun = Game.time + interval;
    }
  }

  /** Return an array of task summaries */
  listTasks() {
    const format = (t) => ({ name: t.name, nextRun: t.nextRun });
    const events = {};
    for (const e in this.eventTasks) {
      events[e] = [
        ...this.eventTasks[e].high.map(format),
        ...this.eventTasks[e].normal.map(format),
      ];
    }
    return {
      high: this.highPriorityTasks.map(format),
      normal: this.tasks.map(format),
      events,
    };
  }

  /** Log task list via statsConsole */
  logTaskList() {
    const list = this.listTasks();
    const show = (arr) =>
      arr.map((t) => `${t.name}@${t.nextRun}`).join(', ') || 'none';
    statsConsole.log(`HP: ${show(list.high)}`, 2);
    statsConsole.log(`Tasks: ${show(list.normal)}`, 2);
    for (const e in list.events) {
      statsConsole.log(`${e}: ${show(list.events[e])}`, 2);
    }
  }

  /**
   * Force a task to run on the next tick by resetting its timer.
   */
  requestTaskUpdate(name) {
    const task = this._findTask(name);
    if (task) {
      task.nextRun = Game.time; // Set the task to run on the next tick
    }
  }

  /**
   * Trigger all tasks listening for the specified event.
   */
  triggerEvent(eventName, data) {
    this.triggeredEvents.push({ eventName, data });
  }

  /**
   * Internal helper to search all task collections by name.
   */
  _findTask(name) {
    let task =
      this.tasks.find((t) => t.name === name) ||
      this.highPriorityTasks.find((t) => t.name === name);
    if (task) return task;
    for (const evt in this.eventTasks) {
      const ev = this.eventTasks[evt];
      let found = ev.high.find((t) => t.name === name);
      if (found) return found;
      found = ev.normal.find((t) => t.name === name);
      if (found) return found;
    }
    return null;
  }
}

module.exports = new Scheduler();
module.exports.Scheduler = Scheduler;
