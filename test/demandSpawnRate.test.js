const { expect } = require('chai');
const globals = require('./mocks/globals');

const demand = require('../manager.hivemind.demand');
const htm = require('../manager.htm');

global.RESOURCE_ENERGY = 'energy';

describe('demand spawn scaling', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Memory.htm.colonies['W1N1'] = { tasks: [] };
    Memory.creeps = { h1: {} };
    Game.getObjectById = id => ({ id });

    Memory.demand = {
      rooms: {
        W1N1: {
          requesters: {
            s1: { deliveries: 1, averageEnergy: 100, averageTickTime: 5 },
          },
          deliverers: {
            h1: { deliveries: 1, averageEnergy: 20, averageTickTime: 10 },
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
    };
  });

  it('queues additional haulers based on demand rate', function () {
    demand.run();
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const haulTask = tasks.find(t => t.name === 'spawnHauler');
    expect(haulTask).to.exist;
    expect(haulTask.amount).to.equal(3);
  });
});
