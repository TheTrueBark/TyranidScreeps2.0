const { expect } = require('chai');
const globals = require('./mocks/globals');

global._ = require('lodash');
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;
global.ERR_FULL = -8;
global.WORK = 'work';
global.MOVE = 'move';
global.CARRY = 'carry';
global.BODYPART_COST = { work: 100, move: 50, carry: 50 };

const spawnManager = require('../manager.spawn');
const spawnQueue = require('../manager.spawnQueue');

function pos(x, y, roomName = 'W1N1') {
  return {
    x,
    y,
    roomName,
    getRangeTo(target) {
      const tx = target && target.x !== undefined ? target.x : target && target.pos && target.pos.x;
      const ty = target && target.y !== undefined ? target.y : target && target.pos && target.pos.y;
      return Math.max(Math.abs(x - tx), Math.abs(y - ty));
    },
  };
}

describe('spawn urgent lifecycle service', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    spawnQueue.queue = [];
    Memory.spawnUrgentRequests = {};
  });

  it('services urgent renew before normal spawn queue', function () {
    let renewed = false;
    let spawned = false;

    const spawn = {
      id: 's1',
      name: 'Spawn1',
      room: {
        name: 'W1N1',
        energyAvailable: 300,
        getTerrain: () => ({ get: () => 0 }),
        lookForAt: () => [],
      },
      pos: pos(10, 10),
      spawning: null,
      memory: {},
      renewCreep: () => {
        renewed = true;
        return OK;
      },
      spawnCreep: () => {
        spawned = true;
        return OK;
      },
    };

    Game.creeps = {
      h1: {
        name: 'h1',
        room: { name: 'W1N1' },
        pos: pos(10, 11),
        memory: { role: 'hauler' },
        travelTo: () => {},
      },
    };

    spawnQueue.addToQueue('miner', 'W1N1', [WORK, MOVE], { role: 'miner' }, 's1', 0, 10);
    Memory.spawnUrgentRequests.s1 = [
      {
        id: 'renew:h1:1',
        action: 'renew',
        role: 'hauler',
        creepName: 'h1',
        priority: -20,
        createdAt: Game.time,
        expiresAt: Game.time + 20,
      },
    ];

    spawnManager.processSpawnQueue(spawn);
    expect(renewed).to.equal(true);
    expect(spawned).to.equal(false);
  });

  it('removes replacement queue entries after renew succeeds', function () {
    const spawn = {
      id: 's1',
      name: 'Spawn1',
      room: {
        name: 'W1N1',
        energyAvailable: 300,
        getTerrain: () => ({ get: () => 0 }),
        lookForAt: () => [],
      },
      pos: pos(10, 10),
      spawning: null,
      memory: {},
      renewCreep: () => OK,
      spawnCreep: () => OK,
    };

    Game.creeps = {
      h1: {
        name: 'h1',
        room: { name: 'W1N1' },
        pos: pos(10, 11),
        memory: { role: 'hauler', assignment: { routeId: 'r1' } },
        travelTo: () => {},
      },
    };

    spawnQueue.addToQueue(
      'hauler',
      'W1N1',
      [CARRY, MOVE],
      { role: 'hauler', isReplacement: true, originCreep: 'h1' },
      's1',
      0,
      10,
      {
        isReplacement: true,
        replacementFor: 'h1',
        parentTaskId: 'haulerReplacement:W1N1:r1',
        dedupeKey: 'haulerReplacement:W1N1:r1',
      },
    );
    expect(spawnQueue.queue.length).to.equal(1);

    Memory.spawnUrgentRequests.s1 = [
      {
        id: 'renew:h1:1',
        action: 'renew',
        role: 'hauler',
        creepName: 'h1',
        priority: -20,
        createdAt: Game.time,
        expiresAt: Game.time + 20,
      },
    ];

    const serviced = spawnManager.processUrgentRequests(spawn);
    expect(serviced).to.equal(true);
    expect(spawnQueue.queue.length).to.equal(0);
  });

  it('removes replacement queue entries when renew reports full ttl', function () {
    const spawn = {
      id: 's1',
      name: 'Spawn1',
      room: {
        name: 'W1N1',
        energyAvailable: 300,
        getTerrain: () => ({ get: () => 0 }),
        lookForAt: () => [],
      },
      pos: pos(10, 10),
      spawning: null,
      memory: {},
      renewCreep: () => ERR_FULL,
      spawnCreep: () => OK,
    };

    Game.creeps = {
      h1: {
        name: 'h1',
        room: { name: 'W1N1' },
        pos: pos(10, 11),
        memory: { role: 'hauler', assignment: { routeId: 'r1' } },
        travelTo: () => {},
      },
    };

    spawnQueue.addToQueue(
      'hauler',
      'W1N1',
      [CARRY, MOVE],
      { role: 'hauler', isReplacement: true, originCreep: 'h1' },
      's1',
      0,
      10,
      {
        isReplacement: true,
        replacementFor: 'h1',
        parentTaskId: 'haulerReplacement:W1N1:r1',
        dedupeKey: 'haulerReplacement:W1N1:r1',
      },
    );
    Memory.spawnUrgentRequests.s1 = [
      {
        id: 'renew:h1:1',
        action: 'renew',
        role: 'hauler',
        creepName: 'h1',
        priority: -20,
        createdAt: Game.time,
        expiresAt: Game.time + 20,
      },
    ];

    const serviced = spawnManager.processUrgentRequests(spawn);
    expect(serviced).to.equal(true);
    expect(spawnQueue.queue.length).to.equal(0);
    expect(Memory.spawnUrgentRequests.s1.length).to.equal(0);
  });

  it('garbage-collects urgent requests for dead creeps', function () {
    const spawn = {
      id: 's1',
      name: 'Spawn1',
      room: {
        name: 'W1N1',
        energyAvailable: 300,
        getTerrain: () => ({ get: () => 0 }),
        lookForAt: () => [],
      },
      pos: pos(10, 10),
      spawning: null,
      memory: {},
      renewCreep: () => OK,
      spawnCreep: () => OK,
    };

    Game.creeps = {};
    Memory.spawnUrgentRequests.s1 = [
      {
        id: 'renew:ghost:1',
        action: 'renew',
        role: 'hauler',
        creepName: 'ghost',
        priority: -20,
        createdAt: Game.time,
        expiresAt: Game.time + 20,
      },
    ];

    spawnManager.cleanupUrgentRequests([spawn]);
    expect(Memory.spawnUrgentRequests.s1).to.be.undefined;
  });
});
