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
};

module.exports = schemas;
