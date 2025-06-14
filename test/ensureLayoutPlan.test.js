const { expect } = require('chai');
const globals = require('./mocks/globals');
const layoutPlanner = require('../layoutPlanner');
const htm = require('../manager.htm');

// mock constants
global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_LINK = 'link';

describe('layoutPlanner.ensurePlan', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N1: {} };
    const spawn = { pos: { x: 10, y: 10, roomName: 'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 3, my: true, pos: { x: 20, y: 20 } },
      find: type => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: Memory.rooms['W1N1'],
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    Game.rooms['W1N1'].memory.distanceTransform = new Array(2500).fill(5);
  });

  it('creates a plan when missing', function() {
    layoutPlanner.ensurePlan('W1N1');
    expect(Memory.rooms['W1N1'].layout).to.exist;
    expect(Memory.rooms['W1N1'].layout.planVersion).to.equal(1);
  });

  it('does not overwrite an existing plan', function() {
    layoutPlanner.plan('W1N1');
    const before = JSON.stringify(Memory.rooms['W1N1'].layout);
    Game.time++;
    layoutPlanner.ensurePlan('W1N1');
    expect(JSON.stringify(Memory.rooms['W1N1'].layout)).to.equal(before);
  });
});
