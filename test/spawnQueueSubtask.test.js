const { expect } = require('chai');
const globals = require('./mocks/globals');

global._ = require('lodash');
global.WORK = 'work';
global.MOVE = 'move';
global.CARRY = 'carry';
global.BODYPART_COST = { work: 100, move: 50, carry: 50 };

const spawnQueue = require('../manager.spawnQueue');

describe('spawnQueue subtask sorting', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawnQueue.queue = [];
    Memory.nextSpawnRequestId = 0;
  });

  it('orders by parent tick and subOrder before priority', function() {
    spawnQueue.addToQueue('miner','W1N1',[WORK],[ ],'s1',0,1,{parentTaskId:'p1',subOrder:0,parentTick:10});
    spawnQueue.addToQueue('hauler','W1N1',[CARRY],[ ],'s1',0,2,{parentTaskId:'p1',subOrder:1,parentTick:10});
    spawnQueue.addToQueue('miner','W1N1',[WORK],[ ],'s1',0,1,{parentTaskId:'p2',subOrder:0,parentTick:20});

    const first = spawnQueue.getNextSpawn('s1');
    expect(first.parentTaskId).to.equal('p1');
    spawnQueue.removeSpawnFromQueue(first.requestId);
    const second = spawnQueue.getNextSpawn('s1');
    expect(second.parentTaskId).to.equal('p1');
    spawnQueue.removeSpawnFromQueue(second.requestId);
    const third = spawnQueue.getNextSpawn('s1');
    expect(third.parentTaskId).to.equal('p2');
  });
});
