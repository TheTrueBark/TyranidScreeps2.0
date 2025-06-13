const { expect } = require('chai');
const globals = require('./mocks/globals');

const spawnManager = require('../manager.spawn');
const spawnQueue = require('../manager.spawnQueue');

global._ = require('lodash');

global.FIND_MY_SPAWNS = 1;

describe('spawnManager base distributor', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({ hive: { clusters: { W1N1: { colonies: { W1N1: { meta:{} } } } } }, stats:{ logs: [] } });
    spawnQueue.queue = [];
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      storage: {},
      find: type => (type === FIND_MY_SPAWNS ? [ { id:'s1', pos:{}, room:{ name:'W1N1' } } ] : []),
    };
    Game.creeps = {};
  });

  it('queues distributor when none present', function() {
    spawnManager.checkStorageAndSpawnBaseDistributor(Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].category).to.equal('baseDistributor');
  });
});
