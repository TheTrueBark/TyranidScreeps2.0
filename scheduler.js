/**
 * Represents a single scheduled task.
 */
class Task {
  constructor(name, interval, taskFunction, options = {}) {
    this.name = name;
    this.interval = interval;
    this.taskFunction = taskFunction;
    this.nextRun = Game.time + interval;
    this.highPriority = options.highPriority || false;
    this.once = options.once || false;
    this.event = options.event || null;
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
    /** @type {Object.<string, Task[]>} tasks listening to events */
    this.eventTasks = {};
    /** @type {Array<{eventName: string, data: any}>} events queued this tick */
    this.triggeredEvents = [];
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
      if (!this.eventTasks[task.event]) this.eventTasks[task.event] = [];
      this.eventTasks[task.event].push(task);
    } else if (task.highPriority) {
      this.highPriorityTasks.push(task);
    } else {
      this.tasks.push(task);
    }
  }
  /**
   * Execute tasks according to their type and schedule.
   * High priority tasks run first, followed by regular tasks and events.
   */
  run() {
    // --- High priority tasks ---
    for (const task of this.highPriorityTasks) {
      if (Game.time >= task.nextRun && (!task.once || !task.executed)) {
        task.taskFunction();
        task.executed = true;
        if (!task.once) task.nextRun = Game.time + task.interval;
      }
    }
    // Remove completed one-time high priority tasks
    for (let i = this.highPriorityTasks.length - 1; i >= 0; i--) {
      if (
        this.highPriorityTasks[i].once &&
        this.highPriorityTasks[i].executed
      ) {
        this.highPriorityTasks.splice(i, 1);
      }
    }

    // --- Regular interval tasks ---
    for (const task of this.tasks) {
      if (Game.time >= task.nextRun && (!task.once || !task.executed)) {
        task.taskFunction();
        task.executed = true;
        if (!task.once) task.nextRun = Game.time + task.interval;
      }
    }
    // Remove completed one-time tasks
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (this.tasks[i].once && this.tasks[i].executed) {
        this.tasks.splice(i, 1);
      }
    }

    // --- Process triggered events ---
    while (this.triggeredEvents.length > 0) {
      const { eventName, data } = this.triggeredEvents.shift();
      const listeners = this.eventTasks[eventName] || [];
      for (let i = listeners.length - 1; i >= 0; i--) {
        const task = listeners[i];
        task.taskFunction(data);
        if (task.once) listeners.splice(i, 1);
      }
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
      const found = this.eventTasks[evt].find((t) => t.name === name);
      if (found) return found;
    }
    return null;
  }
}

module.exports = new Scheduler();
