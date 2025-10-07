/**
 * Remove major persistent memory branches for a clean debugging state.
 * Intended for manual use from the console.
 * @codex-owner main
 */
const statsConsole = require('console.console');
function startFresh(options = {}) {
  const shouldPause =
    typeof options === 'boolean' ? options : Boolean(options && options.pause);

  if (!Memory.stats) Memory.stats = {};
  statsConsole.log('Starting fresh memory wipe', 2);
  var keys = [
    'rooms',
    'hive',
    'htm',
    'demand',
    'spawnQueue',
    'creeps',
    'stats',
    'spawns',
    'roleEval',
    'nextSpawnId',
    'settings',
  ];
  for (var i = 0; i < keys.length; i++) delete Memory[keys[i]];

  if (shouldPause) {
    Memory.settings = { pauseBot: true };
    if (!Memory.stats) Memory.stats = {};
    statsConsole.log('Bot execution paused. Set Memory.settings.pauseBot = false to resume.', 2);
  }
  console.log('Memory reset complete');
}

module.exports = startFresh;
