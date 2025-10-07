const { expect } = require('chai');
const globals = require('./mocks/globals');

global._ = require('lodash');
global.WORK = 'work';
global.MOVE = 'move';
global.CARRY = 'carry';
global.BODYPART_COST = { work: 100, move: 50, carry: 50 };

const spawnQueue = require('../manager.spawnQueue');
const spawnManager = require('../manager.spawn');

describe('spawnQueue subtask sorting', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawnQueue.queue = [];
    Memory.nextSpawnRequestId = 0;
  });

  it('orders by parent tick and subOrder before priority', function() {
    spawnQueue.addToQueue('miner', 'W1N1', [WORK], {}, 's1', 0, 1, { parentTaskId: 'p1', subOrder: 0, parentTick: 10 });
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY], {}, 's1', 0, 2, { parentTaskId: 'p1', subOrder: 1, parentTick: 10 });
    spawnQueue.addToQueue('miner', 'W1N1', [WORK], {}, 's1', 0, 1, { parentTaskId: 'p2', subOrder: 0, parentTick: 20 });

    let next = spawnQueue.getNextSpawn('s1');
    expect(next.parentTaskId).to.equal('p1');
    spawnQueue.removeSpawnFromQueue(next.requestId);

    next = spawnQueue.getNextSpawn('s1');
    expect(next.parentTaskId).to.equal('p1');
    spawnQueue.removeSpawnFromQueue(next.requestId);

    next = spawnQueue.getNextSpawn('s1');
    expect(next.parentTaskId).to.equal('p2');
  });

  it('groups immediate subtasks by lowest parent priority', function() {
    const starterMiner = spawnManager.resolvePriority('miner', { starter: true });
    const starterHauler = spawnManager.resolvePriority('hauler', { starter: true });
    const regularMiner = spawnManager.resolvePriority('miner');
    const regularHauler = spawnManager.resolvePriority('hauler');
    const builderPriority = spawnManager.resolvePriority('builder');

    spawnQueue.addToQueue('builder', 'W1N1', [WORK], {}, 's1', 0, builderPriority);
    spawnQueue.addToQueue('miner', 'W1N1', [WORK], {}, 's1', 0, starterMiner, { parentTaskId: 'starterA', subOrder: 0, parentTick: 5 });
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY], {}, 's1', 0, starterHauler, { parentTaskId: 'starterA', subOrder: 1, parentTick: 5 });
    spawnQueue.addToQueue('miner', 'W1N1', [WORK], {}, 's1', 0, regularMiner, { parentTaskId: 'starterB', subOrder: 0, parentTick: 8 });
    spawnQueue.addToQueue('hauler', 'W1N1', [CARRY], {}, 's1', 0, regularHauler, { parentTaskId: 'starterB', subOrder: 1, parentTick: 8 });

    let next = spawnQueue.getNextSpawn('s1');
    expect(next.parentTaskId).to.equal('starterA');
    spawnQueue.removeSpawnFromQueue(next.requestId);

    next = spawnQueue.getNextSpawn('s1');
    expect(next.parentTaskId).to.equal('starterA');
    spawnQueue.removeSpawnFromQueue(next.requestId);

    next = spawnQueue.getNextSpawn('s1');
    expect(next.parentTaskId).to.equal('starterB');
    spawnQueue.removeSpawnFromQueue(next.requestId);

    next = spawnQueue.getNextSpawn('s1');
    expect(next.parentTaskId).to.equal('starterB');
    spawnQueue.removeSpawnFromQueue(next.requestId);

    next = spawnQueue.getNextSpawn('s1');
    expect(next.category).to.equal('builder');
  });

  it('prefers lower ticksToSpawn when no immediate requests exist', function() {
    spawnQueue.addToQueue('builder', 'W1N1', [WORK], {}, 's1', 5, 80);
    spawnQueue.addToQueue('upgrader', 'W1N1', [WORK], {}, 's1', 2, 20);

    const next = spawnQueue.getNextSpawn('s1');
    expect(next.category).to.equal('upgrader');
    spawnQueue.removeSpawnFromQueue(next.requestId);

    const following = spawnQueue.getNextSpawn('s1');
    expect(following.category).to.equal('builder');
  });
});
