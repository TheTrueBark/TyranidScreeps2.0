const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');

describe('hauler delivery task movement', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.energyReserves = {};
    global.RESOURCE_ENERGY = 'energy';
    global.FIND_DROPPED_RESOURCES = 1;
    global.FIND_SOURCES = 2;
    global.FIND_STRUCTURES = 3;
    global.FIND_MY_SPAWNS = 4;
    global.FIND_RUINS = 5;
    global.FIND_TOMBSTONES = 6;
    global.STRUCTURE_SPAWN = 'spawn';
    global.STRUCTURE_EXTENSION = 'extension';
    global.OK = 0;
    global.ERR_NOT_IN_RANGE = -9;
    global.ERR_NOT_ENOUGH_RESOURCES = -6;
    global.ERR_TIRED = -11;
    Game.time = 123;
  });

  it('moves toward reserved pickup while on a delivery task', function() {
    const roomSource = {
      id: 'source1',
      pos: { x: 11, y: 11, roomName: 'W1N1' },
      energyCapacity: 3000,
    };
    const room = {
      name: 'W1N1',
      storage: null,
      controller: null,
      find: (type) => {
        if (type === FIND_DROPPED_RESOURCES) return [drop];
        if (type === FIND_SOURCES) return [roomSource];
        return [];
      },
    };
    Game.rooms['W1N1'] = room;

    const drop = {
      id: 'dropA',
      amount: 50,
      resourceType: RESOURCE_ENERGY,
      pos: { x: 10, y: 10, roomName: 'W1N1' },
      room,
    };
    const deliverTarget = {
      id: 'target1',
      structureType: STRUCTURE_SPAWN,
      store: {
        getFreeCapacity: () => 100,
        getCapacity: () => 300,
      },
      room,
    };

    Game.getObjectById = (id) => {
      if (id === drop.id) return drop;
      if (id === deliverTarget.id) return deliverTarget;
      return null;
    };

    let travelCalled = false;
    const creep = {
      name: 'hauler1',
      store: {
        [RESOURCE_ENERGY]: 0,
        getFreeCapacity: () => 50,
      },
      room,
      pos: {
        x: 5,
        y: 5,
        roomName: 'W1N1',
        getRangeTo: () => 5,
        findClosestByRange: () => null,
        findClosestByPath: () => null,
      },
      travelTo: () => {
        travelCalled = true;
      },
      pickup: () => ERR_NOT_IN_RANGE,
      withdraw: () => ERR_NOT_IN_RANGE,
      transfer: () => ERR_NOT_IN_RANGE,
      memory: {
        assignment: { routeId: 'route1' },
        task: {
          name: 'deliverEnergy',
          target: deliverTarget.id,
          reserved: 30,
          pos: { x: 1, y: 1, roomName: 'W1N1' },
          startTime: 100,
          initial: 30,
        },
        pickupPlan: {
          version: 2,
          tick: Game.time,
          remaining: 30,
          steps: [
            {
              id: drop.id,
              type: 'pickup',
              amount: 30,
              remaining: 30,
              pos: { x: 10, y: 10, roomName: 'W1N1' },
              reserved: 0,
              productionRate: 0,
              travelTicks: 5,
            },
          ],
        },
      },
    };

    Game.creeps[creep.name] = creep;
    Memory.energyReserves[drop.id] = { reserved: 0 };

    roleHauler.run(creep);

    expect(creep.memory.reserving).to.exist;
    expect(creep.memory.reserving.id).to.equal(drop.id);
    expect(travelCalled).to.equal(true);
    expect(creep.memory.task).to.exist;
  });
});

