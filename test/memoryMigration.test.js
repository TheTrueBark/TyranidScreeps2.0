const { expect } = require('chai');
const globals = require('./mocks/globals');
const { runMigrations, MEMORY_VERSION } = require('../memory.migrations');

describe('memory migrations', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.hive = { version: 1, clusters: {} };
  });

  it('runs migrations and updates version', function() {
    runMigrations(1);
    expect(Memory.hive.version).to.equal(MEMORY_VERSION);
    expect(Memory.demand).to.be.an('object');
  });
});
