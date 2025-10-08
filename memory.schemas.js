/**
 * Registry for memory schema versions used by modules.
 * Each entry documents default values so Codex can build documentation.
 * @codex-owner memoryManager
 */
const schemas = {
  /** @codex-path Memory.hive */
  hive: { version: 2, owner: 'memoryManager', path: 'Memory.hive' },
  /** @codex-path Memory.demand */
  demand: { version: 1, owner: 'hivemind.demand', path: 'Memory.demand' },
  /** @codex-path Memory.spawnQueue */
  spawnQueue: { version: 1, owner: 'spawnQueue', path: 'Memory.spawnQueue' },
  /** @codex-path Memory.empire */
  empire: { version: 1, owner: 'hiveTravel', path: 'Memory.empire' },
  /** @codex-path Memory.settings */
  settings: { version: 1, owner: 'main', path: 'Memory.settings' },
  /** @codex-path Memory.roleEval */
  roleEval: { version: 1, owner: 'hive.roles', path: 'Memory.roleEval' },
  /** @codex-path Memory.stats */
  stats: { version: 1, owner: 'logger', path: 'Memory.stats' },
  /** @codex-path Memory.rooms[room].layout */
  roomLayout: { version: 1, owner: 'layoutPlanner', path: 'Memory.rooms.*.layout' },
  /** @codex-path Memory.debug.savestates */
  debugSavestates: { version: 1, owner: 'debugSavestate', path: 'Memory.debug.savestates' },
};

module.exports = schemas;
