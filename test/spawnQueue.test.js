const { expect } = require('chai');
const globals = require('./mocks/globals');

global._ = require('lodash');
global.WORK = 'work';
global.MOVE = 'move';
global.CARRY = 'carry';
global.BODYPART_COST = { work: 100, move: 50, carry: 50 };

const spawnQueue = require('../manager.spawnQueue');

describe('spawnQueue.clearRoom', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawnQueue.queue = [];
    Memory.nextSpawnRequestId = 0;
  });

  it('removes queued spawns for specific room', function() {
    spawnQueue.addToQueue('miner', 'W1N1', [WORK, MOVE], { role: 'miner' }, 's1');
    spawnQueue.addToQueue('hauler', 'W2N2', [CARRY, MOVE], { role: 'hauler' }, 's1');
    const removed = spawnQueue.clearRoom('W1N1');
    expect(removed).to.equal(1);
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].room).to.equal('W2N2');
  });
});

describe('spawnQueue.addToQueue validation', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawnQueue.queue = [];
  });

  it('rejects requests missing roomName in miningPosition', function() {
    spawnQueue.addToQueue(
      'miner',
      'W1N1',
      [WORK],
      { role: 'miner', miningPosition: { x: 1, y: 1 } },
      's1',
    );
    expect(spawnQueue.queue.length).to.equal(0);
  });
});

describe('spawnQueue priority handling', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawnQueue.queue = [];
    Memory.nextSpawnRequestId = 0;
  });

  it('returns highest priority request first', function() {
    spawnQueue.addToQueue('upgrader', 'W1N1', [WORK], { role: 'upgrader' }, 's1', 0, 5);
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY, MOVE], { role: 'hauler' }, 's1', 0, 3);
    spawnQueue.addToQueue('miner', 'W1N1', [WORK, MOVE], { role: 'miner' }, 's1', 0, 2);

    const next = spawnQueue.getNextSpawn('s1');
    expect(next.category).to.equal('miner');
    spawnQueue.removeSpawnFromQueue(next.requestId);

    const next2 = spawnQueue.getNextSpawn('s1');
    expect(next2.category).to.equal('hauler');
  });

  it('prunes immediate requests beyond cap while keeping delayed entries', function() {
    Game.time = 50;
    spawnQueue.queue = [];
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY, MOVE], { role: 'hauler' }, 's1', 0, 30);
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY, MOVE], { role: 'hauler' }, 's1', 0, 35);
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY, MOVE], { role: 'hauler' }, 's1', 5, 40);

    const removed = spawnQueue.pruneRole('W1N1', 'hauler', 2, { liveCount: 1 });
    expect(removed).to.equal(2);

    const delayed = spawnQueue.queue.filter(req => req.ticksToSpawn > 0);
    expect(delayed.length).to.equal(1);
    const immediate = spawnQueue.queue.filter(req => !req.ticksToSpawn || req.ticksToSpawn <= 0);
    expect(immediate.length).to.equal(0);
  });

  it('keeps limited replacement requests above cap and trims regular spam', function() {
    Game.time = 80;
    spawnQueue.queue = [];
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY, MOVE], { role: 'hauler' }, 's1', 0, 30);
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY, MOVE], { role: 'hauler' }, 's1', 0, 31);
    spawnQueue.addToQueue(
      'hauler',
      'W1N1',
      [CARRY, MOVE],
      { role: 'hauler', isReplacement: true },
      's1',
      0,
      10,
      {
        isReplacement: true,
        parentTaskId: 'haulerReplacement:W1N1:r1',
        dedupeKey: 'haulerReplacement:W1N1:r1',
      },
    );

    const removed = spawnQueue.pruneRole('W1N1', 'hauler', 1, {
      liveCount: 1,
      allowedReplacementCount: 1,
    });
    expect(removed).to.equal(2);

    const replacementLeft = spawnQueue.queue.filter((req) => req.isReplacement).length;
    const regularLeft = spawnQueue.queue.filter((req) => !req.isReplacement).length;
    expect(replacementLeft).to.equal(1);
    expect(regularLeft).to.equal(0);
  });

  it('dedupes replacement requests by parent signature', function() {
    Game.time = 90;
    spawnQueue.queue = [];
    spawnQueue.addToQueue(
      'hauler',
      'W1N1',
      [CARRY, MOVE],
      { role: 'hauler', isReplacement: true, assignment: { routeId: 'r1' } },
      's1',
      0,
      10,
      {
        isReplacement: true,
        parentTaskId: 'haulerReplacement:W1N1:r1',
        dedupeKey: 'haulerReplacement:W1N1:r1',
      },
    );
    spawnQueue.addToQueue(
      'hauler',
      'W1N1',
      [CARRY, MOVE],
      { role: 'hauler', isReplacement: true, assignment: { routeId: 'r1' } },
      's1',
      0,
      12,
      {
        isReplacement: true,
        parentTaskId: 'haulerReplacement:W1N1:r1',
        dedupeKey: 'haulerReplacement:W1N1:r1',
      },
    );

    const removed = spawnQueue.dedupeRole('W1N1', 'hauler');
    expect(removed).to.equal(1);
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].parentTaskId).to.equal('haulerReplacement:W1N1:r1');
  });
});
