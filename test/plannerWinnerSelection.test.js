const { expect } = require('chai');
const globals = require('./mocks/globals');
const winnerSelection = require('../planner.winnerSelection');

describe('planner.winnerSelection', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Game.time = 4242;
    Memory.rooms = {
      W1N1: {
        layout: {
          theoreticalCandidatePlans: {},
        },
      },
    };
  });

  it('normalizes config with nested overrides and fallbacks', function () {
    const config = winnerSelection.resolveConfig({
      layoutDefensePlanningMode: 'full',
      layoutWinnerSelection: {
        rerankTopN: 99,
        rerankDefenseMode: 'bogus',
        tieBreakers: ['weightedScore', 'index'],
        penaltyBuckets: {
          critical: { weight: 7 },
          minor: { weight: 0.25, cap: 0.5 },
        },
      },
    });

    expect(config.profile).to.equal('strict');
    expect(config.rerankTopN).to.equal(10);
    expect(config.rerankDefenseMode).to.equal('full');
    expect(config.penaltyBuckets.critical.weight).to.equal(7);
    expect(config.penaltyBuckets.major.weight).to.equal(1.5);
    expect(config.penaltyBuckets.minor.weight).to.equal(0.25);
    expect(config.penaltyBuckets.minor.cap).to.equal(0.5);
    expect(config.tieBreakers).to.deep.equal(['weightedScore', 'index']);
  });

  it('classifies validation flags and computes penalties deterministically', function () {
    const config = winnerSelection.resolveConfig({
      layoutWinnerSelection: {
        hardRejectPrefixes: ['hard'],
        penaltyBuckets: {
          critical: { prefixes: ['critical'], weight: 5 },
          major: { prefixes: ['major'], weight: 1.5 },
          minor: { weight: 0.2, cap: 0.4 },
        },
      },
    });
    const evaluation = winnerSelection.evaluateGeneratedPlan(
      {
        evaluation: { weightedScore: 0.9 },
        meta: {
          validation: ['hard:1', 'critical:1', 'major:1', 'minor:1', 'minor:2'],
          defenseScore: 1500,
        },
      },
      config,
      { stage: 'foundation', candidateIndex: 3 },
    );

    expect(evaluation.selectionRejected).to.equal(true);
    expect(evaluation.hardRejectFlags).to.deep.equal(['hard:1']);
    expect(evaluation.selectionPenalty).to.equal(6.9);
    expect(evaluation.selectionBreakdown.bucketCounts).to.deep.equal({
      hardReject: 1,
      critical: 1,
      major: 1,
      minor: 2,
    });
    expect(evaluation.selectionBreakdown.stage).to.equal('foundation');
    expect(evaluation.selectionBreakdown.tieBreakers.index).to.equal(3);
    expect(evaluation.weightedScore).to.equal(Number.NEGATIVE_INFINITY);
  });

  it('ranks results with deterministic tie breakers', function () {
    const ranked = winnerSelection.rankResults({
      0: { index: 0, weightedScore: 0.8, rawWeightedScore: 0.9, selectionPenalty: 0.1, defenseScore: 1500 },
      1: { index: 1, weightedScore: 0.8, rawWeightedScore: 0.92, selectionPenalty: 0.1, defenseScore: 1400 },
      2: { index: 2, weightedScore: 0.8, rawWeightedScore: 0.92, selectionPenalty: 0.1, defenseScore: 1600 },
      3: { index: 3, weightedScore: 0.95, rawWeightedScore: 0.95, selectionPenalty: 0, defenseScore: 1000, selectionRejected: true },
    });

    expect(ranked.map((row) => row.index)).to.deep.equal([2, 1, 0, 3]);
    expect(winnerSelection.pickBestSelectableResult(ranked).index).to.equal(2);
  });

  it('reranks only selectable finalists and persists full-rerank metadata', function () {
    Memory.settings = {
      layoutWinnerSelection: {
        rerankTopN: 2,
      },
    };
    const pipeline = {
      requestedHarabiStage: 'full',
      candidateHarabiStage: 'foundation',
      finalHarabiStage: 'full',
      candidates: [
        { index: 0, anchor: { x: 20, y: 20 } },
        { index: 1, anchor: { x: 21, y: 21 } },
        { index: 2, anchor: { x: 22, y: 22 } },
      ],
      results: {
        0: { index: 0, weightedScore: 0.99, selectionRejected: true, selectionPenalty: 8 },
        1: { index: 1, weightedScore: 0.7, selectionPenalty: 0.1 },
        2: { index: 2, weightedScore: 0.6, selectionPenalty: 0.2 },
      },
      refinement: { enabled: false, status: 'done' },
    };
    const rerankedIndices = [];

    const reranked = winnerSelection.rerankTopCandidates(
      'W1N1',
      pipeline,
      Memory.rooms.W1N1,
      winnerSelection.rankResults(pipeline.results),
      {
        settings: Memory.settings,
        readLayoutPattern: () => 'cluster3',
        summarizeRefinement: () => ({ status: 'done' }),
        generatePlanForAnchor: function (_roomName, anchorInput, options = {}) {
          rerankedIndices.push(options.candidateMeta.index);
          const idx = options.candidateMeta.index;
          return {
            anchor: { x: anchorInput.x, y: anchorInput.y },
            placements: [{ type: 'spawn', x: anchorInput.x, y: anchorInput.y }],
            evaluation: { weightedScore: idx === 1 ? 0.83 : 0.61, metrics: {}, contributions: {} },
            meta: {
              validation: idx === 2 ? ['defense-score-low:900'] : [],
              defenseScore: idx === 1 ? 2400 : 1200,
              validStructurePositions: {},
            },
          };
        },
      },
    );

    expect(rerankedIndices).to.deep.equal([1, 2]);
    expect(reranked[0].index).to.equal(1);
    expect(pipeline.fullSelectionRerank.rerankedCount).to.equal(2);
    expect(pipeline.fullSelectionRerank.selectedIndex).to.equal(1);
    expect(pipeline.results[1].selectionStage).to.equal('full-rerank');
    expect(pipeline.results[2].selectionBreakdown.bucketCounts.major).to.equal(1);
    expect(Memory.rooms.W1N1.layout.theoreticalCandidatePlans[1].selectionStage).to.equal('full-rerank');
  });
});
