const { expect } = require('chai');
const globals = require('./mocks/globals');
const startFresh = require('../startFresh');

describe('startFresh command', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({
      rooms: { W1N1: {} },
      hive: { foo: true },
      htm: { creeps: {} },
      demand: { rooms: {} },
      spawnQueue: { list: [1] },
      creeps: { c1: {} },
      stats: { logs: [1] },
      spawns: { s1: {} },
      roleEval: { lastRun: 5 },
      nextSpawnId: 3,
      debug: { incidents: { a: { created: 1 } } },
      energyReserves: { e1: { amount: 100 } },
      settings: { enableVisuals: false },
    });
  });

  it('clears persistent memory branches', function() {
    startFresh();
    const keys = [
      'rooms','hive','htm','demand','spawnQueue','creeps','stats','spawns','roleEval','nextSpawnId','settings'
    ];
    for (const k of keys) {
      if (k === 'settings') continue;
      expect(Memory).to.not.have.property(k);
    }
    expect(Memory.settings).to.deep.equal({ enableVisuals: false });
  });

  it('supports explicit full wipe mode via wipe=all', function() {
    startFresh({ wipe: 'all' });
    expect(Object.keys(Memory)).to.deep.equal([]);
  });

  it('pauses bot when requested', function() {
    startFresh(true);
    expect(Memory.settings).to.have.property('pauseBot', true);
    expect(Memory.settings).to.have.property('enableVisuals', false);
  });

  it('rebuilds hive memory after fresh start', function() {
    const memoryManager = require('../manager.memory');
    startFresh(true);
    Memory.settings.pauseBot = false;
    const room = { name: 'W8N3' };
    expect(() => memoryManager.initializeRoomMemory(room)).to.not.throw();
    expect(Memory.hive).to.have.property('clusters');
    expect(Memory.hive.clusters).to.have.property('W8N3');
  });

  it('enables theoretical building preview mode when requested', function() {
    startFresh({ theoreticalBuildingMode: true });
    expect(Memory.settings).to.include({
      runtimeMode: 'theoretical',
      overlayMode: 'normal',
      enableVisuals: true,
      buildPreviewOnly: true,
      enableBaseBuilderPlanning: true,
      showLayoutOverlay: true,
      showLayoutLegend: true,
      showLayoutOverlayLabels: true,
      layoutPlanningMode: 'theoretical',
      layoutOverlayView: 'plan',
      layoutCandidateOverlayIndex: -1,
      layoutPlanningTopCandidates: 5,
      layoutPlanningCandidatesPerTick: 1,
      layoutPlanningMaxCandidatesPerTick: 25,
      layoutPlanningDynamicBatching: true,
      layoutPlanningReplanInterval: 1000,
      layoutExtensionPattern: 'parity',
      layoutRecalculateRequested: 'all',
      layoutRecalculateMode: 'theoretical',
      enableMemHack: true,
      memHackDebug: false,
      pauseBot: false,
    });
  });

  it('enables strict maintenance mode when requested', function() {
    startFresh({ maintenanceMode: true });
    expect(Memory.settings).to.include({
      runtimeMode: 'maintenance',
      pauseBot: false,
      buildPreviewOnly: false,
      layoutPlanningMode: 'theoretical',
      enableBaseBuilderPlanning: false,
      overlayMode: 'off',
      enableVisuals: false,
      alwaysShowHud: false,
      showSpawnQueueHud: false,
      showLayoutOverlay: false,
      showLayoutLegend: false,
      showHtmOverlay: false,
      enableTaskProfiling: false,
      enableScreepsProfiler: false,
      enableMemHack: true,
      memHackDebug: false,
      profilerEnabledByOverlay: false,
      profilerResetPending: true,
    });
    expect(Memory.settings).to.not.have.property('layoutRecalculateRequested');
    expect(Memory.settings).to.not.have.property('layoutRecalculateMode');
  });

  it('prefers maintenance mode when both maintenance and theoretical are requested', function() {
    startFresh({ maintenanceMode: true, theoreticalBuildingMode: true });
    expect(Memory.settings.runtimeMode).to.equal('maintenance');
    expect(Memory.settings.layoutPlanningMode).to.equal('theoretical');
    expect(Memory.settings.buildPreviewOnly).to.equal(false);
    expect(Memory.settings.overlayMode).to.equal('off');
  });

  it('enables theoretical mode with cluster3 extension pattern when requested', function() {
    startFresh({ theoreticalBuildingMode: true, extensionPattern: 'cluster3' });
    expect(Memory.settings.runtimeMode).to.equal('theoretical');
    expect(Memory.settings.layoutPlanningMode).to.equal('theoretical');
    expect(Memory.settings.layoutExtensionPattern).to.equal('cluster3');
    expect(Memory.settings.layoutHarabiStage).to.equal('foundation');
  });

  it('keeps harabi stage on foundation in theoretical mode', function() {
    startFresh({ theoreticalBuildingMode: true, extensionPattern: 'cluster3', harabiStage: 'full' });
    expect(Memory.settings.runtimeMode).to.equal('theoretical');
    expect(Memory.settings.layoutPlanningMode).to.equal('theoretical');
    expect(Memory.settings.layoutExtensionPattern).to.equal('cluster3');
    expect(Memory.settings.layoutHarabiStage).to.equal('foundation');
  });

  it('supports opt-in layout plan dump debug mode in theoretical mode', function() {
    startFresh({
      theoreticalBuildingMode: true,
      extensionPattern: 'cluster3',
      harabiStage: 'full',
      layoutPlanDumpDebug: true,
    });
    expect(Memory.settings.runtimeMode).to.equal('theoretical');
    expect(Memory.settings.layoutPlanDumpDebug).to.equal(true);
  });
});
