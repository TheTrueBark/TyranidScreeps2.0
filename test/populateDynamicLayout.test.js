const { expect } = require('chai');
const globals = require('./mocks/globals');
const layoutPlanner = require('../layoutPlanner');
const htm = require('../manager.htm');

global.FIND_MY_SPAWNS = 1;
global.FIND_SOURCES = 2;

global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_CONTAINER = 'container';
global.LOOK_STRUCTURES = 'structure';

describe('layoutPlanner.populateDynamicLayout', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N1: { layout: { matrix: {}, reserved: {} } } };
    const spawn = { pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 3, my: true, pos: { x: 20, y: 20 } },
      find: type => {
        if (type === FIND_MY_SPAWNS || type === 'FIND_MY_SPAWNS') return [spawn];
        if (type === FIND_SOURCES || type === 'FIND_SOURCES') return [sourceA, sourceB];
        return [];
      },
      memory: Memory.rooms['W1N1'],
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    Game.rooms['W1N1'].memory.distanceTransform = new Array(2500).fill(5);
    Memory.settings = { layoutPlanningMode: 'theoretical', layoutPlanningTopCandidates: 1, layoutPlanningCandidatesPerTick: 5 };
  });

  it('delegates to theoretical planner and writes matrix entries', function() {
    layoutPlanner.populateDynamicLayout('W1N1');
    const matrix = Memory.rooms['W1N1'].layout.matrix;
    expect(Object.keys(matrix).length).to.be.above(0);
    expect(Memory.rooms['W1N1'].layout.mode).to.equal('theoretical');
    expect(Memory.rooms['W1N1'].layout.planVersion).to.equal(2);
    const firstCell = matrix[Object.keys(matrix)[0]][Object.keys(matrix[Object.keys(matrix)[0]])[0]];
    expect(firstCell).to.have.property('structureType');
    expect(firstCell).to.have.property('rcl');
  });

  it('still produces a plan when some tiles are occupied', function() {
    Game.rooms['W1N1'].lookForAt = () => [{ structureType: STRUCTURE_EXTENSION }];
    layoutPlanner.populateDynamicLayout('W1N1');
    expect(Memory.rooms['W1N1'].layout.planVersion).to.equal(2);
    expect(Memory.rooms['W1N1'].basePlan).to.exist;
  });
});
