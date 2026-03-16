/** @codex-owner layoutPlanner */
const { expect } = require('chai');
global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_ROAD = 'road';
global.STRUCTURE_RAMPART = 'rampart';
global.STRUCTURE_LAB = 'lab';
global.STRUCTURE_POWER_SPAWN = 'powerSpawn';
global.FIND_SOURCES = 2;
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
    global.RoomVisual.prototype.structure = function(...args) {
      drawn.push({ type: 'structure', args });
      return this;
    };
    global.RoomVisual.prototype.connectRoads = function(...args) {
      drawn.push({ type: 'connectRoads', args });
      return this;
    };
    global.RoomVisual.prototype.text = function(...args) { drawn.push({ type: 'text', args }); };
    global.RoomVisual.prototype.rect = function(...args) { drawn.push({ type: 'rect', args }); };
    global.RoomVisual.prototype.circle = function(...args) { drawn.push({ type: 'circle', args }); };
    global.RoomVisual.prototype.line = function(...args) { drawn.push({ type: 'line', args }); };
    Memory.settings = {
      showLayoutOverlay: true,
      layoutPlanningMode: 'theoretical',
      layoutPlanningTopCandidates: 1,
      layoutPlanningCandidatesPerTick: 5,
    };
    Memory.rooms = { W1N1: {} };
    const spawn = { pos: { x: 5, y: 5, roomName: 'W1N1' } };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 8, my: true, pos: { x: 20, y: 20 } },
      find: type => {
        if (type === FIND_MY_SPAWNS || type === 'FIND_MY_SPAWNS') return [spawn];
        if (type === FIND_SOURCES || type === 'FIND_SOURCES') return [sourceA, sourceB];
        return [];
      },
      memory: Memory.rooms['W1N1'],
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    Game.rooms['W1N1'].memory.distanceTransform = new Array(2500).fill(5);
    drawn = [];
    layoutPlanner.plan('W1N1');
  });

  it('renders plan view structures through RoomVisual.structure and keeps only numeric overlays', function() {
    visualizer.drawLayout('W1N1');
    const types = drawn.map(d => d.type);
    expect(types).to.include('structure');
    expect(types).to.include('connectRoads');
    expect(types).to.include('text');
    expect(drawn.some(d => d.type === 'text' && d.args[0] === '2')).to.be.true;
    expect(drawn.some(d => d.type === 'structure' && d.args[2] === STRUCTURE_SPAWN)).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'E')).to.be.false;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Layout Legend')).to.be.false;
  });

  it('renders ramparts as connected outlines with only a subtle tint fill', function() {
    Memory.rooms.W1N1.basePlan = {
      structures: {
        road: [{ x: 20, y: 20, rcl: 2, tag: 'road.rampart' }],
        rampart: [{ x: 20, y: 20, rcl: 2, tag: 'rampart.edge' }],
      },
    };
    visualizer.drawLayout('W1N1');
    expect(
      drawn.some(
        d => d.type === 'line' && d.args[0] === 19.5 && d.args[1] === 19.5 && d.args[2] === 20.5 && d.args[3] === 19.5,
      ),
    ).to.be.true;
    expect(drawn.some(d => d.type === 'structure' && d.args[2] === STRUCTURE_RAMPART)).to.be.false;
    expect(
      drawn.some(
        d =>
          d.type === 'rect' &&
          d.args[0] === 19.5 &&
          d.args[1] === 19.5 &&
          d.args[2] === 1 &&
          d.args[3] === 1 &&
          d.args[4] &&
          d.args[4].strokeWidth === 0 &&
          d.args[4].opacity < 0.2,
      ),
    ).to.be.true;
    expect(
      drawn.some(
        d => d.type === 'text' && d.args[0] === 'A' && d.args[1] === 20 && d.args[2] > 20 && d.args[2] < 20.3,
      ),
    ).to.be.false;
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
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Layout Legend')).to.be.false;
    expect(drawn.some(d => d.type === 'structure' && d.args[2] === STRUCTURE_SPAWN)).to.be.true;
    expect(drawn.some(d => d.type === 'structure' && d.args[2] === STRUCTURE_CONTAINER)).to.be.true;
    expect(
      drawn.some(
        d => d.type === 'rect' && d.args[0] === 17.5 && d.args[1] === 19.5 && d.args[2] === 1 && d.args[3] === 1,
      ),
    ).to.be.false;
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
    expect(drawn.some(d => d.type === 'structure')).to.be.false;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Candidates')).to.be.true;
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

  it('renders replay progress detail in checklist stage 9', function() {
    Memory.settings.layoutPlanningMode = 'theoretical';
    Memory.settings.layoutOverlayView = 'plan';
    Memory.settings.enableHudCalcCache = false;
    Memory.rooms.W2N2 = { layout: JSON.parse(JSON.stringify(Memory.rooms.W1N1.layout || {})) };
    Game.rooms.W2N2 = Object.assign({}, Game.rooms.W1N1, {
      name: 'W2N2',
      memory: Memory.rooms.W2N2,
      controller: { level: 8, my: true, pos: { x: 20, y: 20 } },
    });
    const layout = Memory.rooms.W2N2.layout;
    layout.mode = 'theoretical';
    layout.theoretical = {
      checklist: {
        stages: [
          {
            number: 9,
            label: 'End Evaluation (Weighted)',
            status: 'in_progress',
            progress: '1/5',
            detail: 'Replay gen 3/8, accepted 2/24, +7.4%',
          },
        ],
        candidateStates: [],
      },
      candidates: [],
      sourceContainers: [],
      upgraderSlots: [],
    };
    visualizer.drawLayout('W2N2');
    expect(
      drawn.some(
        d => d.type === 'text' && String(d.args[0]) === 'Replay gen 3/8, accepted 2/24, +7.4%',
      ),
    ).to.be.true;
  });

  it('does not render spawn or power spawn shorthand labels in plan view', function() {
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
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'S2')).to.be.false;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'S3')).to.be.false;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'PS')).to.be.false;
    expect(drawn.filter(d => d.type === 'structure' && d.args[2] === STRUCTURE_SPAWN).length).to.be.at.least(2);
    expect(drawn.some(d => d.type === 'structure' && d.args[2] === STRUCTURE_POWER_SPAWN)).to.be.true;
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
    expect(
      drawn.some(
        d =>
          d.type === 'rect' &&
          d.args[0] === 19.5 &&
          d.args[1] === 19.5 &&
          d.args[2] === 1 &&
          d.args[3] === 1 &&
          d.args[4] &&
          d.args[4].strokeWidth === 0 &&
          d.args[4].opacity < 0.2,
      ),
    ).to.be.true;
    expect(
      drawn.some(d => d.type === 'structure' && d.args[0] === 20 && d.args[1] === 20 && d.args[2] === STRUCTURE_ROAD),
    ).to.be.true;
    expect(
      drawn.some(
        d => d.type === 'line' && d.args[0] === 19.5 && d.args[1] === 19.5 && d.args[2] === 20.5 && d.args[3] === 19.5,
      ),
    ).to.be.true;
    expect(drawn.some(d => d.type === 'structure' && d.args[2] === STRUCTURE_RAMPART)).to.be.false;
    expect(drawn.some(d => d.type === 'connectRoads')).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'AR')).to.be.false;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'Road + Rampart Overlap')).to.be.false;
  });

  it('renders plan structures from compact queue-only basePlan memory', function() {
    Memory.rooms.W1N1.layout.matrix = {};
    Memory.rooms.W1N1.basePlan = {
      compacted: true,
      buildQueue: [
        { type: STRUCTURE_SPAWN, pos: { x: 20, y: 20 } },
        { type: STRUCTURE_ROAD, pos: { x: 19, y: 20 } },
        { type: STRUCTURE_RAMPART, pos: { x: 19, y: 20 } },
        { type: STRUCTURE_LAB, pos: { x: 22, y: 22 }, rcl: 6 },
      ],
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'structure' && d.args[0] === 20 && d.args[1] === 20 && d.args[2] === STRUCTURE_SPAWN)).to.equal(true);
    expect(drawn.some(d => d.type === 'structure' && d.args[0] === 22 && d.args[1] === 22 && d.args[2] === STRUCTURE_LAB)).to.equal(true);
    expect(drawn.some(d => d.type === 'structure' && d.args[0] === 19 && d.args[1] === 20 && d.args[2] === STRUCTURE_ROAD)).to.equal(true);
    expect(drawn.some(d => d.type === 'line' && d.args[0] === 18.5 && d.args[1] === 19.5 && d.args[2] === 19.5 && d.args[3] === 19.5)).to.equal(true);
  });

  it('renders valid structure debug dots when planner debug positions exist', function() {
    Memory.settings.debugVisuals = true;
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
    Memory.settings.debugVisuals = true;
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

  it('falls back to active candidate debug arrays when basePlan only keeps compact summaries', function() {
    Memory.settings.debugVisuals = true;
    Memory.rooms.W1N1.basePlan = {
      plannerDebug: {
        structurePlanning: {
          computed: true,
          counts: { extension: 1 },
        },
        validStructurePositions: {
          structureClear: 2,
          canPlace: 2,
          shownPositions: 2,
        },
      },
    };
    Memory.rooms.W1N1.layout.theoretical = {
      selectedCandidateIndex: 0,
    };
    Memory.rooms.W1N1.layout.currentDisplayCandidateIndex = 0;
    Memory.rooms.W1N1.layout.theoreticalCandidatePlans = {
      0: {
        structurePlanning: {
          placements: [{ type: 'extension', x: 31, y: 31, tag: 'preview.extension' }],
        },
        validStructurePositions: {
          structureClear: 2,
          canPlace: 2,
          positions: [{ x: 31, y: 31 }, { x: 32, y: 31 }],
          truncated: false,
        },
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'structure' && d.args[0] === 31 && d.args[1] === 31 && d.args[2] === 'extension')).to.equal(true);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 31 && d.args[1] === 31)).to.equal(false);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 32 && d.args[1] === 31)).to.equal(true);
  });

  it('does not draw valid dots on occupied structure tiles (e.g. labs/extensions)', function() {
    Memory.settings.debugVisuals = true;
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
          positions: [{ x: 24, y: 24 }, { x: 25, y: 24 }, { x: 30, y: 30 }],
          truncated: false,
        },
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 24 && d.args[1] === 24)).to.equal(false);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 25 && d.args[1] === 24)).to.equal(false);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 30 && d.args[1] === 30)).to.equal(true);
  });

  it('renders lab tiles as structures without shorthand labels in plan view', function() {
    Memory.rooms.W1N1.basePlan = {
      structures: {
        lab: [{ x: 22, y: 22, rcl: 6, tag: 'lab.source.1' }],
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'structure' && d.args[0] === 22 && d.args[1] === 22 && d.args[2] === 'lab')).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'L' && d.args[1] === 22)).to.be.false;
  });

  it('renders lab planning preview tiles as structures before final lab placement', function() {
    Memory.rooms.W1N1.basePlan = {
      plannerDebug: {
        labPlanning: {
          sourceLabs: [{ x: 24, y: 24 }, { x: 25, y: 24 }],
          reactionLabs: [{ x: 24, y: 25 }, { x: 25, y: 25 }],
        },
      },
    };
    visualizer.drawLayout('W1N1');
    expect(
      drawn.some(d => d.type === 'structure' && d.args[0] === 24 && d.args[1] === 24 && d.args[2] === STRUCTURE_LAB),
    ).to.be.true;
    expect(
      drawn.some(d => d.type === 'structure' && d.args[0] === 25 && d.args[1] === 25 && d.args[2] === STRUCTURE_LAB),
    ).to.be.true;
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'L')).to.be.false;
  });

  it('renders structure planning previews and suppresses valid dots on those tiles', function() {
    Memory.settings.debugVisuals = true;
    Memory.rooms.W1N1.basePlan = {
      plannerDebug: {
        structurePlanning: {
          placements: [
            { type: 'extension', x: 27, y: 27, tag: 'preview.extension' },
            { type: 'factory', x: 28, y: 27, tag: 'preview.factory' },
          ],
        },
        validStructurePositions: {
          structureClear: 3,
          canPlace: 3,
          positions: [{ x: 27, y: 27 }, { x: 28, y: 27 }, { x: 29, y: 27 }],
          truncated: false,
        },
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'structure' && d.args[0] === 27 && d.args[1] === 27 && d.args[2] === 'extension')).to.equal(true);
    expect(drawn.some(d => d.type === 'structure' && d.args[0] === 28 && d.args[1] === 27 && d.args[2] === 'factory')).to.equal(true);
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'E' && d.args[1] === 27)).to.equal(false);
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'F' && d.args[1] === 28)).to.equal(false);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 27 && d.args[1] === 27)).to.equal(false);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 28 && d.args[1] === 27)).to.equal(false);
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 29 && d.args[1] === 27)).to.equal(true);
  });

  it('hides planner distance labels, valid dots, and DT marker when debug visuals are disabled', function() {
    Memory.settings.debugVisuals = false;
    Memory.rooms.W1N1.basePlan = {
      plannerDebug: {
        structurePlanning: {
          placements: [{ type: 'extension', x: 27, y: 27, range: 5, rcl: 4 }],
          ranking: {
            spawnStampCenter: { x: 12, y: 12 },
          },
        },
        validStructurePositions: {
          structureClear: 1,
          canPlace: 1,
          positions: [{ x: 29, y: 29, dist: 6, candidateRcl: 4 }],
          truncated: false,
        },
      },
    };
    visualizer.drawLayout('W1N1');
    expect(drawn.some(d => d.type === 'circle' && d.args[0] === 29 && d.args[1] === 29)).to.equal(false);
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'D5,C4')).to.equal(false);
    expect(drawn.some(d => d.type === 'text' && d.args[0] === 'DT0')).to.equal(false);
    expect(drawn.some(d => d.type === 'text' && String(d.args[0]).startsWith('ValidStruct'))).to.equal(false);
  });
});
