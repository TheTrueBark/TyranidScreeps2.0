/** @codex-owner layoutPlanner */
const { expect } = require('chai');
global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_CONTAINER = 'container';
const globals = require('./mocks/globals');

const layoutPlanner = require('../layoutPlanner');
const visualizer = require('../layoutVisualizer');
const htm = require('../manager.htm');

let drawn;

describe('layoutVisualizer.drawLayout', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    global.RoomVisual = function() {};
    global.RoomVisual.prototype.text = function(...args) { drawn.push({ type: 'text', args }); };
    global.RoomVisual.prototype.rect = function(...args) { drawn.push({ type: 'rect', args }); };
    Memory.settings = { showLayoutOverlay: true };
    Memory.rooms = { W1N1: {} };
    const spawn = { pos: { x: 5, y: 5, roomName: 'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 8, my: true, pos: { x: 20, y: 20 } },
      find: type => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: Memory.rooms['W1N1'],
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    Game.rooms['W1N1'].memory.distanceTransform = new Array(2500).fill(5);
    drawn = [];
    layoutPlanner.plan('W1N1');
  });

  it('draws glyphs and reserved boxes', function() {
    visualizer.drawLayout('W1N1');
    const types = drawn.map(d => d.type);
    expect(types).to.include('text');
    expect(types).to.include('rect');
    expect(drawn.some(d => d.type === 'text' && d.args[0] === '2')).to.be.true;
  });
});
