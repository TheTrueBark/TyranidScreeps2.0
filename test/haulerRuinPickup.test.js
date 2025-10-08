const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');

describe('hauler prefers nearby ruin', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.energyReserves = {};
    global.RESOURCE_ENERGY = 'energy';
    global.FIND_DROPPED_RESOURCES = 1;
    global.FIND_RUINS = 2;
    global.FIND_TOMBSTONES = 3;
    global.FIND_STRUCTURES = 4;
    global.FIND_SOURCES = 5;
    global.STRUCTURE_CONTAINER = 'container';
    global.OK = 0;
    global.ERR_NOT_IN_RANGE = -9;
    global.ERR_TIRED = -11;
    const source = {
      id: 'src1',
      pos: {
        x: 9,
        y: 10,
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

  it('withdraws from ruin when closer than container', function() {
    const ruin = { id: 'ru1', store: { [RESOURCE_ENERGY]: 100 }, pos: { x: 11, y: 10, roomName: 'W1N1' } };
    const container = { id: 'c1', structureType: STRUCTURE_CONTAINER, store: { [RESOURCE_ENERGY]: 100 }, pos: { x: 20, y: 20, roomName: 'W1N1' } };

    const room = Game.rooms['W1N1'];
    const previousFind = room.find;
    room.find = (type) => {
      if (type === FIND_RUINS) return [ruin];
      if (type === FIND_STRUCTURES) return [container];
      return previousFind(type);
    };

    const creep = {
      name: 'h1',
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      room,
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        getRangeTo(target) {
          const pos = target.pos || target;
          return Math.abs(pos.x - this.x) + Math.abs(pos.y - this.y);
        },
      },
      travelTo: () => {},
      pickup: () => OK,
      withdraw(target) { this.target = target; return OK; },
      memory: {},
    };

    roleHauler.run(creep);
    expect(creep.target).to.equal(ruin);
  });
});
