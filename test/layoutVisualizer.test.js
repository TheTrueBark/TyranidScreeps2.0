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
    global.RoomVisual.prototype.circle = function(...args) { drawn.push({ type: 'circle', args }); };
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

  it('draws planned dots, labels, and reserved boxes', function() {
    visualizer.drawLayout('W1N1');
    const types = drawn.map(d => d.type);
    expect(types).to.include('circle');
    expect(types).to.include('text');
    expect(types).to.include('rect');
    expect(drawn.some(d => d.type === 'text' && d.args[0] === '2')).to.be.true;
  });

  it('draws theoretical spawn marker when theoretical mode is active', function() {
    Memory.settings.layoutPlanningMode = 'theoretical';
    Memory.settings.layoutOverlayView = 'plan';
    const layout = Memory.rooms.W1N1.layout;
    layout.mode = 'theoretical';
    layout.theoretical = {
      controllerPos: { x: 20, y: 20 },
      spawnCandidate: { x: 24, y: 24, score: 100, floodScore: 50, mincutScore: 10 },
      upgraderSlots: [{ x: 18, y: 20 }, { x: 19, y: 20 }, { x: 20, y: 20 }, { x: 21, y: 20 }, { x: 18, y: 21 }, { x: 19, y: 21 }, { x: 20, y: 21 }, { x: 21, y: 21 }],
      sourceContainers: [{ x: 10, y: 10 }, { x: 30, y: 30 }],
      controllerContainer: { x: 20, y: 23 },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'TH-SP')).to.be.true;
  });
});
