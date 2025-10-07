const { expect } = require('chai');
const globals = require('./mocks/globals');

describe('spawn module lodash dependencies', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [], logCounts: {} } });
    delete global._;
    global.WORK = 'work';
    global.MOVE = 'move';
    global.HARVEST_POWER = 2;
    global.FIND_SOURCES = 1;
    global.BODYPART_COST = { work: 100, move: 50 };
    global.OBSTACLE_OBJECT_TYPES = [];
    global.LOOK_STRUCTURES = 1;
    global.LOOK_CREEPS = 2;
    global.TERRAIN_MASK_WALL = 1;
  });

  afterEach(function () {
    delete global._;
  });

  it('spawns miners without relying on global lodash', function () {
    delete require.cache[require.resolve('../manager.spawnQueue')];
    delete require.cache[require.resolve('../manager.spawn')];

    const spawnQueue = require('../manager.spawnQueue');
    const spawnManager = require('../manager.spawn');

    spawnQueue.queue = [];
    Memory.nextSpawnRequestId = 0;
    Memory.rooms = {
      W1N1: {
        miningPositions: {
          src1: {
            positions: {
              pos1: { x: 10, y: 10, reserved: false },
            },
            distanceFromSpawn: 5,
          },
        },
      },
    };

    const spawn = { id: 's1', pos: { getRangeTo: () => 4 }, room: { name: 'W1N1' } };
    const room = {
      name: 'W1N1',
      find: (type) => (type === FIND_SOURCES ? [{ id: 'src1' }] : []),
    };

    Game.rooms['W1N1'] = room;
    Game.getObjectById = () => ({ pos: { getRangeTo: () => 5 } });
    Game.creeps = {};

    const bodySize = spawnManager.spawnMiner(spawn, room, 300, null, true);

    expect(bodySize).to.equal(2);
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].energyRequired).to.not.equal(undefined);
  });
});
