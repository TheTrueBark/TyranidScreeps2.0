/** @codex-owner layoutPlanner */
const { expect } = require('chai');
global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_LINK = 'link';
const globals = require('./mocks/globals');

const layoutPlanner = require('../layoutPlanner');
// suppress visuals
global.RoomVisual = function () { this.structure = () => {}; };

describe('layoutPlanner.plan', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = { W1N1: {} };
    const spawn = { pos: { x: 10, y: 10, roomName: 'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 1, my: true, pos: { x: 20, y: 20 } },
      find: type => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: Memory.rooms['W1N1'],
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    Game.rooms['W1N1'].memory.distanceTransform = new Array(2500).fill(5);
  });

  it('stores anchor and stamps', function() {
    const room = Game.rooms['W1N1'];
    layoutPlanner.plan('W1N1');
    expect(Memory.rooms['W1N1'].layout.baseAnchor).to.deep.equal({ x: 10, y: 10 });
    const matrix = Memory.rooms['W1N1'].layout.matrix;
    expect(matrix['10']['10'].structureType).to.equal(STRUCTURE_SPAWN);
    expect(matrix['11']['10'].structureType).to.equal(STRUCTURE_EXTENSION);
    const cell = matrix['10']['10'];
    expect(cell.plannedBy).to.equal('layoutPlanner');
    expect(cell.blockedUntil).to.equal(Game.time + 1500);
    expect(Memory.rooms['W1N1'].layout.planVersion).to.equal(1);
  });
});
