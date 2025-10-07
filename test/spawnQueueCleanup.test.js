const { expect } = require('chai');
const globals = require('./mocks/globals');

const spawnQueue = require('../manager.spawnQueue');

global.WORK = 'work';
global.MOVE = 'move';

describe('spawnQueue.cleanUp', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawnQueue.queue = [];
    Memory.nextSpawnRequestId = 0;
    Game.time = 100;
    spawnQueue.addToQueue('miner', 'W1N1', [WORK, MOVE], { role: 'miner' }, 's1');
    Game.time = 1200;
    spawnQueue.addToQueue('hauler', 'W1N1', [MOVE], { role: 'hauler' }, 's1');
  });

  it('removes entries older than maxAge', function() {
    spawnQueue.cleanUp(1000);
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].memory.role).to.equal('hauler');
  });

  it('removes requests targeting missing spawns', function() {
    spawnQueue.addToQueue('hauler', 'W1N1', [MOVE], { role: 'hauler' }, 's2');
    Game.getObjectById = (id) => (id === 's1' ? null : { id });
    spawnQueue.cleanUp(1000);
    expect(spawnQueue.queue.every((req) => req.spawnId !== 's1')).to.equal(true);
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].spawnId).to.equal('s2');
  });
});
