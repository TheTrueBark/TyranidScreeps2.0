const { expect } = require('chai');
const globals = require('./mocks/globals');
const statsConsole = require('../console.console');

describe('console display toggle', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
  });

  it('disables console rendering by default while allowing stats collection', function () {
    statsConsole.run([['CPU', 5]]);

    expect(statsConsole.isConsoleDisplayEnabled()).to.equal(false);
    expect(Memory.stats.cpu).to.deep.equal([['CPU', 5]]);
  });

  it('enables console rendering only when explicitly requested', function () {
    Memory.settings = {
      consoleDisplayEnabled: true,
    };

    expect(statsConsole.isConsoleDisplayEnabled()).to.equal(true);
  });
});
