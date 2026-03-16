const { expect } = require('chai');
const globals = require('./mocks/globals');
const memoryHygiene = require('../memory.hygiene');

describe('memory hygiene policy', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
  });

  it('checks memory pressure on a fixed cadence', function () {
    expect(memoryHygiene.shouldCheckAutoMemoryHygiene(25, 0)).to.equal(true);
    expect(memoryHygiene.shouldCheckAutoMemoryHygiene(30, 10)).to.equal(false);
    expect(memoryHygiene.shouldCheckAutoMemoryHygiene(35, 10)).to.equal(true);
  });

  it('classifies warn, trim, and sweep pressure thresholds', function () {
    expect(memoryHygiene.classifyMemoryPressure(1499999)).to.equal('normal');
    expect(memoryHygiene.classifyMemoryPressure(1500000)).to.equal('warn');
    expect(memoryHygiene.classifyMemoryPressure(1800000)).to.equal('trim');
    expect(memoryHygiene.classifyMemoryPressure(1950000)).to.equal('sweep');
  });

  it('does not auto-prune rooms with an active theoretical pipeline', function () {
    const activeRoomMem = {
      intentState: { activeRunId: 'W1N1:123' },
      layout: {
        theoreticalPipeline: { runId: 'W1N1:123', status: 'running' },
      },
    };
    const completedRoomMem = {
      intentState: { activeRunId: 'W1N1:999' },
      layout: {
        theoreticalPipeline: { runId: 'W1N1:123', status: 'completed' },
      },
    };

    expect(memoryHygiene.canAutoPruneLayout(activeRoomMem)).to.equal(false);
    expect(memoryHygiene.canAutoPruneLayout(completedRoomMem)).to.equal(true);
    expect(
      memoryHygiene.canAutoPruneLayout({
        layout: { theoreticalPipeline: { runId: 'W1N1:123', status: 'stale' } },
      }),
    ).to.equal(true);
  });

  it('decides between warning, trim, pressure sweep, and periodic sweep', function () {
    expect(
      memoryHygiene.decideAutoMemoryHygieneAction({
        gameTime: 100,
        runtimeMode: 'live',
        memoryBytes: 1600000,
        bucket: 10000,
        lastSweepTick: 0,
      }),
    ).to.include({ action: 'warn', reason: 'pressure-warn', pressure: 'warn' });

    expect(
      memoryHygiene.decideAutoMemoryHygieneAction({
        gameTime: 100,
        runtimeMode: 'live',
        memoryBytes: 1850000,
        bucket: 900,
        lastSweepTick: 0,
      }),
    ).to.include({ action: 'trim', reason: 'pressure-trim', pressure: 'trim' });

    expect(
      memoryHygiene.decideAutoMemoryHygieneAction({
        gameTime: 100,
        runtimeMode: 'live',
        memoryBytes: 2000000,
        bucket: 800,
        lastSweepTick: 0,
      }),
    ).to.include({ action: 'trim', reason: 'pressure-sweep-downgraded', pressure: 'sweep' });

    expect(
      memoryHygiene.decideAutoMemoryHygieneAction({
        gameTime: 500,
        runtimeMode: 'live',
        memoryBytes: 400000,
        bucket: 3000,
        lastSweepTick: 0,
      }),
    ).to.include({ action: 'sweep', reason: 'periodic-sweep', pressure: 'normal' });
  });

  it('suppresses periodic auto-sweeps in maintenance mode', function () {
    expect(
      memoryHygiene.decideAutoMemoryHygieneAction({
        gameTime: 500,
        runtimeMode: 'maintenance',
        memoryBytes: 400000,
        bucket: 3000,
        lastSweepTick: 0,
      }),
    ).to.include({ action: 'none', reason: 'maintenance' });
  });
});
