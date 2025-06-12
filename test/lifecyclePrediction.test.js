const { expect } = require('chai');
const globals = require('./mocks/globals');

const lifecycle = require('../hiveMind.lifecycle');
const spawnQueue = require('../manager.spawnQueue');
const spawnManager = require('../manager.spawn');

global._ = require('lodash');

global.WORK = 'work';
global.MOVE = 'move';
global.CREEP_SPAWN_TIME = 3;
global.FIND_MY_SPAWNS = 1;


describe('miner lifecycle predictor', function() {
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
    Memory.rooms = {
      W1N1: {
        miningPositions: {
          src1: { distanceFromSpawn: 10 },
        },
      },
    };
    Game.creeps = {
      miner1: {
        name: 'miner1',
        room: Game.rooms['W1N1'],
        body: [WORK, WORK, WORK, WORK, WORK, MOVE],
        ticksToLive: 30,
        memory: {
          role: 'miner',
          miningPosition: { x: 10, y: 10, roomName: 'W1N1' },
          distanceToSpawn: 5,
          sourceId: 'src1',
        },
      },
    };
  });

  it('queues replacement when ttl below threshold', function() {
    lifecycle.runRoom(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(1);
    const entry = spawnQueue.queue[0];
    expect(entry.origin).to.equal('lifecyclePredictor');
    expect(entry.memory.originCreep).to.equal('miner1');
    expect(entry.priority).to.equal(spawnManager.PRIORITY_HIGH);
  });

  it('uses travel time from room memory', function() {
    Game.creeps.miner1.ticksToLive = 34;
    lifecycle.runRoom(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(1);
  });

  it('skips when queued already', function() {
    spawnQueue.queue.push({
      category: 'miner',
      assignment: { pos: { x: 10, y: 10, roomName: 'W1N1' } },
      memory: { miningPosition: { x: 10, y: 10, roomName: 'W1N1' } },
    });
    lifecycle.runRoom(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(1);
  });

  it('skips when another miner active', function() {
    Game.creeps.miner2 = {
      name: 'miner2',
      room: Game.rooms['W1N1'],
      body: [WORK],
      ticksToLive: 100,
      memory: {
        role: 'miner',
        miningPosition: { x: 10, y: 10, roomName: 'W1N1' },
      },
    };
    lifecycle.runRoom(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(0);
  });
});
