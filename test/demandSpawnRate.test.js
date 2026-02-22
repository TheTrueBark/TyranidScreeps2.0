const { expect } = require('chai');
const globals = require('./mocks/globals');

const demand = require('../manager.hivemind.demand');
const htm = require('../manager.htm');
const spawnQueue = require('../manager.spawnQueue');

global.RESOURCE_ENERGY = 'energy';
global.FIND_SOURCES = 1;
global.FIND_CONSTRUCTION_SITES = 2;

describe('demand spawn scaling', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Memory.htm.colonies['W1N1'] = { tasks: [] };
    Memory.creeps = { h1: {}, m1: {} };
    Game.getObjectById = id => ({ id });

    Memory.demand = {
      rooms: {
        W1N1: {
          requesters: {
            s1: { deliveries: 1, averageEnergy: 100, averageTickTime: 5 },
          },
          deliverers: {
            h1: { deliveries: 1, averageEnergy: 20, averageTickTime: 10, role: 'hauler' },
            m1: { deliveries: 1, averageEnergy: 100, averageTickTime: 5, role: 'miner' },
          },
          totals: { demand: 0, supply: 0, demandRate: 0, supplyRate: 0 },
          runNextTick: true,
        },
      },
      globalTotals: { demand: 0, supply: 0, demandRate: 0, supplyRate: 0 },
    };

    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true, pos: { findInRange: () => [] } },
      find: () => [],
    };
    Game.creeps = {
      h1: { memory: { role: 'hauler' }, room: { name: 'W1N1' }, store: { [RESOURCE_ENERGY]: 0 } },
      m1: { memory: { role: 'miner' }, room: { name: 'W1N1' }, store: { [RESOURCE_ENERGY]: 0 } },
    };
  });

  it('queues additional haulers based on demand rate', function () {
    demand.run();
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const haulTask = tasks.find(t => t.name === 'spawnHauler');
    expect(haulTask).to.exist;
    expect(haulTask.amount).to.equal(1);
  });

  it('caps hauler spawning by miner and crew ratio', function () {
    Game.time = 100;
    Game.creeps = {
      h1: { memory: { role: 'hauler' }, room: { name: 'W1N1' }, store: {} },
      m1: { memory: { role: 'miner' }, room: { name: 'W1N1' }, store: {} },
      m2: { memory: { role: 'miner' }, room: { name: 'W1N1' }, store: {} },
      m3: { memory: { role: 'miner' }, room: { name: 'W1N1' }, store: {} },
      b1: { memory: { role: 'builder' }, room: { name: 'W1N1' }, store: {} },
      b2: { memory: { role: 'builder' }, room: { name: 'W1N1' }, store: {} },
      u1: { memory: { role: 'upgrader' }, room: { name: 'W1N1' }, store: {} },
      u2: { memory: { role: 'upgrader' }, room: { name: 'W1N1' }, store: {} },
    };

    spawnQueue.queue = [];
    const baseRequest = (suffix, delay = 0) => ({
      requestId: `${Game.time}-${suffix}`,
      category: 'hauler',
      room: 'W1N1',
      bodyParts: ['carry', 'move'],
      memory: { role: 'hauler' },
      spawnId: 's1',
      ticksToSpawn: delay,
      priority: 30,
    });
    spawnQueue.queue.push(
      baseRequest('a'),
      baseRequest('b'),
      baseRequest('c'),
      baseRequest('d'),
      baseRequest('e'),
      baseRequest('future', 5),
    );

    Memory.demand.rooms.W1N1.runNextTick = true;
    demand.run();

    expect(Memory.rooms['W1N1'].spawnLimits.maxHaulers).to.equal(3);

    const immediateQueued = spawnQueue.queue.filter(
      (req) =>
        req.room === 'W1N1' &&
        (req.category === 'hauler' || (req.memory && req.memory.role === 'hauler')) &&
        (typeof req.ticksToSpawn !== 'number' || req.ticksToSpawn <= 0),
    ).length;
    const liveHaulers = Object.values(Game.creeps).filter(
      (c) => c.memory.role === 'hauler' && c.room.name === 'W1N1',
    ).length;
    expect(immediateQueued + liveHaulers).to.be.at.most(5);
  });

  it('clamps existing non-replacement hauler task amount to strict cap', function () {
    Game.time = 200;
    Game.creeps = {
      h1: { memory: { role: 'hauler' }, room: { name: 'W1N1' }, store: {} },
      m1: { memory: { role: 'miner' }, room: { name: 'W1N1' }, store: {} },
      m2: { memory: { role: 'miner' }, room: { name: 'W1N1' }, store: {} },
    };
    spawnQueue.queue = [];
    Memory.htm.colonies['W1N1'].tasks = [
      {
        name: 'spawnHauler',
        manager: 'spawnManager',
        amount: 30,
        priority: 2,
        claimedUntil: 0,
      },
    ];
    Memory.demand.rooms.W1N1.runNextTick = true;

    demand.run();

    const haulTask = Memory.htm.colonies['W1N1'].tasks.find(
      (t) => t.name === 'spawnHauler' && t.manager === 'spawnManager',
    );
    expect(haulTask).to.exist;
    // cap=2 (miners), one live hauler, no generic headroom => max task amount is 1
    expect(haulTask.amount).to.be.at.most(1);
  });
});
