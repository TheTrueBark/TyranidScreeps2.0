const { expect } = require('chai');
const globals = require('./mocks/globals');

global.FIND_SOURCES = global.FIND_SOURCES || 1;
global.FIND_STRUCTURES = global.FIND_STRUCTURES || 2;
global.FIND_CONSTRUCTION_SITES = global.FIND_CONSTRUCTION_SITES || 3;
global.FIND_MY_SPAWNS = global.FIND_MY_SPAWNS || 4;

const htm = require('../manager.htm');
const intentPipeline = require('../manager.intentPipeline');
const layoutPlanner = require('../layoutPlanner');
const buildingManager = require('../manager.building');
const hudManager = require('../manager.hud');

describe('intentPipeline', function () {
  let originalBuildTheoreticalLayout;
  let originalPopulateDynamicLayout;
  let originalRefreshTheoreticalDisplay;
  let originalManageBuildingQueue;
  let originalCreateHUD;

  before(function () {
    originalBuildTheoreticalLayout = layoutPlanner.buildTheoreticalLayout;
    originalPopulateDynamicLayout = layoutPlanner.populateDynamicLayout;
    originalRefreshTheoreticalDisplay = layoutPlanner._refreshTheoreticalDisplay;
    originalManageBuildingQueue = buildingManager.manageBuildingQueue;
    originalCreateHUD = hudManager.createHUD;
  });

  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N1: { layout: {} } };
    Memory.settings = { enableBaseBuilderPlanning: true };
    Game.rooms.W1N1 = {
      name: 'W1N1',
      controller: { my: true, level: 3, pos: { x: 20, y: 20 } },
      find(type) {
        if (type === FIND_MY_SPAWNS) return [{ id: 'spawn1' }];
        if (type === FIND_SOURCES) return [{ id: 'srcA', pos: { x: 10, y: 10 } }];
        if (type === FIND_STRUCTURES) return [];
        if (type === FIND_CONSTRUCTION_SITES) return [];
        return [];
      },
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };

    layoutPlanner.buildTheoreticalLayout = () => {};
    layoutPlanner.populateDynamicLayout = () => {};
    layoutPlanner._refreshTheoreticalDisplay = () => {};
    buildingManager.manageBuildingQueue = () => {};
    hudManager.createHUD = () => {};
    intentPipeline.registerHandlers();
  });

  after(function () {
    layoutPlanner.buildTheoreticalLayout = originalBuildTheoreticalLayout;
    layoutPlanner.populateDynamicLayout = originalPopulateDynamicLayout;
    layoutPlanner._refreshTheoreticalDisplay = originalRefreshTheoreticalDisplay;
    buildingManager.manageBuildingQueue = originalManageBuildingQueue;
    hudManager.createHUD = originalCreateHUD;
  });

  it('dedupes queued intents by signature', function () {
    intentPipeline.queueOverlayRefresh('W1N1', 'same-reason');
    intentPipeline.queueOverlayRefresh('W1N1', 'same-reason');
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const names = container.tasks.map((task) => task.name);
    const syncCount = names.filter((name) => name === intentPipeline.INTENTS.SYNC_OVERLAY).length;
    const renderCount = names.filter((name) => name === intentPipeline.INTENTS.RENDER_HUD).length;
    expect(syncCount).to.equal(1);
    expect(renderCount).to.equal(1);
  });

  it('does not queue render/sync intents when overlay mode is off', function () {
    Memory.settings.overlayMode = 'off';
    intentPipeline.queueOverlayRefresh('W1N1', 'off-mode');
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const names = container && Array.isArray(container.tasks) ? container.tasks.map((task) => task.name) : [];
    expect(names.includes(intentPipeline.INTENTS.SYNC_OVERLAY)).to.equal(false);
    expect(names.includes(intentPipeline.INTENTS.RENDER_HUD)).to.equal(false);
  });

  it('completes existing render/sync intents immediately when overlay mode is off', function () {
    Memory.settings.overlayMode = 'normal';
    intentPipeline.queueOverlayRefresh('W1N1', 'prefill');
    let container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.some((task) => task.name === intentPipeline.INTENTS.RENDER_HUD)).to.equal(true);
    expect(container.tasks.some((task) => task.name === intentPipeline.INTENTS.SYNC_OVERLAY)).to.equal(true);
    Memory.settings.overlayMode = 'off';
    Game.time += 1;
    htm.run();
    Game.time += 1;
    htm.run();
    container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.some((task) => task.name === intentPipeline.INTENTS.RENDER_HUD)).to.equal(false);
    expect(container.tasks.some((task) => task.name === intentPipeline.INTENTS.SYNC_OVERLAY)).to.equal(false);
  });

  it('chains planning phases through follow-up intents', function () {
    const runId = intentPipeline.queuePlanStart('W1N1', 'test-chain');
    expect(runId).to.be.a('string');
    for (let i = 0; i < 15; i++) {
      Game.time += 1;
      htm.run();
    }
    const roomMem = Memory.rooms.W1N1;
    expect(roomMem.layout.pipelineRuns).to.have.property(runId);
    const run = roomMem.layout.pipelineRuns[runId];
    expect(run.status).to.equal('completed');
    expect(run.phases).to.have.property('10');
    expect(run.phases['10'].status).to.equal('done');
  });

  it('defers intent execution when bucket is too low', function () {
    Game.cpu.bucket = 0;
    intentPipeline.queueOwnershipIntents('W1N1');
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const firstScan = container.tasks.find((task) => task.name === intentPipeline.INTENTS.SCAN_ROOM);
    expect(firstScan).to.exist;
    htm.run();
    expect(firstScan.claimedUntil).to.be.greaterThan(Game.time);
  });

  it('reuses active planning run instead of queuing duplicate run chains', function () {
    const runIdA = intentPipeline.queuePlanStart('W1N1', 'manual-a');
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const before = 0;
    const afterFirst = container.tasks.length;
    const runIdB = intentPipeline.queuePlanStart('W1N1', 'manual-b');
    const afterSecond = container.tasks.length;
    expect(runIdA).to.equal(runIdB);
    expect(afterFirst).to.be.greaterThan(before);
    expect(afterSecond).to.equal(afterFirst);
  });

  it('auto-recovers stuck phase 4 runs after timeout without duplicate requeues', function () {
    const runId = 'W1N1:123:1';
    Memory.rooms.W1N1.layout.pipelineRuns = {
      [runId]: { runId, status: 'running', phases: {} },
    };
    Memory.rooms.W1N1.layout.theoreticalPipeline = {
      runId,
      status: 'running',
      candidateCount: 5,
      activeCandidate: null,
      activeCandidateIndex: null,
      lastProgressTick: Game.time,
      lastResultsDone: 1,
      results: { '0': { weightedScore: 1 } },
    };
    Memory.rooms.W1N1.intentState = Memory.rooms.W1N1.intentState || {};
    Memory.rooms.W1N1.intentState.activeRunId = runId;
    Memory.rooms.W1N1.intentState.pendingIntents = Memory.rooms.W1N1.intentState.pendingIntents || {};

    intentPipeline.retryIntent('W1N1', runId, intentPipeline.INTENTS.PLAN_PHASE_4);
    for (let i = 0; i < 55; i++) {
      Game.time += 1;
      htm.run();
    }

    const roomMem = Memory.rooms.W1N1;
    const run = roomMem.layout.pipelineRuns[runId];
    expect(run.status).to.equal('stale');
    expect(run.staleReason).to.equal('phase4-stuck-no-active-candidate');
    expect(roomMem.intentState.recovery.autoRecoveredCount).to.equal(1);
    expect(roomMem.intentState.recovery.lastRecoveredRunId).to.equal(runId);

    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const recoveryTasks = container.tasks.filter(
      (task) =>
        task.name === intentPipeline.INTENTS.PLAN_PHASE_4 &&
        task.data &&
        task.data.reason === 'auto-recover-phase4' &&
        task.data.runId === runId,
    );
    expect(recoveryTasks.length).to.be.at.most(1);
  });
});
