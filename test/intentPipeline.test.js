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
});
