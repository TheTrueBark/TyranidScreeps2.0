"use strict";

/**
 * Global memory migrations executed when `Memory.hive.version` is behind
 * the current `MEMORY_VERSION` constant.
 * @codex-owner memoryManager
 * @codex-version 2
 */
const MEMORY_VERSION = 2;

/**
 * Array of migration steps in ascending order.
 * Each migration exposes a `version` and `migrate()` function.
 * @type {Array<{version:number, migrate:function}>}
 */
const migrations = [
  {
    version: 2,
    migrate() {
      if (!Memory.demand) Memory.demand = { rooms: {}, nextId: 1 };
    },
  },
];

/**
 * Run all migrations newer than the given version.
 * @param {number} currentVersion
 */
function runMigrations(currentVersion) {
  for (const step of migrations) {
    if (step.version > currentVersion) {
      try {
        step.migrate();
      } catch (err) {
        console.log(`Migration ${step.version} failed: ${err}`);
      }
    }
  }
  if (!Memory.hive) Memory.hive = { clusters: {} };
  Memory.hive.version = MEMORY_VERSION;
}

module.exports = { MEMORY_VERSION, runMigrations, migrations };
