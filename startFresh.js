/**
 * Remove major persistent memory branches for a clean debugging state.
 * Intended for manual use from the console.
 * @codex-owner main
 */
const statsConsole = require('console.console');
function startFresh(options = {}) {
  const shouldPause =
    typeof options === 'boolean' ? options : Boolean(options && options.pause);
  const theoreticalMode =
    typeof options === 'object' && options !== null
      ? Boolean(options.theoreticalBuildingMode)
      : false;
  const previousSettings = Memory.settings || {};
  const preservedSettings = {};
  const preserveKeys = [
    'enableVisuals',
    'alwaysShowHud',
    'showSpawnQueueHud',
    'showLayoutOverlay',
    'showLayoutLegend',
    'showLayoutOverlayLabels',
    'buildPreviewOnly',
    'layoutPlanningMode',
    'layoutOverlayView',
  ];
  for (const key of preserveKeys) {
    if (previousSettings[key] !== undefined) preservedSettings[key] = previousSettings[key];
  }

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

  if (Object.keys(preservedSettings).length > 0 || shouldPause || theoreticalMode) {
    Memory.settings = preservedSettings;
  }

  if (theoreticalMode) {
    if (!Memory.settings) Memory.settings = {};
    if (!Memory.stats) Memory.stats = {};
    Memory.settings.pauseBot = false;
    Memory.settings.enableVisuals = true;
    Memory.settings.alwaysShowHud = true;
    Memory.settings.showLayoutOverlay = true;
    Memory.settings.showLayoutLegend = true;
    Memory.settings.showLayoutOverlayLabels = true;
    Memory.settings.enableBaseBuilderPlanning = true;
    Memory.settings.buildPreviewOnly = true;
    Memory.settings.layoutPlanningMode = 'theoretical';
    Memory.settings.layoutOverlayView = 'plan';
    statsConsole.log('Theoretical building mode enabled (planning overlay only).', 2);
  }

  if (shouldPause) {
    if (!Memory.settings) Memory.settings = {};
    if (!Memory.stats) Memory.stats = {};
    Memory.settings.pauseBot = true;
    if (!Memory.stats) Memory.stats = {};
    statsConsole.log('Bot execution paused. Set Memory.settings.pauseBot = false to resume.', 2);
  }
  console.log('Memory reset complete');
}

module.exports = startFresh;
