const { expect } = require('chai');
const globals = require('./mocks/globals');

global.WORK = 'work';
global.MOVE = 'move';
global.BODYPART_COST = { work: 100, move: 50 };

const dna = require('../manager.dna');

describe('dna.getBodyParts', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { energyCapacityAvailable: 300 };
  });

  it('builds miner based on available energy', function() {
    const parts = dna.getBodyParts('miner', Game.rooms['W1N1']);
    expect(parts).to.deep.equal(['work', 'work', 'move']);
  });

  it('builds scout using move parts only', function() {
    const parts = dna.getBodyParts('scout', Game.rooms['W1N1']);
    expect(parts).to.deep.equal(['move', 'move', 'move', 'move', 'move']);
  });
});
