const { expect } = require('chai');
const globals = require('./mocks/globals');

const demand = require('../manager.hivemind.demand');
const htm = require('../manager.htm');

global.RESOURCE_ENERGY = 'energy';

describe('demand cleanup of dead creeps', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Memory.htm.colonies['W1N1'] = { tasks: [] };
    Memory.creeps = { liveHauler: {} };

    Memory.demand = {
      rooms: {
        W1N1: {
          requesters: {
            deadCreep: { deliveries: 1, averageEnergy: 50, averageTickTime: 10 },
          },
          deliverers: {
            deadHauler: { deliveries: 1, averageEnergy: 50, averageTickTime: 10, role: 'hauler' },
            liveHauler: { deliveries: 1, averageEnergy: 50, averageTickTime: 10, role: 'hauler' },
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
    Game.getObjectById = () => null;
    Game.creeps = {
      liveHauler: { memory: { role: 'hauler' }, room: { name: 'W1N1' }, store: { [RESOURCE_ENERGY]: 0 } },
    };
  });

  it('removes non-existent creeps from demand data', function () {
    demand.run();
    const roomMem = Memory.demand.rooms['W1N1'];
    expect(roomMem.deliverers.deadHauler).to.be.undefined;
    expect(roomMem.deliverers.liveHauler).to.exist;
    expect(roomMem.requesters.deadCreep).to.be.undefined;
  });

  it('totals include outstanding requests', function () {
    Memory.demand.rooms['W1N1'].requesters = {
      s1: { lastEnergyRequested: 100, deliveries: 0, averageRequested: 100 },
    };
    Game.getObjectById = id => ({ id });
    Memory.demand.rooms['W1N1'].runNextTick = true;
    demand.run();
    const roomMem = Memory.demand.rooms['W1N1'];
    expect(roomMem.totals.demand).to.equal(100);
  });
});
