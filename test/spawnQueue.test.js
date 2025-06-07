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
