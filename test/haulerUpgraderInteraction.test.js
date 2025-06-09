const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');

global.RESOURCE_ENERGY = 'energy';
global.ERR_NOT_IN_RANGE = -9;
global.OK = 0;

describe('hauler stays with upgrader until empty', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [] };
    Memory.stats = { logs: [] };
  });

  it('keeps task while upgrader is full', function() {
    const upgrader = {
      name: 'u1',
      store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 0 },
      room: { name: 'W1N1' },
    };
    Game.creeps = { u1: upgrader };
    const creep = {
      name: 'h1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 100, getFreeCapacity: () => 0 },
      pos: { x: 10, y: 10, roomName: 'W1N1', getRangeTo: () => 1, findClosestByPath: () => null },
      travelTo: () => {},
      transfer: function() {
        const amount = Math.min(this.store[RESOURCE_ENERGY], 50);
        this.store[RESOURCE_ENERGY] -= amount;
        return OK;
      },
      pickup: () => OK,
      withdraw: () => OK,
      memory: {
        task: { name: 'deliverEnergy', target: 'u1', pos: { x: 10, y: 10, roomName: 'W1N1' }, reserved: 100, startTime: 0, initial: 100 },
      },
    };
    roleHauler.run(creep);
    expect(creep.memory.task).to.exist;
    expect(creep.memory.task.reserved).to.equal(50);
  });

  it('clears task once all energy delivered', function() {
    const upgrader = {
      name: 'u1',
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      room: { name: 'W1N1' },
    };
    Game.creeps = { u1: upgrader };
    const creep = {
      name: 'h1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 0 },
      pos: { x: 10, y: 10, roomName: 'W1N1', getRangeTo: () => 1, findClosestByPath: () => null },
      travelTo: () => {},
      transfer: function() {
        const amount = Math.min(this.store[RESOURCE_ENERGY], 50);
        this.store[RESOURCE_ENERGY] -= amount;
        return OK;
      },
      pickup: () => OK,
      withdraw: () => OK,
      memory: {
        task: { name: 'deliverEnergy', target: 'u1', pos: { x: 10, y: 10, roomName: 'W1N1' }, reserved: 50, startTime: 0, initial: 50 },
      },
    };
    roleHauler.run(creep);
    expect(creep.memory.task).to.be.undefined;
  });
});
