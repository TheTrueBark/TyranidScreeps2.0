const { expect } = require('chai');
const globals = require('./mocks/globals');
const hivemind = require('../manager.hivemind');
const scheduler = require('../scheduler');

// Minimal constants to satisfy modules if they run
global._ = require('lodash');

describe('hivemind emergency initialization', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    scheduler.reset();
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true },
      find: () => [],
    };
    Memory.htm = { hive: { tasks: [] }, clusters: {}, colonies: {}, creeps: {} };
    Memory.spawnQueue = [];
    Memory.stats = {};
    // intentionally omit Memory.rooms and Memory.hive to trigger failsafe
  });

  it('schedules emergency task when memory missing', function () {
    hivemind.run();
    const task = scheduler.highPriorityTasks.find(t => t.name === 'emergencyInit_W1N1');
    expect(task).to.exist;
    expect(task.once).to.be.true;
  });
});
