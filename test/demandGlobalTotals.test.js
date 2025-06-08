const { expect } = require('chai');
const globals = require('./mocks/globals');

const demand = require('../manager.hivemind.demand');
const htm = require('../manager.htm');

global.RESOURCE_ENERGY = 'energy';

describe('demand global totals aggregation', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Memory.htm.colonies['W1N1'] = { tasks: [] };
    Game.getObjectById = id => ({ id });

    Memory.demand = {
      rooms: {
        W1N1: {
          requesters: {
            s1: { deliveries: 1, averageEnergy: 50, averageTickTime: 5 },
          },
          deliverers: {
            h1: { deliveries: 1, averageEnergy: 20, averageTickTime: 10, role: 'hauler' },
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

  it('aggregates room totals into global totals', function () {
    demand.run();
    const roomMem = Memory.demand.rooms['W1N1'].totals;
    expect(Memory.demand.globalTotals.demand).to.equal(roomMem.demand);
    expect(Memory.demand.globalTotals.supply).to.equal(roomMem.supply);
    expect(Memory.demand.globalTotals.demandRate).to.equal(roomMem.demandRate);
    expect(Memory.demand.globalTotals.supplyRate).to.equal(roomMem.supplyRate);
  });
});
