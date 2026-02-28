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

describe('build compendium planner', function () {
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
    expect(sinkRange).to.be.at.most(1);
  });

  it('keeps non-road placements out of exit-range tiles', function () {
    const plan = planner.generatePlan('W1N1');
    for (const p of plan.placements || []) {
      if (p.type === STRUCTURE_ROAD) continue;
      expect(p.x).to.be.within(2, 47);
      expect(p.y).to.be.within(2, 47);
    }
  });

  it('keeps extensions on checkerboard parity and validates core constraints', function () {
    const plan = planner.generatePlan('W1N1');
    const placements = plan.placements || [];
    const storage = placements.find((p) => p.type === STRUCTURE_STORAGE);
    const parity = (storage.x + storage.y) % 2;
    const exts = placements.filter((p) => p.type === STRUCTURE_EXTENSION);
    expect(exts.length).to.be.at.least(10);
    expect(exts.every((e) => ((e.x + e.y) % 2) === parity)).to.equal(true);

    const validation = plan.meta.validation || [];
    expect(validation.some((v) => String(v).startsWith('terminal-range-storage-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('sink-link-range-storage-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('spawn-neighbor-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('source-link-container-range-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('rampart-standoff-fail'))).to.equal(false);
    expect(validation.some((v) => String(v).startsWith('missing-logistics-route:'))).to.equal(false);
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

  it('places roads under edge ramparts and outer anti-ranged ramparts', function () {
    const plan = planner.generatePlan('W1N1', { topN: 3 });
    expect(plan).to.exist;
    const placements = plan.placements || [];
    const roads = new Set(
      placements
        .filter((p) => p.type === STRUCTURE_ROAD)
        .map((p) => `${p.x}:${p.y}`),
    );
    const edgeRamparts = placements.filter((p) => p.type === STRUCTURE_RAMPART && p.tag === 'rampart.edge');
    const outerRamparts = placements.filter(
      (p) => p.type === STRUCTURE_RAMPART && p.tag === 'rampart.edge.outer',
    );
    expect(edgeRamparts.length).to.be.greaterThan(0);
    expect(outerRamparts.length).to.be.greaterThan(0);

    for (const rp of [...edgeRamparts, ...outerRamparts]) {
      expect(roads.has(`${rp.x}:${rp.y}`)).to.equal(true);
    }

    const exitDistance =
      plan.analysis && Array.isArray(plan.analysis.exitDistance) ? plan.analysis.exitDistance : new Array(2500).fill(0);
    for (const outer of outerRamparts) {
      const adjacentEdges = edgeRamparts.filter(
        (edge) => Math.max(Math.abs(edge.x - outer.x), Math.abs(edge.y - outer.y)) <= 1,
      );
      expect(adjacentEdges.length).to.be.greaterThan(0);
      const outerDist = Number(exitDistance[outer.y * 50 + outer.x] || 0);
      const nearestEdgeDist = adjacentEdges.reduce(
        (minDist, edge) => Math.min(minDist, Number(exitDistance[edge.y * 50 + edge.x] || 0)),
        Infinity,
      );
      expect(outerDist).to.be.at.most(nearestEdgeDist);
    }
  });

  it('keeps edge ramparts exit-aware when most borders have no exits', function () {
    Game.rooms.W1N1.getTerrain = function () {
      const wallMask = typeof TERRAIN_MASK_WALL !== 'undefined' ? TERRAIN_MASK_WALL : 1;
      return {
        get(x, y) {
          const border = x === 0 || x === 49 || y === 0 || y === 49;
          if (!border) return 0;
          if (y === 0 && x >= 22 && x <= 27) return 0;
          return wallMask;
        },
      };
    };

    const plan = planner.generatePlan('W1N1', { topN: 3 });
    expect(plan).to.exist;
    const edgeRamparts = (plan.placements || []).filter(
      (p) => p.type === STRUCTURE_RAMPART && p.tag === 'rampart.edge',
    );
    expect(edgeRamparts.length).to.be.greaterThan(0);

    const exitDistance =
      plan.analysis && Array.isArray(plan.analysis.exitDistance) ? plan.analysis.exitDistance : new Array(2500).fill(99);
    const maxEdgeExitDistance = edgeRamparts.reduce(
      (maxDist, rp) => Math.max(maxDist, Number(exitDistance[rp.y * 50 + rp.x] || 0)),
      0,
    );
    expect(maxEdgeExitDistance).to.be.at.most(24);
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
    const rampartPreview = plan.meta && plan.meta.rampartPreview ? plan.meta.rampartPreview : {};
    expect(Array.isArray(rampartPreview.edge)).to.equal(true);
    expect(rampartPreview.edge.length).to.be.greaterThan(0);

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

  it('places a complete controller 3x3 stamp ring in cluster3 foundation stage', function () {
    const plan = planner.generatePlan('W1N1', {
      topN: 3,
      extensionPattern: 'cluster3',
      harabiStage: 'foundation',
    });
    const placements = plan.placements || [];
    const controllerRingRoads = placements.filter(
      (p) => p.type === STRUCTURE_ROAD && p.tag === 'road.controllerStamp',
    );
    const controllerLink = placements.find((p) => p.tag === 'controller.link');
    if (controllerLink) {
      expect(controllerRingRoads.length).to.equal(8);
      for (const road of controllerRingRoads) {
        const range = Math.max(
          Math.abs(road.x - Game.rooms.W1N1.controller.pos.x),
          Math.abs(road.y - Game.rooms.W1N1.controller.pos.y),
        );
        expect(range).to.be.at.most(3);
        expect(
          Math.max(
            Math.abs(road.x - controllerLink.x),
            Math.abs(road.y - controllerLink.y),
          ),
        ).to.equal(1);
      }
    } else {
      expect(controllerRingRoads.length).to.equal(0);
      expect((plan.meta.validation || []).includes('controller-stamp-missing')).to.equal(true);
    }
  });

  it('keeps source/resource logistics roads connected from storage', function () {
    const plan = planner.generatePlan('W1N1', {
      topN: 3,
      extensionPattern: 'cluster3',
      harabiStage: 'foundation',
    });
    const logistics = plan.meta && plan.meta.logisticsRoutes ? plan.meta.logisticsRoutes : {};
    expect(Number(logistics.required || 0)).to.be.at.least(1);
    expect(Number(logistics.connected || 0)).to.equal(Number(logistics.required || 0));
    expect(Array.isArray(logistics.missing) ? logistics.missing.length : 0).to.equal(0);
    expect((plan.meta.validation || []).some((v) => String(v).startsWith('missing-logistics-route:'))).to.equal(false);
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
      expect(extensionOrder[0]).to.have.property('wallAffinity');
      expect(extensionOrder[0]).to.have.property('openNeighbors');
      expect(extensionOrder[0]).to.have.property('compactnessR2');
      expect(extensionOrder[0]).to.have.property('edgeProximity');
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

  it('prunes empty big/small road stamps against final foundation preview occupancy', function () {
    const plan = planner.generatePlan('W1N1', {
      topN: 3,
      extensionPattern: 'cluster3',
      harabiStage: 'foundation',
    });
    const pruning = plan.meta && plan.meta.stampPruning ? plan.meta.stampPruning : {};
    expect(pruning.enabled).to.equal(true);

    const planning = plan.meta && plan.meta.structurePlanning ? plan.meta.structurePlanning : {};
    const planningPlacements = Array.isArray(planning.placements) ? planning.placements : [];
    const occupied = new Set(planningPlacements.map((p) => `${p.x}:${p.y}`));
    for (const p of (plan.placements || [])) {
      if (!p || p.type === STRUCTURE_ROAD || p.type === STRUCTURE_RAMPART) continue;
      occupied.add(`${p.x}:${p.y}`);
    }
    const labPlanning = plan.meta && plan.meta.labPlanning ? plan.meta.labPlanning : {};
    for (const lab of (Array.isArray(labPlanning.sourceLabs) ? labPlanning.sourceLabs : [])) {
      if (lab && typeof lab.x === 'number' && typeof lab.y === 'number') occupied.add(`${lab.x}:${lab.y}`);
    }
    for (const lab of (Array.isArray(labPlanning.reactionLabs) ? labPlanning.reactionLabs : [])) {
      if (lab && typeof lab.x === 'number' && typeof lab.y === 'number') occupied.add(`${lab.x}:${lab.y}`);
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
