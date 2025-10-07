const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleHauler = require('../role.hauler');

// Minimal constants
global.RESOURCE_ENERGY = 'energy';
global.ERR_NOT_IN_RANGE = -9;
global.OK = 0;

describe('hauler task claiming', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', storage: null, find: () => [] };
    htm.init();
    Memory.htm.creeps['u1'] = {
      tasks: [{ name: 'deliverEnergy', data: { pos: { x: 5, y: 5, roomName: 'W1N1' }, ticksNeeded: 40 }, priority: 1, ttl: 50, amount: 1, claimedUntil: 0, manager: 'hauler' }]
    };
    Memory.htm.creeps['u2'] = {
      tasks: [{ name: 'deliverEnergy', data: { pos: { x: 7, y: 7, roomName: 'W1N1' }, ticksNeeded: 20 }, priority: 1, ttl: 50, amount: 1, claimedUntil: 0, manager: 'hauler' }]
    };
  });

  function createHauler(name) {
    const room = Game.rooms['W1N1'];
    return {
      name,
      ticksToLive: 200,
      room,
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        getRangeTo() { return 5; },
      },
      travelTo: () => {},
      transfer: () => OK,
      pickup: () => OK,
      withdraw: () => OK,
      memory: {},
    };
  }

  it('claims task with lowest ticksNeeded first', function() {
    const creep = createHauler('h1');
    roleHauler.run(creep);
    expect(creep.memory.task.target).to.equal('u2');
  });
});
