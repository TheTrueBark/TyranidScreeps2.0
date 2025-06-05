/**
 * Debug configuration with runtime toggles.
 *
 * Each property in `Memory.debugConfig` corresponds to a module name. When set
 * to `true`, additional logs for that module will be emitted. The configuration
 * persists in memory so it can be modified from the Screeps console.
 *
 * Example usage from the console:
 *   debug.toggle('spawnManager', true);   // enable logs for spawn manager
 *   debug.toggle('spawnManager', false);  // disable logs
 *   debug.list();                         // show current configuration
 *   debug.setThreshold(4);                // show only severity >= 4
 */

const DEFAULTS = {
  spawnManager: false,
  spawnQueue: false,
  bodyPartManager: false,
  demandManager: false,
  memoryManager: false,
  roleAllPurpose: false,
  roleMiner: false,
  pathfinder: false,
  trafficManager: false,
};

if (!Memory.debugConfig) {
  Memory.debugConfig = Object.assign({}, DEFAULTS);
} else {
  Memory.debugConfig = Object.assign({}, DEFAULTS, Memory.debugConfig);
}

const api = {
  /** Toggle a module on or off */
  toggle(module, value) {
    Memory.debugConfig[module] = !!value;
    return Memory.debugConfig[module];
  },

  /** List current debug configuration */
  list() {
    return JSON.stringify(Memory.debugConfig);
  },

  /** Set the global severity threshold for log display */
  setThreshold(level) {
    if (!Memory.logConfig) Memory.logConfig = { severityThreshold: 3 };
    Memory.logConfig.severityThreshold = level;
    return Memory.logConfig.severityThreshold;
  },
};

module.exports = new Proxy(api, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return Memory.debugConfig[prop];
  },
});
