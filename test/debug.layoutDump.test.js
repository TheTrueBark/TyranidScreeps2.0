const { expect } = require('chai');
const globals = require('./mocks/globals');
const layoutDump = require('../debug.layoutDump');

describe('debug.layoutDump', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.time = 12345;
    Memory.settings = { layoutPlanDumpDebug: true };
    Memory.rooms = {
      W1N1: {
        basePlan: {
          generatedAt: Game.time,
          structures: {
            spawn: [{ x: 25, y: 25, rcl: 1, tag: 'spawn.1' }],
            extension: [{ x: 26, y: 25, rcl: 2, tag: 'extension.1' }],
            road: [{ x: 24, y: 25, rcl: 1, tag: 'road.stamp' }],
          },
          buildQueue: [
            { x: 25, y: 25, rcl: 1, priority: 1, type: 'spawn', tag: 'spawn.1' },
            { x: 26, y: 25, rcl: 2, priority: 2, type: 'extension', tag: 'extension.1' },
          ],
          plannerDebug: {
            layoutPattern: 'cluster3',
            harabiStage: 'full',
            stampStats: {
              bigPlaced: 9,
              smallPlaced: 1,
              capacitySlots: 84,
              requiredSlots: 78,
              smallFallbackReasons: { noBigFitLocal: 1 },
            },
            stampPruning: {
              enabled: true,
              prunedBig: 2,
              prunedSmall: 1,
              keptBig: 7,
              keptSmall: 0,
              removedRoadTiles: 9,
            },
            refinementDebug: {
              status: 'done',
              seedIndices: [0, 1],
              generation: 8,
              maxGenerations: 8,
              attemptedMutations: 64,
              acceptedMutations: 7,
              bestScoreBefore: 0.52,
              bestScoreAfter: 0.61,
              improvementPct: 17.3,
            },
            validation: [],
          },
        },
      },
    };
  });

  it('builds payload with stamp stats and structure counts', function() {
    const payload = layoutDump.buildLayoutPlanDump('W1N1');
    expect(payload.ok).to.equal(true);
    expect(payload.stampStats.bigPlaced).to.equal(9);
    expect(payload.stampStats.smallPlaced).to.equal(1);
    expect(payload.structureCounts.spawn).to.equal(1);
    expect(payload.structureCounts.extension).to.equal(1);
    expect(payload.buildQueueCounts.spawn).to.equal(1);
    expect(payload.buildQueueCounts.extension).to.equal(1);
  });

  it('formats and returns dump lines when enabled', function() {
    const result = layoutDump.dump('W1N1', { print: false, maxEntries: 5, returnObject: true });
    expect(result.ok).to.equal(true);
    expect(result.lines.some((line) => line.includes('stamps big=9 small=1'))).to.equal(true);
    expect(result.lines.some((line) => line.includes('stampPruning enabled=yes'))).to.equal(true);
    expect(result.lines.some((line) => line.includes('type=spawn'))).to.equal(true);
    expect(result.lines.some((line) => line.includes('refinementDebug status=done'))).to.equal(true);
  });

  it('formats buildQueue coordinates from entry.pos fallback', function() {
    Memory.rooms.W1N1.basePlan.buildQueue = [
      { pos: { x: 11, y: 12 }, rcl: 1, priority: 1, type: 'spawn', tag: 'spawn.1' },
    ];
    const result = layoutDump.dump('W1N1', { print: false, returnObject: true });
    expect(result.ok).to.equal(true);
    expect(result.lines.some((line) => line.includes('pos=11,12'))).to.equal(true);
  });

  it('skips road buildQueue entries by default to keep dump concise', function() {
    Memory.rooms.W1N1.basePlan.buildQueue = [
      { pos: { x: 10, y: 10 }, rcl: 1, priority: 1, type: 'road', tag: 'road.stamp' },
      { pos: { x: 11, y: 11 }, rcl: 1, priority: 1, type: 'spawn', tag: 'spawn.1' },
    ];
    const result = layoutDump.dump('W1N1', { print: false, returnObject: true });
    expect(result.ok).to.equal(true);
    expect(result.lines.some((line) => line.includes('skipped road entries: 1'))).to.equal(true);
    expect(result.lines.some((line) => line.includes('type=road'))).to.equal(false);
    expect(result.lines.some((line) => line.includes('type=spawn'))).to.equal(true);
  });

  it('returns disabled status when debug flag is off', function() {
    Memory.settings.layoutPlanDumpDebug = false;
    const result = layoutDump.dump('W1N1', { print: false });
    expect(result).to.be.a('string');
    expect(result.includes('disabled')).to.equal(true);
  });

  it('falls back to theoretical candidate plan when basePlan is missing', function() {
    delete Memory.rooms.W1N1.basePlan;
    Memory.rooms.W1N1.layout = {
      theoretical: { selectedCandidateIndex: 0 },
      theoreticalCandidatePlans: {
        0: {
          completedAt: Game.time,
          placements: [
            { type: 'spawn', x: 25, y: 25, rcl: 1, tag: 'spawn.1' },
            { type: 'extension', x: 26, y: 25, rcl: 2, tag: 'extension.1' },
          ],
          stampStats: {
            bigPlaced: 7,
            smallPlaced: 1,
            capacitySlots: 72,
            requiredSlots: 68,
            smallFallbackReasons: {},
          },
          validStructurePositions: {
            structureClear: 2,
            canPlace: 2,
            positions: [{ x: 21, y: 21 }, { x: 22, y: 22 }],
          },
          sourceLogistics: {},
          validation: [],
        },
      },
    };
    const payload = layoutDump.buildLayoutPlanDump('W1N1');
    expect(payload.ok).to.equal(true);
    expect(payload.source).to.equal('theoreticalCandidate');
    expect(payload.structureCounts.spawn).to.equal(1);
    expect(payload.stampStats.bigPlaced).to.equal(7);
    expect(payload.validStructurePositions.structureClear).to.equal(2);
  });

  it('prints structure planning extension order rows when ranking debug is present', function() {
    Memory.rooms.W1N1.basePlan.plannerDebug.structurePlanning = {
      mode: 'foundation-preview',
      computed: true,
      placements: [{ type: 'extension', x: 23, y: 17, tag: 'preview.extension' }],
      counts: { extension: 1 },
      ranking: {
        extensionOrderTotal: 3,
        extensionOrder: [
          { rank: 1, x: 23, y: 17, center: 1, selectedType: 'extension', selectedTag: 'preview.extension' },
          { rank: 2, x: 24, y: 17, center: 0, selectedType: null, selectedTag: null },
          { rank: 3, x: 25, y: 17, center: 0, selectedType: 'factory', selectedTag: 'preview.factory' },
        ],
        extensionOrderTruncated: false,
      },
    };

    const result = layoutDump.dump('W1N1', { print: false, returnObject: true });
    expect(result.ok).to.equal(true);
    expect(result.lines.some((line) => line.includes('structurePlanning extensionOrder total=3 shown=3'))).to.equal(true);
    expect(result.lines.some((line) => line.includes('1:23,17*->extension[preview.extension]'))).to.equal(true);
  });
});
