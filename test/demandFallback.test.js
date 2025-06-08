const { expect } = require('chai');
const globals = require('./mocks/globals');

const demand = require('../manager.hivemind.demand');
const htm = require('../manager.htm');

describe('demand fallback hauler spawn', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Memory.htm.colonies['W1N1'] = { tasks: [] };
    demand.shouldRun();
    Memory.creeps = {};
    Game.getObjectById = id => ({ id });
  });

  it('queues hauler when miners exist but no haulers', function () {
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true, pos: { findInRange: () => [] } },
      find: () => [],
    };
    Game.creeps = {
      m1: { memory: { role: 'miner' }, room: { name: 'W1N1' } },
      m2: { memory: { role: 'miner' }, room: { name: 'W1N1' } },
    };
    demand.run();
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const haulTask = tasks.find(t => t.name === 'spawnHauler');
    expect(haulTask).to.exist;
  });
});
