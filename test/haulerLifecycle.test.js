const { expect } = require('chai');
const globals = require('./mocks/globals');

const statsConsole = require('../console.console');

global._ = require('lodash');
global.CARRY = 'carry';
global.MOVE = 'move';
global.TOP = 1;
global.TOP_RIGHT = 2;
global.RIGHT = 3;
global.BOTTOM_RIGHT = 4;
global.BOTTOM = 5;
global.BOTTOM_LEFT = 6;
global.LEFT = 7;
global.TOP_LEFT = 8;
global.CREEP_SPAWN_TIME = 3;

const haulerLifecycle = require('../haulerLifecycle');
const spawnQueue = require('../manager.spawnQueue');
const spawnManager = require('../manager.spawn');
global.FIND_MY_SPAWNS = 1;

describe('hauler lifecycle predictor', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawnQueue.queue = [];
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true },
      find: type => {
        if (type === FIND_MY_SPAWNS) {
          return [{ id: 's1', pos: { getRangeTo: () => 0 }, room: { name: 'W1N1' } }];
        }
        return [];
      },
    };
    Memory.demand = { routes: { r1: { avgRoundTrip: 10, activeHaulers: [], totals: { demand: 50 } } } };
    Game.creeps = {
      hauler1: {
        name: 'hauler1',
        room: Game.rooms['W1N1'],
        body: [CARRY, MOVE],
        ticksToLive: 25,
        memory: {
          role: 'hauler',
          assignment: { routeId: 'r1', sourceId: 'src', destId: 'dest' },
        },
      },
    };
  });

  it('queues replacement when ttl low and demand exists', function() {
    haulerLifecycle.runRoom(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(1);
    const entry = spawnQueue.queue[0];
    expect(entry.origin).to.equal('lifecyclePredictor');
    expect(entry.memory.originCreep).to.equal('hauler1');
    expect(entry.priority).to.equal(spawnManager.PRIORITY_HIGH);
  });

  it('skips when replacement already queued', function() {
    spawnQueue.queue.push({ category: 'hauler', assignment: { routeId: 'r1' }, memory: { assignment: { routeId: 'r1' } } });
    haulerLifecycle.runRoom(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(1);
  });

  it('skips when demand is zero', function() {
    Memory.demand.routes.r1.totals = { demand: 0 };
    haulerLifecycle.runRoom(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(0);
  });

  it('skips when another hauler alive', function() {
    Game.creeps.h2 = {
      name: 'h2',
      room: Game.rooms['W1N1'],
      body: [CARRY, MOVE],
      ticksToLive: 100,
      memory: { role: 'hauler', assignment: { routeId: 'r1' } },
    };
    haulerLifecycle.runRoom(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(0);
  });

  it('classifies spawn timing', function() {
    Game.time = 100;
    haulerLifecycle.runRoom(Game.rooms['W1N1']);
    const mem = spawnQueue.queue[0].memory;
    spawnQueue.queue = [];
    Game.time = 120;
    Game.creeps.h2 = { name: 'h2', room: Game.rooms['W1N1'], body: [CARRY, MOVE], memory: mem, ticksToLive: 150 };
    haulerLifecycle.runRoom(Game.rooms['W1N1']);
    expect(Memory.stats.haulerSpawnTiming.perfect).to.equal(1);
  });
});
