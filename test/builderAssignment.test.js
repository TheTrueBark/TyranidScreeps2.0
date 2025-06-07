const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleBuilder = require('../role.builder');

global.FIND_CONSTRUCTION_SITES = 1;
global.FIND_MY_SPAWNS = 2;
global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;

function createSite(id) {
  return {
    id,
    progress: 0,
    progressTotal: 100,
    structureType: STRUCTURE_CONTAINER,
    pos: { x: 1, y: 1, roomName: 'W1N1', lookFor: () => [] },
  };
}

function createCreep(name) {
  return {
    name,
    memory: { working: true },
    room: Game.rooms['W1N1'],
    store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 0 },
    pos: {
      x: 10,
      y: 10,
      roomName: 'W1N1',
      getRangeTo: () => 1,
      findClosestByRange: () => null,
      findInRange: () => [],
    },
    travelTo: () => {},
    build: () => OK,
    upgradeController: () => OK,
  };
}

describe('builder assignment', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    const site = createSite('s1');
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => (type === FIND_CONSTRUCTION_SITES ? [site] : []),
      memory: { buildingQueue: [{ id: 's1', priority: 100 }] },
      controller: {},
    };
    Game.getObjectById = () => site;
    Memory.rooms = { W1N1: { buildingQueue: [{ id: 's1', priority: 100 }], siteAssignments: {} } };
  });

  it('limits builders per site to four', function () {
    for (let i = 0; i < 5; i++) {
      const c = createCreep('b' + i);
      roleBuilder.run(c);
    }
    expect(Memory.rooms.W1N1.siteAssignments['s1']).to.equal(4);
  });
});
