const { expect } = require('chai');
const globals = require('./mocks/globals');
const { Scheduler } = require('../scheduler');

describe('scheduler', function () {
  let scheduler;

  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    scheduler = new Scheduler();
  });

  it('executes interval tasks in sorted order', function () {
    const run = [];
    scheduler.addTask('a', 2, () => run.push('a'));
    scheduler.addTask('b', 1, () => run.push('b'));

    for (let i = 0; i < 3; i++) {
      scheduler.run();
      Game.time++;
    }

    expect(run).to.deep.equal(['b', 'a', 'b']);
  });

  it('respects minBucket for throttling', function () {
    const run = [];
    scheduler.addTask('a', 0, () => run.push('a'), { minBucket: 200 });
    Game.cpu.bucket = 100;
    scheduler.run();
    expect(run).to.be.empty;
    Game.cpu.bucket = 500;
    Game.time++;
    scheduler.run();
    expect(run).to.deep.equal(['a']);
  });

  it('removes tasks properly', function () {
    let count = 0;
    scheduler.addTask('a', 0, () => count++);
    scheduler.run();
    expect(count).to.equal(1);
    scheduler.removeTask('a');
    Game.time++;
    scheduler.run();
    expect(count).to.equal(1);
  });
});
