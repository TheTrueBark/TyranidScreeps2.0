const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleUpgrader = require('../role.upgrader');
const htm = require('../manager.htm');

global.FIND_MY_SPAWNS = 1;
global.FIND_STRUCTURES = 2;
global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;

describe('upgrader assigns container after it appears', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N1: {} };
    Memory.htm.creeps = {};
    const container = { id: 'c1', structureType: STRUCTURE_CONTAINER, store: { [RESOURCE_ENERGY]: 100 }, pos: { x:5, y:5, roomName:'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { pos: { findInRange: () => [container] } },
      find: () => [],
    };
    Game.getObjectById = id => container;
  });

  it('updates memory with new container and position', function() {
    const creep = {
      name: 'u1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      pos: { x:10, y:10, roomName:'W1N1', getRangeTo: () => 5 },
      travelTo: () => {},
      withdraw: () => OK,
      upgradeController: () => OK,
      memory: { upgradePos: { x:10, y:10, roomName:'W1N1' } },
    };
    roleUpgrader.run(creep);
    expect(creep.memory.containerId).to.equal('c1');
    expect(creep.memory.upgradePos.x).to.equal(5);
  });
});
