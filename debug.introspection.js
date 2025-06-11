const htm = require('./manager.htm');
const scheduler = require('./scheduler');
const memoryManager = require('./manager.memory');
const statsConsole = require('console.console');

module.exports = {
  /** Print all active HTM tasks */
  printHTMTasks() {
    const tasks = htm.listTasks();
    if (tasks.length === 0) {
      statsConsole.log('No active HTM tasks', 2);
      return;
    }
    for (const t of tasks) {
      const status = Game.time < t.claimedUntil ? 'claimed' : 'open';
      const ttl = t.ttl - t.age;
      statsConsole.log(
        `[${t.level}] ${t.name} ${t.id} ${status} ttl:${ttl} origin:${t.origin.module}`,
        2,
      );
    }
  },

  /** Print scheduler job timings */
  printSchedulerJobs() {
    const list = scheduler.listTasks();
    const show = (arr) => arr.map((t) => `${t.name}@${t.nextRun}`).join(', ') || 'none';
    statsConsole.log(`HP: ${show(list.high)}`, 2);
    statsConsole.log(`Tasks: ${show(list.normal)}`, 2);
    for (const e in list.events) {
      statsConsole.log(`${e}: ${show(list.events[e])}`, 2);
    }
  },

  /** Print memory version status for all schemas */
  printMemoryStatus() {
    const report = memoryManager.getVersionStatus();
    for (const entry of report) {
      const ok = entry.current === entry.expected;
      const msg = `${entry.path}: ${entry.current || 'n/a'} (expected ${entry.expected})`;
      statsConsole.log(msg, ok ? 2 : 4);
    }
  },
};
