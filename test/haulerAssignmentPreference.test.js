const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');

describe('hauler assignment preference', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.energyReserves = {};
    global.RESOURCE_ENERGY = 'energy';
    global.FIND_DROPPED_RESOURCES = 1;
    global.FIND_SOURCES = 2;
    global.STRUCTURE_CONTAINER = 'container';
    global.FIND_MY_SPAWNS = 3;
    global.FIND_STRUCTURES = 4;
    global.FIND_RUINS = 5;
    global.FIND_TOMBSTONES = 6;
    global.OK = 0;
    global.ERR_NOT_IN_RANGE = -9;
    global.ERR_TIRED = -11;
  });

  it('prefers assigned drop location even if another has more energy', function() {
    const source = {
      id: 'src1',
      pos: {
        x: 2,
        y: 2,
        roomName: 'W1N1',
        findInRange: () => [],
      },
    };
    const assignedDrop = {
      id: 'drop1',
      amount: 30,
      resourceType: RESOURCE_ENERGY,
      pos: { x: 3, y: 3, roomName: 'W1N1' },
    };
    const otherDrop = {
      id: 'drop2',
      amount: 200,
      resourceType: RESOURCE_ENERGY,
      pos: { x: 10, y: 10, roomName: 'W1N1' },
    };

    Game.rooms['W1N1'] = {
      name: 'W1N1',
      storage: null,
      find: (type) => {
        if (type === FIND_SOURCES) return [source];
        if (type === FIND_DROPPED_RESOURCES) return [assignedDrop, otherDrop];
        return [];
      },
    };

    Game.getObjectById = (id) => {
      if (id === source.id) return source;
      return null;
    };

    const creep = {
      name: 'hauler1',
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      room: Game.rooms['W1N1'],
      pos: {
        x: 0,
        y: 0,
        roomName: 'W1N1',
        getRangeTo(target) {
          const pos = target.pos || target;
          return Math.abs(pos.x - this.x) + Math.abs(pos.y - this.y);
        },
        findClosestByRange: () => null,
      },
      travelTo: () => {},
      pickup(target) {
        this.lastPickup = target;
        return ERR_NOT_IN_RANGE;
      },
      withdraw: () => OK,
      memory: {
        assignment: {
          sourceId: 'src1',
          pickupPos: { x: 3, y: 3, roomName: 'W1N1' },
          routeId: 'hauler:W1N1:src1',
        },
      },
    };

    Game.creeps['hauler1'] = creep;

    roleHauler.run(creep);
    expect(creep.memory.reserving.id).to.equal('drop1');
    expect(creep.lastPickup).to.equal(assignedDrop);
  });
});
