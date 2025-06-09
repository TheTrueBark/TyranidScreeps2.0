const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleUpgrader = require('../role.upgrader');

global.FIND_STRUCTURES = 1;
global.FIND_MY_SPAWNS = 2;
global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;

describe('upgrader withdraws from nearby container when not full', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = { W1N1: {} };
    const container = { id: 'c1', structureType: STRUCTURE_CONTAINER, store: { [RESOURCE_ENERGY]: 200 }, pos: { x:5, y:5, roomName:'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { pos: { findInRange: () => [container] } },
      find: () => [],
    };
    Game.getObjectById = id => container;
  });

  it('calls withdraw when container in range and creep not full', function() {
    let withdrew = false;
    const creep = {
      name: 'u1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 50 },
      pos: { x:5, y:5, roomName:'W1N1', getRangeTo: () => 1 },
      travelTo: () => {},
      withdraw: () => { withdrew = true; return OK; },
      upgradeController: () => OK,
      memory: {},
    };
    roleUpgrader.run(creep);
    expect(withdrew).to.be.true;
  });
});
