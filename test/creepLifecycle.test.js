const { expect } = require('chai');
const globals = require('./mocks/globals');

const lifecycle = require('../creep.lifecycle');

global._ = require('lodash');
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;
global.FIND_MY_SPAWNS = 1;
global.FIND_MY_STRUCTURES = 2;
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_CONTAINER = 'container';

describe('creep lifecycle controls', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    global.FIND_MY_SPAWNS = 1;
    global.FIND_MY_STRUCTURES = 2;
    global.STRUCTURE_SPAWN = 'spawn';
    global.STRUCTURE_EXTENSION = 'extension';
    global.STRUCTURE_CONTAINER = 'container';
    Memory.settings = {
      enableAssimilation: true,
      enableRebirth: true,
      rebirthMaxTtl: 180,
    };
    Memory.rooms = {
      W1N1: {
        spawnLimits: { haulers: 1, maxHaulers: 1, builders: 1 },
      },
    };
  });

  it('rebirth renews low-ttl hauler near spawn', function () {
    let renewed = false;
    const spawn = {
      id: 's1',
      spawning: null,
      pos: new RoomPosition(10, 10, 'W1N1'),
      renewCreep: () => {
        renewed = true;
        return OK;
      },
    };
    const room = {
      name: 'W1N1',
      find: (type) => (type === FIND_MY_SPAWNS ? [spawn] : []),
    };
    const creep = {
      name: 'h1',
      memory: { role: 'hauler' },
      room,
      pos: new RoomPosition(10, 11, 'W1N1'),
      body: new Array(10).fill({ type: 'carry', hits: 100 }),
      store: { energy: 0 },
      ticksToLive: 100,
      travelTo: () => {},
      suicide: () => {},
    };
    Game.creeps = { h1: creep };

    const handled = lifecycle.handle(creep, 'hauler');
    expect(handled).to.equal(true);
    expect(renewed).to.equal(true);
  });

  it('rebirth opportunistically renews when full renew-tick gain can be used', function () {
    let renewed = false;
    const spawn = {
      id: 's1',
      spawning: null,
      pos: new RoomPosition(10, 10, 'W1N1'),
      renewCreep: () => {
        renewed = true;
        return OK;
      },
    };
    const room = {
      name: 'W1N1',
      find: (type) => (type === FIND_MY_SPAWNS ? [spawn] : []),
    };
    const creep = {
      name: 'h3',
      memory: { role: 'hauler' },
      room,
      pos: new RoomPosition(10, 11, 'W1N1'),
      body: new Array(25).fill({ type: 'carry', hits: 100 }),
      store: { energy: 0 },
      ticksToLive: 1470, // <= 1500 - floor(600 / 25) => full gain possible
      travelTo: () => {},
      suicide: () => {},
    };
    Game.creeps = { h3: creep };

    const handled = lifecycle.handle(creep, 'hauler');
    expect(handled).to.equal(true);
    expect(renewed).to.equal(true);
  });

  it('skips rebirth when renew would waste partial tick gain', function () {
    let renewed = false;
    const spawn = {
      id: 's1',
      spawning: null,
      pos: new RoomPosition(10, 10, 'W1N1'),
      renewCreep: () => {
        renewed = true;
        return OK;
      },
    };
    const room = {
      name: 'W1N1',
      find: (type) => (type === FIND_MY_SPAWNS ? [spawn] : []),
    };
    const creep = {
      name: 'h4',
      memory: { role: 'hauler' },
      room,
      pos: new RoomPosition(10, 11, 'W1N1'),
      body: new Array(25).fill({ type: 'carry', hits: 100 }),
      store: { energy: 0 },
      ticksToLive: 1490, // > 1500 - floor(600 / 25) => partial gain only
      travelTo: () => {},
      suicide: () => {},
    };
    Game.creeps = { h4: creep };

    const handled = lifecycle.handle(creep, 'hauler');
    expect(handled).to.equal(false);
    expect(renewed).to.equal(false);
  });

  it('assimilation retires over-cap hauler and suicides when empty', function () {
    let died = false;
    const room = {
      name: 'W1N1',
      find: () => [],
    };
    const creepA = {
      name: 'h1',
      memory: { role: 'hauler' },
      room,
      pos: new RoomPosition(5, 5, 'W1N1'),
      store: { energy: 0 },
      ticksToLive: 50,
      travelTo: () => {},
      suicide: () => {
        died = true;
      },
    };
    const creepB = {
      name: 'h2',
      memory: { role: 'hauler' },
      room,
      pos: new RoomPosition(6, 5, 'W1N1'),
      store: { energy: 0 },
      ticksToLive: 800,
      travelTo: () => {},
      suicide: () => {},
    };
    Game.creeps = { h1: creepA, h2: creepB };

    const handled = lifecycle.handle(creepA, 'hauler');
    expect(handled).to.equal(true);
    expect(creepA.memory.retiring).to.equal(true);
    expect(died).to.equal(true);
  });

  it('assimilation deposits energy before death when target exists', function () {
    let transferred = false;
    let died = false;
    const extension = {
      id: 'e1',
      structureType: STRUCTURE_EXTENSION,
      pos: new RoomPosition(10, 11, 'W1N1'),
      energy: 0,
      energyCapacity: 50,
    };
    const room = {
      name: 'W1N1',
      find: (type) => {
        if (type === FIND_MY_SPAWNS) return [];
        if (type === FIND_MY_STRUCTURES) return [extension];
        return [];
      },
    };
    const creepA = {
      name: 'h1',
      memory: { role: 'hauler' },
      room,
      pos: new RoomPosition(10, 10, 'W1N1'),
      store: { energy: 20 },
      ticksToLive: 50,
      transfer: () => {
        transferred = true;
        creepA.store.energy = 0;
        return OK;
      },
      drop: () => {},
      travelTo: () => {},
      suicide: () => {
        died = true;
      },
    };
    const creepB = {
      name: 'h2',
      memory: { role: 'hauler' },
      room,
      pos: new RoomPosition(12, 12, 'W1N1'),
      store: { energy: 0 },
      ticksToLive: 800,
      travelTo: () => {},
      suicide: () => {},
    };
    Game.creeps = { h1: creepA, h2: creepB };

    const handled = lifecycle.handle(creepA, 'hauler');
    expect(handled).to.equal(true);
    expect(transferred).to.equal(true);
    expect(died).to.equal(true);
  });
});
