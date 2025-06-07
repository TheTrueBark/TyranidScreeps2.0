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

  it('builds miner with one move part', function() {
    const parts = dna.getBodyParts('miner', Game.rooms['W1N1']);
    const moveCount = parts.filter(p => p === MOVE).length;
    expect(moveCount).to.equal(1);
  });
});
