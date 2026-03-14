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
  const maintenanceMode =
    typeof options === 'object' && options !== null
      ? Boolean(options.maintenanceMode)
      : false;
  const extensionPattern =
    typeof options === 'object' && options !== null
      ? String(
          options.extensionPattern ||
            options.layoutExtensionPattern ||
            'cluster3',
        ).toLowerCase()
      : 'cluster3';
  const normalizedExtensionPattern =
    extensionPattern === 'cluster3' || extensionPattern === 'harabi' || extensionPattern === 'diag2'
      ? 'cluster3'
      : 'cluster3';
  const requestedHarabiStage =
    typeof options === 'object' && options !== null
      ? String(options.harabiStage || options.layoutHarabiStage || '').toLowerCase()
      : '';
  const normalizedHarabiStage =
    requestedHarabiStage === 'foundation'
      ? 'foundation'
      : 'full';
  const layoutPlanDumpDebug =
    typeof options === 'object' && options !== null
      ? Boolean(options.layoutPlanDumpDebug || options.plannerDumpDebug || options.debugPlanDump)
      : false;
  const useMaintenanceMode = maintenanceMode;
  const useTheoreticalMode = theoreticalMode && !useMaintenanceMode;
  const previousSettings = Memory.settings || {};
  const preservedSettings = {};
  const preserveKeys = [
    'runtimeMode',
    'overlayMode',
    'enableVisuals',
    'alwaysShowHud',
    'showSpawnQueueHud',
    'showLayoutOverlay',
    'showLayoutLegend',
    'showLayoutOverlayLabels',
    'buildPreviewOnly',
    'layoutPlanningMode',
    'layoutOverlayView',
    'layoutCandidateOverlayIndex',
    'layoutPlanningTopCandidates',
    'layoutPlanningCandidatesPerTick',
    'layoutPlanningMaxCandidatesPerTick',
    'layoutPlanningDynamicBatching',
    'layoutPlanningReplanInterval',
    'layoutExtensionPattern',
    'layoutHarabiStage',
    'layoutPlanDumpDebug',
    'enableTaskProfiling',
    'enableMemHack',
    'memHackDebug',
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

  if (
    Object.keys(preservedSettings).length > 0 ||
    shouldPause ||
    useTheoreticalMode ||
    useMaintenanceMode
  ) {
    Memory.settings = preservedSettings;
  }

  if (useMaintenanceMode && theoreticalMode) {
    if (!Memory.stats) Memory.stats = {};
    statsConsole.log(
      'startFresh: maintenanceMode + theoreticalBuildingMode requested; maintenanceMode takes priority.',
      3,
    );
  }

  if (useTheoreticalMode) {
    if (!Memory.settings) Memory.settings = {};
    if (!Memory.stats) Memory.stats = {};
    Memory.settings.runtimeMode = 'theoretical';
    Memory.settings.overlayMode = 'normal';
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
    Memory.settings.layoutCandidateOverlayIndex = -1;
    Memory.settings.layoutPlanningTopCandidates = 5;
    Memory.settings.layoutPlanningCandidatesPerTick = 1;
    Memory.settings.layoutPlanningMaxCandidatesPerTick = 25;
    Memory.settings.layoutPlanningDynamicBatching = true;
    Memory.settings.layoutPlanningReplanInterval = 1000;
    Memory.settings.layoutExtensionPattern = normalizedExtensionPattern;
    Memory.settings.layoutHarabiStage = normalizedHarabiStage;
    Memory.settings.layoutPlanDumpDebug = layoutPlanDumpDebug;
    Memory.settings.layoutRecalculateRequested = 'all';
    Memory.settings.layoutRecalculateMode = 'theoretical';
    Memory.settings.enableTaskProfiling = false;
    Memory.settings.enableMemHack = true;
    Memory.settings.memHackDebug = false;
    statsConsole.log(
      `Theoretical building mode enabled (planning overlay only, pattern=${normalizedExtensionPattern}, stage=${normalizedHarabiStage}).`,
      2,
    );
    if (layoutPlanDumpDebug) {
      statsConsole.log(
        'Layout plan dump debug enabled. Use layoutPlanDump(roomName) after planning to print stamp and structure details.',
        2,
      );
    }
  }

  if (useMaintenanceMode) {
    if (!Memory.settings) Memory.settings = {};
    if (!Memory.stats) Memory.stats = {};
    Memory.settings.runtimeMode = 'maintenance';
    Memory.settings.pauseBot = false;
    Memory.settings.buildPreviewOnly = false;
    Memory.settings.layoutPlanningMode = 'theoretical';
    Memory.settings.enableBaseBuilderPlanning = false;
    Memory.settings.overlayMode = 'off';
    Memory.settings.enableVisuals = false;
    Memory.settings.alwaysShowHud = false;
    Memory.settings.showSpawnQueueHud = false;
    Memory.settings.showLayoutOverlay = false;
    Memory.settings.showLayoutLegend = false;
    Memory.settings.showHtmOverlay = false;
    Memory.settings.enableTaskProfiling = false;
    Memory.settings.enableScreepsProfiler = false;
    Memory.settings.enableMemHack = true;
    Memory.settings.memHackDebug = false;
    delete Memory.settings.layoutRecalculateRequested;
    delete Memory.settings.layoutRecalculateMode;
    delete Memory.settings.profilerControl;
    Memory.settings.profilerEnabledByOverlay = false;
    Memory.settings.profilerResetPending = true;
    statsConsole.log('Maintenance mode enabled (strict minimal runtime + CPU telemetry).', 2);
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
