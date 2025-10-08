/**
 * Expose the Game and Memory mocks to the global scope so
 * modules behave like in the Screeps runtime during tests.
 */

const { Game, resetGame } = require('./game');
const { Memory, resetMemory } = require('./memory');

// Attach mocks
global.Game = Game;
global.Memory = Memory;
global.Room = {
  Terrain: function () {
    this.get = () => 0;
  },
};

if (typeof global.RoomPosition === 'undefined') {
  global.RoomPosition = function (x, y, roomName) {
    this.x = x;
    this.y = y;
    this.roomName = roomName;
    this.isEqualTo = function (pos) {
      return pos && pos.x === this.x && pos.y === this.y && pos.roomName === this.roomName;
    };
    this.getRangeTo = function (pos) {
      if (!pos) return 0;
      return Math.max(Math.abs(this.x - pos.x), Math.abs(this.y - pos.y));
    };
    this.getDirectionTo = () => 1;
    this.inRangeTo = function (pos, range) {
      return this.getRangeTo(pos) <= range;
    };
  };
}

class MockCostMatrix {
  constructor() {
    this._data = {};
  }
  get(x, y) {
    return this._data[`${x}:${y}`] || 0;
  }
  set(x, y, value) {
    this._data[`${x}:${y}`] = value;
  }
  clone() {
    const clone = new MockCostMatrix();
    clone._data = Object.assign({}, this._data);
    return clone;
  }
}

if (!global.PathFinder) {
  global.PathFinder = {
    search(origin, goal) {
      const position = new RoomPosition(origin.x, origin.y, origin.roomName);
      return { path: [position], incomplete: false };
    },
    CostMatrix: MockCostMatrix,
  };
} else if (!global.PathFinder.CostMatrix) {
  global.PathFinder.CostMatrix = MockCostMatrix;
}

if (typeof global.RoomVisual === 'undefined') {
  global.RoomVisual = function () {
    this.circle = () => {};
    this.line = () => {};
    this.text = () => {};
    this.rect = () => {};
    this.structure = () => {};
    this.connectRoads = () => {};
  };
}

const structureDefaults = {
  STRUCTURE_CONTAINER: 'container',
  STRUCTURE_LINK: 'link',
  STRUCTURE_TERMINAL: 'terminal',
  STRUCTURE_STORAGE: 'storage',
};

for (const key in structureDefaults) {
  if (typeof global[key] === 'undefined') {
    global[key] = structureDefaults[key];
  }
}

module.exports = { Game, Memory, resetGame, resetMemory };
