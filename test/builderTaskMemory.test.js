const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleBuilder = require('../role.builder');

global.FIND_MY_SPAWNS = 1;
global.FIND_CONSTRUCTION_SITES = 2;
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_STORAGE = 'storage';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;

describe('builder task memory', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    const site = { id: 's1', pos: { x: 1, y: 1, roomName: 'W1N1', lookFor: () => [] } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => (type === FIND_CONSTRUCTION_SITES ? [site] : []),
      memory: { buildingQueue: [{ id: 's1', priority: 100 }] },
      controller: {},
    };
    Game.getObjectById = id => site;
    Memory.rooms = { W1N1: { buildingQueue: [{ id: 's1', priority: 100 }], siteAssignments: {} } };
  });

  it('retains build task after requesting energy', function () {
    const creep = {
      name: 'b1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        getRangeTo: () => 1,
        findInRange: () => [],
      },
      travelTo: () => {},
      build: () => OK,
      memory: {},
    };
    roleBuilder.run(creep);
    expect(creep.memory.mainTask).to.deep.equal({ type: 'build', id: 's1' });
    const tasks = Memory.htm.creeps['b1'].tasks;
    const names = tasks.map(t => t.name);
    expect(names).to.include('deliverEnergy');
  });
});

