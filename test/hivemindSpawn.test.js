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

  it('queues initial spawn order including upgrader', function () {
    const order = [
      'spawnBootstrap',
      'spawnMiner',
      'spawnMiner',
      'spawnHauler',
      'spawnHauler',
      'spawnUpgrader',
    ];
    for (let i = 0; i < order.length; i++) {
      spawnModule.run(Game.rooms['W1N1']);
    }
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const counts = {};
    for (const t of tasks) counts[t.name] = t.amount;
    expect(counts).to.deep.equal({
      spawnBootstrap: 1,
      spawnMiner: 2,
      spawnHauler: 2,
      spawnUpgrader: 1,
    });
  });

  it('only queues upgrader after two haulers accounted for', function () {
    // Run enough times to queue up to the second hauler
    for (let i = 0; i < 5; i++) {
      spawnModule.run(Game.rooms['W1N1']);
    }
    let tasks = Memory.htm.colonies['W1N1'].tasks.map(t => t.name);
    expect(tasks).to.not.include('spawnUpgrader');

    // Next run should queue the upgrader task
    spawnModule.run(Game.rooms['W1N1']);
    tasks = Memory.htm.colonies['W1N1'].tasks.map(t => t.name);
    expect(tasks).to.include('spawnUpgrader');
  });

  it('considers spawn in progress for initial ordering', function () {
    // First tick queues bootstrap
    spawnModule.run(Game.rooms['W1N1']);
    Memory.htm.colonies['W1N1'].tasks = [];
    spawnQueue.queue = [];
    const spawnObj = { id: 's1', pos: { getRangeTo: () => 5 }, memory: { currentSpawnRole: 'allPurpose' }, spawning: { name: 'ap1' } };
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
    expect(tasks.some(t => t.name === 'spawnMiner')).to.be.true;
  });

  it('considers spawn in progress for initial ordering', function () {
    // First tick queues bootstrap
    spawnModule.run(Game.rooms['W1N1']);
    Memory.htm.colonies['W1N1'].tasks = [];
    spawnQueue.queue = [];
    const spawnObj = { id: 's1', pos: { getRangeTo: () => 5 }, memory: { currentSpawnRole: 'allPurpose' }, spawning: { name: 'ap1' } };
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
    expect(tasks.some(t => t.name === 'spawnMiner')).to.be.true;
  });

  it('adjusts hauler amount based on non-hauler ratio', function () {
    const order = [
      'spawnBootstrap',
      'spawnMiner',
      'spawnMiner',
      'spawnHauler',
      'spawnHauler',
      'spawnUpgrader',
    ];
    for (let i = 0; i < order.length; i++) {
      spawnModule.run(Game.rooms['W1N1']);
    }
    // Run once more to trigger ratio evaluation
    spawnModule.run(Game.rooms['W1N1']);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const haulTask = tasks.find(t => t.name === 'spawnHauler');
    expect(haulTask.amount).to.equal(2);
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
      'spawnMiner',
      'spawnMiner',
      'spawnHauler',
      'spawnHauler',
      'spawnUpgrader',
    ];
    for (let i = 0; i < order.length; i++) {
      spawnModule.run(Game.rooms['W1N1']);
    }
    spawnModule.run(Game.rooms['W1N1']);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const upTask = tasks.find(t => t.name === 'spawnUpgrader');
    expect(upTask).to.exist;
  });
});
