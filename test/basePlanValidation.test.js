const { expect } = require('chai');
const globals = require('./mocks/globals');

describe('basePlan validation helpers', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
  });

  it('normalizes queue entries and auto-fixes invalid placements', function () {
    const validation = require('../manager.basePlanValidation');
    const result = validation.validateBasePlan('W1N1', {
      spawnPos: { x: 25, y: 25 },
      buildQueue: [
        { type: 'spawn', pos: { x: 25, y: 25 }, rcl: 1, priority: 1, built: false },
        { type: 'spawn', pos: { x: 25, y: 25 }, rcl: 1, priority: 1, built: false },
        { type: 'extension', pos: { x: 0, y: 10 }, rcl: 2, priority: 1, built: false },
        { type: 'road', pos: { x: 0, y: 10 }, rcl: 2, priority: 1, built: false },
      ],
    });

    expect(result.valid).to.equal(false);
    expect(result.issues.some((issue) => issue.startsWith('queue-duplicate:'))).to.equal(true);
    expect(result.issues.some((issue) => issue.startsWith('queue-border-placement:extension'))).to.equal(true);
    expect(result.normalizedPlan.buildQueue).to.have.lengthOf(2);
    expect(result.normalizedPlan.buildQueue[1]).to.include({ type: 'road' });
    expect(result.autoFixes).to.be.at.least(2);
  });

  it('returns failure payload for missing base plan', function () {
    const validation = require('../manager.basePlanValidation');
    const result = validation.validateBasePlan('W1N1', null);
    expect(result.valid).to.equal(false);
    expect(result.issues).to.include('basePlan-missing');

    const recovery = validation.handleValidationFailure('W1N1', result);
    expect(recovery.status).to.equal('recovered-with-autofix');
    expect(recovery.issueCount).to.be.greaterThan(0);
  });

  it('auto-fixes overlapping non-rampart placements and extension rcl overflow', function () {
    const validation = require('../manager.basePlanValidation');
    const buildQueue = [
      { type: 'spawn', pos: { x: 25, y: 25 }, rcl: 1, priority: 1 },
      { type: 'tower', pos: { x: 25, y: 25 }, rcl: 3, priority: 2 },
      ...Array.from({ length: 7 }).map((_, i) => ({
        type: 'extension',
        pos: { x: 15 + i, y: 15 },
        rcl: 2,
        priority: 1,
      })),
    ];

    const result = validation.validateBasePlan('W1N1', { buildQueue });
    expect(result.issues.some((issue) => issue.startsWith('queue-overlap:'))).to.equal(true);
    expect(result.issues.some((issue) => issue.startsWith('queue-extension-rcl-shift:'))).to.equal(true);
    const extsAtRcl2 = result.normalizedPlan.buildQueue.filter(
      (entry) => entry.type === 'extension' && entry.rcl <= 2,
    );
    expect(extsAtRcl2.length).to.equal(5);
  });

  it('reports controller container validation issues when room is visible', function () {
    const validation = require('../manager.basePlanValidation');
    Game.rooms.W1N1 = {
      name: 'W1N1',
      controller: { pos: { x: 20, y: 20 } },
    };

    const missing = validation.validateBasePlan('W1N1', {
      buildQueue: [{ type: 'spawn', pos: { x: 25, y: 25 }, rcl: 1, priority: 1 }],
    });
    expect(missing.issues).to.include('controller-container-missing');

    const wrongRange = validation.validateBasePlan('W1N1', {
      buildQueue: [
        { type: 'container', tag: 'controller.container', pos: { x: 25, y: 25 }, rcl: 1, priority: 1 },
      ],
    });
    expect(wrongRange.issues.some((issue) => issue.startsWith('controller-container-range-fail:'))).to.equal(true);
  });

  it('reports lab range violations for reaction labs outside source range 2', function () {
    const validation = require('../manager.basePlanValidation');
    const result = validation.validateBasePlan('W1N1', {
      buildQueue: [
        { type: 'lab', tag: 'lab.source.1', pos: { x: 20, y: 20 }, rcl: 6, priority: 4 },
        { type: 'lab', tag: 'lab.source.2', pos: { x: 22, y: 20 }, rcl: 6, priority: 4 },
        { type: 'lab', tag: 'lab.reaction.1', pos: { x: 30, y: 30 }, rcl: 6, priority: 4 },
      ],
    });

    expect(result.issues.some((issue) => issue.startsWith('lab-range-fail:'))).to.equal(true);
  });

  it('reports disconnected rampart edge segments', function () {
    const validation = require('../manager.basePlanValidation');
    const result = validation.validateBasePlan('W1N1', {
      buildQueue: [
        { type: 'rampart', tag: 'rampart.edge.1', pos: { x: 10, y: 10 }, rcl: 3, priority: 3 },
        { type: 'rampart', tag: 'rampart.edge.2', pos: { x: 11, y: 10 }, rcl: 3, priority: 3 },
        { type: 'rampart', tag: 'rampart.edge.3', pos: { x: 40, y: 40 }, rcl: 3, priority: 3 },
      ],
    });

    expect(result.issues.some((issue) => issue.startsWith('rampart-connectivity-fail:'))).to.equal(true);
    expect(result.durationMs).to.be.a('number');
  });
});
