const { expect } = require('chai');
const globals = require('./mocks/globals');
const memoryBreakdown = require('../memory.breakdown');

describe('memory breakdown', function () {
  beforeEach(function () {
    globals.resetGame({ time: 100 });
    globals.resetMemory();
  });

  it('captures memory breakdown on a 100 tick cadence', function () {
    expect(memoryBreakdown.shouldCaptureMemoryBreakdown(100, 0)).to.equal(true);
    expect(memoryBreakdown.shouldCaptureMemoryBreakdown(150, 100)).to.equal(false);
    expect(memoryBreakdown.shouldCaptureMemoryBreakdown(200, 100)).to.equal(true);
  });

  it('surfaces tickPipeline.byTick and heavy room branches in the summary', function () {
    Memory.settings = { overlayMode: 'normal', debugVisuals: false };
    Memory.stats = {
      tickPipeline: {
        ticks: [98, 99, 100],
        byTick: {
          '98': { phases: { planning: { notes: 'x'.repeat(300) } } },
          '99': { phases: { planning: { notes: 'y'.repeat(300) } } },
          '100': { phases: { planning: { notes: 'z'.repeat(300) } } },
        },
      },
      logs: ['l'.repeat(120)],
      taskLogs: ['t'.repeat(180)],
    };
    Memory.rooms = {
      W1N1: {
        layout: {
          theoreticalCandidatePlans: {
            '0': {
              placements: [
                { type: 'road', x: 10, y: 10 },
                { type: 'road', x: 11, y: 10 },
                { type: 'road', x: 12, y: 10 },
              ],
            },
          },
          theoretical: {
            candidates: [{ index: 0, weightedScore: 1.23 }],
          },
        },
        basePlan: {
          buildQueue: new Array(20).fill(0).map((_, index) => ({
            pos: { x: 10 + index, y: 20 },
            structureType: 'extension',
          })),
        },
      },
    };

    const payload = memoryBreakdown.buildMemoryBreakdown(Memory, {
      gameTime: Game.time,
      rawMemoryBytes: 1536000,
      topN: 8,
      roomLimit: 3,
    });

    expect(payload.rawMemoryBytes).to.equal(1536000);
    expect(payload.stats.tickPipeline.tickCount).to.equal(3);
    expect(payload.stats.tickPipeline.byTickBytes).to.be.above(payload.stats.tickPipeline.ticksBytes);
    expect(payload.stats.tickPipeline.topTicks[0].tick).to.equal('100');
    expect(payload.topBranches.some((row) => row.path === 'stats.tickPipeline.byTick')).to.equal(true);
    expect(payload.rooms.topRooms[0].room).to.equal('W1N1');
    expect(
      payload.rooms.topRooms[0].topBranches.some(
        (row) => row.path === 'rooms.W1N1.layout.theoreticalCandidatePlans' || row.path === 'rooms.W1N1.basePlan',
      ),
    ).to.equal(true);
  });

  it('formats a copy-friendly multi-line memory report', function () {
    Memory.stats = {
      tickPipeline: {
        ticks: [98, 99, 100],
        byTick: {
          '98': { phases: { planning: { notes: 'x'.repeat(80) } } },
          '99': { phases: { planning: { notes: 'y'.repeat(120) } } },
          '100': { phases: { planning: { notes: 'z'.repeat(160) } } },
        },
      },
      logs: ['l'.repeat(120)],
      taskLogs: ['t'.repeat(180)],
    };
    Memory.rooms = {
      W1N1: {
        layout: {
          theoreticalCandidatePlans: {
            '0': {
              placements: new Array(20).fill(0).map((_, index) => ({
                type: 'road',
                x: 10 + index,
                y: 10,
              })),
            },
          },
        },
        basePlan: {
          buildQueue: new Array(10).fill(0).map((_, index) => ({
            pos: { x: 20 + index, y: 25 },
            structureType: 'extension',
          })),
        },
      },
    };

    const payload = memoryBreakdown.buildMemoryBreakdown(Memory, {
      gameTime: Game.time,
      rawMemoryBytes: 1572864,
      topN: 6,
      roomLimit: 2,
    });
    const lines = memoryBreakdown.formatMemoryBreakdownReport(payload, {
      topN: 4,
      roomLimit: 2,
      roomBranchLimit: 2,
    });

    expect(lines[0]).to.include('raw=1.50MB');
    expect(lines.some((line) => line.includes('tickPipeline.byTick heavy'))).to.equal(true);
    expect(lines.some((line) => line.includes('100='))).to.equal(true);
    expect(lines.some((line) => line.includes('room W1N1'))).to.equal(true);
    expect(lines.some((line) => line.includes('layout.theoreticalCandidatePlans'))).to.equal(true);
  });
});
