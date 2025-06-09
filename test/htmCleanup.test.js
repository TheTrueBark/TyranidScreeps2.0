const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');

describe('htm creep container cleanup', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.htm.creeps = { a1: { tasks: [] }, b1: { tasks: [] } };
    Game.creeps = { a1: {} };
  });

  it('removes entries for dead creeps', function() {
    htm.cleanupDeadCreeps();
    expect(Memory.htm.creeps).to.deep.equal({ a1: { tasks: [] } });
  });
});
