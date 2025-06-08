const { expect } = require('chai');
const globals = require('./mocks/globals');

const demand = require('../manager.hivemind.demand');

describe('demand recordDelivery', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
  });

  it('updates averages and flags next run', function () {
    demand.recordDelivery('s1', 10, 100, 'W1N1');
    demand.recordDelivery('s1', 20, 50, 'W1N1');

    const data = Memory.demand.requesters['s1'];
    expect(data.lastTickTime).to.equal(20);
    expect(data.lastEnergy).to.equal(50);
    expect(data.deliveries).to.equal(2);
    expect(data.averageTickTime).to.equal(15);
    expect(data.averageEnergy).to.equal(75);
    expect(Memory.demand.runNextTick).to.be.true;

    demand.run();
    expect(Memory.demand.runNextTick).to.be.false;
  });

  it('queues hauler when delivery rate low', function () {
    const htm = require('../manager.htm');
    htm.init();
    Game.rooms['W1N1'] = { name: 'W1N1' };
    demand.recordDelivery('target1', 100, 20, 'W1N1');
    demand.run();
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const haulTask = tasks.find(t => t.name === 'spawnHauler');
    expect(haulTask).to.exist;
  });
});
