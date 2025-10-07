const { expect } = require('chai');
const globals = require('./mocks/globals');
const startFresh = require('../startFresh');

describe('startFresh command', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({
      rooms: { W1N1: {} },
      hive: { foo: true },
      htm: { creeps: {} },
      demand: { rooms: {} },
      spawnQueue: { list: [1] },
      creeps: { c1: {} },
      stats: { logs: [1] },
      spawns: { s1: {} },
      roleEval: { lastRun: 5 },
      nextSpawnId: 3,
      settings: { enableVisuals: false },
    });
  });

  it('clears persistent memory branches', function() {
    startFresh();
    const keys = [
      'rooms','hive','htm','demand','spawnQueue','creeps','stats','spawns','roleEval','nextSpawnId','settings'
    ];
    for (const k of keys) {
      expect(Memory).to.not.have.property(k);
    }
  });

  it('pauses bot when requested', function() {
    startFresh(true);
    expect(Memory.settings).to.have.property('pauseBot', true);
  });

  it('rebuilds hive memory after fresh start', function() {
    const memoryManager = require('../manager.memory');
    startFresh(true);
    Memory.settings.pauseBot = false;
    const room = { name: 'W8N3' };
    expect(() => memoryManager.initializeRoomMemory(room)).to.not.throw();
    expect(Memory.hive).to.have.property('clusters');
    expect(Memory.hive.clusters).to.have.property('W8N3');
  });
});
