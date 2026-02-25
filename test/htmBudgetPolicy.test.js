const { expect } = require('chai');
const globals = require('./mocks/globals');
const htm = require('../manager.htm');

describe('htm budget policy helpers', function () {
  beforeEach(function () {
    globals.resetGame({
      time: 1000,
      cpu: {
        limit: 20,
        bucket: 9000,
        tickLimit: 500,
        getUsed: () => 0,
      },
    });
    globals.resetMemory();
    htm.init();
  });

  it('reports runnable tasks by pipeline', function () {
    htm.addColonyTask('W1N1', 'DEFEND_ROOM', {}, 1, 100, 1, 'test');
    htm.addColonyTask('W1N1', 'INTENT_PLAN_PHASE_4', {}, 1, 100, 1, 'test');
    const summary = htm.getRunnableSummary();
    expect(summary.totalActive).to.equal(2);
    expect(summary.totalRunnable).to.equal(2);
    expect(summary.runnableByPipeline.critical).to.equal(1);
    expect(summary.runnableByPipeline.burstOnly).to.equal(1);
  });

  it('respects allowedPipelines override in runScheduled', function () {
    let ranCritical = 0;
    let ranBurst = 0;
    htm.registerHandler(htm.LEVELS.COLONY, 'DEFEND_ROOM', () => {
      ranCritical += 1;
      return { complete: true };
    });
    htm.registerHandler(htm.LEVELS.COLONY, 'INTENT_PLAN_PHASE_4', () => {
      ranBurst += 1;
      return { complete: true };
    });
    htm.addColonyTask('W1N1', 'DEFEND_ROOM', {}, 1, 100, 1, 'test');
    htm.addColonyTask('W1N1', 'INTENT_PLAN_PHASE_4', {}, 1, 100, 1, 'test');

    htm.runScheduled({
      mode: 'BURST',
      softBudget: 500,
      reserveCpu: 0,
      allowedPipelines: ['critical'],
    });

    expect(ranCritical).to.equal(1);
    expect(ranBurst).to.equal(0);
  });
});
