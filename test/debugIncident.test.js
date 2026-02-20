const { expect } = require('chai');
const path = require('path');
require('./mocks/globals');

describe('debug.incident', () => {
  const modulePath = path.resolve(__dirname, '..', 'debug.incident.js');

  const bootstrap = () => {
    const memory = global.Memory || {};
    for (const key of Object.keys(memory)) delete memory[key];
    Object.assign(memory, {
      settings: {
        allowSavestateRestore: false,
        maxSavestates: 10,
        maxIncidents: 2,
        incidentLogWindow: 100,
        incidentMaxAge: 1000,
        enableAutoIncidentCapture: true,
      },
      debug: { savestates: {}, incidents: {} },
      stats: {
        logs: [
          { message: '[spawnQueue] Failed to spawn', severity: 4, time: 995, duration: 30, count: 2 },
          { message: '[HTM] Error executing task', severity: 5, time: 1000, duration: 30, count: 1 },
        ],
        taskLogs: [
          { tick: 1000, level: 'colony', id: 'W1N1', name: 'SCOUT_ROOM', result: 'err', cpu: 0.3, reason: 'boom' },
        ],
      },
      spawnQueue: [
        { requestId: '1000-1', room: 'W1N1', category: 'scout', priority: 10, ticksToSpawn: 0 },
      ],
      htm: {
        hive: { tasks: [] },
        clusters: {},
        colonies: { W1N1: { tasks: [{ id: 'task-1', name: 'SCOUT_ROOM', ttl: 50, age: 0 }] } },
        creeps: {},
      },
    });

    const game = global.Game || {};
    Object.assign(game, {
      time: 1000,
      shard: { name: 'shardUnit' },
      cpu: {
        bucket: 9000,
        limit: 20,
        tickLimit: 500,
        getUsed: () => 2.1,
      },
      gcl: { level: 2, progress: 100, progressTotal: 1000 },
      gpl: { level: 1, progress: 10, progressTotal: 100 },
    });
    global.Game = game;

    global.RawMemory = {
      get: () => JSON.stringify(global.Memory),
      set: () => {},
    };
  };

  const loadModule = () => {
    delete require.cache[modulePath];
    return require(modulePath);
  };

  beforeEach(() => {
    bootstrap();
  });

  it('captures incident bundle with savestate reference and readable summary', () => {
    const incident = loadModule();
    const saved = incident.saveIncident('incident-1', 'test capture');
    expect(saved).to.have.property('compressed').that.is.a('string');

    const decoded = incident.inspectIncident('incident-1');
    expect(decoded).to.have.property('incidentId', 'incident-1');
    expect(decoded).to.have.property('savestateRef', 'incident-incident-1');
    expect(decoded.logs.length).to.be.greaterThan(0);
    expect(decoded.summary.logs.severityCounts['5']).to.equal(1);
    expect(decoded.summary.queueSize).to.equal(1);
  });

  it('exports and imports an incident payload', () => {
    const incident = loadModule();
    incident.saveIncident('incident-1', 'export me', { includeSavestate: false });

    const payload = incident.exportIncident('incident-1');
    expect(payload).to.be.a('string');

    const importedId = incident.importIncident(payload, 'incident-imported');
    expect(importedId).to.equal('incident-imported');
    expect(incident.inspectIncident('incident-imported')).to.not.equal(null);
  });

  it('enforces max incident retention and auto capture rate limiting', () => {
    const incident = loadModule();
    incident.saveIncident('incident-1', 'a', { includeSavestate: false });
    Game.time += 1;
    incident.saveIncident('incident-2', 'b', { includeSavestate: false });
    Game.time += 1;
    incident.saveIncident('incident-3', 'c', { includeSavestate: false });

    expect(Memory.debug.incidents['incident-1']).to.equal(undefined);
    expect(Memory.debug.incidents['incident-2']).to.exist;
    expect(Memory.debug.incidents['incident-3']).to.exist;

    Game.time += 10;
    const first = incident.captureAuto('htm-task-error', { task: 'A' }, { minInterval: 30, includeSavestate: false });
    const second = incident.captureAuto('htm-task-error', { task: 'B' }, { minInterval: 30, includeSavestate: false });
    expect(first).to.not.equal(null);
    expect(second).to.equal(null);
  });
});
