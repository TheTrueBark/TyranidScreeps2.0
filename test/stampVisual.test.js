const { expect } = require('chai');
const globals = require('./mocks/globals');

global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_ROAD = 'road';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_POWER_SPAWN = 'powerSpawn';
global.STRUCTURE_TERMINAL = 'terminal';
global.STRUCTURE_NUKER = 'nuker';

const stampManager = require('../manager.stamps');

let drawn;

describe('stamp visualization', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    drawn = [];
    global.RoomVisual = function () {};
    global.RoomVisual.prototype.structure = function (...args) {
      drawn.push({ type: 'structure', args });
      return this;
    };
    global.RoomVisual.prototype.connectRoads = function (...args) {
      drawn.push({ type: 'connectRoads', args });
      return this;
    };
    global.RoomVisual.prototype.text = function (...args) {
      drawn.push({ type: 'text', args });
      return this;
    };
    global.RoomVisual.prototype.line = function (...args) {
      drawn.push({ type: 'line', args });
      return this;
    };
    const spawn = { pos: { x: 5, y: 5 } };
    Game.rooms.W1N1 = {
      name: 'W1N1',
      find: (type) => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: {},
      controller: { level: 3 },
    };
  });

  it('stores spawnPos when missing', function() {
    const room = Game.rooms.W1N1;
    stampManager.visualizeStamp(room, 3, 0);
    expect(room.memory.spawnPos).to.deep.equal({ x: 5, y: 5 });
  });

  it('renders stamp structures through RoomVisual.structure and connects roads', function() {
    const room = Game.rooms.W1N1;
    stampManager.visualizeStamp(room, 3, 0);

    expect(drawn.some((d) => d.type === 'structure' && d.args[2] === STRUCTURE_ROAD)).to.equal(true);
    expect(drawn.some((d) => d.type === 'structure' && d.args[2] === STRUCTURE_SPAWN)).to.equal(true);
    expect(drawn.some((d) => d.type === 'structure' && d.args[2] === STRUCTURE_TOWER)).to.equal(true);
    expect(drawn.some((d) => d.type === 'connectRoads')).to.equal(true);
    expect(drawn.some((d) => d.type === 'structure' && d.args[2] === STRUCTURE_STORAGE)).to.equal(false);
  });

  it('rotates stamp placements while preserving the structure renderer path', function() {
    const room = Game.rooms.W1N1;
    stampManager.visualizeStamp(room, 3, 90);

    expect(
      drawn.some(
        (d) =>
          d.type === 'structure' &&
          d.args[0] === 5 &&
          d.args[1] === 4 &&
          d.args[2] === STRUCTURE_SPAWN,
      ),
    ).to.equal(true);
  });
});
