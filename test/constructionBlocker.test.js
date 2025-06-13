/** @codex-owner layoutPlanner */
const { expect } = require('chai');
global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_CONTAINER = 'container';
const globals = require('./mocks/globals');

const layoutPlanner = require('../layoutPlanner');
const blocker = require('../constructionBlocker');
const htm = require('../manager.htm');

describe('constructionBlocker.isTileBlocked', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N1: {} };
    const spawn = { pos: { x: 5, y: 5, roomName: 'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true, level: 2, pos: { x: 20, y: 20 } },
      find: type => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: Memory.rooms['W1N1'],
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    Game.rooms['W1N1'].memory.distanceTransform = new Array(2500).fill(5);
    layoutPlanner.plan('W1N1');
  });

  it('returns true for reserved tiles', function() {
    expect(blocker.isTileBlocked('W1N1', 5, 5)).to.be.true;
  });

  it('returns false otherwise', function() {
    expect(blocker.isTileBlocked('W1N1', 10, 10)).to.be.false;
  });
});
