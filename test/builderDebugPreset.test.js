const { expect } = require('chai');
const globals = require('./mocks/globals');
const { enableBuilderDebugPreset } = require('../debug.builderPreset');

describe('debug.builderPreset', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({
      rooms: { W1N1: {} },
      hive: { foo: true },
      settings: { enableVisuals: false },
    });
  });

  it('applies theoretical + paused + cluster3 defaults', function() {
    const settings = enableBuilderDebugPreset();
    expect(settings.runtimeMode).to.equal('theoretical');
    expect(settings.pauseBot).to.equal(true);
    expect(settings.layoutExtensionPattern).to.equal('cluster3');
  });

  it('enables required overlay/debug flags', function() {
    const settings = enableBuilderDebugPreset();
    expect(settings).to.include({
      overlayMode: 'normal',
      enableVisuals: true,
      alwaysShowHud: true,
      showLayoutOverlay: true,
      showLayoutLegend: true,
      showLayoutOverlayLabels: true,
      enableBaseBuilderPlanning: true,
      buildPreviewOnly: true,
      layoutPlanningMode: 'theoretical',
    });
  });

  it('sets layoutPlanDumpDebug true by default', function() {
    const settings = enableBuilderDebugPreset();
    expect(settings.layoutPlanDumpDebug).to.equal(true);
  });

  it('returns the final Memory.settings object', function() {
    const settings = enableBuilderDebugPreset();
    expect(settings).to.equal(Memory.settings);
  });
});
