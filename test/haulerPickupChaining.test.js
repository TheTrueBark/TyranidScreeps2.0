const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');
const Traveler = require('../manager.hiveTravel');

describe('hauler pickup chaining', function () {
  let originalFindTravelPath;

  beforeEach(function () {
    global.RESOURCE_ENERGY = 'energy';
    global.FIND_DROPPED_RESOURCES = 1;
    global.FIND_STRUCTURES = 2;
    global.FIND_MY_SPAWNS = 3;
    global.FIND_SOURCES = 4;
    global.STRUCTURE_CONTAINER = 'container';
    global.STRUCTURE_LINK = 'link';
    global.STRUCTURE_STORAGE = 'storage';
    global.STRUCTURE_TERMINAL = 'terminal';
    global.STRUCTURE_FACTORY = 'factory';
    global.STRUCTURE_LAB = 'lab';
    global.STRUCTURE_POWER_SPAWN = 'powerSpawn';
    global.OK = 0;
    global.ERR_NOT_IN_RANGE = -9;
    global.ERR_NOT_ENOUGH_RESOURCES = -6;
    global.ERR_TIRED = -11;
    globals.resetGame();
    globals.resetMemory();
    Memory.energyReserves = {};
    Game.time = 1;
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      storage: null,
      terminal: null,
      controller: { pos: { x: 5, y: 5, roomName: 'W1N1' } },
      find: () => [],
    };
    originalFindTravelPath = Traveler.findTravelPath;
    Traveler.findTravelPath = () => ({ path: [{}, {}] });
  });

  afterEach(function () {
    Traveler.findTravelPath = originalFindTravelPath;
  });

  it('continues pickup plan until remaining energy sources are exhausted', function () {
    const room = Game.rooms['W1N1'];
    const drop = {
      id: 'dropA',
      resourceType: RESOURCE_ENERGY,
      amount: 40,
      pos: { x: 2, y: 2, roomName: 'W1N1' },
    };
    const container = {
      id: 'contA',
      structureType: STRUCTURE_CONTAINER,
      store: { [RESOURCE_ENERGY]: 60, getCapacity: () => 600 },
      pos: { x: 4, y: 4, roomName: 'W1N1' },
    };
    const source = { id: 'srcA', pos: { x: 3, y: 3, roomName: 'W1N1' }, energy: 300, energyCapacity: 300 };

    room.find = type => {
      if (type === FIND_DROPPED_RESOURCES) return drop.amount > 0 ? [drop] : [];
      if (type === FIND_STRUCTURES) return [container];
      if (type === FIND_MY_SPAWNS) return [];
      if (type === FIND_SOURCES) return [source];
      return [];
    };

    Game.getObjectById = id => {
      if (id === drop.id) return drop;
      if (id === container.id) return container;
      if (id === source.id) return source;
      return null;
    };

    const capacity = 100;
    const store = {
      [RESOURCE_ENERGY]: 0,
      getFreeCapacity: () => capacity - store[RESOURCE_ENERGY],
      getCapacity: () => capacity,
    };

    const creep = {
      name: 'haulerChain',
      room,
      pos: {
        x: 0,
        y: 0,
        roomName: 'W1N1',
        getRangeTo(target) {
          const pos = target.pos || target;
          return Math.max(Math.abs(pos.x - this.x), Math.abs(pos.y - this.y));
        },
        findClosestByRange: () => null,
      },
      store,
      carryCapacity: capacity,
      storeCapacity: capacity,
      pickup: () => ERR_NOT_IN_RANGE,
      withdraw: () => ERR_NOT_IN_RANGE,
      transfer: () => ERR_NOT_IN_RANGE,
      travelTo: () => {},
      memory: {},
    };

    roleHauler.run(creep);
    expect(creep.memory.reserving).to.exist;
    const firstTargetId = creep.memory.reserving.id;
    expect([drop.id, container.id]).to.include(firstTargetId);
    expect(creep.memory.pickupPlan).to.exist;
    const plannedIds = creep.memory.pickupPlan.steps.map(step => step.id);
    const secondTargetId = firstTargetId === drop.id ? container.id : drop.id;
    expect(plannedIds).to.include(secondTargetId);

    Game.time += 1;
    if (firstTargetId === container.id) {
      creep.pos.x = container.pos.x;
      creep.pos.y = container.pos.y;
      creep.withdraw = () => {
        store[RESOURCE_ENERGY] += 60;
        container.store[RESOURCE_ENERGY] = Math.max(0, container.store[RESOURCE_ENERGY] - 60);
        return OK;
      };
    } else {
      creep.pos.x = drop.pos.x;
      creep.pos.y = drop.pos.y;
      creep.pickup = () => {
        store[RESOURCE_ENERGY] += 40;
        drop.amount = Math.max(0, drop.amount - 40);
        return OK;
      };
    }

    roleHauler.run(creep);
    expect(creep.memory.reserving).to.be.undefined;
    expect(creep.memory.pickupPlan).to.exist;
    expect(creep.memory.pickupPlan.steps[0].id).to.equal(secondTargetId);

    Game.time += 1;
    creep.pos.x = 0;
    creep.pos.y = 0;

    roleHauler.run(creep);
    expect(creep.memory.reserving).to.exist;
    expect(creep.memory.reserving.id).to.equal(secondTargetId);
  });
});
