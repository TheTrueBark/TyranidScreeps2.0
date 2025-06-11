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
      findClosestByRange: () => ({ id: 's1', pos: { x: 1, y: 1, roomName: 'W1N1' } }),
      isNearTo: () => false,
    },
    travelTo: () => {},
    build: () => OK,
    repair: () => OK,
    upgradeController: () => OK,
    harvest: () => OK,
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
    let harvested = false;
    creep.harvest = () => {
      harvested = true;
      return OK;
    };
    roleBuilder.run(creep);
    expect(harvested).to.be.true;
  });

  it('does not request energy if dropped energy nearby', function () {
    const creep = createCreep('b2');
    const dropped = { resourceType: RESOURCE_ENERGY, amount: 50, pos: { x: 9, y: 10, roomName: 'W1N1' } };
    creep.pos.findInRange = (type) => (type === FIND_DROPPED_RESOURCES ? [dropped] : []);
    creep.pickup = () => OK;
    roleBuilder.run(creep);
    expect(Memory.htm.creeps['b2']).to.be.undefined;
  });

  it('does not request energy if container nearby', function () {
    const creep = createCreep('b3');
    const container = { structureType: STRUCTURE_CONTAINER, store: { [RESOURCE_ENERGY]: 100 }, pos: { x: 11, y: 10, roomName: 'W1N1' } };
    creep.pos.findInRange = (type) => (type === FIND_STRUCTURES ? [container] : []);
    creep.pickup = () => OK;
    creep.withdraw = () => OK;
    roleBuilder.run(creep);
    expect(Memory.htm.creeps['b3']).to.be.undefined;
  });

  it('does not request energy if storage nearby', function () {
    const creep = createCreep('b4');
    const storage = { structureType: STRUCTURE_STORAGE, store: { [RESOURCE_ENERGY]: 200 }, pos: { x: 12, y: 10, roomName: 'W1N1' } };
    creep.pos.findInRange = (type) => (type === FIND_STRUCTURES ? [storage] : []);
    creep.pickup = () => OK;
    creep.withdraw = () => OK;
    roleBuilder.run(creep);
    expect(Memory.htm.creeps['b4']).to.be.undefined;
  });

  it('scans for energy within 15 tiles', function () {
    const creep = createCreep('b5');
    let rangeChecked = 0;
    creep.pos.findInRange = (type, range) => {
      rangeChecked = range;
      return [];
    };
    roleBuilder.run(creep);
    expect(rangeChecked).to.equal(15);
  });
});
