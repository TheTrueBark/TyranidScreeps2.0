const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleUpgrader = require('../role.upgrader');

global.FIND_MY_SPAWNS = 1;
global.FIND_STRUCTURES = 2;
global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;

describe('upgrader moves toward controller when not in range', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = { W1N1: {} };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: {},
      find: () => [],
    };
    Game.getObjectById = () => null;
    Memory.constructionReservations = {};
  });

  it('calls travelTo when controller is farther than range 3', function() {
    let moved = false;
    const creep = {
      name: 'u1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 0 },
      pos: { x:10, y:10, roomName:'W1N1', getRangeTo: () => 5 },
      travelTo: () => { moved = true; },
      upgradeController: () => OK,
      memory: {},
    };
    roleUpgrader.run(creep);
    expect(moved).to.be.true;
  });
});
