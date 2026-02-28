/**
 * Apply a stable builder-debug runtime profile in one command.
 * @codex-owner main
 */
const startFresh = require('./startFresh');

function enableBuilderDebugPreset(options = {}) {
  const pause = options.pause === undefined ? true : Boolean(options.pause);
  const extensionPattern = String(options.extensionPattern || 'cluster3').toLowerCase();
  const layoutPlanDumpDebug =
    options.layoutPlanDumpDebug === undefined
      ? true
      : Boolean(options.layoutPlanDumpDebug);

  startFresh({
    theoreticalBuildingMode: true,
    pause,
    extensionPattern,
    layoutPlanDumpDebug,
  });

  if (!Memory.settings) Memory.settings = {};
  Memory.settings.overlayMode = 'normal';
  Memory.settings.enableVisuals = true;
  Memory.settings.alwaysShowHud = true;
  Memory.settings.showLayoutOverlay = true;
  Memory.settings.showLayoutLegend = true;
  Memory.settings.showLayoutOverlayLabels = true;
  Memory.settings.enableBaseBuilderPlanning = true;
  Memory.settings.buildPreviewOnly = true;
  Memory.settings.layoutPlanningMode = 'theoretical';

  return Memory.settings;
}

module.exports = { enableBuilderDebugPreset };
