const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleHauler = require('../role.hauler');

// Minimal constants
global.RESOURCE_ENERGY = 'energy';
global.ERR_NOT_IN_RANGE = -9;
global.OK = 0;

function createHauler(name) {
  return {
    name,
    ticksToLive: 200,
    room: { name: 'W1N1' },
    store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
    pos: {
      x: 10,
      y: 10,
      roomName: 'W1N1',
      getRangeTo: () => 5,
      findClosestByPath: () => null,
    },
    travelTo: () => {},
    transfer: () => OK,
    pickup: () => OK,
    withdraw: () => OK,
    memory: {},
  };
}

describe('hauler task claiming', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [] };
    htm.init();
    Memory.htm.creeps['u1'] = {
      tasks: [{ name: 'deliverEnergy', data: { pos: { x: 5, y: 5, roomName: 'W1N1' }, ticksNeeded: 40 }, priority: 1, ttl: 50, amount: 1, claimedUntil: 0, manager: 'hauler' }]
    };
    Memory.htm.creeps['u2'] = {
      tasks: [{ name: 'deliverEnergy', data: { pos: { x: 7, y: 7, roomName: 'W1N1' }, ticksNeeded: 20 }, priority: 1, ttl: 50, amount: 1, claimedUntil: 0, manager: 'hauler' }]
    };
  });

  it('claims task with lowest ticksNeeded first', function() {
    const creep = createHauler('h1');
    roleHauler.run(creep);
    expect(creep.memory.task.target).to.equal('u2');
  });
});
