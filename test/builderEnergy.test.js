const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleBuilder = require('../role.builder');

global.FIND_MY_SPAWNS = 1;
global.FIND_DROPPED_RESOURCES = 2;
global.FIND_STRUCTURES = 3;
global.FIND_CONSTRUCTION_SITES = 4;
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_STORAGE = 'storage';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;

function createCreep(name) {
  return {
    name,
    room: {
      name: 'W1N1',
      find: () => [],
      controller: {},
    },
    store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
    pos: {
      x: 10,
      y: 10,
      roomName: 'W1N1',
      getRangeTo: () => 5,
      findInRange: () => [],
    },
    travelTo: () => {},
    build: () => OK,
    repair: () => OK,
    upgradeController: () => OK,
    memory: {},
  };
}

describe('builder energy evaluation', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [], controller: {} };
    htm.init();
  });

  it('queues deliverEnergy when no nearby energy', function () {
    const creep = createCreep('b1');
    roleBuilder.run(creep);
    const tasks = Memory.htm.creeps['b1'].tasks;
    expect(tasks[0].name).to.equal('deliverEnergy');
  });

  it('does not request energy if dropped energy nearby', function () {
    const creep = createCreep('b2');
    const dropped = { resourceType: RESOURCE_ENERGY, amount: 50, pos: { x: 9, y: 10, roomName: 'W1N1' } };
    creep.pos.findInRange = (type) => (type === FIND_DROPPED_RESOURCES ? [dropped] : []);
    creep.pickup = () => OK;
    roleBuilder.run(creep);
    expect(Memory.htm.creeps['b2']).to.be.undefined;
  });
});
