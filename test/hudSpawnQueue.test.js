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

  it('splits colony tasks into planned and in-progress sections', function () {
    const hudManager = require('../manager.hud');
    Game.time = 100;
    Memory.htm = {
      colonies: {
        W1N1: {
          tasks: [
            { name: 'spawnMiner', amount: 1, priority: 1, manager: 'spawnManager', claimedUntil: 0 },
            { name: 'spawnHauler', amount: 1, priority: 2, manager: 'spawnManager', claimedUntil: 120 },
          ],
        },
      },
    };

    const lines = hudManager._buildColonyTaskLines({ name: 'W1N1' });

    expect(lines).to.include('Tasks Planned');
    expect(lines).to.include('Tasks In Progress');
    expect(lines).to.include('  1. Spawn Miner [p1] • Spawn Manager');
    expect(lines).to.include('  1. Spawn Hauler [p2] • Spawn Manager');
  });

  it('shows spawn limits with manual overrides', function () {
    const hudManager = require('../manager.hud');
    Game.creeps = {
      m1: { memory: { role: 'miner' }, room: { name: 'W1N1' } },
      h1: { memory: { role: 'hauler' }, room: { name: 'W1N1' } },
      b1: { memory: { role: 'builder' }, room: { name: 'W1N1' } },
      u1: { memory: { role: 'upgrader' }, room: { name: 'W1N1' } },
    };
    Memory.rooms = {
      W1N1: {
        spawnLimits: { miners: 2, haulers: 3, upgraders: 4 },
        manualSpawnLimits: { haulers: 5, upgraders: 'auto' },
      },
    };

    const lines = hudManager._buildSpawnLimitLines({ name: 'W1N1' });
    expect(lines).to.include('Spawn Limits');
    expect(lines).to.include('  Miners 1/2 (a)');
    expect(lines).to.include('  Haulers 1/5 (m)');
    expect(lines).to.include('  Upgraders 1/4 (a)');
    expect(lines.some((line) => line.includes('Workers'))).to.equal(false);
  });
});
