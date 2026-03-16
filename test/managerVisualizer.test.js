const { expect } = require('chai');
const globals = require('./mocks/globals');

global.STRUCTURE_ROAD = 'road';
global.STRUCTURE_RAMPART = 'rampart';
global.STRUCTURE_SPAWN = 'spawn';

const visualizer = require('../manager.visualizer');

describe('manager.visualizer', function() {
  let drawn;

  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.settings = { enableVisuals: true };
    drawn = [];
    global.RoomVisual = function() {};
    global.RoomVisual.prototype.structure = function(...args) {
      drawn.push({ type: 'structure', args });
      return this;
    };
    global.RoomVisual.prototype.connectRoads = function(...args) {
      drawn.push({ type: 'connectRoads', args });
      return this;
    };
    global.RoomVisual.prototype.line = function(...args) {
      drawn.push({ type: 'line', args });
      return this;
    };
    global.RoomVisual.prototype.text = function(...args) {
      drawn.push({ type: 'text', args });
      return this;
    };
    global.RoomVisual.prototype.rect = function(...args) {
      drawn.push({ type: 'rect', args });
      return this;
    };
    global.RoomVisual.prototype.circle = function(...args) {
      drawn.push({ type: 'circle', args });
      return this;
    };
  });

  it('draws adjacent ramparts as merged outline segments with a subtle fill instead of circle structures', function() {
    visualizer.drawStructurePlacements([
      { roomName: 'W1N1', x: 20, y: 20, type: STRUCTURE_RAMPART },
      { roomName: 'W1N1', x: 21, y: 20, type: STRUCTURE_RAMPART },
    ], { opacity: 0.8 });

    expect(drawn.some((entry) => entry.type === 'structure' && entry.args[2] === STRUCTURE_RAMPART)).to.equal(false);
    expect(drawn.filter((entry) => entry.type === 'rect').length).to.equal(2);
    expect(drawn.filter((entry) => entry.type === 'line').length).to.equal(4);
    expect(
      drawn.some(
        (entry) =>
          entry.type === 'line' &&
          entry.args[0] === 19.5 &&
          entry.args[1] === 19.5 &&
          entry.args[2] === 21.5 &&
          entry.args[3] === 19.5,
      ),
    ).to.equal(true);
  });

  it('draws a diagonal connector for pure diagonal ramparts so they do not read as isolated tiles', function() {
    visualizer.drawStructurePlacements([
      { roomName: 'W1N1', x: 20, y: 20, type: STRUCTURE_RAMPART },
      { roomName: 'W1N1', x: 21, y: 21, type: STRUCTURE_RAMPART },
    ], { opacity: 0.8 });

    const strokeBridgeLine = drawn.find(
      (entry) =>
        entry.type === 'line' &&
        entry.args[0] === 20.5 &&
        entry.args[1] === 19.5 &&
        entry.args[2] === 21.5 &&
        entry.args[3] === 20.5 &&
        entry.args[4] &&
        entry.args[4].width === 0.12,
    );
    const secondStrokeBridgeLine = drawn.find(
      (entry) =>
        entry.type === 'line' &&
        entry.args[0] === 19.5 &&
        entry.args[1] === 20.5 &&
        entry.args[2] === 20.5 &&
        entry.args[3] === 21.5 &&
        entry.args[4] &&
        entry.args[4].width === 0.12,
    );
    expect(strokeBridgeLine).to.exist;
    expect(secondStrokeBridgeLine).to.exist;
    expect(drawn.filter((entry) => entry.type === 'line').length).to.equal(2);
    expect(
      drawn.some(
        (entry) =>
          entry.type === 'line' &&
          entry.args[0] === 20 &&
          entry.args[1] === 20 &&
          entry.args[2] === 21 &&
          entry.args[3] === 21,
      ),
    ).to.equal(false);
    expect(
      drawn.some(
        (entry) =>
          entry.type === 'line' &&
          (
            (entry.args[0] === 19.5 && entry.args[1] === 19.5 && entry.args[2] === 20.5 && entry.args[3] === 19.5) ||
            (entry.args[0] === 19.5 && entry.args[1] === 19.5 && entry.args[2] === 19.5 && entry.args[3] === 20.5)
          ),
      ),
    ).to.equal(false);
    expect(drawn.filter((entry) => entry.type === 'rect').length).to.equal(2);
    expect(drawn.some((entry) => entry.type === 'structure' && entry.args[2] === STRUCTURE_RAMPART)).to.equal(false);
  });

  it('keeps support ramparts out of the outer contour and draws them as an inset inner band', function() {
    visualizer.drawStructurePlacements([
      { roomName: 'W1N1', x: 20, y: 20, type: STRUCTURE_RAMPART, tag: 'rampart.edge' },
      { roomName: 'W1N1', x: 20, y: 21, type: STRUCTURE_RAMPART, tag: 'rampart.edge' },
      { roomName: 'W1N1', x: 21, y: 21, type: STRUCTURE_RAMPART, tag: 'rampart.support' },
    ], { opacity: 0.8 });

    expect(
      drawn.some(
        (entry) =>
          entry.type === 'line' &&
          entry.args[0] === 20.5 &&
          entry.args[1] === 19.5 &&
          entry.args[2] === 20.5 &&
          entry.args[3] === 21.5,
      ),
    ).to.equal(true);
    expect(
      drawn.some(
        (entry) =>
          entry.type === 'line' &&
          entry.args[0] === 21.5 &&
          entry.args[1] === 20.5 &&
          entry.args[2] === 21.5 &&
          entry.args[3] === 21.5,
      ),
    ).to.equal(false);
    expect(
      drawn.some(
        (entry) =>
          entry.type === 'rect' &&
          Math.abs(entry.args[0] - 20.59) < 0.0001 &&
          Math.abs(entry.args[1] - 20.59) < 0.0001 &&
          Math.abs(entry.args[2] - 0.82) < 0.0001 &&
          Math.abs(entry.args[3] - 0.82) < 0.0001,
      ),
    ).to.equal(true);
  });

  it('draws inset diagonal rails for support-band ramparts instead of a center stroke', function() {
    visualizer.drawStructurePlacements([
      { roomName: 'W1N1', x: 20, y: 20, type: STRUCTURE_RAMPART, tag: 'rampart.support' },
      { roomName: 'W1N1', x: 21, y: 21, type: STRUCTURE_RAMPART, tag: 'rampart.support' },
    ], { opacity: 0.8 });

    expect(
      drawn.some(
        (entry) =>
          entry.type === 'line' &&
          Math.abs(entry.args[0] - 20.41) < 0.0001 &&
          Math.abs(entry.args[1] - 19.59) < 0.0001 &&
          Math.abs(entry.args[2] - 21.41) < 0.0001 &&
          Math.abs(entry.args[3] - 20.59) < 0.0001,
      ),
    ).to.equal(true);
    expect(
      drawn.some(
        (entry) =>
          entry.type === 'line' &&
          entry.args[0] === 20 &&
          entry.args[1] === 20 &&
          entry.args[2] === 21 &&
          entry.args[3] === 21,
      ),
    ).to.equal(false);
  });

  it('still uses structure/connectRoads for roads alongside rampart outlines', function() {
    visualizer.drawStructurePlacements([
      { roomName: 'W1N1', x: 20, y: 20, type: STRUCTURE_ROAD },
      { roomName: 'W1N1', x: 21, y: 20, type: STRUCTURE_ROAD },
      { roomName: 'W1N1', x: 20, y: 21, type: STRUCTURE_RAMPART },
      { roomName: 'W1N1', x: 21, y: 21, type: STRUCTURE_SPAWN },
    ]);

    expect(drawn.some((entry) => entry.type === 'structure' && entry.args[2] === STRUCTURE_ROAD)).to.equal(true);
    expect(drawn.some((entry) => entry.type === 'connectRoads')).to.equal(true);
    expect(drawn.some((entry) => entry.type === 'structure' && entry.args[2] === STRUCTURE_SPAWN)).to.equal(true);
    expect(drawn.some((entry) => entry.type === 'line')).to.equal(true);
  });
});
