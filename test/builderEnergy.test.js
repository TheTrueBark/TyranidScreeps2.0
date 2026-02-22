const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleBuilder = require('../role.builder');

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
    global.FIND_MY_SPAWNS = 1;
    global.FIND_DROPPED_RESOURCES = 2;
    global.FIND_STRUCTURES = 3;
    global.FIND_CONSTRUCTION_SITES = 4;
    global.FIND_TOMBSTONES = 5;
    global.FIND_RUINS = 6;
    global.FIND_SOURCES = 7;
    global.LOOK_STRUCTURES = 'structure';
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
    const dropEntry = Memory.energyReserves['drop1'];
    expect(dropEntry).to.include({ reserved: 50, available: 80, type: 'droppedEnergy' });
    expect(dropEntry.haulersMayWithdraw).to.be.true;
    expect(dropEntry.haulersMayDeposit).to.be.false;
    expect(dropEntry.buildersMayWithdraw).to.be.true;
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
    const containerEntry = Memory.energyReserves['cont1'];
    expect(containerEntry).to.include({ reserved: 50, available: 200, type: 'container' });
    expect(containerEntry.haulersMayWithdraw).to.be.true;
    expect(containerEntry.haulersMayDeposit).to.be.true;
    expect(containerEntry.buildersMayWithdraw).to.be.true;
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
    const spawnEntry = Memory.energyReserves['spawn1'];
    expect(spawnEntry).to.include({ reserved: 50, available: 300, type: 'spawn' });
    expect(spawnEntry.haulersMayDeposit).to.be.true;
    expect(spawnEntry.haulersMayWithdraw).to.be.false;
    expect(spawnEntry.buildersMayWithdraw).to.be.true;
  });

  it('only cluster leader requests hauled energy for the full builder cluster', function () {
    Game.time = 10;
    const site = {
      id: 'site1',
      structureType: STRUCTURE_CONTAINER,
      pos: { x: 15, y: 15, roomName: 'W1N1' },
    };
    const room = {
      name: 'W1N1',
      controller: {},
      find: type => {
        if (type === FIND_MY_SPAWNS) {
          return [{ id: 'spawn1', pos: { x: 5, y: 5, roomName: 'W1N1', getRangeTo: () => 10 } }];
        }
        if (type === FIND_CONSTRUCTION_SITES) return [site];
        return [];
      },
    };
    Game.rooms['W1N1'] = room;
    Game.getObjectById = id => (id === site.id ? site : null);

    const b1 = createCreep('b1');
    b1.room = room;
    b1.memory.constructionTask = { id: site.id, priority: 1 };
    b1.memory.mainTask = { type: 'build', id: site.id };
    b1.pos = {
      x: 14, y: 14, roomName: 'W1N1',
      getRangeTo: () => 2,
      isEqualTo: () => false,
      findInRange: () => [],
      findClosestByRange: () => null,
    };

    const b2 = createCreep('b2');
    b2.room = room;
    b2.memory.constructionTask = { id: site.id, priority: 1 };
    b2.memory.mainTask = { type: 'build', id: site.id };
    b2.pos = {
      x: 16, y: 16, roomName: 'W1N1',
      getRangeTo: () => 2,
      isEqualTo: () => false,
      findInRange: () => [],
      findClosestByRange: () => null,
    };

    Game.creeps = { b1, b2 };
    roleBuilder.run(b1);
    roleBuilder.run(b2);

    const creepTasks = Memory.htm.creeps || {};
    const b1Has = creepTasks.b1 && (creepTasks.b1.tasks || []).some(t => t.name === 'deliverEnergy');
    const b2Has = creepTasks.b2 && (creepTasks.b2.tasks || []).some(t => t.name === 'deliverEnergy');
    expect([b1Has, b2Has].filter(Boolean).length).to.equal(1);
  });

  it('prefers spawn-side 2x2 cluster slots and keeps leader in requester role', function () {
    Game.time = 20;
    const site = {
      id: 'site2',
      structureType: STRUCTURE_EXTENSION,
      pos: { x: 23, y: 37, roomName: 'W1N1' },
    };
    const spawn = {
      id: 'spawn1',
      pos: {
        x: 28, y: 37, roomName: 'W1N1',
        getRangeTo: target => Math.max(Math.abs(28 - target.x), Math.abs(37 - target.y)),
      },
    };
    const room = {
      name: 'W1N1',
      controller: {},
      find: type => {
        if (type === FIND_MY_SPAWNS) return [spawn];
        if (type === FIND_CONSTRUCTION_SITES) return [site];
        return [];
      },
      getTerrain: () => ({ get: () => 0 }),
      lookForAt: () => [],
    };
    Game.rooms['W1N1'] = room;
    Game.getObjectById = id => (id === site.id ? site : null);

    const mkPos = (x, y) => ({
      x, y, roomName: 'W1N1',
      getRangeTo: target => Math.max(Math.abs(x - target.x), Math.abs(y - target.y)),
      isEqualTo: target => x === target.x && y === target.y,
      findInRange: () => [],
      findClosestByRange: () => null,
    });

    const b1 = createCreep('b1');
    b1.room = room;
    b1.pos = mkPos(24, 37);
    b1.memory.constructionTask = { id: site.id, priority: 1 };
    b1.memory.mainTask = { type: 'build', id: site.id };

    const b2 = createCreep('b2');
    b2.room = room;
    b2.pos = mkPos(24, 38);
    b2.memory.constructionTask = { id: site.id, priority: 1 };
    b2.memory.mainTask = { type: 'build', id: site.id };

    const b3 = createCreep('b3');
    b3.room = room;
    b3.pos = mkPos(25, 37);
    b3.memory.constructionTask = { id: site.id, priority: 1 };
    b3.memory.mainTask = { type: 'build', id: site.id };

    const b4 = createCreep('b4');
    b4.room = room;
    b4.pos = mkPos(25, 38);
    b4.memory.constructionTask = { id: site.id, priority: 1 };
    b4.memory.mainTask = { type: 'build', id: site.id };

    Game.creeps = { b1, b2, b3, b4 };

    roleBuilder.run(b1);
    roleBuilder.run(b2);
    roleBuilder.run(b3);
    roleBuilder.run(b4);

    const slots = [b1, b2, b3, b4]
      .map(c => c.memory.builderClusterSlot)
      .filter(Boolean);
    expect(slots.length).to.equal(4);
    const xs = [...new Set(slots.map(s => s.x))].sort((a, b) => a - b);
    const ys = [...new Set(slots.map(s => s.y))].sort((a, b) => a - b);
    expect(xs).to.deep.equal([25, 26]); // spawn-facing side near x=28
    expect(ys.length).to.equal(2);
    expect(ys[1] - ys[0]).to.equal(1);

    // Leader requests hauled delivery and does not self-pickup.
    const requesterTasks = Memory.htm.creeps || {};
    const requesting = Object.entries(requesterTasks)
      .filter(([, c]) => (c.tasks || []).some(t => t.name === 'deliverEnergy'))
      .map(([name]) => name);
    expect(requesting.length).to.equal(1);
    for (const creep of [b1, b2, b3, b4]) {
      expect(creep.memory.energyTask).to.be.undefined;
    }
    const requesterName = requesting[0];
    const requestTask = (requesterTasks[requesterName].tasks || []).find(t => t.name === 'deliverEnergy');
    expect(requestTask.data.amount).to.be.at.least(150);
    expect(requestTask.data.amount % 50).to.equal(0);
  });

  it('uses one-tile-closer cluster range for source-adjacent container sites', function () {
    Game.time = 30;
    const source = { id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const site = {
      id: 'site3',
      structureType: STRUCTURE_CONTAINER,
      pos: {
        x: 11,
        y: 10,
        roomName: 'W1N1',
        findInRange: (type, range) =>
          type === FIND_SOURCES && range === 1 ? [source] : [],
      },
    };
    const spawn = {
      id: 'spawn1',
      pos: {
        x: 18,
        y: 10,
        roomName: 'W1N1',
        getRangeTo: target => Math.max(Math.abs(18 - target.x), Math.abs(10 - target.y)),
      },
    };
    const room = {
      name: 'W1N1',
      controller: {},
      find: type => {
        if (type === FIND_MY_SPAWNS) return [spawn];
        if (type === FIND_CONSTRUCTION_SITES) return [site];
        if (type === FIND_SOURCES) return [source];
        return [];
      },
      getTerrain: () => ({ get: () => 0 }),
      lookForAt: () => [],
    };
    Game.rooms['W1N1'] = room;
    Game.getObjectById = id => (id === site.id ? site : null);

    const mkPos = (x, y) => ({
      x, y, roomName: 'W1N1',
      getRangeTo: target => Math.max(Math.abs(x - target.x), Math.abs(y - target.y)),
      isEqualTo: target => x === target.x && y === target.y,
      findInRange: () => [],
      findClosestByRange: () => null,
    });

    const b1 = createCreep('bc1');
    b1.room = room;
    b1.pos = mkPos(12, 10);
    b1.memory.constructionTask = { id: site.id, priority: 1 };
    b1.memory.mainTask = { type: 'build', id: site.id };

    const b2 = createCreep('bc2');
    b2.room = room;
    b2.pos = mkPos(12, 11);
    b2.memory.constructionTask = { id: site.id, priority: 1 };
    b2.memory.mainTask = { type: 'build', id: site.id };

    Game.creeps = { bc1: b1, bc2: b2 };

    roleBuilder.run(b1);
    roleBuilder.run(b2);

    for (const creep of [b1, b2]) {
      const slot = creep.memory.builderClusterSlot;
      expect(slot).to.exist;
      const range = Math.max(Math.abs(slot.x - site.pos.x), Math.abs(slot.y - site.pos.y));
      expect(range).to.be.at.most(2);
    }
  });

  it('reserves builder cluster slots and clears reservation on death', function () {
    Game.time = 40;
    const site = {
      id: 'site4',
      structureType: STRUCTURE_EXTENSION,
      pos: { x: 20, y: 20, roomName: 'W1N1' },
    };
    const spawn = {
      id: 'spawn1',
      pos: {
        x: 28, y: 20, roomName: 'W1N1',
        getRangeTo: target => Math.max(Math.abs(28 - target.x), Math.abs(20 - target.y)),
      },
    };
    const room = {
      name: 'W1N1',
      controller: {},
      find: type => {
        if (type === FIND_MY_SPAWNS) return [spawn];
        if (type === FIND_CONSTRUCTION_SITES) return [site];
        if (type === FIND_SOURCES) return [];
        return [];
      },
      getTerrain: () => ({ get: () => 0 }),
      lookForAt: () => [],
    };
    Game.rooms['W1N1'] = room;
    Game.getObjectById = id => (id === site.id ? site : null);

    const mkPos = (x, y) => ({
      x, y, roomName: 'W1N1',
      getRangeTo: target => Math.max(Math.abs(x - target.x), Math.abs(y - target.y)),
      isEqualTo: target => x === target.x && y === target.y,
      findInRange: () => [],
      findClosestByRange: () => null,
    });

    const b1 = createCreep('br1');
    b1.room = room;
    b1.pos = mkPos(21, 20);
    b1.memory.constructionTask = { id: site.id, priority: 1 };
    b1.memory.mainTask = { type: 'build', id: site.id };

    const b2 = createCreep('br2');
    b2.room = room;
    b2.pos = mkPos(21, 21);
    b2.memory.constructionTask = { id: site.id, priority: 1 };
    b2.memory.mainTask = { type: 'build', id: site.id };

    Game.creeps = { br1: b1, br2: b2 };

    roleBuilder.run(b1);
    roleBuilder.run(b2);

    const reservations = Memory.rooms.W1N1.builderClusterReservations || {};
    expect(Object.keys(reservations).length).to.equal(2);

    roleBuilder.onDeath(b1);
    const after = Memory.rooms.W1N1.builderClusterReservations || {};
    expect(Object.keys(after).length).to.equal(1);
  });

  it('aggregates demand across active builder clusters', function () {
    Game.time = 50;
    const siteA = {
      id: 'siteA',
      structureType: STRUCTURE_EXTENSION,
      pos: { x: 15, y: 15, roomName: 'W1N1' },
    };
    const siteB = {
      id: 'siteB',
      structureType: STRUCTURE_EXTENSION,
      pos: { x: 25, y: 25, roomName: 'W1N1' },
    };
    const spawn = {
      id: 'spawn1',
      pos: {
        x: 30, y: 20, roomName: 'W1N1',
        getRangeTo: target => Math.max(Math.abs(30 - target.x), Math.abs(20 - target.y)),
      },
    };
    const room = {
      name: 'W1N1',
      controller: {},
      find: type => {
        if (type === FIND_MY_SPAWNS) return [spawn];
        if (type === FIND_CONSTRUCTION_SITES) return [siteA, siteB];
        if (type === FIND_SOURCES) return [];
        return [];
      },
      getTerrain: () => ({ get: () => 0 }),
      lookForAt: () => [],
    };
    Game.rooms['W1N1'] = room;
    Game.getObjectById = id => {
      if (id === siteA.id) return siteA;
      if (id === siteB.id) return siteB;
      return null;
    };

    const mkPos = (x, y) => ({
      x, y, roomName: 'W1N1',
      getRangeTo: target => Math.max(Math.abs(x - target.x), Math.abs(y - target.y)),
      isEqualTo: target => x === target.x && y === target.y,
      findInRange: () => [],
      findClosestByRange: () => null,
    });

    const mkBuilder = (name, site, x, y) => {
      const creep = createCreep(name);
      creep.room = room;
      creep.pos = mkPos(x, y);
      creep.memory.constructionTask = { id: site.id, priority: 1 };
      creep.memory.mainTask = { type: 'build', id: site.id };
      return creep;
    };

    const a1 = mkBuilder('a1', siteA, 16, 15);
    const a2 = mkBuilder('a2', siteA, 16, 16);
    const b1 = mkBuilder('b1', siteB, 26, 25);
    const b2 = mkBuilder('b2', siteB, 26, 26);
    Game.creeps = { a1, a2, b1, b2 };

    roleBuilder.run(a1);
    roleBuilder.run(a2);
    roleBuilder.run(b1);
    roleBuilder.run(b2);

    const requesterTasks = Memory.htm.creeps || {};
    const requesters = Object.entries(requesterTasks)
      .filter(([, c]) => (c.tasks || []).some(t => t.name === 'deliverEnergy'))
      .map(([name]) => name);
    expect(requesters.length).to.equal(1);
    const reqName = requesters[0];
    const reqTask = (requesterTasks[reqName].tasks || []).find(t => t.name === 'deliverEnergy');
    expect(reqTask.data.amount).to.equal(200);
  });

  it('reassigns remaining builders to compact slots when one quad member is gone', function () {
    Game.time = 60;
    const site = {
      id: 'site5',
      structureType: STRUCTURE_EXTENSION,
      pos: { x: 23, y: 37, roomName: 'W1N1' },
    };
    const spawn = {
      id: 'spawn1',
      pos: {
        x: 28, y: 37, roomName: 'W1N1',
        getRangeTo: target => Math.max(Math.abs(28 - target.x), Math.abs(37 - target.y)),
      },
    };
    const room = {
      name: 'W1N1',
      controller: {},
      find: type => {
        if (type === FIND_MY_SPAWNS) return [spawn];
        if (type === FIND_CONSTRUCTION_SITES) return [site];
        if (type === FIND_SOURCES) return [];
        return [];
      },
      getTerrain: () => ({ get: () => 0 }),
      lookForAt: () => [],
    };
    Game.rooms.W1N1 = room;
    Game.getObjectById = id => (id === site.id ? site : null);

    const mkPos = (x, y) => ({
      x, y, roomName: 'W1N1',
      getRangeTo: target => Math.max(Math.abs(x - target.x), Math.abs(y - target.y)),
      isEqualTo: target => x === target.x && y === target.y,
      findInRange: () => [],
      findClosestByRange: () => null,
    });

    const mkBuilder = (name, x, y) => {
      const c = createCreep(name);
      c.room = room;
      c.pos = mkPos(x, y);
      c.memory.constructionTask = { id: site.id, priority: 1 };
      c.memory.mainTask = { type: 'build', id: site.id };
      c.memory.role = 'builder';
      return c;
    };

    const b1 = mkBuilder('b1', 25, 37);
    const b2 = mkBuilder('b2', 25, 38);
    const b3 = mkBuilder('b3', 24, 37);
    const b4 = mkBuilder('b4', 24, 38);
    Game.creeps = { b1, b2, b3, b4 };

    // First pass establishes initial 4-slot cluster memory.
    roleBuilder.run(b1);
    roleBuilder.run(b2);
    roleBuilder.run(b3);
    roleBuilder.run(b4);
    const byName = { b1, b2, b3, b4 };
    const distances = Object.entries(byName).map(([name, creep]) => {
      const slot = creep.memory.builderClusterSlot;
      return {
        name,
        slotKey: `${slot.x},${slot.y}`,
        distance: Math.max(Math.abs(slot.x - spawn.pos.x), Math.abs(slot.y - spawn.pos.y)),
      };
    });
    distances.sort((a, b) => b.distance - a.distance || a.name.localeCompare(b.name));
    const moverName = distances[0].name;
    const victimName = distances[1].name;
    const beforeMoverSlot = distances[0].slotKey;

    // Simulate one quad member gone; remaining builders should compact inward.
    delete Game.creeps[victimName];
    for (const [name, creep] of Object.entries(byName)) {
      if (name === victimName) continue;
      roleBuilder.run(creep);
    }

    const mover = byName[moverName];
    expect(mover.memory.builderClusterSlot).to.exist;
    const afterMoverSlot = `${mover.memory.builderClusterSlot.x},${mover.memory.builderClusterSlot.y}`;
    expect(afterMoverSlot).to.not.equal(beforeMoverSlot);
  });
});
