const { expect } = require('chai');
const globals = require('./mocks/globals');

global.WORK = 'work';
global.MOVE = 'move';
global.HARVEST_POWER = 2;
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

const demandManager = require('../manager.demand');

describe('demandManager miner calculations', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      energyCapacityAvailable: 550,
      controller: {},
      find: type => {
        if (type === FIND_SOURCES) return [{ id: 's1' }, { id: 's2' }];
        return [];
      },
    };
    Memory.rooms = {
      W1N1: {
        miningPositions: {
          s1: { positions: { a: {}, b: {} } },
          s2: { positions: { a: {} } },
        },
      },
    };
    Game.creeps = {};
  });

  it('demands a miner when none present', function() {
    demandManager.evaluateRoomNeeds(Game.rooms['W1N1']);
    expect(Memory.rooms['W1N1'].inDemand).to.equal('miner');
  });

  it('alternates to hauler once a miner exists', function() {
    Game.creeps.m1 = { memory: { role: 'miner', source: 's1' }, room: { name: 'W1N1' } };
    demandManager.evaluateRoomNeeds(Game.rooms['W1N1']);
    expect(Memory.rooms['W1N1'].inDemand).to.equal('hauler');
  });
});
