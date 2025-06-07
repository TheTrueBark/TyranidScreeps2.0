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
    expect(Memory.stats.logs[0][0]).to.equal('0: [spawnManager] test message');
    expect(Memory.stats.logs[0][1]).to.equal(4);
  });

  it('increments count and escalates severity for repeated messages', function () {
    for (let i = 0; i < 11; i++) {
      logger.log('spawnManager', 'repeat', 2);
    }

    expect(Memory.stats.logCounts['[spawnManager] repeat']).to.equal(11);
    expect(Memory.stats.logs[10][1]).to.equal(3); // escalated severity
  });

  it('expires old logs when the display limit is reached', function () {
    for (let t = 0; t < 5; t++) {
      logger.log('spawnManager', `msg${t}`, 1);
      statsConsole.run([], true, { display: 3 });
      Game.time++;
    }

    expect(Memory.stats.logs.length).to.equal(2);
    expect(Memory.stats.logs[0][0]).to.match(/^3:/);
    expect(Memory.stats.logs[1][0]).to.match(/^4:/);
  });

  it('accepts an optional roomName argument', function () {
    logger.log('spawnManager', 'with room', 3, 'W1N1');

    expect(Memory.stats.logs[0][0]).to.equal('0: [spawnManager] with room');
  });
});
