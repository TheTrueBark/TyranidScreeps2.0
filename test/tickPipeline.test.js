const { expect } = require('chai');
const globals = require('./mocks/globals');
const tickPipeline = require('../manager.tickPipeline');

describe('tickPipeline', function() {
  beforeEach(function() {
    globals.resetGame({
      time: 42,
      cpu: {
        limit: 20,
        bucket: 9500,
        tickLimit: 500,
        getUsed: () => 3,
      },
      rooms: {
        W1N1: {
          name: 'W1N1',
          controller: { my: true, level: 3 },
          find(type) {
            if (type === global.FIND_MY_SPAWNS) return [{ id: 'spawn1' }];
            if (type === global.FIND_HOSTILE_CREEPS) return [{ id: 'hostile1' }];
            if (type === global.FIND_CONSTRUCTION_SITES) return [{ id: 'site1' }];
            if (type === global.FIND_STRUCTURES) return [{ id: 's1' }, { id: 's2' }];
            return [];
          },
        },
      },
      creeps: {
        Bob: {
          id: 'c1',
          room: { name: 'W1N1' },
          memory: { role: 'hauler' },
          ticksToLive: 100,
          store: { getFreeCapacity: () => 50 },
        },
      },
    });
    globals.resetMemory();
    global.FIND_MY_SPAWNS = 1;
    global.FIND_HOSTILE_CREEPS = 2;
    global.FIND_CONSTRUCTION_SITES = 3;
    global.FIND_STRUCTURES = 4;
  });

  it('creates bootstrap context with burst budget flags', function() {
    const ctx = tickPipeline.bootstrapTick();
    expect(ctx.mode).to.equal('BURST');
    expect(ctx.flags.BURST).to.equal(true);
    expect(ctx.softBudget).to.equal(240);
  });

  it('builds read-only snapshot with events', function() {
    const snapshot = tickPipeline.buildSnapshot();
    expect(snapshot.rooms.W1N1.hasSpawn).to.equal(true);
    expect(snapshot.rooms.W1N1.spawnCount).to.equal(1);
    expect(snapshot.events.some((e) => e.type === 'hostilesSeen')).to.equal(true);
    expect(snapshot.events.some((e) => e.type === 'constructionSitesPresent')).to.equal(true);
  });

  it('builds minimal snapshot without room.find traversal', function() {
    let findCalls = 0;
    Game.rooms.W1N1.find = function() {
      findCalls += 1;
      return [];
    };
    const snapshot = tickPipeline.buildMinimalSnapshot();
    expect(snapshot.minimal).to.equal(true);
    expect(snapshot.events).to.have.length(0);
    expect(findCalls).to.equal(0);
  });

  it('commits phase accounting into Memory.stats.tickPipeline', function() {
    const ctx = tickPipeline.bootstrapTick();
    ctx.phases.bootstrap = { cpu: 0.22, count: 1 };
    ctx.runtimeState = 'idle';
    ctx.runtimeReason = 'no-work';
    ctx.forcePlanningTick = false;
    ctx.nextPlanningHeartbeatTick = 99;
    tickPipeline.commitTick(ctx);
    expect(Memory.stats.tickPipeline).to.exist;
    expect(Memory.stats.tickPipeline.byTick[String(Game.time)].phases.bootstrap.cpu).to.equal(0.22);
    expect(Memory.stats.tickPipeline.byTick[String(Game.time)].runtime.state).to.equal('idle');
  });

  it('retains only the most recent tick snapshots', function() {
    for (let i = 0; i < tickPipeline.MAX_TICK_HISTORY + 5; i++) {
      Game.time = 42 + i;
      const ctx = tickPipeline.bootstrapTick();
      ctx.runtimeState = `state-${i}`;
      tickPipeline.commitTick(ctx);
    }

    expect(Memory.stats.tickPipeline.ticks).to.have.lengthOf(tickPipeline.MAX_TICK_HISTORY);
    expect(Memory.stats.tickPipeline.byTick['42']).to.equal(undefined);
    expect(Memory.stats.tickPipeline.byTick[String(Game.time)].runtime.state).to.equal(`state-${tickPipeline.MAX_TICK_HISTORY + 4}`);
  });
});
