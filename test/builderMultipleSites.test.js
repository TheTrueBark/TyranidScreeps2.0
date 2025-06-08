const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleBuilder = require('../role.builder');
const htm = require('../manager.htm');

global.FIND_CONSTRUCTION_SITES = 1;
global.FIND_MY_SPAWNS = 2;
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_STORAGE = 'storage';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.LOOK_CREEPS = 'creep';
global.TERRAIN_MASK_WALL = 1;

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
      isEqualTo: function (p) { return p.x === this.x && p.y === this.y; },
    },
    travelTo: () => {},
    build: () => OK,
    upgradeController: () => OK,
  };
}

describe('builder multi-site assignment', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.htm.creeps = {};
    const site1 = createSite('s1');
    const site2 = createSite('s2');
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => (type === FIND_CONSTRUCTION_SITES ? [site1, site2] : []),
      memory: { buildingQueue: [{ id: 's1', priority: 100 }, { id: 's2', priority: 90 }] },
      controller: {},
    };
    Game.getObjectById = id => (id === 's1' ? site1 : site2);
    Memory.rooms = { W1N1: { buildingQueue: [{ id: 's1', priority: 100 }, { id: 's2', priority: 90 }], siteAssignments: {} } };
  });

  it('assigns builders to second site when first is full', function () {
    // Four builders take first site
    for (let i = 0; i < 4; i++) {
      const c = createCreep('b' + i);
      roleBuilder.run(c);
    }
    const extra = createCreep('extra');
    roleBuilder.run(extra);
    expect(Memory.rooms.W1N1.siteAssignments['s2']).to.equal(1);
  });
});
