const { expect } = require('chai');
const globals = require('./mocks/globals');
const layoutPlanner = require('../layoutPlanner');

describe('layout memory pruning', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Memory.settings = {
      layoutCandidateOverlayIndex: -1,
    };
    Memory.rooms = {
      W1N1: {
        layout: {
          theoretical: {
            selectedCandidateIndex: 4,
            candidates: [
              { index: 0, weightedScore: 10 },
              { index: 1, weightedScore: 20 },
              { index: 2, weightedScore: 30 },
              { index: 3, weightedScore: 40 },
              { index: 4, weightedScore: 50 },
            ],
          },
          theoreticalCandidatePlans: {
            '0': { index: 0, weightedScore: 10, placements: [{ type: 'road', x: 1, y: 1 }], validStructurePositions: { positions: [{ x: 10, y: 10 }] } },
            '1': { index: 1, weightedScore: 20, placements: [{ type: 'road', x: 2, y: 2 }], validStructurePositions: { positions: [{ x: 11, y: 11 }] } },
            '2': {
              index: 2,
              weightedScore: 30,
              placements: [{ type: 'extension', x: 3, y: 3 }],
              labPlanning: { computed: true, sourceLabs: [{ x: 20, y: 20 }], reactionLabs: [{ x: 21, y: 21 }] },
              structurePlanning: { placements: [{ type: 'extension', x: 3, y: 3 }], ranking: { extensionOrder: [{ x: 3, y: 3 }] } },
              validStructurePositions: { positions: [{ x: 12, y: 12 }], canPlace: 1, structureClear: 1 },
            },
            '3': {
              index: 3,
              weightedScore: 40,
              placements: [{ type: 'tower', x: 4, y: 4 }],
              labPlanning: { computed: true, sourceLabs: [{ x: 22, y: 22 }], reactionLabs: [{ x: 23, y: 23 }] },
              structurePlanning: { placements: [{ type: 'tower', x: 4, y: 4 }], ranking: { extensionOrder: [{ x: 4, y: 4 }] } },
              validStructurePositions: { positions: [{ x: 13, y: 13 }], canPlace: 1, structureClear: 1 },
            },
            '4': {
              index: 4,
              weightedScore: 50,
              placements: [{ type: 'spawn', x: 5, y: 5 }],
              labPlanning: { computed: true, sourceLabs: [{ x: 24, y: 24 }], reactionLabs: [{ x: 25, y: 25 }] },
              structurePlanning: { placements: [{ type: 'spawn', x: 5, y: 5 }], ranking: { extensionOrder: [{ x: 5, y: 5 }] } },
              validStructurePositions: { positions: [{ x: 14, y: 14 }], canPlace: 1, structureClear: 1 },
            },
          },
          theoreticalPipeline: {
            runId: 'W1N1:123',
            status: 'completed',
            bestCandidateIndex: 4,
            candidates: [
              { index: 0 },
              { index: 1 },
              { index: 2 },
              { index: 3 },
              { index: 4 },
            ],
            results: {
              '0': { index: 0, weightedScore: 10 },
              '1': { index: 1, weightedScore: 20 },
              '2': { index: 2, weightedScore: 30 },
              '3': { index: 3, weightedScore: 40 },
              '4': { index: 4, weightedScore: 50 },
            },
          },
          pipelineRuns: {
            'W1N1:111': { runId: 'W1N1:111', createdAt: 111, status: 'completed' },
            'W1N1:123': { runId: 'W1N1:123', createdAt: 123, status: 'completed' },
          },
        },
      },
    };
  });

  it('keeps only top 3 candidates and one compact pipeline run', function () {
    const summary = layoutPlanner._pruneTheoreticalMemory('W1N1', { runId: 'W1N1:123', reason: 'test' });
    expect(summary).to.exist;
    const layout = Memory.rooms.W1N1.layout;
    expect(layout.theoretical.candidates.length).to.be.at.most(3);
    expect(Object.keys(layout.theoreticalCandidatePlans).length).to.be.at.most(3);
    expect(Object.keys(layout.theoreticalPipeline.results).length).to.be.at.most(3);
    expect(Object.keys(layout.pipelineRuns).length).to.equal(1);
    expect(layout.pipelineRuns['W1N1:123']).to.exist;
    expect(layout.pipelineRuns['W1N1:123']).to.have.property('compactedAt');
    expect(layout.theoreticalCandidatePlans['4'].compacted).to.equal(false);
    expect(layout.theoreticalCandidatePlans['4'].placements).to.be.an('array').that.is.not.empty;
    expect(layout.theoreticalCandidatePlans['3'].compacted).to.equal(true);
    expect(layout.theoreticalCandidatePlans['3']).to.not.have.property('placements');
    expect(layout.theoreticalCandidatePlans['3'].validStructurePositions.shownPositions).to.equal(1);
    expect(layout.theoreticalCandidatePlans['3'].structurePlanning).to.not.have.property('placements');
    expect(summary.compactedCandidatePlans).to.be.at.least(1);
  });

  it('keeps the requested overlay candidate renderable and falls back away from compacted plans', function () {
    Memory.settings.layoutCandidateOverlayIndex = 3;
    let summary = layoutPlanner._pruneTheoreticalMemory('W1N1', { runId: 'W1N1:123', reason: 'test-overlay' });
    let layout = Memory.rooms.W1N1.layout;
    expect(layout.theoreticalCandidatePlans['3'].compacted).to.equal(false);
    expect(layout.theoreticalCandidatePlans['3'].placements).to.be.an('array');
    expect(layout.currentDisplayCandidateIndex).to.equal(3);
    expect(summary.compactedCandidatePlans).to.be.at.least(1);

    Memory.settings.layoutCandidateOverlayIndex = 2;
    summary = layoutPlanner._pruneTheoreticalMemory('W1N1', { runId: 'W1N1:123', reason: 'test-fallback' });
    layout = Memory.rooms.W1N1.layout;
    expect(layout.theoreticalCandidatePlans['2'].compacted).to.equal(false);
    expect(layout.currentDisplayCandidateIndex).to.equal(2);

    delete layout.theoreticalCandidatePlans['2'].placements;
    layout.theoreticalCandidatePlans['2'].compacted = true;
    expect(layoutPlanner._resolveDisplayedCandidateIndex(Memory.rooms.W1N1)).to.equal(4);
  });

  it('compacts the persisted winner when basePlan already covers the selected layout', function () {
    Memory.rooms.W1N1.basePlan = {
      buildQueue: [
        { type: 'spawn', pos: { x: 5, y: 5 } },
      ],
    };
    const summary = layoutPlanner._pruneTheoreticalMemory('W1N1', { runId: 'W1N1:123', reason: 'persisted-baseplan' });
    const layout = Memory.rooms.W1N1.layout;
    expect(summary.compactedCandidatePlans).to.be.at.least(1);
    expect(layout.theoreticalCandidatePlans['4'].compacted).to.equal(true);
    expect(layout.theoreticalCandidatePlans['4']).to.not.have.property('placements');
  });

  it('keeps the explicitly requested winner renderable even when basePlan exists', function () {
    Memory.settings.layoutCandidateOverlayIndex = 4;
    Memory.rooms.W1N1.basePlan = {
      buildQueue: [
        { type: 'spawn', pos: { x: 5, y: 5 } },
      ],
    };
    layoutPlanner._pruneTheoreticalMemory('W1N1', { runId: 'W1N1:123', reason: 'persisted-overlay-winner' });
    const layout = Memory.rooms.W1N1.layout;
    expect(layout.theoreticalCandidatePlans['4'].compacted).to.equal(false);
    expect(layout.theoreticalCandidatePlans['4'].placements).to.be.an('array').that.is.not.empty;
  });
});
