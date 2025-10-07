const { expect } = require('chai');
const globals = require('./mocks/globals');

const spawnManager = require('../manager.spawn');
const spawnQueue = require('../manager.spawnQueue');

global._ = require('lodash');

global.WORK = 'work';
global.MOVE = 'move';
global.CARRY = 'carry';
global.FIND_SOURCES = 1;
global.FIND_MY_SPAWNS = 2;
global.HARVEST_POWER = 2;
global.CREEP_SPAWN_TIME = 3;

global.BODYPART_COST = { work: 100, move: 50, carry: 50 };

describe('spawnManager fallback bodies', function () {
  let room;
  let spawn;

  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Memory.stats = { logCounts: {} };
    Memory.settings = {};
    spawnQueue.queue = [];

    room = {
      name: 'W1N1',
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      controller: { level: 2 },
      find(type) {
        if (type === FIND_SOURCES) {
          return [
            {
              id: 'source1',
              pos: { x: 5, y: 5, roomName: 'W1N1', getRangeTo: () => 0 },
            },
          ];
        }
        if (type === FIND_MY_SPAWNS) {
          return [spawn];
        }
        return [];
      },
    };

    spawn = {
      id: 's1',
      room,
      pos: { getRangeTo: () => 4 },
    };

    Game.rooms['W1N1'] = room;
    Game.getObjectById = () => ({ pos: { x: 5, y: 5 } });
    Memory.rooms = {
      W1N1: {
        miningPositions: {
          source1: {
            positions: {
              a: { x: 4, y: 5, reserved: false },
            },
          },
        },
      },
    };
  });

  it('queues a downgraded miner when energy is insufficient for the full body', function () {
    const size = spawnManager.spawnMiner(spawn, room, room.energyCapacityAvailable);
    expect(size).to.equal(2);
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].bodyParts).to.deep.equal([WORK, MOVE]);
  });

  it('queues a downgraded hauler when energy is insufficient for the full body', function () {
    const size = spawnManager.spawnHauler(spawn, room, room.energyCapacityAvailable);
    expect(size).to.equal(2);
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].bodyParts).to.deep.equal([CARRY, MOVE]);
  });
});
