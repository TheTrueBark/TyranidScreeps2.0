const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleBuilder = require('../role.builder');

global.FIND_CONSTRUCTION_SITES = 1;
global.FIND_MY_SPAWNS = 2;
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_STORAGE = 'storage';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;

describe('builder retains mainTask while refueling', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.htm.creeps = {};
    Memory.constructionReservations = {};
    const site = { id: 's1', progress: 0, progressTotal: 100, pos: { x: 1, y: 1, roomName: 'W1N1', lookFor: () => [] } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => (type === FIND_CONSTRUCTION_SITES ? [site] : []),
      memory: { buildingQueue: [{ id: 's1', priority: 100 }] },
      controller: {},
    };
    Game.getObjectById = id => site;
    Memory.rooms = { W1N1: { buildingQueue: [{ id: 's1', priority: 100 }] } };
  });

  it('keeps mainTask id after requesting energy', function() {
    const creep = {
      name: 'b1',
      memory: { working: false, mainTask: { type: 'build', id: 's1' } },
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        getRangeTo: () => 5,
        findInRange: () => [],
        findClosestByRange: () => ({ id: 's1', pos: { x: 1, y: 1, roomName: 'W1N1' } }),
        isNearTo: () => false,
      },
      travelTo: () => {},
      build: () => OK,
      upgradeController: () => OK,
      harvest: () => OK,
    };
    roleBuilder.run(creep);
    expect(creep.memory.mainTask).to.deep.equal({ type: 'build', id: 's1' });
  });
});
