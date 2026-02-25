const { expect } = require('chai');
const globals = require('./mocks/globals');

global.FIND_SOURCES = global.FIND_SOURCES || 1;
global.FIND_STRUCTURES = global.FIND_STRUCTURES || 2;
global.FIND_CONSTRUCTION_SITES = global.FIND_CONSTRUCTION_SITES || 3;
global.FIND_MY_SPAWNS = global.FIND_MY_SPAWNS || 4;

const htm = require('../manager.htm');
const intentPipeline = require('../manager.intentPipeline');
const layoutPlanner = require('../layoutPlanner');

describe('intent state finalize cleanup', function () {
  let originalBuildTheoreticalLayout;
  let originalPrune;

  before(function () {
    originalBuildTheoreticalLayout = layoutPlanner.buildTheoreticalLayout;
    originalPrune = layoutPlanner._pruneTheoreticalMemory;
  });

  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.settings = {
      enableBaseBuilderPlanning: true,
      overlayMode: 'off',
    };
    Memory.rooms = { W1N1: { layout: {} } };
    Game.rooms.W1N1 = {
      name: 'W1N1',
      controller: { my: true, level: 3, pos: { x: 20, y: 20 } },
      find(type) {
        if (type === FIND_MY_SPAWNS) return [{ id: 'spawn1' }];
        if (type === FIND_SOURCES) return [{ id: 'srcA' }];
        if (type === FIND_STRUCTURES) return [];
        if (type === FIND_CONSTRUCTION_SITES) return [];
        return [];
      },
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    intentPipeline._handlersRegistered = false;
    intentPipeline.registerHandlers();
  });

  after(function () {
    layoutPlanner.buildTheoreticalLayout = originalBuildTheoreticalLayout;
    layoutPlanner._pruneTheoreticalMemory = originalPrune;
  });

  it('prunes theoretical memory and clears activeRunId when run completes', function () {
    layoutPlanner.buildTheoreticalLayout = () => {};
    let pruneCalls = 0;
    layoutPlanner._pruneTheoreticalMemory = () => {
      pruneCalls += 1;
      return { removedTotal: 0 };
    };

    const runId = intentPipeline.queuePlanStart('W1N1', 'cleanup-test');
    expect(runId).to.be.a('string');
    for (let i = 0; i < 15; i++) {
      Game.time += 1;
      htm.run();
    }
    expect(Memory.rooms.W1N1.intentState.activeRunId).to.equal(null);
    expect(pruneCalls).to.be.greaterThan(0);
  });
});
