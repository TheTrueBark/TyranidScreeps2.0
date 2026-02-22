const { expect } = require('chai');
const globals = require('./mocks/globals');

const roles = require('../hive.roles');
const htm = require('../manager.htm');

global.WORK = 'work';
global.CARRY = 'carry';
global.MOVE = 'move';

// Minimal costs for dna
global.BODYPART_COST = { work: 100, carry: 50, move: 50 };

describe('manual spawn limits', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.stats = { logs: [], logCounts: {} };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 1, my: true },
      find: type => {
        if (type === FIND_SOURCES) {
          return [{ id: 's1', energyCapacity: 3000, pos: {} }];
        }
        if (type === FIND_CONSTRUCTION_SITES) return [];
        if (type === FIND_MY_SPAWNS) return [];
        return [];
      },
    };
    Memory.rooms = {
      W1N1: {
        miningPositions: { s1: { positions: { a: {}, b: {} } } },
        controllerUpgradeSpots: 4,
        manualSpawnLimits: { builders: 0 },
      },
    };
    htm.init();
  });

  it('respects manual builder limit', function() {
    roles.evaluateRoom(Game.rooms['W1N1']);
    const limits = Memory.rooms['W1N1'].spawnLimits;
    expect(limits.workers).to.equal(1);
    expect(limits.builders).to.equal(0);
    expect(limits.upgraders).to.equal(1);
  });

  it('uses dynamic limit when set to auto', function() {
    Game.rooms['W1N1'].find = type => {
      if (type === FIND_SOURCES) {
        return [{ id: 's1', energyCapacity: 3000, pos: {} }];
      }
      if (type === FIND_CONSTRUCTION_SITES) {
        return [
          { id: 'c1', structureType: STRUCTURE_EXTENSION },
          { id: 'c2', structureType: STRUCTURE_EXTENSION },
        ];
      }
      if (type === FIND_MY_SPAWNS) return [];
      return [];
    };
    Memory.rooms['W1N1'].manualSpawnLimits.builders = 'auto';
    roles.evaluateRoom(Game.rooms['W1N1']);
    const limits = Memory.rooms['W1N1'].spawnLimits;
    expect(limits.workers).to.equal(4);
    expect(limits.builders).to.equal(3);
  });
});
