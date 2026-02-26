/** @codex-owner layoutPlanner */
const { expect } = require('chai');
global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_CONTAINER = 'container';
global.TERRAIN_MASK_WALL = 1;
global.TERRAIN_MASK_SWAMP = 2;
global.FIND_STRUCTURES = 107;
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
    global.RoomVisual.prototype.line = function(...args) { drawn.push({ type: 'line', args }); };
    Memory.settings = { showLayoutOverlay: true, layoutLegacyMode: true };
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

  it('draws planned labels', function() {
    visualizer.drawLayout('W1N1');
    const types = drawn.map(d => d.type);
    expect(types).to.include('text');
    expect(drawn.some(d => d.type === 'text' && d.args[0] === '2')).to.be.true;
  });

  it('draws theoretical spawn marker when theoretical mode is active', function() {
    Memory.settings.layoutPlanningMode = 'theoretical';
    Memory.settings.layoutOverlayView = 'plan';
    const layout = Memory.rooms.W1N1.layout;
    layout.mode = 'theoretical';
    layout.theoreticalPipeline = {
      status: 'running',
      bestCandidateIndex: undefined,
      results: {},
      candidateCount: 0,
    };
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
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Candidates')).to.be.false;
    expect(
      drawn.some(d => d.type === 'text' && String(d.args[0]).startsWith('Eval C2 weighted:')),
    ).to.be.true;
  });

  it('renders checklist stage detail lines under stage status', function() {
    Memory.settings.layoutPlanningMode = 'theoretical';
    Memory.settings.layoutOverlayView = 'plan';
    const layout = Memory.rooms.W1N1.layout;
    layout.mode = 'theoretical';
    layout.theoretical = {
      checklist: {
        stages: [
          {
            number: 2,
            label: 'Candidate Filter',
            status: 'done',
            progress: '✔',
            detail: 'Only Controller Seed (fallback)',
          },
        ],
        candidateStates: [],
      },
      candidates: [],
      sourceContainers: [],
      upgraderSlots: [],
    };
    visualizer.drawLayout('W1N1');
    expect(
      drawn.some(
        d => d.type === 'text' && String(d.args[0]) === 'Only Controller Seed (fallback)',
      ),
    ).to.be.true;
  });

  it('renders spawn variant labels (S2) from matrix tags', function() {
    Memory.settings.showLayoutOverlayLabels = true;
    const matrix = Memory.rooms.W1N1.layout.matrix;
    matrix['15'] = matrix['15'] || {};
    matrix['15']['15'] = {
      structureType: STRUCTURE_SPAWN,
      rcl: 7,
      tag: 'spawn.2',
    };
    matrix['16'] = matrix['16'] || {};
    matrix['16']['15'] = {
      structureType: STRUCTURE_SPAWN,
      rcl: 8,
      tag: 'spawn.3',
    };
    matrix['17'] = matrix['17'] || {};
    matrix['17']['15'] = {
      structureType:
        typeof STRUCTURE_POWER_SPAWN !== 'undefined' ? STRUCTURE_POWER_SPAWN : 'powerSpawn',
      rcl: 8,
      tag: 'core.powerSpawn',
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'S2')).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'S3')).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'PS')).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Power Spawn (PS)')).to.be.true;
  });

  it('renders road+rampart overlap from base plan structures', function() {
    const matrix = Memory.rooms.W1N1.layout.matrix;
    matrix['20'] = matrix['20'] || {};
    matrix['20']['20'] = {
      structureType: STRUCTURE_ROAD,
      rcl: 2,
      tag: 'road.rampart',
    };
    Memory.rooms.W1N1.basePlan = {
      structures: {
        [STRUCTURE_ROAD]: [{ x: 20, y: 20, rcl: 2 }],
        [STRUCTURE_RAMPART]: [{ x: 20, y: 20, rcl: 2 }],
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 20 && d.args[1] === 20)).to.be.true;
    const hasRoadLine = drawn.some(
      d =>
        d.type === 'line' &&
        ((d.args[0] === 20 && d.args[1] === 20) || (d.args[2] === 20 && d.args[3] === 20)),
    );
    const hasRoadDotGlyph = drawn.some(
      d => d.type === 'text' && d.args[0] === '·' && d.args[1] === 20 && d.args[2] === 20.08,
    );
    expect(hasRoadLine || hasRoadDotGlyph).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Road + Rampart Overlap')).to.be.true;
  });

  it('renders valid structure debug dots when planner debug positions exist', function() {
    Memory.rooms.W1N1.basePlan = Memory.rooms.W1N1.basePlan || {};
    Memory.rooms.W1N1.basePlan.plannerDebug = {
      validStructurePositions: {
        structureClear: 2,
        canPlace: 2,
        positions: [{ x: 13, y: 13 }, { x: 14, y: 14 }],
        truncated: false,
      },
    };
    visualizer.drawLayout('W1N1');
    expect(
      drawn.some(d => d.type === 'text' && String(d.args[0]).startsWith('ValidStruct 2')),
    ).to.be.true;
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 13 && d.args[1] === 13)).to.be.true;
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 14 && d.args[1] === 14)).to.be.true;
  });

  it('renders valid structure debug dots from active theoretical candidate plan fallback', function() {
    delete Memory.rooms.W1N1.basePlan;
    Memory.rooms.W1N1.layout.theoretical = {};
    Memory.rooms.W1N1.layout.matrix = {};
    Memory.rooms.W1N1.layout.currentDisplayCandidateIndex = 0;
    Memory.rooms.W1N1.layout.theoreticalCandidatePlans = {
      0: {
        validStructurePositions: {
          structureClear: 2,
          canPlace: 2,
          positions: [{ x: 18, y: 18 }, { x: 19, y: 19 }],
          truncated: false,
        },
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 18 && d.args[1] === 18)).to.be.true;
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 19 && d.args[1] === 19)).to.be.true;
  });

  it('does not draw valid dots on occupied structure tiles (e.g. labs/extensions)', function() {
    Memory.settings.layoutPlanningMode = 'theoretical';
    Memory.rooms.W1N1.basePlan = {
      structures: {
        lab: [{ x: 24, y: 24, rcl: 6, tag: 'lab.source.1' }],
        extension: [{ x: 25, y: 24, rcl: 2, tag: 'extension.1' }],
      },
      plannerDebug: {
        validStructurePositions: {
          structureClear: 3,
          canPlace: 3,
          positions: [{ x: 24, y: 24 }, { x: 25, y: 24 }, { x: 26, y: 24 }],
          truncated: false,
        },
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 24 && d.args[1] === 24)).to.equal(false);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 25 && d.args[1] === 24)).to.equal(false);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 26 && d.args[1] === 24)).to.equal(true);
  });

  it('renders lab tiles as L in overlay', function() {
    Memory.rooms.W1N1.basePlan = {
      structures: {
        lab: [{ x: 22, y: 22, rcl: 6, tag: 'lab.source.1' }],
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'L' && d.args[1] === 22)).to.be.true;
  });
});
