const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleBuilder = require('../role.builder');

global.FIND_MY_SPAWNS = 1;
global.FIND_CONSTRUCTION_SITES = 2;
global.FIND_SOURCES = 3;
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_STORAGE = 'storage';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;

describe('builder task memory', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.constructionReservations = {};
    const site = { id: 's1', pos: { x: 1, y: 1, roomName: 'W1N1', lookFor: () => [] } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => (type === FIND_CONSTRUCTION_SITES ? [site] : []),
      memory: { buildingQueue: [{ id: 's1', priority: 100 }] },
      controller: {},
    };
    Game.getObjectById = id => site;
    Memory.rooms = { W1N1: { buildingQueue: [{ id: 's1', priority: 100 }], siteAssignments: {} } };
  });

  it('retains build task after requesting energy', function () {
    Game.time = 10;
    const creep = {
      name: 'b1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        getRangeTo: () => 1,
        findInRange: () => [],
        findClosestByRange: () => ({ id: 's1', pos: { x: 1, y: 1, roomName: 'W1N1' } }),
        isNearTo: () => false,
      },
      travelTo: () => {},
      build: () => OK,
      harvest: () => OK,
      memory: {},
    };
    roleBuilder.run(creep);
    expect(creep.memory.mainTask).to.deep.equal({ type: 'build', id: 's1' });
  });

  it('does not retarget to another cluster site while current site still exists', function () {
    Game.time = 20;
    const site1 = { id: 's1', structureType: 'extension', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const site2 = { id: 's2', structureType: 'extension', pos: { x: 14, y: 10, roomName: 'W1N1' } };
    const spawn = {
      id: 'spawn1',
      pos: {
        x: 20,
        y: 10,
        roomName: 'W1N1',
        getRangeTo: (target) => Math.max(Math.abs(20 - target.x), Math.abs(10 - target.y)),
      },
    };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => {
        if (type === FIND_MY_SPAWNS) return [spawn];
        if (type === FIND_CONSTRUCTION_SITES) return [site1, site2];
        if (type === FIND_SOURCES) return [];
        return [];
      },
      getTerrain: () => ({ get: () => 0 }),
      lookForAt: () => [],
      memory: { buildingQueue: [{ id: 's2', priority: 200 }, { id: 's1', priority: 100 }] },
      controller: {},
    };
    Game.getObjectById = id => (id === 's1' ? site1 : id === 's2' ? site2 : null);

    const creep = {
      name: 'b2',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        getRangeTo: () => 1,
        findInRange: () => [],
        findClosestByRange: () => null,
        isNearTo: () => false,
        isEqualTo(pos) { return this.x === pos.x && this.y === pos.y; },
      },
      travelTo: () => {},
      build: () => OK,
      harvest: () => OK,
      withdraw: () => ERR_NOT_IN_RANGE,
      pickup: () => ERR_NOT_IN_RANGE,
      memory: {
        constructionTask: { id: 's1', priority: 100 },
        mainTask: { type: 'build', id: 's1' },
      },
    };
    Game.creeps = { b2: creep };

    roleBuilder.run(creep);

    expect(creep.memory.mainTask).to.deep.equal({ type: 'build', id: 's1' });
    expect(creep.memory.constructionTask).to.deep.equal({ id: 's1', priority: 100 });
  });

  it('prefers refilling an active builder cluster before switching to another site', function () {
    Game.time = 30;
    const site1 = { id: 's1', structureType: 'extension', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const site2 = { id: 's2', structureType: 'extension', pos: { x: 20, y: 10, roomName: 'W1N1' } };
    const spawn = {
      id: 'spawn1',
      pos: {
        x: 25,
        y: 10,
        roomName: 'W1N1',
        getRangeTo: (target) => Math.max(Math.abs(25 - target.x), Math.abs(10 - target.y)),
      },
    };
    const room = {
      name: 'W1N1',
      find: type => {
        if (type === FIND_MY_SPAWNS) return [spawn];
        if (type === FIND_CONSTRUCTION_SITES) return [site2, site1];
        if (type === FIND_SOURCES) return [];
        return [];
      },
      getTerrain: () => ({ get: () => 0 }),
      lookForAt: () => [],
      memory: { buildingQueue: [{ id: 's2', priority: 200 }, { id: 's1', priority: 100 }] },
      controller: {},
    };
    Game.rooms['W1N1'] = room;
    Game.getObjectById = id => (id === 's1' ? site1 : id === 's2' ? site2 : null);

    const mkPos = (x, y) => ({
      x,
      y,
      roomName: 'W1N1',
      getRangeTo: (target) => Math.max(Math.abs(x - target.x), Math.abs(y - target.y)),
      findInRange: () => [],
      findClosestByRange: () => null,
      isNearTo: () => false,
      isEqualTo(pos) { return this.x === pos.x && this.y === pos.y; },
    });

    const makeBuilder = (name, x, y) => ({
      name,
      room,
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      pos: mkPos(x, y),
      travelTo: () => {},
      build: () => OK,
      harvest: () => OK,
      withdraw: () => ERR_NOT_IN_RANGE,
      pickup: () => ERR_NOT_IN_RANGE,
      memory: {
        role: 'builder',
        constructionTask: { id: 's1', priority: 100 },
        mainTask: { type: 'build', id: 's1' },
      },
    });

    const b1 = makeBuilder('b1', 11, 10);
    const b2 = makeBuilder('b2', 11, 11);
    const b3 = makeBuilder('b3', 12, 10);
    const newcomer = {
      name: 'b4',
      room,
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
      pos: mkPos(24, 10),
      travelTo: () => {},
      build: () => OK,
      harvest: () => OK,
      withdraw: () => ERR_NOT_IN_RANGE,
      pickup: () => ERR_NOT_IN_RANGE,
      memory: { role: 'builder' },
    };
    Game.creeps = { b1, b2, b3, b4: newcomer };

    roleBuilder.run(newcomer);

    expect(newcomer.memory.constructionTask).to.deep.equal({ id: 's1', priority: 100 });
    expect(newcomer.memory.mainTask).to.deep.equal({ type: 'build', id: 's1' });
  });
});
