const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');

global.FIND_STRUCTURES = 1;
global.FIND_MY_SPAWNS = 2;
global.FIND_DROPPED_RESOURCES = 3;
global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;

describe('hauler avoids withdrawing from deposit container', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [], controller: { pos: { findInRange: () => [] } } };
  });

  it('does not withdraw from container it just filled', function() {
    const container = { id: 'c1', structureType: STRUCTURE_CONTAINER, store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 2000 }, pos: { x:5, y:5, roomName:'W1N1' } };
    Game.getObjectById = id => container;
    Game.rooms['W1N1'].controller.pos.findInRange = () => [container];
    let withdrawCalled = false;
    const creep = {
      name: 'h1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 0 },
      pos: { x:5, y:5, roomName:'W1N1', findClosestByPath: () => null, getRangeTo: () => 1 },
      travelTo: () => {},
      transfer: () => { container.store[RESOURCE_ENERGY] += 50; creep.store[RESOURCE_ENERGY] = 0; return OK; },
      pickup: () => OK,
      withdraw: () => { withdrawCalled = true; return OK; },
      memory: {},
    };
    roleHauler.run(creep); // deposit
    expect(creep.memory.blockedContainerId).to.equal('c1');
    roleHauler.run(creep); // attempt to withdraw
    expect(withdrawCalled).to.be.false;
  });

  it('keeps container blocked for several ticks after leaving', function() {
    const container = { id: 'c1', structureType: STRUCTURE_CONTAINER, store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 2000 }, pos: { x:5, y:5, roomName:'W1N1' } };
    Game.getObjectById = id => container;
    Game.rooms['W1N1'].controller.pos.findInRange = () => [container];
    let withdrawCalled = false;
    const creep = {
      name: 'h1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 0 },
      pos: { x:5, y:5, roomName:'W1N1', findClosestByPath: () => null, getRangeTo: () => 1 },
      travelTo: () => {},
      transfer: () => { container.store[RESOURCE_ENERGY] += 50; creep.store[RESOURCE_ENERGY] = 0; return OK; },
      pickup: () => OK,
      withdraw: () => { withdrawCalled = true; return OK; },
      memory: {},
    };
    roleHauler.run(creep); // deposit
    creep.pos.getRangeTo = () => 3; // moved away
    Game.time += 3;
    roleHauler.run(creep); // still blocked
    expect(withdrawCalled).to.be.false;
  });
});
