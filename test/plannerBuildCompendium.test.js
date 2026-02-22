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
        if (type === FIND_SOURCES) return [sourceA, sourceB];
        if (type === FIND_MINERALS) return [mineral];
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

});
