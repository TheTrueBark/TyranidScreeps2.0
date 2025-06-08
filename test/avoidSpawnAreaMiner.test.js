const { expect } = require('chai');
const globals = require('./mocks/globals');

const movementUtils = require('../utils.movement');

global.FIND_MY_SPAWNS = 1;

function createCreep(spawn) {
  return {
    memory: { role: 'miner' },
    room: { name: 'W1N1' },
    pos: {
      x: 10,
      y: 10,
      roomName: 'W1N1',
      findClosestByRange(type) {
        if (type === FIND_MY_SPAWNS) return spawn;
        return null;
      },
      isNearTo() { return false; },
      getRangeTo(target) {
        const dx = this.x - target.pos.x;
        const dy = this.y - target.pos.y;
        return Math.max(Math.abs(dx), Math.abs(dy));
      },
    },
    travelTo() { moved = true; },
  };
}

describe('avoidSpawnArea skips miners', function() {
  let spawn;
  let moved;
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawn = { pos: { x: 25, y: 25 } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find(type) { if (type === FIND_MY_SPAWNS) return [spawn]; return []; },
    };
    Memory.rooms = { W1N1: { restrictedArea: [{ x: 10, y: 10 }] } };
    moved = false;
  });

  it('does not move miner off restricted tile', function() {
    const creep = createCreep(spawn);
    movementUtils.avoidSpawnArea(creep);
    expect(moved).to.be.false;
  });
});
