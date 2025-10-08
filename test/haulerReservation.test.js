const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');

global.RESOURCE_ENERGY = 'energy';
global.FIND_DROPPED_RESOURCES = 1;
global.FIND_SOURCES = 2;
global.STRUCTURE_CONTAINER = 'container';
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;

describe('hauler respects energy reservations', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.energyReserves = {};
    const source = {
      id: 'src1',
      pos: {
        x: 5,
        y: 5,
        roomName: 'W1N1',
        findInRange: () => [],
      },
    };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      storage: null,
      find: (type) => {
        if (type === FIND_SOURCES) return [source];
        return [];
      },
    };
    Game.getObjectById = (id) => (id === source.id ? source : null);
  });

  it('picks non-reserved resource when closer one fully reserved', function() {
    const r1 = { id: 'r1', amount: 20, resourceType: RESOURCE_ENERGY, pos: { x: 5, y: 5, roomName: 'W1N1' } };
    const r2 = { id: 'r2', amount: 100, resourceType: RESOURCE_ENERGY, pos: { x: 10, y: 10, roomName: 'W1N1' } };

    const room = Game.rooms['W1N1'];
    const previousFind = room.find;
    room.find = (type) => {
      if (type === FIND_DROPPED_RESOURCES) return [r1, r2];
      return previousFind(type);
    };

    const creep = {
      name: 'h1',
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      room,
      pos: {
        x: 0,
        y: 0,
        roomName: 'W1N1',
        getRangeTo(target) {
          const pos = target.pos || target;
          return Math.abs(pos.x - this.x) + Math.abs(pos.y - this.y);
        },
        findClosestByPath(type) {
          if (type === FIND_DROPPED_RESOURCES) {
            return Memory.energyReserves[r1.id] >= r1.amount ? r2 : r1;
          }
          return null;
        },
      },
      travelTo: () => {},
      pickup: () => ERR_NOT_IN_RANGE,
      withdraw: () => OK,
      memory: {},
    };

    Memory.energyReserves[r1.id] = 20; // fully reserved
    roleHauler.run(creep);
    expect(creep.memory.reserving.id).to.equal('r2');
  });
});
