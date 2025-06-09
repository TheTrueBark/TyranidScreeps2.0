const { expect } = require('chai');
const globals = require('./mocks/globals');

const stampManager = require('../manager.stamps');

global.FIND_MY_SPAWNS = 1;
// Minimal RoomVisual mock that does nothing
global.RoomVisual = function () { this.text = () => {}; };

describe('stamp visualization spawnPos fallback', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    const spawn = { pos: { x: 5, y: 5 } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: {},
      controller: { level:3 },
    };
  });

  it('stores spawnPos when missing', function() {
    const room = Game.rooms['W1N1'];
    stampManager.visualizeStamp(room, 3, 0);
    expect(room.memory.spawnPos).to.deep.equal({ x: 5, y: 5 });
  });
});
