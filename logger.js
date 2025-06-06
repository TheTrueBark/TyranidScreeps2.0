const statsConsole = require('console.console');
const debugConfig = require('console.debugLogs');

const logger = {
  log(module, message, severity = 3) {
    if (!debugConfig[module]) return;
    statsConsole.log(`[${module}] ${message}`, severity);
  },

  toggle(module, state) {
    if (debugConfig.hasOwnProperty(module)) {
      debugConfig[module] = state;
      return true;
    }
    return false;
  },

  getConfig() {
    return debugConfig;
  },
};

module.exports = logger;
