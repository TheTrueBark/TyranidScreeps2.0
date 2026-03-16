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
global.TERRAIN_MASK_WALL = 1;
global.TERRAIN_MASK_SWAMP = 2;
const globals = require('./mocks/globals');

const layoutPlanner = require('../layoutPlanner');
const htm = require('../manager.htm');
const buildCompendium = require('../planner.buildCompendium');
// suppress visuals
global.RoomVisual = function () { this.structure = () => {}; };

describe('layoutPlanner.plan', function() {
  this.timeout(10000);

  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = { W1N1: {} };
    const spawn = { pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 1, my: true, pos: { x: 20, y: 20 } },
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
  });

  it('always plans through the theoretical pipeline', function() {
    Memory.settings = {
      layoutPlanningMode: 'theoretical',
      layoutPlanningTopCandidates: 1,
      layoutPlanningCandidatesPerTick: 5,
    };
    layoutPlanner.plan('W1N1');
    expect(Memory.rooms['W1N1'].layout.mode).to.equal('theoretical');
    expect(Memory.rooms['W1N1'].layout.planVersion).to.equal(2);
    expect(Memory.rooms['W1N1'].basePlan).to.exist;
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
    expect(layout.theoretical.compacted).to.equal(true);
    expect(layout.theoretical.spawnCandidate).to.include.keys('x', 'y', 'score');
    expect(layout.theoretical.sourceContainers).to.be.an('array').that.has.lengthOf(2);
    expect(layout.theoretical).to.not.have.property('floodTiles');
    expect(layout.theoretical).to.not.have.property('wallDistance');
    expect(layout.theoretical).to.not.have.property('controllerDistance');
    expect(layout.theoretical).to.have.property('selectedWeightedScore');
    expect(layout.theoretical.candidates).to.be.an('array').that.is.not.empty;
    expect(layout.roadMatrix).to.be.an('object');
    expect(Memory.rooms['W1N1'].basePlan).to.exist;
    expect(Memory.rooms['W1N1'].basePlan).to.have.property('spawnPos');
    expect(Memory.rooms['W1N1'].basePlan.compacted).to.equal(true);
    expect(Memory.rooms['W1N1'].basePlan).to.not.have.property('structures');
    expect(Memory.rooms['W1N1'].basePlan).to.have.property('buildQueue');
    expect(Memory.rooms['W1N1'].basePlan.buildQueue).to.be.an('array').that.is.not.empty;
    expect(Memory.rooms['W1N1'].basePlan.buildQueue[0]).to.not.have.property('priority');
    expect(Memory.rooms['W1N1'].basePlan.buildQueue[0]).to.not.have.property('sequence');
    expect(Memory.rooms['W1N1'].basePlan.buildQueue[0]).to.not.have.property('depth');
    expect(Memory.rooms['W1N1'].basePlan.buildQueue[0]).to.not.have.property('tag');
    expect(Memory.rooms['W1N1'].basePlan).to.have.property('evaluation');
    expect(Memory.rooms['W1N1'].basePlan).to.have.property('validation');
    expect(Memory.rooms['W1N1'].basePlan.validation).to.have.property('valid');
    expect(Memory.rooms['W1N1'].basePlan.plannerDebug.compacted).to.equal(true);
    expect(Memory.rooms['W1N1'].basePlan.plannerDebug.structurePlanning).to.not.have.property('placements');
    expect(Memory.rooms['W1N1'].basePlan.plannerDebug.validStructurePositions).to.not.have.property('positions');
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
      const completedResults = firstPipeline.results ? Object.keys(firstPipeline.results).length : 0;
      expect(candidateTasks.length + completedResults).to.be.at.least(1);
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

  it('adds explanatory checklist details for candidate filtering decisions', function() {
    const checklist = layoutPlanner._buildTheoreticalChecklist(
      'W1N1',
      {
        candidateCount: 1,
        results: {},
        candidateSet: {
          totalCandidates: 0,
          scannedCandidates: 0,
          filteredCandidates: 1,
          fallbackUsed: true,
        },
      },
      [{ index: 0, anchor: { x: 25, y: 25 } }],
    );
    expect(checklist).to.exist;
    expect(checklist.stages).to.be.an('array').that.is.not.empty;
    expect(checklist.stages).to.have.length(11);
    expect(checklist.stages[3].label).to.equal('Core + Foundations');
    expect(checklist.stages[4].label).to.equal('Sources + Resources');
    expect(checklist.stages[10].label).to.equal('Persist + Overlay');
    const stage2 = checklist.stages.find((stage) => stage.number === 2);
    expect(stage2).to.exist;
    expect(stage2.detail).to.equal('Only Controller Seed (fallback)');
  });



  it('supports manual phase initialization mode for independent phase range recomputation', function() {
    Memory.settings = {
      layoutPlanningMode: 'theoretical',
      layoutPlanningManualMode: true,
      layoutPlanningTopCandidates: 2,
      layoutPlanningCandidatesPerTick: 5,
    };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'].find = type => {
      if (type === FIND_MY_SPAWNS || type === 'FIND_MY_SPAWNS') return [];
      if (type === FIND_SOURCES || type === 'FIND_SOURCES') return [sourceA, sourceB];
      return [];
    };

    layoutPlanner.buildTheoreticalLayout('W1N1');
    expect(Memory.rooms['W1N1'].layout.theoretical).to.not.exist;

    const queued = layoutPlanner.initializeManualPhaseRun('W1N1', 4, 1);
    expect(queued).to.equal(true);

    for (let i = 0; i < 6; i++) {
      Game.time += 1;
      layoutPlanner.buildTheoreticalLayout('W1N1');
    }

    const layout = Memory.rooms['W1N1'].layout;
    expect(layout.theoreticalPipeline).to.exist;
    expect(['paused_phase_9', 'paused_phase_10', 'completed']).to.include(layout.theoreticalPipeline.status);
    expect(layout.theoretical).to.exist;
    expect(layout.theoretical.selectedCandidateIndex).to.be.a('number');

    const queuedRecalc = layoutPlanner.initializeManualPhaseRun('W1N1', 4, 3);
    expect(queuedRecalc).to.equal(true);
    Game.time += 1;
    layoutPlanner.buildTheoreticalLayout('W1N1');
    expect(layout.manualPhaseRequest).to.not.exist;
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
    const current = Memory.rooms['W1N1'].layout.currentDisplayCandidateIndex;
    const candidates = Memory.rooms['W1N1'].layout.theoretical.candidates || [];
    const indices = candidates.map((c) => c.index);
    if (indices.includes(1)) {
      expect(current).to.equal(1);
    } else {
      expect(current).to.be.a('number');
      expect(indices.includes(current)).to.equal(true);
    }
  });

  it('passes layout extension pattern setting to theoretical planner and enforces foundation stage', function() {
    Memory.settings = {
      layoutPlanningMode: 'theoretical',
      layoutPlanningTopCandidates: 1,
      layoutPlanningCandidatesPerTick: 5,
      layoutExtensionPattern: 'cluster3',
      layoutHarabiStage: 'full',
    };
    const sourceA = { id: 'srcA', pos: { x: 8, y: 8 } };
    const sourceB = { id: 'srcB', pos: { x: 38, y: 38 } };
    Game.rooms['W1N1'].find = type => {
      if (type === FIND_MY_SPAWNS || type === 'FIND_MY_SPAWNS') return [];
      if (type === FIND_SOURCES || type === 'FIND_SOURCES') return [sourceA, sourceB];
      return [];
    };

    layoutPlanner.plan('W1N1');
    const plan = Memory.rooms['W1N1'].basePlan;
    const pipeline = Memory.rooms['W1N1'].layout.theoreticalPipeline;
    expect(plan).to.exist;
    expect(plan.plannerDebug.harabiStage).to.equal('full');
    expect(pipeline.requestedHarabiStage).to.equal('full');
    expect(pipeline.candidateHarabiStage).to.equal('foundation');
    expect(pipeline.finalHarabiStage).to.equal('full');
    expect(Memory.settings.layoutHarabiStage).to.equal('full');
  });

  it('uses configured top-N candidate pipeline in theoretical mode when harabi pattern is enabled', function() {
    Memory.settings = {
      layoutPlanningMode: 'theoretical',
      layoutExtensionPattern: 'cluster3',
      layoutPlanningTopCandidates: 1,
      layoutPlanningCandidatesPerTick: 1,
      layoutHarabiStage: 'foundation',
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
    expect(layout).to.exist;
    expect(layout.mode).to.equal('theoretical');
    expect(layout.theoreticalPipeline).to.exist;
    expect(layout.theoreticalPipeline.candidateCount).to.be.at.least(1);
    expect(['running', 'completed']).to.include(layout.theoreticalPipeline.status);
  });

  it('skips replay refinement when bucket gate is not met', function() {
    Memory.settings = {
      runtimeMode: 'theoretical',
      layoutPlanningMode: 'theoretical',
      layoutRefinementEnabled: true,
      layoutRefinementMinBucket: 9000,
      layoutRefinementTopSeeds: 2,
      layoutRefinementMaxGenerations: 2,
      layoutRefinementVariantsPerGeneration: 2,
    };
    Game.cpu.bucket = 2000;
    const pipeline = {
      runId: 'test:skip',
      status: 'running',
      candidateCount: 2,
      candidates: [
        { index: 0, anchor: { x: 25, y: 25 } },
        { index: 1, anchor: { x: 26, y: 26 } },
      ],
      results: {
        0: { index: 0, weightedScore: 0.6, completedAt: Game.time },
        1: { index: 1, weightedScore: 0.5, completedAt: Game.time },
      },
      refinement: {
        enabled: true,
        status: 'pending',
        seedIndices: [],
        generation: 0,
        maxGenerations: 2,
        variantsPerGeneration: 2,
        attemptedMutations: 0,
        acceptedMutations: 0,
        bestScoreBefore: 0,
        bestScoreAfter: 0,
        improvementPct: 0,
        minBucket: 9000,
        topSeeds: 2,
        history: [],
      },
    };
    Memory.rooms.W1N1.layout = { theoreticalCandidatePlans: {} };
    const ranked = Object.values(pipeline.results).sort((a, b) => b.weightedScore - a.weightedScore);
    layoutPlanner._initializeRefinementIfNeeded(pipeline, ranked);
    layoutPlanner._runRefinementStep('W1N1', pipeline, Memory.rooms.W1N1);
    expect(pipeline.refinement.status).to.equal('skipped-bucket');
    expect(pipeline.refinement.seedIndices).to.deep.equal([0, 1]);
  });

  it('runs replay refinement and can switch winner to improved candidate', function() {
    Memory.settings = {
      runtimeMode: 'theoretical',
      layoutPlanningMode: 'theoretical',
      layoutRefinementEnabled: true,
      layoutRefinementMinBucket: 0,
      layoutRefinementTopSeeds: 2,
      layoutRefinementMaxGenerations: 1,
      layoutRefinementVariantsPerGeneration: 1,
    };
    Game.cpu.bucket = 10000;
    const pipeline = {
      runId: 'test:run',
      status: 'running',
      candidateCount: 2,
      candidates: [
        { index: 0, anchor: { x: 25, y: 25 } },
        { index: 1, anchor: { x: 26, y: 26 } },
      ],
      results: {
        0: { index: 0, weightedScore: 0.6, completedAt: Game.time },
        1: { index: 1, weightedScore: 0.55, completedAt: Game.time },
      },
      refinement: {
        enabled: true,
        status: 'pending',
        seedIndices: [],
        generation: 0,
        maxGenerations: 1,
        variantsPerGeneration: 1,
        attemptedMutations: 0,
        acceptedMutations: 0,
        bestScoreBefore: 0,
        bestScoreAfter: 0,
        improvementPct: 0,
        minBucket: 0,
        topSeeds: 2,
        history: [],
      },
    };
    Memory.rooms.W1N1.layout = { theoreticalCandidatePlans: {} };

    const original = buildCompendium.generatePlanForAnchor;
    buildCompendium.generatePlanForAnchor = function (roomName, anchorInput, options = {}) {
      const idx = options && options.candidateMeta ? options.candidateMeta.index : 0;
      const score = idx === 1 ? 0.75 : 0.61;
      return {
        anchor: { x: anchorInput.x, y: anchorInput.y },
        placements: [],
        evaluation: { weightedScore: score, metrics: {}, contributions: {} },
        meta: { validation: [], defenseScore: 0, validStructurePositions: {} },
      };
    };
    try {
      const ranked = Object.values(pipeline.results).sort((a, b) => b.weightedScore - a.weightedScore);
      layoutPlanner._initializeRefinementIfNeeded(pipeline, ranked);
      layoutPlanner._runRefinementStep('W1N1', pipeline, Memory.rooms.W1N1);
    } finally {
      buildCompendium.generatePlanForAnchor = original;
    }
    expect(pipeline.refinement.status).to.equal('done');
    expect(pipeline.refinement.acceptedMutations).to.be.at.least(1);
    const best = Object.values(pipeline.results).sort((a, b) => b.weightedScore - a.weightedScore)[0];
    expect(best.index).to.equal(1);
  });

  it('keeps winner unchanged when replay does not improve', function() {
    Memory.settings = {
      runtimeMode: 'theoretical',
      layoutPlanningMode: 'theoretical',
      layoutRefinementEnabled: true,
      layoutRefinementMinBucket: 0,
      layoutRefinementTopSeeds: 2,
      layoutRefinementMaxGenerations: 1,
      layoutRefinementVariantsPerGeneration: 1,
    };
    Game.cpu.bucket = 10000;
    const pipeline = {
      runId: 'test:no-improve',
      status: 'running',
      candidateCount: 2,
      candidates: [
        { index: 0, anchor: { x: 25, y: 25 } },
        { index: 1, anchor: { x: 26, y: 26 } },
      ],
      results: {
        0: { index: 0, weightedScore: 0.7, completedAt: Game.time },
        1: { index: 1, weightedScore: 0.6, completedAt: Game.time },
      },
      refinement: {
        enabled: true,
        status: 'pending',
        seedIndices: [],
        generation: 0,
        maxGenerations: 1,
        variantsPerGeneration: 1,
        attemptedMutations: 0,
        acceptedMutations: 0,
        bestScoreBefore: 0,
        bestScoreAfter: 0,
        improvementPct: 0,
        minBucket: 0,
        topSeeds: 2,
        history: [],
      },
    };
    Memory.rooms.W1N1.layout = { theoreticalCandidatePlans: {} };

    const original = buildCompendium.generatePlanForAnchor;
    buildCompendium.generatePlanForAnchor = function (roomName, anchorInput, options = {}) {
      const idx = options && options.candidateMeta ? options.candidateMeta.index : 0;
      const score = idx === 0 ? 0.69 : 0.58;
      return {
        anchor: { x: anchorInput.x, y: anchorInput.y },
        placements: [],
        evaluation: { weightedScore: score, metrics: {}, contributions: {} },
        meta: { validation: [], defenseScore: 0, validStructurePositions: {} },
      };
    };
    try {
      const ranked = Object.values(pipeline.results).sort((a, b) => b.weightedScore - a.weightedScore);
      layoutPlanner._initializeRefinementIfNeeded(pipeline, ranked);
      layoutPlanner._runRefinementStep('W1N1', pipeline, Memory.rooms.W1N1);
    } finally {
      buildCompendium.generatePlanForAnchor = original;
    }
    expect(pipeline.refinement.status).to.equal('done');
    expect(pipeline.refinement.acceptedMutations).to.equal(0);
    const best = Object.values(pipeline.results).sort((a, b) => b.weightedScore - a.weightedScore)[0];
    expect(best.index).to.equal(0);
  });

  it('reranks top full-plan candidates and demotes leaking defense plans', function() {
    Memory.settings = {
      runtimeMode: 'theoretical',
      layoutPlanningMode: 'theoretical',
      layoutExtensionPattern: 'cluster3',
      layoutHarabiStage: 'full',
    };
    Memory.rooms.W1N1.layout = { theoreticalCandidatePlans: {} };
    const pipeline = {
      runId: 'test:full-rerank',
      requestedHarabiStage: 'full',
      candidateHarabiStage: 'foundation',
      finalHarabiStage: 'full',
      candidates: [
        { index: 0, anchor: { x: 25, y: 25 } },
        { index: 1, anchor: { x: 26, y: 26 } },
      ],
      results: {
        0: { index: 0, weightedScore: 0.95, completedAt: Game.time },
        1: { index: 1, weightedScore: 0.7, completedAt: Game.time },
      },
      refinement: {
        enabled: false,
        status: 'disabled',
      },
    };

    const original = buildCompendium.generatePlanForAnchor;
    buildCompendium.generatePlanForAnchor = function (roomName, anchorInput, options = {}) {
      const idx = options && options.candidateMeta ? options.candidateMeta.index : 0;
      expect(options.defensePlanningMode).to.equal('estimate');
      return {
        anchor: { x: anchorInput.x, y: anchorInput.y },
        placements: [{ type: 'spawn', x: anchorInput.x, y: anchorInput.y }],
        evaluation: { weightedScore: idx === 0 ? 0.98 : 0.74, metrics: {}, contributions: {} },
        meta: {
          validation: idx === 0 ? ['rampart-boundary-leak:1', 'defense-score-low:900'] : [],
          defenseScore: idx === 0 ? 900 : 2400,
          validStructurePositions: {},
        },
      };
    };

    try {
      const ranked = layoutPlanner._rankPipelineResults(pipeline.results);
      const reranked = layoutPlanner._rerankTopCandidatesWithFullPlans(
        'W1N1',
        pipeline,
        Memory.rooms.W1N1,
        ranked,
      );
      expect(reranked[0].index).to.equal(1);
      expect(pipeline.results[0].rawWeightedScore).to.equal(0.98);
      expect(pipeline.results[0].weightedScore).to.be.below(0);
      expect(pipeline.results[1].weightedScore).to.equal(0.74);
      expect(pipeline.fullSelectionRerank.selectedIndex).to.equal(1);
      expect(pipeline.fullSelectionRerank.rerankedCount).to.equal(2);
      expect(pipeline.fullSelectionRerank.defensePlanningMode).to.equal('estimate');
    } finally {
      buildCompendium.generatePlanForAnchor = original;
    }
  });

  it('uses explicit full defense mode during full-plan rerank when configured', function() {
    Memory.settings = {
      runtimeMode: 'theoretical',
      layoutPlanningMode: 'theoretical',
      layoutExtensionPattern: 'cluster3',
      layoutHarabiStage: 'full',
      layoutDefensePlanningMode: 'full',
    };
    Memory.rooms.W1N1.layout = { theoreticalCandidatePlans: {} };
    const pipeline = {
      runId: 'test:full-rerank-mode',
      requestedHarabiStage: 'full',
      candidateHarabiStage: 'foundation',
      finalHarabiStage: 'full',
      candidates: [{ index: 0, anchor: { x: 25, y: 25 } }],
      results: {
        0: { index: 0, weightedScore: 0.95, completedAt: Game.time },
      },
      refinement: {
        enabled: false,
        status: 'disabled',
      },
    };

    const original = buildCompendium.generatePlanForAnchor;
    buildCompendium.generatePlanForAnchor = function (roomName, anchorInput, options = {}) {
      expect(options.defensePlanningMode).to.equal('full');
      return {
        anchor: { x: anchorInput.x, y: anchorInput.y },
        placements: [{ type: 'spawn', x: anchorInput.x, y: anchorInput.y }],
        evaluation: { weightedScore: 0.98, metrics: {}, contributions: {} },
        meta: {
          validation: [],
          defenseScore: 2400,
          validStructurePositions: {},
          fullOptimization: { mode: 'foundation-derived-full-v1' },
        },
      };
    };

    try {
      const ranked = layoutPlanner._rankPipelineResults(pipeline.results);
      layoutPlanner._rerankTopCandidatesWithFullPlans(
        'W1N1',
        pipeline,
        Memory.rooms.W1N1,
        ranked,
      );
      expect(pipeline.fullSelectionRerank.defensePlanningMode).to.equal('full');
    } finally {
      buildCompendium.generatePlanForAnchor = original;
    }
  });

  it('demotes foundation candidates with hard validation failures before winner selection', function() {
    Memory.settings = {
      runtimeMode: 'theoretical',
      layoutPlanningMode: 'theoretical',
      layoutExtensionPattern: 'cluster3',
      layoutHarabiStage: 'foundation',
      layoutPlanningTopCandidates: 2,
      layoutPlanningCandidatesPerTick: 5,
    };

    const original = buildCompendium.generatePlanForAnchor;
    buildCompendium.generatePlanForAnchor = function (roomName, anchorInput, options = {}) {
      const idx = options && options.candidateMeta ? options.candidateMeta.index : 0;
      return {
        anchor: { x: anchorInput.x, y: anchorInput.y },
        placements: [{ type: 'spawn', x: anchorInput.x, y: anchorInput.y }],
        evaluation: { weightedScore: idx === 0 ? 0.95 : 0.7, metrics: {}, contributions: {} },
        analysis: { dt: [], controllerDistance: {}, flood: [] },
        meta: {
          validation: idx === 0 ? ['controller-stamp-incomplete', 'road-network-disconnected:5/12'] : [],
          defenseScore: idx === 0 ? 0 : 1800,
          validStructurePositions: {},
        },
      };
    };

    try {
      layoutPlanner.buildTheoreticalLayout('W1N1');
      const layout = Memory.rooms.W1N1.layout;
      expect(layout.theoretical.selectedCandidateIndex).to.equal(1);
      expect(layout.theoretical.selectedWeightedScore).to.equal(0.7);
    } finally {
      buildCompendium.generatePlanForAnchor = original;
    }
  });

  it('does not select a winner when every candidate has hard foundation failures', function() {
    Memory.settings = {
      runtimeMode: 'theoretical',
      layoutPlanningMode: 'theoretical',
      layoutExtensionPattern: 'cluster3',
      layoutHarabiStage: 'foundation',
      layoutPlanningTopCandidates: 2,
      layoutPlanningCandidatesPerTick: 5,
    };

    const original = buildCompendium.generatePlanForAnchor;
    buildCompendium.generatePlanForAnchor = function (roomName, anchorInput) {
      return {
        anchor: { x: anchorInput.x, y: anchorInput.y },
        placements: [{ type: 'spawn', x: anchorInput.x, y: anchorInput.y }],
        evaluation: { weightedScore: 0.95, metrics: {}, contributions: {} },
        analysis: { dt: [], controllerDistance: {}, flood: [] },
        meta: {
          validation: ['controller-stamp-incomplete', 'road-network-disconnected:5/12'],
          defenseScore: 0,
          validStructurePositions: {},
        },
      };
    };

    try {
      layoutPlanner.buildTheoreticalLayout('W1N1');
      const layout = Memory.rooms.W1N1.layout;
      expect(layout.theoretical.selectedCandidateIndex).to.equal(null);
      expect(layout.theoretical.selectedWeightedScore).to.equal(0);
      expect(layout.theoretical.planningStatus).to.equal('completed');
    } finally {
      buildCompendium.generatePlanForAnchor = original;
    }
  });

  it('reuses materialized full preview instead of regenerating the final full plan', function() {
    Memory.settings = {
      runtimeMode: 'theoretical',
      layoutPlanningMode: 'theoretical',
      layoutExtensionPattern: 'cluster3',
      layoutHarabiStage: 'full',
      layoutDefensePlanningMode: 'full',
    };
    Memory.rooms.W1N1.basePlan = {
      buildQueue: [{ type: 'spawn', pos: { x: 25, y: 25 }, rcl: 1 }],
      plannerDebug: { fullOptimization: { mode: 'foundation-derived-full-v1' } },
    };
    Memory.rooms.W1N1.layout = {
      mode: 'theoretical',
      theoretical: {
        candidates: [{ index: 0, anchor: { x: 25, y: 25 }, weightedScore: 0.8 }],
        selectedCandidateIndex: 0,
        selectedWeightedScore: 0.8,
        planningStatus: 'running',
      },
      theoreticalCandidatePlans: {
        0: {
          index: 0,
          anchor: { x: 25, y: 25 },
          placements: [
            { type: 'spawn', x: 25, y: 25, tag: 'spawn.1' },
            { type: 'road', x: 24, y: 25, tag: 'road.full' },
            { type: 'rampart', x: 24, y: 24, tag: 'rampart.edge' },
          ],
          weightedScore: 0.8,
          rawWeightedScore: 0.8,
          selectionPenalty: 0,
          weightedMetrics: { roadCount: 1 },
          weightedContributions: { roadEff: { contribution: 0.1 } },
          validation: [],
          defenseScore: 2200,
          fullOptimization: { mode: 'foundation-derived-full-v1' },
        },
      },
      theoreticalPipeline: {
        runId: 'test:reuse-preview',
        status: 'running',
        candidateCount: 1,
        requestedHarabiStage: 'full',
        candidateHarabiStage: 'foundation',
        finalHarabiStage: 'full',
        candidates: [{ index: 0, anchor: { x: 25, y: 25 }, initialScore: 0.8 }],
        results: {
          0: {
            index: 0,
            weightedScore: 0.8,
            rawWeightedScore: 0.92,
            selectionPenalty: 0.12,
            weightedMetrics: { roadCount: 1 },
            weightedContributions: { roadEff: { contribution: 0.1 } },
            validation: [],
            defenseScore: 2200,
            completedAt: Game.time,
          },
        },
        refinement: {
          enabled: false,
          status: 'done',
        },
        fullSelectionRerank: {
          enabled: true,
          rerankedCount: 1,
          topN: 1,
          selectedIndex: 0,
          candidates: [],
        },
        fullPreviewCandidateIndex: 0,
        fullPreviewMutationKey: '',
        fullPreviewDefensePlanningMode: 'full',
      },
    };
    htm.init();
    expect(
      layoutPlanner._canReuseMaterializedFullPreview(
        Memory.rooms.W1N1.layout.theoreticalPipeline,
        Memory.rooms.W1N1.layout.theoreticalPipeline.candidates[0],
        Memory.rooms.W1N1.layout.theoreticalCandidatePlans[0],
        null,
      ),
    ).to.equal(true);

    const original = buildCompendium.generatePlanForAnchor;
    const originalMaterializeFullPreview = layoutPlanner._materializeTheoreticalFullPreview;
    const originalRerankTopCandidates = layoutPlanner._rerankTopCandidatesWithFullPlans;
    const originalGetContainer = htm._getContainer;
    buildCompendium.generatePlanForAnchor = function () {
      throw new Error('final full plan should reuse the existing preview');
    };
    layoutPlanner._materializeTheoreticalFullPreview = function () {
      return false;
    };
    layoutPlanner._rerankTopCandidatesWithFullPlans = function (_roomName, localPipeline, _mem, ranked) {
      localPipeline.fullSelectionRerank = {
        enabled: true,
        rerankedCount: 0,
        topN: 0,
        selectedIndex: 0,
        candidates: [],
      };
      return ranked;
    };
    htm._getContainer = function () {
      return { tasks: [] };
    };

    try {
      layoutPlanner._processTheoreticalPipeline('W1N1');
    } finally {
      buildCompendium.generatePlanForAnchor = original;
      layoutPlanner._materializeTheoreticalFullPreview = originalMaterializeFullPreview;
      layoutPlanner._rerankTopCandidatesWithFullPlans = originalRerankTopCandidates;
      htm._getContainer = originalGetContainer;
    }

    const layout = Memory.rooms.W1N1.layout;
    expect(layout.theoretical.planningStatus).to.equal('completed');
    expect(layout.theoretical.selectedCandidateIndex).to.equal(0);
    expect(layout.currentDisplayCandidateIndex).to.equal(0);
    expect(layout.matrix[25][25].structureType).to.equal('spawn');
    expect(layout.matrix[24][25].structureType).to.equal('road');
    expect(layout.theoreticalPipeline.status).to.equal('completed');
  });

  it('persists full-plan rerank score into the final theoretical layout', function() {
    Memory.rooms.W1N1.layout = {};
    const pipeline = {
      runId: 'test:write-rerank',
      bestCandidateIndex: 0,
      candidates: [{ index: 0, anchor: { x: 25, y: 25 }, initialScore: 0.8 }],
      results: {
        0: {
          index: 0,
          weightedScore: 0.41,
          rawWeightedScore: 0.91,
          selectionPenalty: 0.5,
          weightedMetrics: {},
          weightedContributions: {},
          validation: [],
          defenseScore: 1800,
          completedAt: Game.time,
        },
      },
      refinement: {
        enabled: false,
        status: 'done',
      },
      fullSelectionRerank: {
        enabled: true,
        rerankedCount: 1,
        topN: 1,
        selectedIndex: 0,
        candidates: [
          {
            index: 0,
            foundationScore: 0.8,
            rawWeightedScore: 0.91,
            weightedScore: 0.41,
            selectionPenalty: 0.5,
            criticalCount: 0,
            majorCount: 1,
          },
        ],
      },
    };

    layoutPlanner._writeTheoreticalLayoutFromPlan(
      Game.rooms.W1N1,
      {
        anchor: { x: 25, y: 25, score: 0.8 },
        placements: [{ type: 'spawn', x: 25, y: 25 }],
        analysis: { dt: [], controllerDistance: {}, flood: [] },
        evaluation: { weightedScore: 0.91, metrics: {}, contributions: {}, weights: {} },
        meta: {
          validation: [],
          foundationDebug: {},
          sourceResourceDebug: {},
          logisticsRoutes: {},
          labPlanning: {},
          structurePlanning: {},
          validStructurePositions: {},
        },
      },
      pipeline,
    );

    expect(Memory.rooms.W1N1.layout.theoretical.selectedWeightedScore).to.equal(0.41);
    expect(Memory.rooms.W1N1.basePlan.evaluation.weightedScore).to.equal(0.41);
    expect(Memory.rooms.W1N1.basePlan.plannerDebug.fullSelectionRerank.enabled).to.equal(true);
  });
});
