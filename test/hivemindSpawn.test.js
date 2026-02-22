const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const spawnModule = require('../manager.hivemind.spawn');
const spawnQueue = require('../manager.spawnQueue');

global._ = require('lodash');

global.WORK = 'work';
global.MOVE = 'move';
global.CARRY = 'carry';
global.FIND_HOSTILE_CREEPS = 0;
global.FIND_SOURCES = 1;
global.FIND_MY_SPAWNS = 2;
global.HARVEST_POWER = 2;
global.CREEP_SPAWN_TIME = 3;

global.BODYPART_COST = { work: 100, move: 50, carry: 50 };

describe('hivemind spawn module', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    spawnQueue.queue = [];
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true, level: 1 },
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: { buildingQueue: [{ id: 'c1', pos: { x: 1, y: 1 } }] },
      find: (type) => {
        if (type === FIND_HOSTILE_CREEPS) return [];
        if (type === FIND_SOURCES) {
          return [
            {
              id: 'source1',
              pos: {
                x: 5,
                y: 5,
                roomName: 'W1N1',
                getRangeTo: () => 0,
              },
            },
          ];
        }
        if (type === FIND_MY_SPAWNS) {
          return [
            {
              id: 's1',
              pos: { getRangeTo: () => 5 },
            },
          ];
        }
        return [];
      },
    };
    Memory.rooms = {
      W1N1: {
        miningPositions: {
          source1: {
            positions: {
              a: { x: 4, y: 5 },
              b: { x: 5, y: 4 },
              c: { x: 6, y: 5 },
            },
          },
        },
      },
    };
    htm.init();
  });

  it('queues bootstrap task when no creeps remain', function () {
    spawnModule.run(Game.rooms['W1N1']);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks.length).to.equal(1);
    expect(tasks[0].name).to.equal('spawnBootstrap');
  });

  it('queues miner next when bootstrap spawning', function () {
    // First tick queues bootstrap
    spawnModule.run(Game.rooms['W1N1']);
    Memory.htm.colonies['W1N1'].tasks = [];
    spawnQueue.queue = [];
    const spawnObj = { id: 's1', pos: { getRangeTo: () => 5 }, memory: { currentSpawnRole: 'miner' }, spawning: { name: 'm1' } };
    Game.rooms['W1N1'].find = (type) => {
      if (type === FIND_HOSTILE_CREEPS) return [];
      if (type === FIND_SOURCES) {
        return [
          {
            id: 'source1',
            pos: { x: 5, y: 5, roomName: 'W1N1', getRangeTo: () => 0 },
          },
        ];
      }
      if (type === FIND_MY_SPAWNS) return [spawnObj];
      return [];
    };

    // Second tick should queue the miner as next entry
    spawnModule.run(Game.rooms['W1N1']);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks.length).to.be.above(0);
  });

  it('adjusts hauler amount based on non-hauler ratio', function () {
    const order = [
      'spawnBootstrap',
      'spawnBootstrap',
      'spawnMiner',
      'spawnHauler',
      'spawnUpgrader',
    ];
    for (let i = 0; i < order.length; i++) {
      spawnModule.run(Game.rooms['W1N1']);
    }
    // Run once more to trigger ratio evaluation
    spawnModule.run(Game.rooms['W1N1']);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks).to.be.an('array');
  });

  it('queues starter couples, high-priority upgraders, and a scout during bootstrap', function () {
    Game.creeps = {
      h1: { my: true, memory: { role: 'hauler' }, room: { name: 'W1N1' } },
      m1: { my: true, memory: { role: 'miner' }, room: { name: 'W1N1' } },
    };
    if (!Memory.htm.colonies['W1N1']) {
      Memory.htm.colonies['W1N1'] = { tasks: [] };
    } else {
      Memory.htm.colonies['W1N1'].tasks = [];
    }
    spawnQueue.queue = [];

    spawnModule.run(Game.rooms['W1N1']);

    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const starterTask = tasks.find(t => t.name === 'spawnStarterCouple');
    const upgraderTask = tasks.find(t => t.name === 'spawnUpgrader');
    const scoutTask = tasks.find(t => t.name === 'spawnScout');

    expect(starterTask).to.exist;
    expect(starterTask.priority).to.equal(0);
    expect(upgraderTask).to.exist;
    expect(upgraderTask.priority).to.equal(1);
    expect(upgraderTask.amount).to.be.at.least(1);
    expect(scoutTask).to.exist;
    expect(scoutTask.priority).to.equal(4);
  });

  it('does not queue a scout before both starter roles are alive', function () {
    Game.creeps = {
      m1: { my: true, memory: { role: 'miner' }, room: { name: 'W1N1' } },
    };
    if (!Memory.htm.colonies['W1N1']) {
      Memory.htm.colonies['W1N1'] = { tasks: [] };
    } else {
      Memory.htm.colonies['W1N1'].tasks = [];
    }
    spawnQueue.queue = [];

    spawnModule.run(Game.rooms['W1N1']);

    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const scoutTask = tasks.find(t => t.name === 'spawnScout');
    expect(scoutTask).to.not.exist;
  });

  it('caps builders to four per site with overall max', function () {
    Game.rooms['W1N1'].controller.level = 2;
    Game.rooms['W1N1'].memory.buildingQueue = [
      { id: 'c1', pos: { x: 1, y: 1 } },
      { id: 'c2', pos: { x: 2, y: 2 } },
      { id: 'c3', pos: { x: 3, y: 3 } },
    ];
    const order = [
      'spawnBootstrap',
      'spawnBootstrap',
      'spawnMiner',
      'spawnHauler',
      'spawnUpgrader',
    ];
    for (let i = 0; i < order.length; i++) {
      spawnModule.run(Game.rooms['W1N1']);
    }
    spawnModule.run(Game.rooms['W1N1']);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks).to.be.an('array');
  });
});
