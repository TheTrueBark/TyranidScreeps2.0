const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleAllPurpose = require('../role.allPurpose');

// Global constants required by the role logic
global.FIND_DROPPED_RESOURCES = 1;
global.FIND_SOURCES = 2;
global.FIND_STRUCTURES = 3;
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_SPAWN = 'spawn';
global.FIND_MY_SPAWNS = 4;
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;

// Minimal RoomPosition mock used by the role
global.RoomPosition = function (x, y, roomName) {
  this.x = x;
  this.y = y;
  this.roomName = roomName;
  this.isEqualTo = function (x2, y2) {
    if (typeof x2 === 'object') {
      return this.x === x2.x && this.y === x2.y && this.roomName === x2.roomName;
    }
    return this.x === x2 && this.y === y2;
  };
  this.findClosestByRange = () => ({ id: 's1', pos: this });
};

function createCreep(dropped) {
  return {
    name: 'ap1',
    room: { name: 'W1N1', controller: {}, find: () => [] },
    store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
    pos: {
      x: 5,
      y: 5,
      roomName: 'W1N1',
      findClosestByRange: () => null,
      findClosestByPath: (type, opts) => {
        if (type !== FIND_DROPPED_RESOURCES) return null;
        if (opts && typeof opts.filter === 'function' && !opts.filter(dropped)) {
          return null;
        }
        return dropped;
      },
      isNearTo: () => false,
      isEqualTo: () => false,
    },
    travelTo: () => {},
    pickup: () => ERR_NOT_IN_RANGE,
    harvest: () => OK,
    transfer: () => OK,
    upgradeController: () => OK,
    say: () => {},
    memory: {
      source: 's1',
      sourcePosition: { x: 6, y: 6, roomName: 'W1N1' },
      miningPosition: { x: 1, y: 1, roomName: 'W1N1', reserved: true },
      working: false,
      desiredPosition: {},
    },
  };
}

describe('allPurpose energy collection', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [] };
    Memory.rooms = {
      W1N1: { miningPositions: { s1: { positions: { a: { x: 1, y: 1, roomName: 'W1N1', reserved: false } } } } },
    };
  });

  it('moves to dropped energy when enough is available', function () {
    const dropped = { resourceType: RESOURCE_ENERGY, amount: 50, pos: { x: 4, y: 4, roomName: 'W1N1' } };
    const creep = createCreep(dropped);
    roleAllPurpose.run(creep);
    expect(creep.memory.desiredPosition).to.include(dropped.pos);
  });

  it('uses mining position when dropped energy is insufficient', function () {
    const dropped = { resourceType: RESOURCE_ENERGY, amount: 10, pos: { x: 4, y: 4, roomName: 'W1N1' } };
    const creep = createCreep(dropped);
    roleAllPurpose.run(creep);
    expect(creep.memory.desiredPosition).to.include({ x: 1, y: 1, roomName: 'W1N1' });
  });
});
