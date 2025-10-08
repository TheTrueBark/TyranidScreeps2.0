const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const energyRequests = require('../manager.energyRequests');

global.FIND_MY_SPAWNS = 1;
global.FIND_MY_STRUCTURES = 2;
global.FIND_STRUCTURES = 3;
global.STRUCTURE_EXTENSION = 'extension';
global.RESOURCE_ENERGY = 'energy';

describe('spawn energy requests', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      energyAvailable: 0,
      energyCapacityAvailable: 150,
      find: (type, opts = {}) => {
        if (type === FIND_MY_SPAWNS) {
          const spawns = [
            {
              id: 's1',
              store: {
                getFreeCapacity: () => 150,
              },
              pos: { x: 5, y: 5, roomName: 'W1N1' },
              structureType: 'spawn',
            },
          ];
          return typeof opts.filter === 'function' ? spawns.filter(opts.filter) : spawns;
        }
        if (type === FIND_MY_STRUCTURES || type === FIND_STRUCTURES) {
          return [];
        }
        return [];
      },
    };
  });

  it('creates deliverEnergy task for spawn', function () {
    const room = Game.rooms['W1N1'];
    energyRequests.run(room);
    const tasks = Memory.htm.creeps['s1'].tasks;
    expect(tasks[0].name).to.equal('deliverEnergy');
    expect(tasks[0].data.amount).to.equal(150);
    expect(tasks[0].priority).to.equal(0);
    const state = energyRequests.getDeliveryState('s1');
    expect(state).to.include({
      requested: 150,
      outstanding: 150,
      reserved: 0,
    });
  });

  it('tracks reservations and outstanding energy for spawn', function () {
    const room = Game.rooms['W1N1'];
    energyRequests.run(room);
    energyRequests.reserveDelivery('s1', 100, { roomName: 'W1N1', structureType: 'spawn' });
    let state = energyRequests.getDeliveryState('s1');
    expect(state.reserved).to.equal(100);
    expect(state.outstanding).to.equal(50);

    energyRequests.releaseDelivery('s1', 30);
    state = energyRequests.getDeliveryState('s1');
    expect(state.reserved).to.equal(70);
    expect(state.outstanding).to.equal(80);
  });
});
