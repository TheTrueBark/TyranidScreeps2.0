const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleBuilder = require('../role.builder');

global.FIND_MY_SPAWNS = 1;
global.FIND_DROPPED_RESOURCES = 2;
global.FIND_STRUCTURES = 3;
global.FIND_CONSTRUCTION_SITES = 4;
global.FIND_TOMBSTONES = 5;
global.FIND_RUINS = 6;
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_TERMINAL = 'terminal';
global.STRUCTURE_FACTORY = 'factory';
global.STRUCTURE_LAB = 'lab';
global.STRUCTURE_POWER_SPAWN = 'powerSpawn';
global.STRUCTURE_SPAWN = 'spawn';
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
    withdraw: () => ERR_NOT_IN_RANGE,
    pickup: () => ERR_NOT_IN_RANGE,
    memory: {},
  };
}

describe('builder energy evaluation', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [], controller: {} };
    htm.init();
    Memory.constructionReservations = {};
    Game.getObjectById = () => null;
  });

  it('requests hauled energy when no sources available', function () {
    const creep = createCreep('b1');
    roleBuilder.run(creep);
    expect(Memory.htm.creeps['b1']).to.exist;
    expect(creep.memory.energyTask).to.be.undefined;
  });

  it('reserves dropped energy when available', function () {
    const creep = createCreep('b2');
    const dropped = {
      id: 'drop1',
      resourceType: RESOURCE_ENERGY,
      amount: 80,
      pos: { x: 9, y: 10, roomName: 'W1N1' },
    };
    Game.rooms['W1N1'].find = type =>
      (type === FIND_DROPPED_RESOURCES ? [dropped] : []);
    Game.getObjectById = id => (id === 'drop1' ? dropped : null);
    creep.pickup = () => ERR_NOT_IN_RANGE;
    creep.room = Game.rooms['W1N1'];
    roleBuilder.run(creep);
    expect(Memory.htm.creeps['b2']).to.be.undefined;
    expect(creep.memory.energyTask).to.deep.include({ id: 'drop1', type: 'pickup' });
    expect(Memory.energyReserves['drop1']).to.equal(50);
  });

  it('reserves container energy when available', function () {
    const creep = createCreep('b3');
    const container = {
      id: 'cont1',
      structureType: STRUCTURE_CONTAINER,
      store: { [RESOURCE_ENERGY]: 200, getCapacity: () => 200 },
      pos: { x: 11, y: 10, roomName: 'W1N1' },
    };
    Game.rooms['W1N1'].find = type =>
      (type === FIND_STRUCTURES ? [container] : []);
    Game.getObjectById = id => (id === 'cont1' ? container : null);
    creep.withdraw = () => ERR_NOT_IN_RANGE;
    creep.room = Game.rooms['W1N1'];
    roleBuilder.run(creep);
    expect(Memory.htm.creeps['b3']).to.be.undefined;
    expect(creep.memory.energyTask).to.deep.include({ id: 'cont1', type: 'withdraw' });
    expect(Memory.energyReserves['cont1']).to.equal(50);
  });

  it('considers spawn energy when efficient', function () {
    const creep = createCreep('b4');
    const spawn = {
      id: 'spawn1',
      structureType: STRUCTURE_SPAWN,
      store: {
        [RESOURCE_ENERGY]: 300,
        getUsedCapacity: () => 300,
      },
      pos: { x: 8, y: 10, roomName: 'W1N1' },
    };
    Game.rooms['W1N1'].find = type =>
      (type === FIND_MY_SPAWNS ? [spawn] : []);
    Game.getObjectById = id => (id === 'spawn1' ? spawn : null);
    creep.withdraw = () => ERR_NOT_IN_RANGE;
    creep.room = Game.rooms['W1N1'];
    roleBuilder.run(creep);
    expect(Memory.htm.creeps['b4']).to.be.undefined;
    expect(creep.memory.energyTask).to.deep.include({ id: 'spawn1', type: 'withdraw' });
    expect(creep.memory.energyTask.structureType).to.equal(STRUCTURE_SPAWN);
    expect(Memory.energyReserves['spawn1']).to.equal(50);
  });
});
