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
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Planned Terminal')).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Planned Lab')).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Planned Rampart')).to.be.true;
    const legendY = drawn
      .filter(d => d.type === 'text' && typeof d.args[1] === 'number' && typeof d.args[2] === 'number')
      .filter(d => String(d.args[0]).startsWith('Planned ') || d.args[0] === 'Layout Legend' || String(d.args[0]).startsWith('View:'))
      .map(d => d.args[2]);
    expect(Math.max(...legendY)).to.be.at.most(49);
  });

  it('renders candidate list and weighted score breakdown views', function() {
    Memory.settings.layoutPlanningMode = 'theoretical';
    Memory.settings.layoutOverlayView = 'evaluation';
    Memory.settings.layoutCandidateOverlayIndex = 1;
    const layout = Memory.rooms.W1N1.layout;
    layout.mode = 'theoretical';
    layout.theoretical = {
      controllerPos: { x: 20, y: 20 },
      spawnCandidate: { x: 24, y: 24, score: 100 },
      selectedCandidateIndex: 0,
      selectedWeightedScore: 0.812,
      candidates: [
        {
          index: 0,
          anchor: { x: 24, y: 24 },
          initialScore: 120,
          weightedScore: 0.812,
          weightedContributions: {
            avgExtDist: { normalized: 0.8, weight: 0.2, contribution: 0.16 },
          },
          selected: true,
        },
        {
          index: 1,
          anchor: { x: 27, y: 23 },
          initialScore: 110,
          weightedScore: 0.755,
          weightedContributions: {
            avgExtDist: { normalized: 0.7, weight: 0.2, contribution: 0.14 },
          },
          selected: false,
        },
      ],
      upgraderSlots: [],
      sourceContainers: [],
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Candidates')).to.be.true;
    expect(
      drawn.some(d => d.type === 'text' && String(d.args[0]).startsWith('Eval C2 weighted:')),
    ).to.be.true;
  });
});
