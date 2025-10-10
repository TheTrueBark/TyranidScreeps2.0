const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleUpgrader = require('../role.upgrader');

global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;

describe('upgrader upgrades when powered', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    const container = { id: 'c1', store: { [RESOURCE_ENERGY]: 0 }, pos: { x: 5, y: 5 } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { pos: { findInRange: () => [container] } },
      find: () => [],
    };
    Game.getObjectById = id => container;
    Memory.constructionReservations = {};
  });

  it('calls upgradeController when in range and has energy', function() {
    let upgraded = false;
    const creep = {
      name: 'u1',
      memory: {},
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 50 },
      pos: { x: 5, y: 5, getRangeTo: () => 2 },
      travelTo: () => {},
      upgradeController: () => { upgraded = true; return OK; },
    };
    roleUpgrader.run(creep);
    expect(upgraded).to.be.true;
  });
});
