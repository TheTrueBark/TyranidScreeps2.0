const { expect } = require('chai');
const globals = require('./mocks/globals');

global.FIND_SOURCES = 1;
global.FIND_MINERALS = 2;
global.LOOK_STRUCTURES = 'structure';
global.STRUCTURE_ROAD = 'road';
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_TERMINAL = 'terminal';
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_RAMPART = 'rampart';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_LAB = 'lab';
global.STRUCTURE_TOWER = 'tower';

const planner = require('../planner.buildCompendium');
const minCutAlgorithm = require('../algorithm.minCut');

describe('build compendium planner', function () {
  this.timeout(5000);

  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    const sourceA = { id: 'sa', pos: { x: 10, y: 10 } };
    const sourceB = { id: 'sb', pos: { x: 38, y: 38 } };
    const mineral = { id: 'm1', pos: { x: 40, y: 8 } };
    Game.rooms.W1N1 = {
      name: 'W1N1',
      controller: { my: true, pos: { x: 25, y: 25 } },
      find(type) {
        if (type === FIND_SOURCES || type === 'FIND_SOURCES' || type === 1) return [sourceA, sourceB];
        if (type === FIND_MINERALS || type === 'FIND_MINERALS' || type === 2) return [mineral];
        return [];
      },
      lookForAt() {
        return [];
      },
      getTerrain() {
        return { get: () => 0 };
      },
      memory: {
        distanceTransform: new Array(2500).fill(7),
      },
    };
  });

  it('generates core placements and rcl-aware extension spread', function () {
    const plan = planner.generatePlan('W1N1');
    expect(plan).to.exist;
    const placements = plan.placements || [];
    expect(placements.some((p) => p.type === STRUCTURE_STORAGE)).to.equal(true);
    expect(placements.some((p) => p.type === STRUCTURE_TERMINAL)).to.equal(true);
    expect(placements.some((p) => p.type === STRUCTURE_SPAWN && p.rcl === 1)).to.equal(true);
    const exts = placements.filter((p) => p.type === STRUCTURE_EXTENSION);
    expect(exts.length).to.be.at.least(20);
    expect(exts.some((e) => e.rcl === 2)).to.equal(true);
    expect(exts.some((e) => e.rcl >= 6)).to.equal(true);

    const storage = placements.find((p) => p.type === STRUCTURE_STORAGE);
    const terminal = placements.find((p) => p.type === STRUCTURE_TERMINAL);
    expect(storage).to.exist;
    expect(terminal).to.exist;
    const sRange = Math.max(Math.abs(storage.x - terminal.x), Math.abs(storage.y - terminal.y));
    expect(sRange).to.be.at.most(1);

    const sink = placements.find((p) => p.tag === 'link.sink');
    expect(sink).to.exist;
    const sinkRange = Math.max(Math.abs(storage.x - sink.x), Math.abs(storage.y - sink.y));
    expect(sinkRange).to.be.at.most(2);
  });

  it('keeps non-road placements out of exit-range tiles', function () {
    const plan = planner.generatePlan('W1N1');
    for (const p of plan.placements || []) {
      if (p.type === STRUCTURE_ROAD) continue;
      expect(p.x).to.be.within(2, 47);
      expect(p.y).to.be.within(2, 47);
    }
  });

  it('keeps extensions off road tiles and validates core constraints', function () {
    const plan = planner.generatePlan('W1N1');
    const placements = plan.placements || [];
    const storage = placements.find((p) => p.type === STRUCTURE_STORAGE);
    const exts = placements.filter((p) => p.type === STRUCTURE_EXTENSION);
    const roadKeys = new Set(
      placements
        .filter((p) => p.type === STRUCTURE_ROAD)
        .map((p) => `${p.x}:${p.y}`),
    );
    expect(exts.length).to.be.at.least(10);
    expect(storage).to.exist;
    expect(exts.every((extension) => !roadKeys.has(`${extension.x}:${extension.y}`))).to.equal(true);

    const validation = plan.meta.validation || [];
    expect(validation.some((v) => String(v).startsWith('terminal-range-storage-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('sink-link-range-storage-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('spawn-neighbor-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('source-link-container-range-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('rampart-standoff-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('missing-logistics-route:'))).to.equal(false);
  });

  it('counts only viable clipped stamp slots and keeps all viable partial placements', function () {
    const exitProximity = new Array(2500).fill(0);
    for (let y = 0; y < 50; y++) {
      exitProximity[y * 50] = 1;
      exitProximity[y * 50 + 1] = 1;
    }
    const ctx = {
      matrices: {
        walkableMatrix: new Array(2500).fill(1),
        staticBlocked: new Array(2500).fill(0),
        exitProximity,
      },
      reserved: new Set(),
      roads: new Set(),
      blocked: new Set(),
      ramparts: new Set(),
      roadBlockedByStructures: new Set(),
      structuresByPos: new Map(),
      placements: [],
    };
    const storage = { x: 25, y: 25 };
    const evaluation = planner._helpers.evaluateHarabiStampSlots(
      ctx,
      { x: 2, y: 24 },
      {
        slots: [
          { x: -2, y: 0 },
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
      },
      {
        storagePos: storage,
        layoutPattern: 'parity',
        preferredParity: 0,
      },
    );

    expect(evaluation.slotCandidates.map((slot) => `${slot.x}:${slot.y}`)).to.deep.equal([
      '0:24',
      '2:24',
      '4:24',
    ]);
    expect(evaluation.viableSlots.map((slot) => `${slot.x}:${slot.y}`)).to.deep.equal([
      '2:24',
      '4:24',
    ]);
    expect([...planner._helpers.collectHarabiStampCapacityKeys(evaluation)]).to.deep.equal([
      '2:24',
      '4:24',
    ]);
    expect(planner._helpers.getHarabiStampPlacementSlots(evaluation)).to.have.length(2);
  });

  it('ignores structure candidates that only touch disconnected road fragments', function () {
    const matrices = {
      walkableMatrix: new Array(2500).fill(1),
      staticBlocked: new Array(2500).fill(0),
      exitProximity: new Array(2500).fill(0),
      terrainMatrix: new Array(2500).fill(0),
      exitDistance: new Array(2500).fill(10),
    };
    const ctx = {
      placements: [
        { type: STRUCTURE_ROAD, x: 25, y: 26, tag: 'road.coreStamp' },
        { type: STRUCTURE_ROAD, x: 26, y: 26, tag: 'road.grid' },
        { type: STRUCTURE_ROAD, x: 47, y: 10, tag: 'road.stamp' },
      ],
      blocked: new Set(),
      roads: new Set(['25:26', '26:26', '47:10']),
      roadBlockedByStructures: new Set(),
      ramparts: new Set(),
      reserved: new Set(),
      structuresByPos: new Map(),
      matrices,
    };
    const ranking = planner._helpers.buildFoundationPreviewRanking(
      ctx,
      [
        { x: 25, y: 27, d: 1 },
        { x: 47, y: 11, d: 1 },
      ],
      { x: 25, y: 25 },
      'parity',
      0,
      {},
    );

    const orderedKeys = ranking.orderedCandidates.map((candidate) => candidate.key);
    expect(orderedKeys).to.include('25:27');
    expect(orderedKeys).to.not.include('47:11');
  });

  it('prunes disconnected kept-road fragments that are outside the main storage road network', function () {
    const matrices = {
      walkableMatrix: new Array(2500).fill(1),
      staticBlocked: new Array(2500).fill(0),
      exitProximity: new Array(2500).fill(0),
      terrainMatrix: new Array(2500).fill(0),
      exitDistance: new Array(2500).fill(10),
    };
    const ctx = {
      placements: [
        { type: STRUCTURE_ROAD, x: 25, y: 25, tag: 'road.coreStamp' },
        { type: STRUCTURE_ROAD, x: 25, y: 26, tag: 'road.grid' },
        { type: STRUCTURE_ROAD, x: 47, y: 10, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 48, y: 10, tag: 'road.stampHalo' },
      ],
      blocked: new Set(),
      roads: new Set(['25:25', '25:26', '47:10', '48:10']),
      roadBlockedByStructures: new Set(),
      ramparts: new Set(),
      reserved: new Set(),
      structuresByPos: new Map(),
      matrices,
    };

    const pruning = planner._helpers.pruneRoadPlacements(ctx, {
      keepTags: ['road.stamp', 'road.stampHalo', 'road.coreStamp'],
      storagePos: { x: 25, y: 25 },
    });

    expect(pruning.removed).to.equal(3);
    expect(ctx.roads.has('25:25')).to.equal(true);
    expect(ctx.roads.has('25:26')).to.equal(false);
    expect(ctx.roads.has('47:10')).to.equal(false);
    expect(ctx.roads.has('48:10')).to.equal(false);
  });

  it('adds exit-approach defense targets for a single reachable border opening', function () {
    const walkableMatrix = new Array(2500).fill(1);
    const terrainMatrix = new Array(2500).fill(0);
    const exitDistance = new Array(2500).fill(10);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (x !== 0 && x !== 49 && y !== 0 && y !== 49) continue;
        const openEast = x === 49 && y >= 24 && y <= 26;
        if (openEast) {
          exitDistance[y * 50 + x] = 0;
          continue;
        }
        walkableMatrix[y * 50 + x] = 0;
        terrainMatrix[y * 50 + x] = 2;
      }
    }
    const ctx = {
      placements: [
        { type: STRUCTURE_STORAGE, x: 25, y: 25, tag: 'core.storage' },
        { type: STRUCTURE_SPAWN, x: 24, y: 25, tag: 'spawn.1' },
      ],
      matrices: {
        walkableMatrix,
        terrainMatrix,
        exitDistance,
      },
    };

    const targets = planner._helpers.buildExitApproachTargets(ctx, { x: 25, y: 25 }, {
      depth: 5,
      reserveRadius: 1,
    });
    const defenseCtx = planner._helpers.buildDefenseCutContext(ctx, { x: 25, y: 25 });

    expect(targets.some((tile) => tile.x >= 46 && tile.y >= 23 && tile.y <= 27)).to.equal(true);
    expect(targets.some((tile) => tile.x === 49 && tile.y === 25)).to.equal(true);
    expect(defenseCtx.structuresByPos.has('48:25')).to.equal(true);
    expect(defenseCtx.structuresByPos.get('48:25')).to.equal('fortify.exitApproach');
    expect(defenseCtx.corePoints).to.deep.equal([
      { x: 25, y: 25 },
      { x: 24, y: 25 },
    ]);
  });

  it('keeps single-exit approach targets centered on the exit opening instead of drifting along an arbitrary path', function () {
    const walkableMatrix = new Array(2500).fill(1);
    const terrainMatrix = new Array(2500).fill(0);
    const exitDistance = new Array(2500).fill(10);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (x !== 0 && x !== 49 && y !== 0 && y !== 49) continue;
        const openEast = x === 49 && y >= 14 && y <= 22;
        if (openEast) {
          exitDistance[y * 50 + x] = 0;
          continue;
        }
        walkableMatrix[y * 50 + x] = 0;
        terrainMatrix[y * 50 + x] = 2;
      }
    }
    const ctx = {
      placements: [{ type: STRUCTURE_STORAGE, x: 15, y: 13, tag: 'core.storage' }],
      matrices: {
        walkableMatrix,
        terrainMatrix,
        exitDistance,
      },
    };

    const targets = planner._helpers.buildExitApproachTargets(ctx, { x: 15, y: 13 }, {
      depth: 6,
      reserveRadius: 1,
    });

    expect(targets.some((tile) => tile.x === 49 && tile.y === 18)).to.equal(true);
    expect(targets.every((tile) => tile.y >= 17 && tile.y <= 19)).to.equal(true);
    expect(targets.every((tile) => tile.x >= 43 && tile.x <= 49)).to.equal(true);
  });

  it('does not keep rampart edge tiles on source logistics structures', function () {
    const ctx = {
      structuresByPos: new Map([['25:25', STRUCTURE_CONTAINER]]),
      matrices: {
        walkableMatrix: new Array(2500).fill(1),
      },
    };

    const line = planner._helpers.canonicalizeRampartBoundaryTiles(
      ctx,
      [
        { x: 24, y: 25 },
        { x: 25, y: 25 },
        { x: 26, y: 25 },
      ],
      { x: 20, y: 20 },
    );

    expect(line.some((tile) => tile.x === 25 && tile.y === 25)).to.equal(false);
  });

  it('prefers source link tiles that do not choke a narrow transit corridor', function () {
    const walkableMatrix = new Array(2500).fill(0);
    const staticBlocked = new Array(2500).fill(0);
    const exitProximity = new Array(2500).fill(0);
    const openTiles = [
      [10, 10], [11, 10], [12, 10], [13, 10], [14, 10],
      [12, 11], [13, 11], [14, 11],
    ];
    for (const [x, y] of openTiles) {
      walkableMatrix[y * 50 + x] = 1;
    }
    const ctx = {
      matrices: {
        walkableMatrix,
        staticBlocked,
        exitProximity,
      },
      blocked: new Set(),
      roadBlockedByStructures: new Set(),
      structuresByPos: new Map(),
    };
    const storage = { x: 6, y: 10 };
    const sourcePos = { x: 12, y: 12 };
    const containerPos = { x: 12, y: 10 };
    const roadAnchor = { x: 11, y: 10 };
    const corridorCandidate = { x: 13, y: 10 };
    const sideCandidate = { x: 13, y: 11 };

    const corridorPenalty = planner._helpers.computeLocalTransitPenalty(
      ctx,
      corridorCandidate.x,
      corridorCandidate.y,
    );
    const sidePenalty = planner._helpers.computeLocalTransitPenalty(
      ctx,
      sideCandidate.x,
      sideCandidate.y,
    );
    const corridorScore = planner._helpers.scoreSourceLinkCandidate(
      ctx,
      storage,
      sourcePos,
      containerPos,
      roadAnchor,
      corridorCandidate,
    );
    const sideScore = planner._helpers.scoreSourceLinkCandidate(
      ctx,
      storage,
      sourcePos,
      containerPos,
      roadAnchor,
      sideCandidate,
    );

    expect(corridorPenalty).to.be.at.least(sidePenalty);
    expect(sideScore).to.be.greaterThan(corridorScore);
  });

  it('skips barrier connection smoothing when estimate defense planning is requested', function () {
    const originalConnectBarrier = minCutAlgorithm.connectBarrier;
    minCutAlgorithm.connectBarrier = function () {
      throw new Error('connectBarrier should not run in estimate defense mode');
    };

    try {
      const plan = planner.generatePlanForAnchor(
        'W1N1',
        { x: 25, y: 25 },
        { harabiStage: 'full', defensePlanningMode: 'estimate' },
      );
      expect(plan).to.exist;
      expect(plan.meta).to.exist;
      expect(plan.meta.rampartPlanning).to.exist;
      expect(plan.meta.rampartPlanning.mode).to.equal('estimate');
    } finally {
      minCutAlgorithm.connectBarrier = originalConnectBarrier;
    }
  });

  it('penalizes candidates that still miss base-road redundancy in the final weighted score', function () {
    const safePlan = {
      placements: [
        { type: STRUCTURE_STORAGE, x: 25, y: 25, tag: 'core.storage' },
        { type: STRUCTURE_EXTENSION, x: 27, y: 25, tag: 'extension.3' },
        { type: STRUCTURE_ROAD, x: 25, y: 25, tag: 'road.coreStamp' },
        { type: STRUCTURE_ROAD, x: 26, y: 25, tag: 'road.grid' },
      ],
      meta: {
        logisticsRoutes: { required: 1, connected: 1, missing: [] },
        baseRoadRedundancy: { attempted: 1, connected: 1, missing: 0 },
      },
      analysis: { exitDistance: new Array(2500).fill(10) },
    };
    const riskyPlan = {
      placements: safePlan.placements.slice(),
      meta: {
        logisticsRoutes: { required: 1, connected: 1, missing: [] },
        baseRoadRedundancy: { attempted: 1, connected: 0, missing: 1 },
      },
      analysis: { exitDistance: new Array(2500).fill(10) },
    };

    const safeMetrics = planner.evaluateLayoutForRoom('W1N1', safePlan, {
      sources: Game.rooms.W1N1.find(FIND_SOURCES),
      controllerPos: Game.rooms.W1N1.controller.pos,
    });
    const riskyMetrics = planner.evaluateLayoutForRoom('W1N1', riskyPlan, {
      sources: Game.rooms.W1N1.find(FIND_SOURCES),
      controllerPos: Game.rooms.W1N1.controller.pos,
    });
    const safeScore = planner.computeWeightedScore(safeMetrics).score;
    const riskyScore = planner.computeWeightedScore(riskyMetrics).score;

    expect(safeMetrics.baseRoadRedundancyCoverage).to.equal(1);
    expect(riskyMetrics.baseRoadRedundancyCoverage).to.equal(0);
    expect(riskyScore).to.be.lessThan(safeScore);
  });

  it('reconnects a disconnected main-road wing with a protected link path', function () {
    const matrices = {
      walkableMatrix: new Array(2500).fill(1),
      staticBlocked: new Array(2500).fill(0),
      exitProximity: new Array(2500).fill(0),
      terrainMatrix: new Array(2500).fill(0),
      exitDistance: new Array(2500).fill(10),
    };
    const ctx = {
      roomName: 'W1N1',
      placements: [
        { type: STRUCTURE_ROAD, x: 25, y: 25, tag: 'road.coreStamp' },
        { type: STRUCTURE_ROAD, x: 26, y: 25, tag: 'road.grid' },
        { type: STRUCTURE_ROAD, x: 29, y: 25, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 30, y: 25, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 31, y: 25, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 32, y: 25, tag: 'road.stamp' },
      ],
      roads: new Set(['25:25', '26:25', '29:25', '30:25', '31:25', '32:25']),
      blocked: new Set(),
      reserved: new Set(),
      ramparts: new Set(),
      structuresByPos: new Map(),
      roadBlockedByStructures: new Set(),
      matrices,
    };
    const preferredRoads = new Set(ctx.roads);
    const protectedPaths = [];

    const result = planner._helpers.connectDisconnectedBaseRoadComponents(
      ctx,
      { x: 25, y: 25 },
      preferredRoads,
      {
        roadKeys: new Set(ctx.roads),
        layoutPattern: 'parity',
        preferredParity: 0,
        candidates: [],
        addProtectedPath(path) {
          protectedPaths.push(path.map((step) => `${step.x}:${step.y}`));
          for (const step of path) preferredRoads.add(`${step.x}:${step.y}`);
        },
      },
    );

    expect(result.connected).to.equal(1);
    expect(result.missing).to.equal(0);
    expect(protectedPaths).to.have.length(1);
    expect(protectedPaths[0]).to.include('27:25');
    expect(protectedPaths[0].some((step) => step === '28:25' || step === '28:24' || step === '28:26')).to.equal(true);
  });

  it('can relocate a single extension blocker to reconnect a disconnected main-road wing', function () {
    const walkableMatrix = new Array(2500).fill(0);
    for (const [x, y] of [
      [25, 25],
      [26, 25],
      [27, 25],
      [28, 25],
      [29, 25],
      [30, 25],
      [31, 25],
      [26, 26],
    ]) {
      walkableMatrix[y * 50 + x] = 1;
    }
    const matrices = {
      walkableMatrix,
      staticBlocked: new Array(2500).fill(0),
      exitProximity: new Array(2500).fill(0),
      terrainMatrix: new Array(2500).fill(0),
      exitDistance: new Array(2500).fill(10),
    };
    const ctx = {
      roomName: 'W1N1',
      placements: [
        { type: STRUCTURE_ROAD, x: 25, y: 25, tag: 'road.coreStamp' },
        { type: STRUCTURE_ROAD, x: 26, y: 25, tag: 'road.grid' },
        { type: STRUCTURE_ROAD, x: 28, y: 25, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 29, y: 25, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 30, y: 25, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 31, y: 25, tag: 'road.stamp' },
        { type: STRUCTURE_EXTENSION, x: 27, y: 25, rcl: 3, tag: 'extension.3' },
      ],
      roads: new Set(['25:25', '26:25', '28:25', '29:25', '30:25', '31:25']),
      blocked: new Set(['27:25']),
      reserved: new Set(['27:25']),
      ramparts: new Set(),
      structuresByPos: new Map([['27:25', STRUCTURE_EXTENSION]]),
      roadBlockedByStructures: new Set(['27:25']),
      matrices,
    };
    const preferredRoads = new Set(ctx.roads);
    const protectedPaths = [];
    const originalPathFinderSearch = PathFinder.search;
    let pathFinderCalls = 0;
    PathFinder.search = function () {
      pathFinderCalls += 1;
      if (pathFinderCalls === 1) {
        return {
          path: [
            { x: 26, y: 25 },
          ],
          incomplete: false,
        };
      }
      return {
        path: [
          { x: 27, y: 25 },
          { x: 28, y: 25 },
        ],
        incomplete: false,
      };
    };

    try {
      const result = planner._helpers.connectDisconnectedBaseRoadComponents(
        ctx,
        { x: 25, y: 25 },
        preferredRoads,
        {
          roadKeys: new Set(ctx.roads),
          layoutPattern: 'parity',
          preferredParity: 0,
          candidates: [{ x: 26, y: 26 }],
          addProtectedPath(path) {
            protectedPaths.push(path.map((step) => `${step.x}:${step.y}`));
            for (const step of path) preferredRoads.add(`${step.x}:${step.y}`);
          },
        },
      );

      expect(result.connected).to.equal(1);
      expect(result.relocated).to.equal(1);
      expect(result.missing).to.equal(0);
      expect(ctx.structuresByPos.has('27:25')).to.equal(false);
      expect(ctx.structuresByPos.get('26:26')).to.equal(STRUCTURE_EXTENSION);
      expect(protectedPaths[0]).to.include('27:25');
    } finally {
      PathFinder.search = originalPathFinderSearch;
    }
  });

  it('stores candidate ranking with weighted end evaluation', function () {
    const plan = planner.generatePlan('W1N1', { topN: 3 });
    expect(plan).to.exist;
    expect(plan.selection).to.exist;
    expect(plan.selection.candidates).to.be.an('array').that.is.not.empty;
    expect(plan.selection.selectedCandidateIndex).to.be.a('number');
    const selected = plan.selection.candidates.find(
      (candidate) => candidate.index === plan.selection.selectedCandidateIndex,
    );
    expect(selected).to.exist;
    expect(selected.weightedScore).to.be.a('number');
    expect(selected.weightedContributions).to.be.an('object');
    expect(selected.weightedContributions).to.have.property('logisticsCoverage');
    expect(selected.weightedContributions).to.have.property('infraCost');
  });

  it('exposes phase-4 compatible layout APIs', function () {
    const complete = planner.generateCompleteLayout('W1N1', { x: 24, y: 24 });
    expect(complete).to.exist;
    expect(complete.evaluation).to.exist;
    expect(complete.evaluation.weightedScore).to.be.a('number');

    const optimal = planner.generateOptimalLayout('W1N1', { topN: 3 });
    expect(optimal).to.exist;
    const metrics = planner.evaluateLayoutForRoom('W1N1', optimal, {
      sources: Game.rooms.W1N1.find(FIND_SOURCES),
      controllerPos: Game.rooms.W1N1.controller.pos,
    });
    expect(metrics).to.exist;
    expect(metrics).to.have.property('avgExtDist');
    expect(metrics).to.have.property('infrastructureCost');
  });



  it('emits buildQueue entries ordered by rcl and priority', function () {
    const plan = planner.generatePlan('W1N1', { topN: 3 });
    expect(plan).to.exist;
    expect(plan.buildQueue).to.be.an('array').that.is.not.empty;

    const queue = plan.buildQueue;
    for (let i = 1; i < queue.length; i++) {
      const prev = queue[i - 1];
      const cur = queue[i];
      const prevKey = `${prev.rcl}:${prev.priority}`;
      const curKey = `${cur.rcl}:${cur.priority}`;
      expect(prevKey <= curKey).to.equal(true);
    }

    const spawnEntry = queue.find((q) => q.type === STRUCTURE_SPAWN);
    expect(spawnEntry).to.exist;
    expect(spawnEntry.rcl).to.equal(1);
    expect(spawnEntry.priority).to.equal(1);

    const nextAtRcl2 = planner.getNextBuild({ controller: { level: 2 } }, queue);
    expect(nextAtRcl2).to.exist;
    expect(nextAtRcl2.rcl).to.be.at.most(2);
  });

  it('prunes remote roads unless adjacent to structures or protected logistics', function () {
    const plan = planner.generatePlan('W1N1', { topN: 3 });
    const placements = plan.placements || [];
    const roadTiles = placements.filter((p) => p.type === STRUCTURE_ROAD);
    const protectedRoads = new Set((plan.meta.roadPruning && plan.meta.roadPruning.protectedKeys) || []);
    const structures = new Set(
      placements
        .filter((p) => p.type !== STRUCTURE_ROAD && p.type !== STRUCTURE_RAMPART)
        .map((p) => `${p.x}:${p.y}`),
    );
    const roadTagsByPos = new Map();
    for (const road of roadTiles) {
      const k = `${road.x}:${road.y}`;
      const tags = roadTagsByPos.get(k) || new Set();
      tags.add(road.tag || '');
      roadTagsByPos.set(k, tags);
    }

    for (const road of roadTiles) {
      if (road.tag !== 'road.grid') continue;
      const posKey = `${road.x}:${road.y}`;
      const tags = roadTagsByPos.get(posKey) || new Set();
      // Preserve shared logistics and perimeter routes that overlap checkerboard slots.
      if (tags.has('road.flow') || tags.has('road.rampart') || protectedRoads.has(posKey)) continue;
      let adjacent = false;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const x = road.x + dx;
          const y = road.y + dy;
          if (structures.has(`${x}:${y}`)) adjacent = true;
        }
      }
      expect(adjacent).to.equal(true);
    }
    expect(plan.meta.roadPruning).to.exist;
  });

  it('plans a four-tile rampart standoff with an inner support band', function () {
    const plan = planner.generatePlan('W1N1', { topN: 3 });
    const placements = plan.placements || [];
    const supportRamparts = placements.filter((p) => p.type === STRUCTURE_RAMPART && p.tag === 'rampart.support');
    const roadKeys = new Set(
      placements
        .filter((p) => p.type === STRUCTURE_ROAD)
        .map((p) => `${p.x}:${p.y}`),
    );

    expect(Number(plan.meta.rampartStandoff || 0)).to.be.at.least(4);
    expect(supportRamparts.length).to.be.greaterThan(0);
    expect(supportRamparts.every((placement) => roadKeys.has(`${placement.x}:${placement.y}`))).to.equal(true);
    expect(Number(plan.meta.rampartPlanning.supportCount || 0)).to.equal(supportRamparts.length);
    expect((plan.meta.validation || []).some((entry) => String(entry).startsWith('rampart-standoff-fail'))).to.equal(false);
  });

  it('connects rampart perimeter roads back to the main base network before pruning', function () {
    const matrices = {
      walkableMatrix: new Array(2500).fill(1),
      staticBlocked: new Array(2500).fill(0),
      exitProximity: new Array(2500).fill(0),
      terrainMatrix: new Array(2500).fill(0),
      exitDistance: new Array(2500).fill(10),
    };
    const ctx = {
      placements: [
        { type: STRUCTURE_ROAD, x: 25, y: 25, rcl: 1, tag: 'road.coreStamp' },
        { type: STRUCTURE_ROAD, x: 25, y: 26, rcl: 1, tag: 'road.full' },
      ],
      blocked: new Set(),
      roads: new Set(['25:25', '25:26']),
      ramparts: new Set(),
      roadBlockedByStructures: new Set(),
      reserved: new Set(),
      structuresByPos: new Map(),
      matrices,
      meta: {},
    };
    const ring = [
      { x: 18, y: 18 }, { x: 19, y: 18 }, { x: 20, y: 18 }, { x: 21, y: 18 }, { x: 22, y: 18 },
      { x: 23, y: 18 }, { x: 24, y: 18 }, { x: 25, y: 18 }, { x: 26, y: 18 }, { x: 27, y: 18 },
      { x: 28, y: 18 }, { x: 29, y: 18 }, { x: 30, y: 18 }, { x: 31, y: 18 }, { x: 32, y: 18 },
      { x: 32, y: 19 }, { x: 32, y: 20 }, { x: 32, y: 21 }, { x: 32, y: 22 }, { x: 32, y: 23 },
      { x: 32, y: 24 }, { x: 32, y: 25 }, { x: 32, y: 26 }, { x: 32, y: 27 }, { x: 32, y: 28 },
      { x: 32, y: 29 }, { x: 32, y: 30 }, { x: 32, y: 31 }, { x: 32, y: 32 }, { x: 31, y: 32 },
      { x: 30, y: 32 }, { x: 29, y: 32 }, { x: 28, y: 32 }, { x: 27, y: 32 }, { x: 26, y: 32 },
      { x: 25, y: 32 }, { x: 24, y: 32 }, { x: 23, y: 32 }, { x: 22, y: 32 }, { x: 21, y: 32 },
      { x: 20, y: 32 }, { x: 19, y: 32 }, { x: 18, y: 32 }, { x: 18, y: 31 }, { x: 18, y: 30 },
      { x: 18, y: 29 }, { x: 18, y: 28 }, { x: 18, y: 27 }, { x: 18, y: 26 }, { x: 18, y: 25 },
      { x: 18, y: 24 }, { x: 18, y: 23 }, { x: 18, y: 22 }, { x: 18, y: 21 }, { x: 18, y: 20 },
      { x: 18, y: 19 },
    ];

    const result = planner._helpers.finalizeFullRampartPlacements(ctx, ring, { x: 25, y: 25 });

    expect(result.accessRoadsAdded).to.be.greaterThan(0);
    expect(result.removedRogueEdgeRamparts).to.equal(0);
    expect(result.boundaryPlacedCount).to.equal(ring.length);
    expect(ctx.placements.some((placement) => placement.tag === 'road.rampartAccess')).to.equal(true);
  });

  it('prunes stray single inner ramparts that do not connect to the shell', function () {
    const matrices = {
      walkableMatrix: new Array(2500).fill(1),
      staticBlocked: new Array(2500).fill(0),
      exitProximity: new Array(2500).fill(0),
      terrainMatrix: new Array(2500).fill(0),
      exitDistance: new Array(2500).fill(10),
    };
    const ctx = {
      placements: [
        { type: STRUCTURE_RAMPART, x: 25, y: 25, tag: 'rampart.support' },
        { type: STRUCTURE_RAMPART, x: 20, y: 20, tag: 'rampart.edge' },
        { type: STRUCTURE_RAMPART, x: 20, y: 21, tag: 'rampart.edge' },
      ],
      ramparts: new Set(['25:25', '20:20', '20:21']),
      matrices,
    };

    const pruned = planner._helpers.pruneStrayInnerRamparts(ctx);

    expect(pruned.removedSupports).to.equal(1);
    expect(ctx.ramparts.has('25:25')).to.equal(false);
    expect(ctx.placements.some((placement) => placement.x === 25 && placement.y === 25)).to.equal(false);
  });

  it('adds an inner support rampart directly on boundary road spines when needed', function () {
    const matrices = {
      walkableMatrix: new Array(2500).fill(1),
      staticBlocked: new Array(2500).fill(0),
      exitProximity: new Array(2500).fill(0),
      terrainMatrix: new Array(2500).fill(0),
      exitDistance: new Array(2500).fill(10),
    };
    const ctx = {
      placements: [
        { type: STRUCTURE_ROAD, x: 30, y: 20, rcl: 2, tag: 'road.rampart' },
        { type: STRUCTURE_ROAD, x: 29, y: 20, rcl: 2, tag: 'road.rampartAccess' },
        { type: STRUCTURE_ROAD, x: 28, y: 20, rcl: 2, tag: 'road.rampartAccess' },
      ],
      roads: new Set(['30:20', '29:20', '28:20']),
      ramparts: new Set(['30:20']),
      blocked: new Set(),
      reserved: new Set(),
      structuresByPos: new Map(),
      roadBlockedByStructures: new Set(),
      matrices,
    };

    const added = planner._helpers.ensureBoundaryRoadSupports(ctx, [{ x: 30, y: 20 }], { x: 20, y: 20 });

    expect(added).to.deep.equal([{ x: 29, y: 20 }]);
    expect(ctx.placements.some((placement) =>
      placement.type === STRUCTURE_RAMPART &&
      placement.tag === 'rampart.support' &&
      placement.x === 29 &&
      placement.y === 20,
    )).to.equal(true);
  });

  it('prunes redundant outer boundary blips without weakening the shell score', function () {
    const matrices = {
      walkableMatrix: new Array(2500).fill(1),
      staticBlocked: new Array(2500).fill(0),
      exitProximity: new Array(2500).fill(0),
      terrainMatrix: new Array(2500).fill(0),
      exitDistance: new Array(2500).fill(10),
    };
    const ctx = {
      placements: [
        { type: STRUCTURE_STORAGE, x: 20, y: 20, rcl: 4, tag: 'storage.main' },
      ],
      roads: new Set(),
      ramparts: new Set(),
      blocked: new Set(['20:20']),
      reserved: new Set(['20:20']),
      structuresByPos: new Map([['20:20', STRUCTURE_STORAGE]]),
      roadBlockedByStructures: new Set(['20:20']),
      matrices,
    };
    const line = [
      { x: 18, y: 18 },
      { x: 19, y: 18 },
      { x: 20, y: 18 },
      { x: 21, y: 18 },
      { x: 22, y: 18 },
      { x: 22, y: 19 },
      { x: 22, y: 20 },
      { x: 22, y: 21 },
      { x: 22, y: 22 },
      { x: 21, y: 22 },
      { x: 20, y: 22 },
      { x: 19, y: 22 },
      { x: 18, y: 22 },
      { x: 18, y: 21 },
      { x: 18, y: 20 },
      { x: 18, y: 19 },
      { x: 23, y: 18 },
    ];

    const pruned = planner._helpers.pruneRedundantBoundaryBlips(ctx, line, { x: 20, y: 20 });

    expect(pruned.some((tile) => tile.x === 23 && tile.y === 18)).to.equal(false);
    expect(pruned.some((tile) => tile.x === 18 && tile.y === 18)).to.equal(true);
    expect(pruned.some((tile) => tile.x === 22 && tile.y === 22)).to.equal(true);
  });

  it('supports cluster3 foundation road pattern mode', function () {
    const plan = planner.generatePlan('W1N1', {
      topN: 3,
      extensionPattern: 'cluster3',
      harabiStage: 'foundation',
    });
    expect(plan).to.exist;
    expect(plan.meta.layoutPattern).to.equal('cluster3');

    const placements = plan.placements || [];
    const roadKeys = new Set(
      placements
        .filter((p) => p.type === STRUCTURE_ROAD)
        .map((p) => `${p.x}:${p.y}`),
    );
    const invalidOverlap = placements.filter(
      (p) =>
        p.type !== STRUCTURE_ROAD &&
        p.type !== STRUCTURE_RAMPART &&
        roadKeys.has(`${p.x}:${p.y}`),
    );
    expect(invalidOverlap).to.deep.equal([]);
    const storage = placements.find((p) => p.type === STRUCTURE_STORAGE);
    expect(storage).to.exist;

    const checkerboard = require('../algorithm.checkerboard');
    const preferredParity = checkerboard.parityAt(storage.x, storage.y);

    const stampRoads = placements.filter(
      (p) =>
        p.type === STRUCTURE_ROAD &&
        (p.tag === 'road.stamp' || p.tag === 'road.coreStamp'),
    );
    expect(stampRoads.length).to.be.greaterThan(0);

    const spawn1 = placements.find((p) => p.type === STRUCTURE_SPAWN && p.tag === 'spawn.1');
    const spawn2 = placements.find((p) => p.type === STRUCTURE_SPAWN && p.tag === 'spawn.2');
    const spawn3 = placements.find((p) => p.type === STRUCTURE_SPAWN && p.tag === 'spawn.3');
    const terminal = placements.find((p) => p.type === STRUCTURE_TERMINAL && p.tag === 'core.terminal');
    const storageCore = placements.find((p) => p.type === STRUCTURE_STORAGE && p.tag === 'core.storage');
    const linkCore = placements.find((p) => p.type === STRUCTURE_LINK && p.tag === 'link.sink');
    const powerSpawnType =
      typeof STRUCTURE_POWER_SPAWN !== 'undefined' ? STRUCTURE_POWER_SPAWN : 'powerSpawn';
    const powerSpawn = placements.find((p) => p.type === powerSpawnType && p.tag === 'core.powerSpawn');

    expect(spawn1).to.exist;
    expect(spawn2).to.exist;
    expect(spawn3).to.exist;
    expect(terminal).to.exist;
    expect(storageCore).to.exist;
    expect(linkCore).to.exist;
    expect(powerSpawn).to.exist;

    const anchor = plan.anchor;
    expect(anchor).to.exist;
    expect(spawn1.x).to.equal(anchor.x);
    expect(spawn1.y).to.equal(anchor.y);
    expect(spawn2.x).to.equal(anchor.x - 1);
    expect(spawn2.y).to.equal(anchor.y);
    expect(spawn3.x).to.equal(anchor.x + 1);
    expect(spawn3.y).to.equal(anchor.y);
    expect(terminal.x).to.equal(anchor.x - 1);
    expect(terminal.y).to.equal(anchor.y + 1);
    expect(storageCore.x).to.equal(anchor.x - 1);
    expect(storageCore.y).to.equal(anchor.y + 2);
    expect(linkCore.x).to.equal(anchor.x + 1);
    expect(linkCore.y).to.equal(anchor.y + 1);
    expect(powerSpawn.x).to.equal(anchor.x + 1);
    expect(powerSpawn.y).to.equal(anchor.y + 2);

    expect(plan.meta).to.have.property('stampStats');
    expect(plan.meta.stampStats.bigPlaced).to.be.greaterThan(0);
    expect(plan.meta.stampStats.smallPlaced).to.be.at.most(plan.meta.stampStats.bigPlaced);
    expect(plan.meta.stampStats.requiredSlots).to.be.at.least(0);
    expect(plan.meta.stampStats.capacitySlots).to.be.at.least(plan.meta.stampStats.requiredSlots);
    const fallbackReasonCount = Object.values(plan.meta.stampStats.smallFallbackReasons || {}).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    );
    expect(fallbackReasonCount).to.equal(plan.meta.stampStats.smallPlaced);
    expect(plan.meta).to.have.property('validStructurePositions');
    expect(plan.meta.validStructurePositions).to.have.property('canPlace');
    expect(plan.meta.validStructurePositions.canPlace).to.be.a('number');
    expect(plan.meta.validStructurePositions).to.have.property('roadClear');
    expect(plan.meta.validStructurePositions.roadClear).to.be.at.most(plan.meta.validStructurePositions.structureClear);
    const validKeys = new Set(
      (plan.meta.validStructurePositions.positions || []).map((p) => `${p.x}:${p.y}`),
    );
    const roadKeysForValid = new Set(
      placements.filter((p) => p.type === STRUCTURE_ROAD).map((p) => `${p.x}:${p.y}`),
    );
    const overlapValidRoad = [...validKeys].some((k) => roadKeysForValid.has(k));
    expect(overlapValidRoad).to.equal(false);
    const hasRoadPatternValid = (plan.meta.validStructurePositions.positions || []).some((p) =>
      checkerboard.classifyTileByPattern(p.x, p.y, storage, {
        pattern: 'cluster3',
        preferredParity,
      }) === 'road',
    );
    expect(hasRoadPatternValid).to.equal(true);
    const nonRoadBigCenters = (plan.meta.stampStats.bigCenters || []).filter(
      (c) => !roadKeysForValid.has(`${c.x}:${c.y}`),
    );
    if (nonRoadBigCenters.length > 0) {
      const previewOccupied = new Set();
      const structurePreview = plan.meta && plan.meta.structurePlanning && Array.isArray(plan.meta.structurePlanning.placements)
        ? plan.meta.structurePlanning.placements
        : [];
      for (const pos of structurePreview) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
        previewOccupied.add(`${pos.x}:${pos.y}`);
      }
      const labPreview = plan.meta && plan.meta.labPlanning ? plan.meta.labPlanning : {};
      for (const pos of Array.isArray(labPreview.sourceLabs) ? labPreview.sourceLabs : []) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
        previewOccupied.add(`${pos.x}:${pos.y}`);
      }
      for (const pos of Array.isArray(labPreview.reactionLabs) ? labPreview.reactionLabs : []) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
        previewOccupied.add(`${pos.x}:${pos.y}`);
      }
      const hasCenterRepresented = nonRoadBigCenters.some((c) =>
        validKeys.has(`${c.x}:${c.y}`) || previewOccupied.has(`${c.x}:${c.y}`),
      );
      expect(hasCenterRepresented).to.equal(true);
    }

    expect(plan.meta).to.have.property('sourceLogistics');
    expect(plan.meta.sourceLogistics.sa).to.exist;
    expect(plan.meta.sourceLogistics.sb).to.exist;
    expect(plan.meta.sourceLogistics.sa.roadAnchored).to.equal(true);
    expect(plan.meta.sourceLogistics.sb.roadAnchored).to.equal(true);
    expect(plan.meta.sourceLogistics.sa.linkPlaced).to.be.a('boolean');
    expect(plan.meta.sourceLogistics.sb.linkPlaced).to.be.a('boolean');

    const coreRoadKeys = new Set(
      placements
        .filter((p) => p.type === STRUCTURE_ROAD && p.tag === 'road.coreStamp')
        .map((p) => `${p.x}:${p.y}`),
    );
    const overlapNonRoad = placements.some(
      (p) => p.type !== STRUCTURE_ROAD && coreRoadKeys.has(`${p.x}:${p.y}`),
    );
    expect(overlapNonRoad).to.equal(false);
  });

  it('plans source containers, source links, and source routes in cluster3 foundation stage', function () {
    const plan = planner.generatePlan('W1N1', {
      topN: 3,
      extensionPattern: 'cluster3',
      harabiStage: 'foundation',
    });
    expect(plan).to.exist;
    expect(plan.meta.layoutPattern).to.equal('cluster3');
    expect(plan.meta.harabiStage).to.equal('foundation');

    const placements = plan.placements || [];
    const sourceContainers = placements.filter((p) =>
      p.type === STRUCTURE_CONTAINER && String(p.tag || '').startsWith('source.container.'),
    );
    const sourceLinks = placements.filter((p) =>
      p.type === STRUCTURE_LINK && String(p.tag || '').startsWith('source.link.'),
    );
    const mineralContainers = placements.filter((p) => p.tag === 'mineral.container');
    const mineralExtractors = placements.filter((p) => p.tag === 'mineral.extractor');
    expect(sourceContainers.length).to.equal(2);
    expect(sourceLinks.length).to.be.at.least(1);
    expect(mineralContainers.length).to.equal(1);
    expect(mineralExtractors.length).to.equal(1);

    const logistics = plan.meta.sourceLogistics || {};
    expect(logistics.sa).to.exist;
    expect(logistics.sb).to.exist;
    expect(logistics.sa.roadAnchored).to.equal(true);
    expect(logistics.sb.roadAnchored).to.equal(true);
    expect(plan.meta.sourceResourceDebug).to.exist;
    expect(Number(plan.meta.sourceResourceDebug.sourceContainersPlaced || 0)).to.equal(2);
    expect(Number(plan.meta.sourceResourceDebug.sourceRouteTargets || 0)).to.equal(2);
    expect(Number(plan.meta.sourceResourceDebug.mineralFound || 0)).to.equal(1);
    expect(Number(plan.meta.sourceResourceDebug.mineralContainerPlaced || 0)).to.equal(1);
    expect(Number(plan.meta.sourceResourceDebug.mineralRouteTarget || 0)).to.equal(1);

    const queue = Array.isArray(plan.buildQueue) ? plan.buildQueue : [];
    const sinkIdx = queue.findIndex((entry) => entry && entry.tag === 'link.sink');
    const sourceLinkRows = queue
      .map((entry, idx) => ({ entry, idx }))
      .filter((row) => row.entry && String(row.entry.tag || '').startsWith('source.link.'));
    const controllerIdx = queue.findIndex((entry) => entry && entry.tag === 'controller.link');
    expect(sinkIdx).to.be.at.least(0);
    expect(sourceLinkRows.length).to.equal(2);
    expect(sourceLinkRows[0].idx).to.be.greaterThan(sinkIdx);
    expect(sourceLinkRows[1].idx).to.be.greaterThan(sourceLinkRows[0].idx);
    if (controllerIdx >= 0) {
      expect(controllerIdx).to.be.greaterThan(sourceLinkRows[1].idx);
    }
  });

  it('treats only the storage-connected road component as the main source-route network', function () {
    const ctx = {
      roads: new Set([
        '25:26',
        '26:26',
        '27:26',
        '47:10',
        '48:10',
      ]),
      placements: [
        { type: STRUCTURE_ROAD, x: 25, y: 26, tag: 'road.coreStamp' },
        { type: STRUCTURE_ROAD, x: 26, y: 26, tag: 'road.grid' },
        { type: STRUCTURE_ROAD, x: 27, y: 26, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 47, y: 10, tag: 'road.stamp' },
        { type: STRUCTURE_ROAD, x: 48, y: 10, tag: 'road.stamp' },
      ],
    };
    const storage = { x: 25, y: 25 };

    const connectedMainRoads = planner._helpers.buildMainRoadComponentKeys(ctx, storage);
    expect(connectedMainRoads.has('25:26')).to.equal(true);
    expect(connectedMainRoads.has('27:26')).to.equal(true);
    expect(connectedMainRoads.has('47:10')).to.equal(false);
    expect(connectedMainRoads.has('48:10')).to.equal(false);

    const origin = planner._helpers.pickRoadOriginFromNetwork(
      connectedMainRoads,
      { x: 49, y: 10 },
      storage,
      { corePenaltyRange: 2, corePenalty: 6 },
    );
    expect(origin).to.deep.equal({ x: 27, y: 26 });
  });

  it('computes a central 10-lab preview cluster with valid source-lab range constraints on foundation', function () {
    const plan = planner.generatePlan('W1N1', {
      topN: 3,
      extensionPattern: 'cluster3',
      harabiStage: 'foundation',
    });
    expect(plan).to.exist;
    const placements = plan.placements || [];
    const labs = placements.filter((p) => p.type === STRUCTURE_LAB);
    expect(labs.length).to.equal(0);

    const preview = plan.meta && plan.meta.labPlanning ? plan.meta.labPlanning : {};
    const sourceLabs = Array.isArray(preview.sourceLabs) ? preview.sourceLabs : [];
    const reactions = Array.isArray(preview.reactionLabs) ? preview.reactionLabs : [];
    expect(preview.computed).to.equal(true);
    expect(preview.clusterFound).to.equal(true);
    expect(preview.totalLabs).to.equal(10);
    expect(sourceLabs.length).to.equal(2);
    expect(reactions.length).to.equal(8);
    const source1 = sourceLabs[0];
    const source2 = sourceLabs[1];
    const previewLabs = [...sourceLabs, ...reactions];
    const roadKeys = new Set(
      placements
        .filter((p) => p.type === STRUCTURE_ROAD)
        .map((p) => `${p.x}:${p.y}`),
    );
    for (const lab of previewLabs) {
      expect(roadKeys.has(`${lab.x}:${lab.y}`)).to.equal(false);
    }

    const stampCenters = ((plan.meta && plan.meta.stampStats && plan.meta.stampStats.bigCenters) || []).map(
      (p) => `${p.x}:${p.y}`,
    );
    const centerSet = new Set(stampCenters);
    const centerHits = previewLabs.reduce(
      (sum, lab) => sum + (centerSet.has(`${lab.x}:${lab.y}`) ? 1 : 0),
      0,
    );
    expect(centerHits).to.be.at.least(1);

    for (const reaction of reactions) {
      const d1 = Math.max(Math.abs(reaction.x - source1.x), Math.abs(reaction.y - source1.y));
      const d2 = Math.max(Math.abs(reaction.x - source2.x), Math.abs(reaction.y - source2.y));
      expect(d1).to.be.at.most(2);
      expect(d2).to.be.at.most(2);
    }
  });

  it('computes foundation preview placements for extensions and late-game core structures without road overlap', function () {
    const plan = planner.generatePlan('W1N1', {
      topN: 3,
      extensionPattern: 'cluster3',
      harabiStage: 'foundation',
    });
    const preview = plan.meta && plan.meta.structurePlanning ? plan.meta.structurePlanning : {};
    expect(preview.computed).to.equal(true);
    const placements = Array.isArray(preview.placements) ? preview.placements : [];
    const counts = preview.counts || {};
    const ranking = preview.ranking && typeof preview.ranking === 'object' ? preview.ranking : {};
    const extensionOrder = Array.isArray(ranking.extensionOrder) ? ranking.extensionOrder : [];
    const factoryType = typeof STRUCTURE_FACTORY !== 'undefined' ? STRUCTURE_FACTORY : 'factory';
    const observerType = typeof STRUCTURE_OBSERVER !== 'undefined' ? STRUCTURE_OBSERVER : 'observer';
    const nukerType = typeof STRUCTURE_NUKER !== 'undefined' ? STRUCTURE_NUKER : 'nuker';
    expect(Number(counts[STRUCTURE_EXTENSION] || 0)).to.be.at.most(60);
    expect(Number(counts[factoryType] || 0)).to.be.at.most(1);
    expect(Number(counts[observerType] || 0)).to.be.at.most(1);
    expect(Number(counts[nukerType] || 0)).to.be.at.most(1);
    expect(Number(ranking.extensionOrderTotal || 0)).to.be.at.least(extensionOrder.length);
    if (extensionOrder.length > 0) {
      expect(extensionOrder[0]).to.have.property('rank', 1);
    }

    const roadKeys = new Set(
      (plan.placements || [])
        .filter((p) => p.type === STRUCTURE_ROAD)
        .map((p) => `${p.x}:${p.y}`),
    );
    const roadTagsByPos = new Map();
    for (const road of (plan.placements || [])) {
      if (!road || road.type !== STRUCTURE_ROAD) continue;
      const k = `${road.x}:${road.y}`;
      const tags = roadTagsByPos.get(k) || new Set();
      tags.add(String(road.tag || ''));
      roadTagsByPos.set(k, tags);
    }
    const allowedFoundationRoadTags = new Set([
      'road.stamp',
      'road.coreStamp',
      'road.controllerStamp',
      'road.grid',
    ]);
    const hasAdjacentAllowedFoundationRoad = (x, y) => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const tags = roadTagsByPos.get(`${x + dx}:${y + dy}`);
          if (!tags) continue;
          for (const tag of tags) {
            if (allowedFoundationRoadTags.has(tag)) return true;
          }
        }
      }
      return false;
    };
    for (const pos of placements) {
      expect(roadKeys.has(`${pos.x}:${pos.y}`)).to.equal(false);
      expect(hasAdjacentAllowedFoundationRoad(pos.x, pos.y)).to.equal(true);
    }

    const pruning = plan.meta && plan.meta.stampPruning ? plan.meta.stampPruning : {};
    expect(pruning.enabled).to.equal(true);
    expect(Number(pruning.removedRoadTiles || 0)).to.be.at.least(0);

    const occupied = new Set();
    for (const pos of (plan.placements || [])) {
      if (!pos || pos.type === STRUCTURE_ROAD || pos.type === STRUCTURE_RAMPART) continue;
      occupied.add(`${pos.x}:${pos.y}`);
    }
    for (const pos of placements) occupied.add(`${pos.x}:${pos.y}`);
    const labPreview = plan.meta && plan.meta.labPlanning ? plan.meta.labPlanning : {};
    for (const lab of Array.isArray(labPreview.sourceLabs) ? labPreview.sourceLabs : []) {
      occupied.add(`${lab.x}:${lab.y}`);
    }
    for (const lab of Array.isArray(labPreview.reactionLabs) ? labPreview.reactionLabs : []) {
      occupied.add(`${lab.x}:${lab.y}`);
    }
    const bigCenters = plan.meta && plan.meta.stampStats && Array.isArray(plan.meta.stampStats.bigCenters)
      ? plan.meta.stampStats.bigCenters
      : [];
    for (const center of bigCenters) {
      const cross = [
        `${center.x}:${center.y}`,
        `${center.x}:${center.y - 1}`,
        `${center.x - 1}:${center.y}`,
        `${center.x + 1}:${center.y}`,
        `${center.x}:${center.y + 1}`,
      ];
      expect(cross.some((k) => occupied.has(k))).to.equal(true);
    }
  });

});
