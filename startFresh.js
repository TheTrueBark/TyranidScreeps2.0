/**
 * Remove major persistent memory branches for a clean debugging state.
 * Intended for manual use from the console.
 * @codex-owner main
 */
const statsConsole = require('console.console');
function startFresh() {
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
  console.log('Memory reset complete');
}

module.exports = startFresh;
