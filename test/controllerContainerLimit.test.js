const { expect } = require('chai');
const globals = require('./mocks/globals');

const building = require('../manager.building');

global.FIND_STRUCTURES = 1;
global.FIND_CONSTRUCTION_SITES = 2;
global.FIND_MY_SPAWNS = 3;

global.STRUCTURE_CONTAINER = 'container';

describe('buildControllerContainers single site', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = { W1N1: {} };
    const container = { structureType: STRUCTURE_CONTAINER, pos: { x: 8, y: 8 } };
    const spawn = { pos: { getRangeTo: () => 5 } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { pos: { findInRange: () => [container], x: 6, y: 6 } },
      find: type => {
        if (type === FIND_STRUCTURES) return [container];
        if (type === FIND_CONSTRUCTION_SITES) return [];
        if (type === FIND_MY_SPAWNS) return [spawn];
        return [];
      },
      createConstructionSite: () => { created = true; return OK; },
    };
    created = false;
  });

  it('does not create site if controller container exists', function() {
    const room = Game.rooms['W1N1'];
    building.buildControllerContainers(room);
    expect(created).to.be.false;
  });
});
