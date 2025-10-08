const { expect } = require('chai');
const path = require('path');
require('./mocks/globals');
const LZString = require('../vendor.lz-string');

describe('debug.savestate', () => {
  const modulePath = path.resolve(__dirname, '..', 'debug.savestate.js');

  const bootstrapEnv = () => {
    const memory = global.Memory || {};
    for (const key of Object.keys(memory)) delete memory[key];
    Object.assign(memory, {
      settings: { allowSavestateRestore: false },
      debug: { savestates: {} },
      stats: { logCounts: {}, logs: [] },
      spawnQueue: [
        {
          requestId: '100-0',
          category: 'hauler',
          room: 'W1N1',
          priority: 50,
          ticksToSpawn: 0,
          parentTaskId: 'task-parent',
          parentTick: 100,
          subOrder: 1,
        },
      ],
      nextSpawnRequestId: 7,
      htm: {
        hive: { tasks: [{ id: 't1', name: 'bootstrap', ttl: 10, age: 1 }] },
        clusters: { alpha: { tasks: [{ id: 'c1', name: 'grow', ttl: 5, age: 0 }] } },
        colonies: { alpha: { tasks: [{ id: 'co1', name: 'link', ttl: 5, age: 0 }] } },
        creeps: { Worker1: { tasks: [{ id: 'cr1', name: 'haul', ttl: 5, age: 0 }] } },
      },
      creeps: {
        Worker1: { role: 'hauler', taskId: 'cr1', task: { name: 'haul', target: 'Storage1' }, colony: 'alpha' },
      },
      hive: {
        version: 2,
        clusters: {
          alpha: {
            meta: { status: 'core' },
            colonies: {
              alpha: {
                meta: { rcl: 4 },
                creeps: { Worker1: {} },
                structures: { spawn: ['Spawn1'] },
              },
            },
          },
        },
        expansionTargets: ['W2N1'],
      },
      rooms: {
        W1N1: {
          owner: 'Tyranid',
          colony: 'alpha',
          layout: { stamp: 'alpha' },
          structures: { spawn: ['Spawn1'] },
        },
      },
    });

    const game = global.Game || {};
    Object.assign(game, {
      time: 1000,
      shard: { name: 'shardUnit' },
      cpu: {
        bucket: 8000,
        limit: 20,
        tickLimit: 500,
        getUsed: () => 2.5,
      },
      gcl: { level: 3, progress: 123, progressTotal: 1000 },
      gpl: { level: 1, progress: 20, progressTotal: 100 },
    });
    global.Game = game;

    global.RawMemory = {
      get: () => JSON.stringify(global.Memory),
      set: (value) => {
        global.__rawSet = value;
        const parsed = JSON.parse(value);
        const target = global.Memory || {};
        for (const key of Object.keys(target)) delete target[key];
        Object.assign(target, parsed);
      },
    };
  };

  const loadModule = () => {
    delete require.cache[modulePath];
    return require(modulePath);
  };

  beforeEach(() => {
    bootstrapEnv();
  });

  it('captures and stores a savestate entry', () => {
    const savestate = loadModule();
    const entry = savestate.saveSavestate('unit-test', 'mocha');
    expect(entry).to.have.property('compressed').that.is.a('string');
    expect(Memory.debug.savestates['unit-test']).to.deep.equal(entry);

    const decoded = JSON.parse(LZString.decompressFromBase64(entry.compressed));
    expect(decoded.metadata.time).to.equal(1000);
    expect(decoded.spawnQueue.queue).to.have.length(1);
    expect(decoded.creeps.summary.Worker1.role).to.equal('hauler');
    expect(decoded.empire.hive.clusters.alpha.colonies).to.deep.equal(['alpha']);
  });

  it('restores a savestate when enabled', () => {
    const savestate = loadModule();
    const original = JSON.parse(RawMemory.get());
    savestate.saveSavestate('unit-test', 'restore');

    // mutate memory to ensure restore rewinds it
    Memory.rooms.W1N1.owner = 'Invader';
    Memory.settings.allowSavestateRestore = true;

    const restored = savestate.restoreSavestate('unit-test');
    expect(restored).to.equal(true);
    expect(Memory.rooms.W1N1.owner).to.equal(original.rooms.W1N1.owner);
    expect(Memory.debug.savestates['unit-test']).to.exist;
    expect(global.__rawSet).to.be.a('string');
  });

  it('refuses to restore when guard disabled', () => {
    const savestate = loadModule();
    savestate.saveSavestate('unit-test', 'guard');
    const result = savestate.restoreSavestate('unit-test');
    expect(result).to.equal(false);
  });
});
