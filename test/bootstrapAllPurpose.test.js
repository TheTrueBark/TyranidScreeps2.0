const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const spawnModule = require('../manager.hivemind.spawn');

global._ = require('lodash');

global.FIND_HOSTILE_CREEPS = 0;
global.FIND_SOURCES = 1;
global.FIND_MY_SPAWNS = 2;

describe('initial spawn uses miner bootstrap', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    Memory.rooms = { W1N1: { miningPositions: { } } };
    spawnQueue = require('../manager.spawnQueue');
    spawnQueue.queue = [];
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true, level: 1 },
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: { buildingQueue: [] },
      find: type => {
        if (type === FIND_HOSTILE_CREEPS) return [];
        if (type === FIND_SOURCES) return [{ id: 's1', pos: { x: 10, y: 10 } }];
        if (type === FIND_MY_SPAWNS) return [{ pos: { getRangeTo: () => 5 } }];
        return [];
      },
    };
    htm.init();
  });

  it('queues spawnBootstrap with role miner', function() {
    spawnModule.run(Game.rooms['W1N1']);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks[0].name).to.equal('spawnBootstrap');
    expect(tasks[0].data.role).to.equal('miner');
  });
});
