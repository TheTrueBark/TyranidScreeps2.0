const { expect } = require('chai');
const globals = require('./mocks/globals');

global._ = require('lodash');

describe('hudManager spawn queue panel', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    delete require.cache[require.resolve('../manager.hud')];
  });

  it('returns placeholder when no queued spawns exist', function () {
    const hudManager = require('../manager.hud');
    const lines = hudManager._buildSpawnQueueLines({ name: 'W1N1' }, []);

    expect(lines).to.deep.equal([
      'W1N1',
      'Status: TBD',
      '-----------------',
      'Spawn Queue',
      '  (empty)',
    ]);
  });

  it('orders entries using spawn queue priority fields', function () {
    const hudManager = require('../manager.hud');
    const lines = hudManager._buildSpawnQueueLines(
      { name: 'W2N2' },
      [
        {
          memory: { role: 'remoteMiner' },
          category: 'spawnRemoteMiner',
          energyRequired: 850,
          parentTick: 15,
          subOrder: 1,
          priority: 3,
          ticksToSpawn: 0,
        },
        {
          memory: { role: 'hauler' },
          category: 'spawnHauler',
          energyRequired: 450,
          parentTick: 10,
          subOrder: 0,
          priority: 2,
          ticksToSpawn: 0,
        },
        {
          memory: { role: 'miner' },
          category: 'spawnMiner',
          energyRequired: 300,
          parentTick: 5,
          subOrder: 0,
          priority: 1,
          ticksToSpawn: 0,
        },
      ],
    );

    expect(lines).to.include('  Miner - 300');
    expect(lines).to.include('  Hauler - 450');
    expect(lines).to.include('  Remote Miner - 850');
    expect(lines[4]).to.equal('  Miner - 300');
    expect(lines[5]).to.equal('  Hauler - 450');
    expect(lines[6]).to.equal('  Remote Miner - 850');
  });
});
