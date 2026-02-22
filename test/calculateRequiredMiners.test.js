const { expect } = require('chai');
const globals = require('./mocks/globals');

global.WORK = 'work';
global.MOVE = 'move';
global.HARVEST_POWER = 2;
// minimal costs so dna.getBodyParts works consistently
global.BODYPART_COST = { work: 100, move: 50 };
global.TOP = 1;
global.TOP_RIGHT = 2;
global.RIGHT = 3;
global.BOTTOM_RIGHT = 4;
global.BOTTOM = 5;
global.BOTTOM_LEFT = 6;
global.LEFT = 7;
global.TOP_LEFT = 8;
global.TERRAIN_MASK_WALL = 1;
global.OBSTACLE_OBJECT_TYPES = [];

const spawnManager = require('../manager.spawn');

describe('spawnManager.calculateRequiredMiners', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', energyCapacityAvailable: 550 };
  });

  it('returns zero when no miningPositions memory', function () {
    const source = { id: 's1' };
    const count = spawnManager.calculateRequiredMiners(Game.rooms['W1N1'], source);
    expect(count).to.equal(0);
  });

  it('calculates miners based on positions and work parts', function () {
    Memory.rooms = {
      W1N1: {
        miningPositions: { s1: { positions: { a: {}, b: {} } } },
      },
    };
    const source = { id: 's1' };
    const count = spawnManager.calculateRequiredMiners(Game.rooms['W1N1'], source);
    // With 5 WORK parts (550 energy room) energyPerTick = 10
    // requirement becomes 1 miner given two available positions
    expect(count).to.equal(1);
  });

  it('ignores null mining slots when counting available positions', function () {
    Memory.rooms = {
      W1N1: {
        miningPositions: { s1: { positions: { a: {}, b: null, c: {} } } },
      },
    };
    const source = { id: 's1' };
    const count = spawnManager.calculateRequiredMiners(Game.rooms['W1N1'], source);
    expect(count).to.equal(1);
  });
});
