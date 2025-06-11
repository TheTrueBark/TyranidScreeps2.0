const { expect } = require('chai');
const globals = require('./mocks/globals');
const htm = require('../manager.htm');

describe('htm listTasks', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    htm.addColonyTask('W1N1', 'spawnMiner');
  });

  it('returns tasks with level info', function() {
    const list = htm.listTasks();
    expect(list).to.have.length(1);
    expect(list[0].level).to.equal('colony');
    expect(list[0].name).to.equal('spawnMiner');
  });
});
