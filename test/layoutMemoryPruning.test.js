const { expect } = require('chai');
const globals = require('./mocks/globals');
const layoutPlanner = require('../layoutPlanner');

describe('layout memory pruning', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
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
            '0': { index: 0, weightedScore: 10, placements: [{ x: 1, y: 1 }] },
            '1': { index: 1, weightedScore: 20, placements: [{ x: 2, y: 2 }] },
            '2': { index: 2, weightedScore: 30, placements: [{ x: 3, y: 3 }] },
            '3': { index: 3, weightedScore: 40, placements: [{ x: 4, y: 4 }] },
            '4': { index: 4, weightedScore: 50, placements: [{ x: 5, y: 5 }] },
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
  });
});
