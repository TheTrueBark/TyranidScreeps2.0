const { expect } = require('chai');
const globals = require('./mocks/globals');
const debugConfig = require('../console.debugLogs');
const statsConsole = require('../console.console');

let logger;

describe('logger', function () {
  beforeEach(function () {
    // Prepare fresh global state for each test
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });

    // Enable logging for the tested module
    debugConfig.spawnManager = true;

    // Reload logger so it picks up the new debugConfig
    delete require.cache[require.resolve('../logger')];
    logger = require('../logger');
  });

  it('logs messages with severity', function () {
    logger.log('spawnManager', 'test message', 4);

    expect(Memory.stats.logs).to.have.length(1);
    expect(Memory.stats.logs[0].message).to.equal('[spawnManager] test message');
    expect(Memory.stats.logs[0].severity).to.equal(4);
  });

  it('aggregates repeated messages into a single entry', function () {
    for (let i = 0; i < 11; i++) {
      logger.log('spawnManager', 'repeat', 2);
    }

    expect(Memory.stats.logCounts['[spawnManager] repeat']).to.equal(11);
    expect(Memory.stats.logs).to.have.length(1);
    expect(Memory.stats.logs[0].severity).to.equal(3); // escalated severity
  });

  it('expires old logs after a duration', function () {
    logger.log('spawnManager', 'old', 1);
    Game.time += 31;
    logger.log('spawnManager', 'new', 1);

    expect(Memory.stats.logs).to.have.length(1);
    expect(Memory.stats.logs[0].message).to.equal('[spawnManager] new');
  });

  it('accepts an optional roomName argument', function () {
    logger.log('spawnManager', 'with room', 3, 'W1N1');

    expect(Memory.stats.logs[0].message).to.equal('[spawnManager] with room');
  });
});
