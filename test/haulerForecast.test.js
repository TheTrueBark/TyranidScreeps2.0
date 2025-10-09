const { expect } = require('chai');
const globals = require('./mocks/globals');

const Traveler = require('../manager.hiveTravel');
const roleHauler = require('../role.hauler');

global.RESOURCE_ENERGY = 'energy';
global.FIND_DROPPED_RESOURCES = 1;
global.FIND_SOURCES = 2;
global.FIND_MY_SPAWNS = 3;
global.ERR_NOT_IN_RANGE = -9;
global.ERR_NOT_ENOUGH_RESOURCES = -6;
global.ERR_TIRED = -11;
global.OK = 0;

describe('hauler forecast optimisation', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Game.time = 100;
    Memory.energyReserves = {};
    Traveler.findTravelPath = () => ({ path: [0, 0] });
  });

  it('prefers distant drop when forecasted yield fills capacity faster', function () {
    const dropNear = {
      id: 'drop1',
      amount: 20,
      resourceType: RESOURCE_ENERGY,
      pos: { x: 5, y: 5, roomName: 'W1N1' },
    };
    const dropFar = {
      id: 'drop2',
      amount: 40,
      resourceType: RESOURCE_ENERGY,
      pos: { x: 20, y: 20, roomName: 'W1N1' },
    };
    const sourceNear = {
      id: 'src1',
      pos: new RoomPosition(4, 5, 'W1N1'),
    };
    const sourceFar = {
      id: 'src2',
      pos: new RoomPosition(21, 20, 'W1N1'),
    };

    const room = {
      name: 'W1N1',
      storage: null,
      controller: null,
      find(type) {
        if (type === FIND_DROPPED_RESOURCES) return [dropNear, dropFar];
        if (type === FIND_SOURCES) return [sourceNear, sourceFar];
        if (type === FIND_MY_SPAWNS) return [];
        return [];
      },
    };

    Game.rooms['W1N1'] = room;
    Game.getObjectById = (id) => {
      if (id === dropNear.id) return dropNear;
      if (id === dropFar.id) return dropFar;
      if (id === sourceNear.id) return sourceNear;
      if (id === sourceFar.id) return sourceFar;
      return null;
    };

    Traveler.findTravelPath = (start, destination) => {
      if (destination.x === dropNear.pos.x && destination.y === dropNear.pos.y) {
        return { path: new Array(12).fill({}) };
      }
      if (destination.x === dropFar.pos.x && destination.y === dropFar.pos.y) {
        return { path: new Array(15).fill({}) };
      }
      return { path: [start] };
    };

    Game.creeps = {
      miner1: {
        memory: { role: 'miner', sourceId: sourceNear.id },
        getActiveBodyparts: () => 1, // 2 energy/tick
      },
      miner2: {
        memory: { role: 'miner', sourceId: sourceFar.id },
        getActiveBodyparts: () => 2, // 4 energy/tick
      },
    };

    const creep = {
      name: 'hauler1',
      store: {
        [RESOURCE_ENERGY]: 0,
        getFreeCapacity: () => 50,
      },
      room,
      pos: new RoomPosition(0, 0, 'W1N1'),
      travelTo: () => {},
      pickup: () => ERR_NOT_IN_RANGE,
      withdraw: () => OK,
      memory: {},
    };

    Game.creeps[creep.name] = creep;

    roleHauler.run(creep);

    expect(creep.memory.reserving).to.exist;
    expect(creep.memory.reserving.id).to.equal(dropFar.id);
  });
});

