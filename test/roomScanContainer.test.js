const { expect } = require('chai');
const globals = require('./mocks/globals');

const roomManager = require('../manager.room');

// Constants required by roomManager
global.FIND_SOURCES = 1;
global.FIND_MY_SPAWNS = 2;
global.FIND_STRUCTURES = 3;
global.TERRAIN_MASK_WALL = 1;

global.PathFinder = {
  search(start, goal) {
    return { path: [{ x: 11, y: 10 }], incomplete: false };
  },
};

function getRangeTo(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.max(Math.abs(dx), Math.abs(dy));
}

describe('roomManager.scanRoom container placement', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    global.FIND_MY_SPAWNS = 2;
    global.FIND_SOURCES = 1;
    global.FIND_STRUCTURES = 3;
    global.TERRAIN_MASK_WALL = 1;
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true },
      find(type) {
        if (type === FIND_SOURCES) {
          return [{ id: 's1', pos: { x: 10, y: 10 } }];
        }
        if (type === FIND_MY_SPAWNS) {
          return [{ pos: { x: 25, y: 25, getRangeTo(targetX, targetY) {
            if (typeof targetX === 'object') {
              return getRangeTo(this.x, this.y, targetX.x, targetX.y);
            }
            return getRangeTo(this.x, this.y, targetX, targetY);
          } } }];
        }
        if (type === FIND_STRUCTURES) return [];
        return [];
      },
      getTerrain() {
        return { get() { return 0; } };
      },
    };
  });

  it('stores path-based container position as best1', function() {
    roomManager.scanRoom(Game.rooms['W1N1']);
    const pos = Memory.rooms.W1N1.miningPositions.s1.positions.best1;
    expect(pos).to.deep.equal({ x: 11, y: 10, roomName: 'W1N1', reserved: false });
  });
});
