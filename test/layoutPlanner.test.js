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
global.FIND_SOURCES = 2;
const globals = require('./mocks/globals');

const layoutPlanner = require('../layoutPlanner');
const htm = require('../manager.htm');
// suppress visuals
global.RoomVisual = function () { this.structure = () => {}; };

describe('layoutPlanner.plan', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = { W1N1: {} };
    const spawn = { pos: { x: 10, y: 10, roomName: 'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 1, my: true, pos: { x: 20, y: 20 } },
      find: type => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: Memory.rooms['W1N1'],
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    Game.rooms['W1N1'].memory.distanceTransform = new Array(2500).fill(5);
  });

  it('stores anchor and stamps', function() {
    const room = Game.rooms['W1N1'];
    layoutPlanner.plan('W1N1');
    expect(Memory.rooms['W1N1'].layout.baseAnchor).to.deep.equal({ x: 10, y: 10 });
    const matrix = Memory.rooms['W1N1'].layout.matrix;
    expect(matrix['10']['10'].structureType).to.equal(STRUCTURE_SPAWN);
    expect(matrix['11']['10'].structureType).to.equal(STRUCTURE_EXTENSION);
    const cell = matrix['10']['10'];
    expect(cell.plannedBy).to.equal('layoutPlanner');
    expect(cell.blockedUntil).to.equal(Game.time + 1500);
    expect(Memory.rooms['W1N1'].layout.planVersion).to.equal(1);
  });

  it('builds a theoretical, spawn-independent plan when enabled', function() {
    Memory.settings = {
      layoutPlanningMode: 'theoretical',
      layoutPlanningTopCandidates: 1,
      layoutPlanningCandidatesPerTick: 5,
    };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'].find = type => {
      if (type === FIND_MY_SPAWNS || type === 'FIND_MY_SPAWNS') return [];
      if (type === FIND_SOURCES || type === 'FIND_SOURCES') return [sourceA, sourceB];
      return [];
    };
    layoutPlanner.plan('W1N1');
    const layout = Memory.rooms['W1N1'].layout;
    expect(layout.mode).to.equal('theoretical');
    expect(layout.planVersion).to.equal(2);
    expect(layout.theoretical).to.exist;
    expect(layout.theoretical.spawnCandidate).to.include.keys('x', 'y', 'score');
    expect(layout.theoretical.upgraderSlots).to.be.an('array').that.has.lengthOf(8);
    expect(layout.theoretical.sourceContainers).to.be.an('array').that.has.lengthOf(2);
    expect(layout.theoretical.floodTiles).to.be.an('array').that.is.not.empty;
    expect(layout.theoretical).to.have.property('selectedWeightedScore');
    expect(layout.theoretical.candidates).to.be.an('array').that.is.not.empty;
    expect(layout.roadMatrix).to.be.an('object');
  });

  it('splits theoretical candidate planning into HTM subtasks', function() {
    Memory.settings = {
      layoutPlanningMode: 'theoretical',
      layoutPlanningTopCandidates: 3,
      layoutPlanningCandidatesPerTick: 1,
    };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'].find = type => {
      if (type === FIND_MY_SPAWNS || type === 'FIND_MY_SPAWNS') return [];
      if (type === FIND_SOURCES || type === 'FIND_SOURCES') return [sourceA, sourceB];
      return [];
    };

    layoutPlanner.buildTheoreticalLayout('W1N1');
    const firstPipeline = Memory.rooms['W1N1'].layout.theoreticalPipeline;
    expect(firstPipeline).to.exist;
    expect(['running', 'completed']).to.include(firstPipeline.status);
    const firstContainer = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const candidateTasks = firstContainer && firstContainer.tasks
      ? firstContainer.tasks.filter((t) => t.name === 'PLAN_LAYOUT_CANDIDATE')
      : [];
    if (firstPipeline.status === 'running') {
      expect(candidateTasks.length).to.be.at.least(1);
    }

    for (let i = 0; i < 6; i++) {
      Game.time += 1;
      layoutPlanner.buildTheoreticalLayout('W1N1');
    }

    const layout = Memory.rooms['W1N1'].layout;
    expect(layout.planVersion).to.equal(2);
    expect(layout.theoretical.selectedWeightedScore).to.be.a('number');
    expect(layout.theoretical.selectedCandidateIndex).to.be.a('number');
    expect(layout.theoreticalPipeline.status).to.equal('completed');
  });



  it('supports scoped theoretical recalculation for debug phase windows', function() {
    Memory.settings = {
      layoutPlanningMode: 'theoretical',
      layoutPlanningTopCandidates: 3,
      layoutPlanningCandidatesPerTick: 5,
      layoutPlanningDebugPhaseFrom: 8,
      layoutPlanningDebugPhaseTo: 9,
      layoutPlanningRecalcScope: 'evaluation',
    };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'].find = type => {
      if (type === FIND_MY_SPAWNS || type === 'FIND_MY_SPAWNS') return [];
      if (type === FIND_SOURCES || type === 'FIND_SOURCES') return [sourceA, sourceB];
      return [];
    };

    layoutPlanner.buildTheoreticalLayout('W1N1');
    const before = Memory.rooms['W1N1'].layout.theoreticalPipeline;
    expect(before).to.exist;

    const ok = layoutPlanner.recalculateRoom('W1N1', {
      mode: 'theoretical',
      subPhase: 'evaluation',
      phaseFrom: 8,
      phaseTo: 9,
      scrubDistanceTransform: false,
    });
    expect(ok).to.equal(true);

    for (let i = 0; i < 4; i++) {
      Game.time += 1;
      layoutPlanner.buildTheoreticalLayout('W1N1');
    }

    const after = Memory.rooms['W1N1'].layout;
    expect(after.theoretical).to.exist;
    expect(after.theoretical.checklist).to.exist;
    expect(after.theoretical.checklist.debug).to.exist;
    expect(after.theoretical.checklist.debug.phaseWindow.from).to.equal(8);
    expect(after.theoretical.checklist.debug.phaseWindow.to).to.equal(9);
  });

  it('switches displayed building overlay candidate via settings index', function() {
    Memory.settings = {
      layoutPlanningMode: 'theoretical',
      layoutPlanningTopCandidates: 3,
      layoutPlanningCandidatesPerTick: 5,
      layoutCandidateOverlayIndex: -1,
    };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'].find = type => {
      if (type === FIND_MY_SPAWNS || type === 'FIND_MY_SPAWNS') return [];
      if (type === FIND_SOURCES || type === 'FIND_SOURCES') return [sourceA, sourceB];
      return [];
    };

    layoutPlanner.buildTheoreticalLayout('W1N1');
    const firstDisplay = Memory.rooms['W1N1'].layout.currentDisplayCandidateIndex;
    expect(firstDisplay).to.be.a('number');

    Memory.settings.layoutCandidateOverlayIndex = 1;
    Game.time += 1;
    layoutPlanner.buildTheoreticalLayout('W1N1');
    expect(Memory.rooms['W1N1'].layout.currentDisplayCandidateIndex).to.equal(1);
  });
});
