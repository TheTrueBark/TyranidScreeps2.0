const { expect } = require('chai');
const globals = require('./mocks/globals');
const { DomainQueueScheduler } = require('../scheduler.domainQueues');

describe('DomainQueueScheduler', function() {
  beforeEach(function() {
    globals.resetGame({
      time: 100,
      cpu: {
        limit: 20,
        bucket: 8000,
        tickLimit: 500,
        getUsed: () => 0,
      },
    });
    globals.resetMemory();
  });

  it('pops by priority/deadline and supports lazy invalidation', function() {
    const scheduler = new DomainQueueScheduler();
    scheduler.startTick(Game.time);
    scheduler.enqueue({
      taskId: 'a',
      domain: 'planner',
      pipeline: 'background',
      priorityBand: 1,
      priorityBase: 2,
      deadlineTick: 120,
      validUntil: 200,
      costEst: 'high',
    });
    scheduler.enqueue({
      taskId: 'b',
      domain: 'planner',
      pipeline: 'background',
      priorityBand: 1,
      priorityBase: 0,
      deadlineTick: 110,
      validUntil: 200,
      costEst: 'low',
    });

    const seen = [];
    scheduler.runPhase('planning', 100, (task) => {
      seen.push(task.taskId);
      if (task.taskId === 'b') return { invalidate: true };
      return { invalidate: true };
    }, {
      pipelines: ['background'],
      domains: ['planner'],
    });

    expect(seen[0]).to.equal('b');
    expect(seen[1]).to.equal('a');
  });

  it('tracks queue statistics and average cost estimate', function() {
    const scheduler = new DomainQueueScheduler();
    scheduler.startTick(Game.time);
    scheduler.enqueue({ taskId: 'l', domain: 'misc', pipeline: 'realtime', priorityBand: 0, costEst: 'low' });
    scheduler.enqueue({ taskId: 'm', domain: 'misc', pipeline: 'realtime', priorityBand: 0, costEst: 'medium' });
    scheduler.enqueue({ taskId: 'h', domain: 'misc', pipeline: 'realtime', priorityBand: 0, costEst: 'high' });

    const stats = scheduler.getStats();
    expect(stats.costEst.low).to.equal(1);
    expect(stats.costEst.medium).to.equal(1);
    expect(stats.costEst.high).to.equal(1);
    expect(stats.avgCostEst).to.equal(2);
  });
});
