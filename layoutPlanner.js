const statsConsole = require('console.console');
const htm = require('./manager.htm');
const constructionBlocker = require('./constructionBlocker');
const buildCompendium = require('./planner.buildCompendium');
const basePlanValidation = require('./manager.basePlanValidation');

/**
 * Modular layout planner storing structure matrix per room.
 * @codex-owner layoutPlanner
 */

const ROAD_TYPE = typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road';
const RAMPART_TYPE = typeof STRUCTURE_RAMPART !== 'undefined' ? STRUCTURE_RAMPART : 'rampart';
const SPAWN_TYPE = typeof STRUCTURE_SPAWN !== 'undefined' ? STRUCTURE_SPAWN : 'spawn';
const EXTENSION_TYPE = typeof STRUCTURE_EXTENSION !== 'undefined' ? STRUCTURE_EXTENSION : 'extension';
const TOWER_TYPE = typeof STRUCTURE_TOWER !== 'undefined' ? STRUCTURE_TOWER : 'tower';
const STORAGE_TYPE = typeof STRUCTURE_STORAGE !== 'undefined' ? STRUCTURE_STORAGE : 'storage';
const LINK_TYPE = typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link';
const CONTAINER_TYPE = typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container';
const TERRAIN_WALL_MASK =
  typeof TERRAIN_MASK_WALL !== 'undefined' ? TERRAIN_MASK_WALL : 1;
const PLAN_LAYOUT_PARENT_TASK = 'PLAN_LAYOUT_CANDIDATES';
const PLAN_LAYOUT_CANDIDATE_TASK = 'PLAN_LAYOUT_CANDIDATE';
const DEFAULT_THEORETICAL_TOP_N = 5;
const DEFAULT_THEORETICAL_CANDIDATES_PER_TICK = 1;
const DEFAULT_THEORETICAL_REPLAN_INTERVAL = 1000;
const DEFAULT_THEORETICAL_MAX_CANDIDATES_PER_TICK = 25;
const DEFAULT_THEORETICAL_DYNAMIC_BATCH = 1;
const THEORETICAL_KEEP_TOP = 3;
const DEFAULT_REFINEMENT_ENABLED = 1;
const DEFAULT_REFINEMENT_TOP_SEEDS = 2;
const DEFAULT_REFINEMENT_MAX_GENERATIONS = 8;
const DEFAULT_REFINEMENT_VARIANTS_PER_GENERATION = 4;
const DEFAULT_REFINEMENT_MIN_BUCKET = 3500;
const DEFAULT_FULL_SELECTION_RERANK_CANDIDATES = 3;
const DEFAULT_FULL_SELECTION_RERANK_DEFENSE_MODE = 'estimate';
const EXPECTED_CPU_PARENT_TASK = 0.35;
const EXPECTED_CPU_CANDIDATE_TASK = 8;
const EXPECTED_CPU_FULL_PREVIEW = 6;
const EXPECTED_CPU_REFINEMENT_VARIANT = 4;


function mapBasePhaseToDebugWindow(baseFrom = 1, baseTo = 6) {
  const phaseMap = {
    1: { from: 1, to: 3 },
    2: { from: 4, to: 4 },
    3: { from: 5, to: 7 },
    4: { from: 8, to: 10 },
    5: { from: 11, to: 11 },
    6: { from: 11, to: 11 },
  };
  const clamp = (value, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(1, Math.min(6, Math.floor(num)));
  };
  const bf = clamp(baseFrom, 1);
  const bt = clamp(baseTo, 6);
  const low = Math.min(bf, bt);
  const high = Math.max(bf, bt);
  return {
    baseFrom: low,
    baseTo: high,
    debugFrom: phaseMap[low].from,
    debugTo: phaseMap[high].to,
  };
}

function isTheoreticalMode() {
  return (
    Memory.settings &&
    String(Memory.settings.layoutPlanningMode || 'theoretical').toLowerCase() === 'theoretical'
  );
}

function findSourcesConst() {
  return typeof FIND_SOURCES !== 'undefined' ? FIND_SOURCES : 'FIND_SOURCES';
}

function findRoomSources(room) {
  if (!room || typeof room.find !== 'function') return [];
  const primary = room.find(findSourcesConst()) || [];
  if (primary.length > 0) return primary;
  const fallback = room.find('FIND_SOURCES') || [];
  if (fallback.length > 0) return fallback;
  return [];
}

function inBounds(x, y) {
  return x >= 1 && x <= 48 && y >= 1 && y <= 48;
}

function key(x, y) {
  return `${x}:${y}`;
}

function parseKey(k) {
  const [x, y] = String(k).split(':').map(Number);
  return { x, y };
}

function toArrayMap(map) {
  const arr = new Array(2500).fill(-1);
  for (const k in map) {
    const { x, y } = parseKey(k);
    if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
      arr[y * 50 + x] = map[k];
    }
  }
  return arr;
}

function groupStructuresByType(placements = []) {
  const grouped = {};
  for (const placement of placements) {
    if (!placement || !placement.type) continue;
    if (!grouped[placement.type]) grouped[placement.type] = [];
    grouped[placement.type].push({
      x: placement.x,
      y: placement.y,
      rcl: placement.rcl || 1,
      tag: placement.tag || null,
    });
  }
  return grouped;
}

function compactPersistedEvaluation(evaluation = {}) {
  const compact = {};
  if (
    evaluation &&
    typeof evaluation.weightedScore === 'number' &&
    Number.isFinite(evaluation.weightedScore)
  ) {
    compact.weightedScore = Number(evaluation.weightedScore);
  }
  return compact;
}

const FULL_SELECTION_CRITICAL_VALIDATION_PREFIXES = [
  'rampart-boundary-leak',
  'road-network-disconnected',
  'base-road-redundancy-missing',
  'missing-logistics-route',
  'source-road-anchor-missing',
  'rampart-road-missing',
  'rampart-road-disconnected',
  'controller-stamp-missing',
  'controller-stamp-incomplete',
  'core-stamp-storage-fallback',
  'core-stamp-spawn1-fallback',
  'core-stamp-terminal-fallback',
  'core-stamp-link-fallback',
  'controller-link-missing',
  'controller-link-range-fail',
  'source-link-range-fail',
  'source-link-container-range-fail',
  'extension-foundation-rank-missing',
];

const FULL_SELECTION_MAJOR_VALIDATION_PREFIXES = [
  'rampart-standoff-fail',
  'defense-score-low',
  'rampart-rogue-edge',
  'rampart-rogue-corridor',
  'rampart-diagonal-gap',
  'sink-link-range-storage-fail',
  'terminal-range-storage-fail',
  'storage-neighbor-fail',
  'spawn-neighbor-fail',
  'spawn-spread-fail',
  'spawn-exit-blocked',
  'container-count-fail',
  'exit-proximity-fail',
];

const FOUNDATION_SELECTION_HARD_REJECT_PREFIXES = [
  'controller-stamp-missing',
  'controller-stamp-incomplete',
  'missing-logistics-route',
  'source-road-anchor-missing',
  'road-network-disconnected',
  'spawn-exit-blocked',
  'extension-foundation-rank-missing',
];

function validationMatchesPrefix(flag, prefixes = []) {
  const value = String(flag || '');
  return prefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}:`));
}

function summarizeFullSelectionValidation(validation = []) {
  const flags = Array.isArray(validation) ? validation.filter(Boolean).map(String) : [];
  const criticalFlags = [];
  const majorFlags = [];
  const minorFlags = [];

  for (const flag of flags) {
    if (validationMatchesPrefix(flag, FULL_SELECTION_CRITICAL_VALIDATION_PREFIXES)) {
      criticalFlags.push(flag);
      continue;
    }
    if (validationMatchesPrefix(flag, FULL_SELECTION_MAJOR_VALIDATION_PREFIXES)) {
      majorFlags.push(flag);
      continue;
    }
    minorFlags.push(flag);
  }

  return {
    criticalFlags,
    majorFlags,
    minorFlags,
    criticalCount: criticalFlags.length,
    majorCount: majorFlags.length,
    minorCount: minorFlags.length,
    penalty:
      criticalFlags.length * 5 +
      majorFlags.length * 1.5 +
      Math.min(1, minorFlags.length * 0.1),
  };
}

function summarizeFoundationSelectionValidation(validation = []) {
  const flags = Array.isArray(validation) ? validation.filter(Boolean).map(String) : [];
  const hardRejectFlags = flags.filter((flag) =>
    validationMatchesPrefix(flag, FOUNDATION_SELECTION_HARD_REJECT_PREFIXES),
  );
  return {
    hardRejectFlags,
    hardReject: hardRejectFlags.length > 0,
  };
}

function applySelectionPenaltyToGeneratedPlan(generated) {
  const rawWeightedScore =
    generated &&
    generated.evaluation &&
    typeof generated.evaluation.weightedScore === 'number' &&
    Number.isFinite(generated.evaluation.weightedScore)
      ? Number(generated.evaluation.weightedScore)
      : 0;
  const validationSummary = summarizeFullSelectionValidation(
    generated && generated.meta && Array.isArray(generated.meta.validation)
      ? generated.meta.validation
      : [],
  );
  const foundationSelection = summarizeFoundationSelectionValidation(
    generated && generated.meta && Array.isArray(generated.meta.validation)
      ? generated.meta.validation
      : [],
  );
  return {
    rawWeightedScore,
    selectionPenalty: validationSummary.penalty,
    weightedScore: foundationSelection.hardReject
      ? Number.NEGATIVE_INFINITY
      : rawWeightedScore - validationSummary.penalty,
    validationSummary,
    selectionRejected: foundationSelection.hardReject,
    hardRejectFlags: foundationSelection.hardRejectFlags,
  };
}

function compactFullSelectionRerankDebug(debug) {
  if (!debug || typeof debug !== 'object') return {};
  const candidateRows = Array.isArray(debug.candidates) ? debug.candidates : [];
  return {
    enabled: debug.enabled === true,
    defensePlanningMode:
      typeof debug.defensePlanningMode === 'string' ? debug.defensePlanningMode : null,
    rerankedCount: Number(debug.rerankedCount || 0),
    topN: Number(debug.topN || 0),
    selectedIndex:
      typeof debug.selectedIndex === 'number' && Number.isFinite(debug.selectedIndex)
        ? debug.selectedIndex
        : null,
    candidates: candidateRows.map((row) => ({
      index:
        typeof row.index === 'number' && Number.isFinite(row.index)
          ? row.index
          : null,
      foundationScore: Number(row.foundationScore || 0),
      rawWeightedScore: Number(row.rawWeightedScore || 0),
      weightedScore: Number(row.weightedScore || 0),
      selectionPenalty: Number(row.selectionPenalty || 0),
      selectionRejected: row.selectionRejected === true,
      criticalCount: Number(row.criticalCount || 0),
      majorCount: Number(row.majorCount || 0),
    })),
  };
}

function compactPersistedBuildQueue(buildQueue = []) {
  if (!Array.isArray(buildQueue)) return [];
  const compact = [];
  for (const entry of buildQueue) {
    if (!entry || !entry.pos || typeof entry.type !== 'string') continue;
    const x = Number(entry.pos.x);
    const y = Number(entry.pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const row = {
      type: entry.type,
      pos: { x, y },
    };
    if (Number(entry.rcl || 1) > 1) row.rcl = Number(entry.rcl || 1);
    if (entry.built === true) row.built = true;
    if (typeof entry.builtAt === 'number' && Number.isFinite(entry.builtAt)) {
      row.builtAt = Number(entry.builtAt);
    }
    compact.push(row);
  }
  return compact;
}

function compactPersistedBasePlan(basePlan = {}) {
  const compact = {
    version: Number(basePlan.version || 1),
    generatedAt:
      typeof basePlan.generatedAt === 'number' && Number.isFinite(basePlan.generatedAt)
        ? Number(basePlan.generatedAt)
        : Game.time,
    buildQueue: compactPersistedBuildQueue(basePlan.buildQueue),
    compacted: true,
  };
  if (basePlan.spawnPos && typeof basePlan.spawnPos.x === 'number' && typeof basePlan.spawnPos.y === 'number') {
    compact.spawnPos = {
      x: Number(basePlan.spawnPos.x),
      y: Number(basePlan.spawnPos.y),
    };
  }
  const evaluation = compactPersistedEvaluation(basePlan.evaluation);
  if (Object.keys(evaluation).length > 0) compact.evaluation = evaluation;
  if (basePlan.planningRunId) compact.planningRunId = basePlan.planningRunId;
  if (basePlan.plannerDebug && typeof basePlan.plannerDebug === 'object') {
    compact.plannerDebug = basePlan.plannerDebug;
  }
  return compact;
}

function persistBasePlan(roomName, generated, pipeline) {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  const roomMem = Memory.rooms[roomName];
  const rawPlan = {
    version: 1,
    generatedAt: Game.time,
    spawnPos: generated.anchor ? { x: generated.anchor.x, y: generated.anchor.y } : null,
    structures: groupStructuresByType(generated.placements || []),
    buildQueue: Array.isArray(generated.buildQueue)
      ? generated.buildQueue.map((entry) => Object.assign({}, entry))
      : [],
    evaluation: generated.evaluation || {},
    selection: generated.selection || null,
    planningRunId: pipeline && pipeline.runId ? pipeline.runId : null,
    plannerDebug: compactBasePlanPlannerDebug(generated && generated.meta ? generated.meta : {}),
  };

  const validation = basePlanValidation.validateBasePlan(roomName, rawPlan);
  roomMem.basePlan = compactPersistedBasePlan(validation.normalizedPlan);
  roomMem.basePlan.validation = {
    valid: validation.valid,
    issues: validation.issues,
    autoFixes: validation.autoFixes,
    checkedAt: validation.checkedAt,
  };
  roomMem.basePlan.validationRecovery = basePlanValidation.handleValidationFailure(roomName, validation);
}

function refinementMutationKey(refinementInput) {
  if (
    !refinementInput ||
    !refinementInput.mutation ||
    typeof refinementInput.mutation !== 'object'
  ) {
    return '';
  }
  return JSON.stringify(refinementInput.mutation);
}

function readNumberSetting(path, fallback) {
  const value =
    Memory &&
    Memory.settings &&
    Object.prototype.hasOwnProperty.call(Memory.settings, path)
      ? Memory.settings[path]
      : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
}

function readBoolSetting(path, fallback = false) {
  const value =
    Memory &&
    Memory.settings &&
    Object.prototype.hasOwnProperty.call(Memory.settings, path)
      ? Memory.settings[path]
      : undefined;
  if (value === undefined) return fallback;
  return Boolean(value);
}

function normalizeTopN(value) {
  return Math.max(1, Math.min(10, Math.floor(value)));
}

function normalizeCandidatesPerTick(value) {
  return Math.max(1, Math.min(5, Math.floor(value)));
}

function readRefinementSettings() {
  const enabled = readBoolSetting('layoutRefinementEnabled', DEFAULT_REFINEMENT_ENABLED === 1);
  const topSeeds = Math.max(
    1,
    Math.min(5, Math.floor(readNumberSetting('layoutRefinementTopSeeds', DEFAULT_REFINEMENT_TOP_SEEDS))),
  );
  const maxGenerations = Math.max(
    1,
    Math.min(50, Math.floor(readNumberSetting('layoutRefinementMaxGenerations', DEFAULT_REFINEMENT_MAX_GENERATIONS))),
  );
  const variantsPerGeneration = Math.max(
    1,
    Math.min(10, Math.floor(readNumberSetting('layoutRefinementVariantsPerGeneration', DEFAULT_REFINEMENT_VARIANTS_PER_GENERATION))),
  );
  const minBucket = Math.max(
    0,
    Math.min(10000, Math.floor(readNumberSetting('layoutRefinementMinBucket', DEFAULT_REFINEMENT_MIN_BUCKET))),
  );
  return { enabled, topSeeds, maxGenerations, variantsPerGeneration, minBucket };
}

function buildReplayMutation(seedIndex, generation, variant) {
  const base = Number(seedIndex || 0) * 31 + Number(generation || 0) * 17 + Number(variant || 0) * 7;
  const jitter = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
  ];
  const pick = jitter[Math.abs(base) % jitter.length];
  return {
    anchorDx: pick.x,
    anchorDy: pick.y,
    roadAngleShift: ((base % 5) - 2),
    slotOrderShift: ((base % 7) - 3),
    routeTieBreakShift: ((base % 9) - 4),
  };
}

function summarizeRefinement(refinement) {
  if (!refinement || typeof refinement !== 'object') return {};
  return {
    enabled: refinement.enabled === true,
    status: refinement.status || 'pending',
    seedIndices: Array.isArray(refinement.seedIndices) ? refinement.seedIndices.slice(0, 5) : [],
    generation: Number(refinement.generation || 0),
    maxGenerations: Number(refinement.maxGenerations || 0),
    variantsPerGeneration: Number(refinement.variantsPerGeneration || 0),
    attemptedMutations: Number(refinement.attemptedMutations || 0),
    acceptedMutations: Number(refinement.acceptedMutations || 0),
    bestScoreBefore: Number(refinement.bestScoreBefore || 0),
    bestScoreAfter: Number(refinement.bestScoreAfter || 0),
    improvementPct: Number(refinement.improvementPct || 0),
    skipReason: refinement.skipReason || null,
  };
}

function buildRefinementDetail(refinement, done, total) {
  const scoringDetail =
    total > 0
      ? done >= total
        ? 'Weighted scores finalized'
        : `Scoring ${done}/${Math.max(total, 1)}`
      : 'Awaiting candidates';
  if (!refinement || refinement.enabled !== true) return scoringDetail;

  const generation = Number(refinement.generation || 0);
  const maxGenerations = Math.max(1, Number(refinement.maxGenerations || DEFAULT_REFINEMENT_MAX_GENERATIONS));
  const attempted = Number(refinement.attemptedMutations || 0);
  const accepted = Number(refinement.acceptedMutations || 0);
  const improvement = Number(refinement.improvementPct || 0);
  const status = String(refinement.status || 'pending').toLowerCase();
  const improvementText = `${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%`;

  if (status === 'skipped-bucket') {
    return `Replay skipped (bucket < ${Number(refinement.minBucket || DEFAULT_REFINEMENT_MIN_BUCKET)})`;
  }
  if (status === 'running') {
    return `Replay gen ${generation}/${maxGenerations}, accepted ${accepted}/${attempted}, ${improvementText}`;
  }
  if (status === 'done') {
    return `Replay done ${generation}/${maxGenerations}, accepted ${accepted}/${attempted}, ${improvementText}`;
  }
  if (status === 'disabled' || status === 'disabled-runtime') {
    return scoringDetail;
  }
  return `Replay pending (${generation}/${maxGenerations})`;
}

function normalizePhase(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(11, Math.floor(num)));
}

function readPhaseWindow() {
  const from = normalizePhase(
    readNumberSetting('layoutPlanningDebugPhaseFrom', 1),
    1,
  );
  const to = normalizePhase(
    readNumberSetting('layoutPlanningDebugPhaseTo', 11),
    11,
  );
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function readRecalcScope() {
  const value =
    Memory && Memory.settings && typeof Memory.settings.layoutPlanningRecalcScope === 'string'
      ? Memory.settings.layoutPlanningRecalcScope
      : 'all';
  const normalized = String(value || 'all').toLowerCase();
  if (['all', 'foundation', 'placement', 'evaluation', 'persist'].includes(normalized)) {
    return normalized;
  }
  return 'all';
}

function readLayoutPattern() {
  const value =
    Memory && Memory.settings && typeof Memory.settings.layoutExtensionPattern === 'string'
      ? Memory.settings.layoutExtensionPattern
      : 'cluster3';
  const normalized = String(value || 'cluster3').toLowerCase();
  if (normalized === 'cluster3' || normalized === 'harabi' || normalized === 'diag2') {
    return 'cluster3';
  }
  return 'cluster3';
}

function readHarabiStage() {
  const raw =
    Memory && Memory.settings && typeof Memory.settings.layoutHarabiStage === 'string'
      ? Memory.settings.layoutHarabiStage
      : 'full';
  const normalized = String(raw || 'full').toLowerCase() === 'foundation' ? 'foundation' : 'full';
  if (Memory && Memory.settings) {
    Memory.settings.layoutHarabiStage = normalized;
  }
  return normalized;
}

function readTheoreticalHarabiStages() {
  const requested = readHarabiStage();
  const pattern = readLayoutPattern();
  const candidate = pattern === 'cluster3' && requested === 'full' ? 'foundation' : requested;
  return {
    requested,
    candidate,
    final: requested,
  };
}

function readTheoreticalDefensePlanningMode() {
  const explicit =
    Memory && Memory.settings && typeof Memory.settings.layoutDefensePlanningMode === 'string'
      ? String(Memory.settings.layoutDefensePlanningMode || '').toLowerCase()
      : '';
  if (explicit === 'full') return 'full';
  if (explicit === 'estimate') return 'estimate';
  const runtimeMode =
    Memory && Memory.settings && typeof Memory.settings.runtimeMode === 'string'
      ? String(Memory.settings.runtimeMode || 'live').toLowerCase()
      : 'live';
  return runtimeMode === 'theoretical' ? 'estimate' : 'full';
}

function readFullSelectionRerankDefensePlanningMode() {
  const explicit =
    Memory && Memory.settings && typeof Memory.settings.layoutDefensePlanningMode === 'string'
      ? String(Memory.settings.layoutDefensePlanningMode || '').toLowerCase()
      : '';
  if (explicit === 'full' || explicit === 'estimate') return explicit;
  return DEFAULT_FULL_SELECTION_RERANK_DEFENSE_MODE;
}

function isWalkable(room, x, y) {
  if (!room || !inBounds(x, y)) return false;
  const terrain = room.getTerrain();
  if (terrain.get(x, y) === TERRAIN_WALL_MASK) return false;
  const lookStructures = typeof LOOK_STRUCTURES !== 'undefined' ? LOOK_STRUCTURES : 'structure';
  const structures = room.lookForAt(lookStructures, x, y) || [];
  const blocked = structures.some((s) => {
    if (!s || !s.structureType) return false;
    if (s.structureType === ROAD_TYPE || s.structureType === CONTAINER_TYPE) return false;
    return (
      typeof OBSTACLE_OBJECT_TYPES !== 'undefined' &&
      Array.isArray(OBSTACLE_OBJECT_TYPES) &&
      OBSTACLE_OBJECT_TYPES.includes(s.structureType)
    );
  });
  return !blocked;
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function computeControllerDistanceMap(room, originPos) {
  const dist = {};
  if (!room || !originPos) return dist;
  const q = [{ x: originPos.x, y: originPos.y }];
  dist[key(originPos.x, originPos.y)] = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (q.length) {
    const cur = q.shift();
    const d = dist[key(cur.x, cur.y)];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny) || !isWalkable(room, nx, ny)) continue;
      const nk = key(nx, ny);
      if (dist[nk] !== undefined) continue;
      dist[nk] = d + 1;
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

function floodFillScore(room, start, maxDepth = 12) {
  if (!start || !isWalkable(room, start.x, start.y)) return 0;
  const seen = new Set([key(start.x, start.y)]);
  const q = [{ x: start.x, y: start.y, d: 0 }];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let count = 0;
  while (q.length) {
    const cur = q.shift();
    count += 1;
    if (cur.d >= maxDepth) continue;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = key(nx, ny);
      if (seen.has(nk) || !inBounds(nx, ny) || !isWalkable(room, nx, ny)) continue;
      seen.add(nk);
      q.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return count;
}

function mincutProxyScore(room, center, radius = 8) {
  let openRing = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (!inBounds(x, y)) continue;
      const rng = Math.max(Math.abs(dx), Math.abs(dy));
      if (rng !== radius) continue;
      if (isWalkable(room, x, y)) openRing += 1;
    }
  }
  // Fewer openings are easier to wall, but zero openings are unrealistic.
  return Math.max(0, 40 - openRing);
}

function chooseUpgraderBlock(room, controllerPos, wallDistance) {
  let best = null;
  let bestScore = -Infinity;
  const tryRect = (x0, y0, w, h) => {
    const slots = [];
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (!inBounds(x, y) || !isWalkable(room, x, y)) return;
        const range = chebyshev({ x, y }, controllerPos);
        if (range > 3 || range < 1) return;
        slots.push({ x, y });
      }
    }
    if (slots.length !== 8) return;
    const avgRange = slots.reduce((sum, p) => sum + chebyshev(p, controllerPos), 0) / slots.length;
    const avgWall = slots.reduce((sum, p) => sum + (wallDistance[p.y * 50 + p.x] || 0), 0) / slots.length;
    const center = {
      x: slots.reduce((sum, p) => sum + p.x, 0) / slots.length,
      y: slots.reduce((sum, p) => sum + p.y, 0) / slots.length,
    };
    const centerDist = manhattan(center, controllerPos);
    const score = avgWall * 12 - avgRange * 8 - centerDist;
    if (score > bestScore) {
      bestScore = score;
      best = slots;
    }
  };
  for (let x = 1; x <= 47; x++) {
    for (let y = 1; y <= 47; y++) {
      tryRect(x, y, 4, 2);
      tryRect(x, y, 2, 4);
    }
  }
  if (best) return best;

  // Fallback: nearest 8 walkable controller-adjacent upgrade tiles.
  const fallback = [];
  for (let x = 1; x <= 48; x++) {
    for (let y = 1; y <= 48; y++) {
      if (!isWalkable(room, x, y)) continue;
      const range = chebyshev({ x, y }, controllerPos);
      if (range < 1 || range > 3) continue;
      fallback.push({ x, y, range, wall: wallDistance[y * 50 + x] || 0 });
    }
  }
  fallback.sort((a, b) => a.range - b.range || b.wall - a.wall || a.y - b.y || a.x - b.x);
  return fallback.slice(0, 8).map(({ x, y }) => ({ x, y }));
}

function chooseTheoreticalSpawn(room, controllerPos, sources, wallDistance, controllerDistances, upgraderSlots) {
  let best = null;
  let bestScore = -Infinity;
  const avgSourceDist = (p) => {
    if (!sources || sources.length === 0) return 15;
    return (
      sources.reduce((sum, s) => sum + manhattan(p, s.pos || s), 0) /
      Math.max(1, sources.length)
    );
  };
  for (let x = 5; x <= 44; x++) {
    for (let y = 5; y <= 44; y++) {
      if (!isWalkable(room, x, y)) continue;
      const pos = { x, y };
      const cRange = chebyshev(pos, controllerPos);
      if (cRange < 4 || cRange > 15) continue;
      if (upgraderSlots.some((s) => s.x === x && s.y === y)) continue;

      const wall = wallDistance[y * 50 + x] || 0;
      const flood = floodFillScore(room, pos, 10);
      const mincut = mincutProxyScore(room, pos, 8);
      const cd = controllerDistances[key(x, y)] !== undefined ? controllerDistances[key(x, y)] : 80;
      const src = avgSourceDist(pos);
      const score =
        wall * 8 +
        flood * 0.25 +
        mincut * 2 -
        Math.abs(cRange - 8) * 3 -
        cd * 0.4 -
        src * 0.7;
      if (score > bestScore) {
        bestScore = score;
        best = {
          x,
          y,
          wallDistance: wall,
          floodScore: flood,
          mincutScore: mincut,
          controllerDistance: cd,
          sourceDistance: src,
          score,
        };
      }
    }
  }
  return best;
}

function chooseControllerContainer(room, controllerPos, upgraderSlots, spawnPos) {
  let best = null;
  let bestScore = -Infinity;
  const slotSet = new Set(upgraderSlots.map((s) => key(s.x, s.y)));
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const x = controllerPos.x + dx;
      const y = controllerPos.y + dy;
      if (!inBounds(x, y) || !isWalkable(room, x, y)) continue;
      if (slotSet.has(key(x, y))) continue;
      const range = chebyshev({ x, y }, controllerPos);
      if (range > 3 || range < 1) continue;
      const adjacentToLine = upgraderSlots.some((s) => chebyshev(s, { x, y }) === 1);
      if (!adjacentToLine) continue;
      const spawnDist = spawnPos ? manhattan({ x, y }, spawnPos) : 20;
      const score = (adjacentToLine ? 40 : 0) - spawnDist;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function chooseSourceContainers(room, spawnPos, sources) {
  const selected = [];
  for (const source of sources || []) {
    let best = null;
    let bestScore = -Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = source.pos.x + dx;
        const y = source.pos.y + dy;
        if (!inBounds(x, y) || !isWalkable(room, x, y)) continue;
        const spawnDist = spawnPos ? manhattan({ x, y }, spawnPos) : 50;
        const score = 100 - spawnDist;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y, sourceId: source.id };
        }
      }
    }
    if (best) selected.push(best);
  }
  return selected;
}

function pathRoad(room, from, to) {
  if (!from || !to || typeof PathFinder === 'undefined' || typeof PathFinder.search !== 'function') {
    return [];
  }
  const search = PathFinder.search(
    new RoomPosition(from.x, from.y, room.name),
    { pos: new RoomPosition(to.x, to.y, room.name), range: 1 },
    { plainCost: 2, swampCost: 3, maxOps: 6000 },
  );
  if (!search || !Array.isArray(search.path)) return [];
  return search.path.map((p) => ({ x: p.x, y: p.y }));
}

function writeRoadMatrix(mem, roadTiles) {
  mem.roadMatrix = {};
  for (const tile of roadTiles) {
    if (!mem.roadMatrix[tile.x]) mem.roadMatrix[tile.x] = {};
    mem.roadMatrix[tile.x][tile.y] = { rcl: 1 };
  }
}

function countPlacementsByType(placements = []) {
  const counts = {};
  for (const placement of Array.isArray(placements) ? placements : []) {
    if (!placement || !placement.type) continue;
    counts[placement.type] = (counts[placement.type] || 0) + 1;
  }
  return counts;
}

function compactLabPlanningDebug(debug) {
  if (!debug || typeof debug !== 'object') return {};
  const sourceLabs = Array.isArray(debug.sourceLabs)
    ? debug.sourceLabs
        .filter((pos) => pos && Number.isFinite(pos.x) && Number.isFinite(pos.y))
        .slice(0, 2)
        .map((pos) => ({ x: pos.x, y: pos.y }))
    : [];
  const reactionLabs = Array.isArray(debug.reactionLabs) ? debug.reactionLabs : [];
  return {
    mode: debug.mode || null,
    computed: debug.computed === true,
    clusterFound: debug.clusterFound === true,
    totalLabs: Number(debug.totalLabs || sourceLabs.length + reactionLabs.length || 0),
    sourceLabs,
    reactionLabCount: reactionLabs.length,
  };
}

function compactStructurePlanningDebug(debug) {
  if (!debug || typeof debug !== 'object') return {};
  const ranking = debug.ranking && typeof debug.ranking === 'object' ? debug.ranking : {};
  return {
    mode: debug.mode || null,
    computed: debug.computed === true,
    counts: debug.counts && typeof debug.counts === 'object' ? debug.counts : {},
    ranking: {
      extensionOrderTotal: Number(ranking.extensionOrderTotal || 0),
      extensionOrderTruncated: ranking.extensionOrderTruncated === true,
      disconnectedFallbackCount: Number(ranking.disconnectedFallbackCount || 0),
      distanceModel: ranking.distanceModel || null,
      rangeMode: ranking.rangeMode || null,
      roadSelection: ranking.roadSelection || null,
      spawnStampCenter:
        ranking.spawnStampCenter &&
        Number.isFinite(ranking.spawnStampCenter.x) &&
        Number.isFinite(ranking.spawnStampCenter.y)
          ? { x: ranking.spawnStampCenter.x, y: ranking.spawnStampCenter.y }
          : null,
      spawnRef:
        ranking.spawnRef &&
        Number.isFinite(ranking.spawnRef.x) &&
        Number.isFinite(ranking.spawnRef.y)
          ? { x: ranking.spawnRef.x, y: ranking.spawnRef.y }
          : null,
    },
  };
}

function compactValidStructureDebug(debug) {
  if (!debug || typeof debug !== 'object') return {};
  const positions = Array.isArray(debug.positions) ? debug.positions : [];
  return {
    mode: debug.mode || null,
    distanceModel: debug.distanceModel || null,
    roadSelection: debug.roadSelection || null,
    structureClear: Number(debug.structureClear || 0),
    roadClear: Number(debug.roadClear || 0),
    canPlace: Number(debug.canPlace || 0),
    shownPositions: positions.length,
    truncated: debug.truncated === true,
  };
}

function cloneCoord(pos, extraKeys = []) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
  const cloned = { x: Number(pos.x), y: Number(pos.y) };
  for (const key of extraKeys) {
    if (pos[key] !== undefined) cloned[key] = pos[key];
  }
  return cloned;
}

function compactTheoreticalCandidateRow(row) {
  if (!row || typeof row !== 'object') return null;
  const compact = {
    index: typeof row.index === 'number' ? row.index : null,
    anchor: cloneCoord(row.anchor),
    initialScore: Number(row.initialScore || 0),
    weightedScore:
      typeof row.weightedScore === 'number' && Number.isFinite(row.weightedScore)
        ? row.weightedScore
        : null,
    weightedContributions:
      row.weightedContributions && typeof row.weightedContributions === 'object'
        ? row.weightedContributions
        : {},
    selected: row.selected === true,
    completedAt: Number(row.completedAt || 0),
  };
  if (typeof row.rawWeightedScore === 'number' && Number.isFinite(row.rawWeightedScore)) {
    compact.rawWeightedScore = Number(row.rawWeightedScore);
  }
  if (typeof row.selectionPenalty === 'number' && Number.isFinite(row.selectionPenalty)) {
    compact.selectionPenalty = Number(row.selectionPenalty);
  }
  if (row.selectionRejected === true) {
    compact.selectionRejected = true;
    compact.hardRejectFlags = Array.isArray(row.hardRejectFlags) ? row.hardRejectFlags.slice() : [];
  }
  if (typeof row.defenseScore === 'number' && Number.isFinite(row.defenseScore)) {
    compact.defenseScore = Number(row.defenseScore);
  }
  return compact;
}

function compactBasePlanPlannerDebug(meta = {}) {
  return {
    layoutPattern: meta.layoutPattern || null,
    harabiStage: meta.harabiStage || null,
    stampStats: meta.stampStats || {},
    stampPruning: meta.stampPruning || {},
    sourceLogistics: meta.sourceLogistics || {},
    foundationDebug: meta.foundationDebug || {},
    sourceResourceDebug: meta.sourceResourceDebug || {},
    logisticsRoutes: meta.logisticsRoutes || {},
    labPlanning: compactLabPlanningDebug(meta.labPlanning),
    structurePlanning: compactStructurePlanningDebug(meta.structurePlanning),
    refinementDebug: summarizeRefinement(meta.refinementDebug),
    fullSelectionRerank: compactFullSelectionRerankDebug(meta.fullSelectionRerank),
    validStructurePositions: compactValidStructureDebug(meta.validStructurePositions),
    validation: Array.isArray(meta.validation) ? meta.validation : [],
    compacted: true,
  };
}

function compactCompletedTheoreticalState(theoretical = {}) {
  const sourceContainers = Array.isArray(theoretical.sourceContainers)
    ? theoretical.sourceContainers
        .map((pos) => cloneCoord(pos))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const compact = {
    compacted: true,
    controllerPos: cloneCoord(theoretical.controllerPos),
    spawnCandidate: cloneCoord(theoretical.spawnCandidate, ['score']),
    controllerContainer: cloneCoord(theoretical.controllerContainer),
    sourceContainers,
    foundationDebug:
      theoretical.foundationDebug && typeof theoretical.foundationDebug === 'object'
        ? theoretical.foundationDebug
        : {},
    sourceResourceDebug:
      theoretical.sourceResourceDebug && typeof theoretical.sourceResourceDebug === 'object'
        ? theoretical.sourceResourceDebug
        : {},
    logisticsRoutes:
      theoretical.logisticsRoutes && typeof theoretical.logisticsRoutes === 'object'
        ? theoretical.logisticsRoutes
        : {},
    labPlanning: compactLabPlanningDebug(theoretical.labPlanning),
    structurePlanning: compactStructurePlanningDebug(theoretical.structurePlanning),
    refinementDebug: summarizeRefinement(theoretical.refinementDebug),
    fullSelectionRerank: compactFullSelectionRerankDebug(theoretical.fullSelectionRerank),
    validStructurePositions: compactValidStructureDebug(theoretical.validStructurePositions),
    floodScore: Number(theoretical.floodScore || 0),
    mincutProxy: Number(theoretical.mincutProxy || 0),
    selectedCandidateIndex:
      typeof theoretical.selectedCandidateIndex === 'number'
        ? theoretical.selectedCandidateIndex
        : null,
    selectedWeightedScore: Number(theoretical.selectedWeightedScore || 0),
    candidates: Array.isArray(theoretical.candidates)
      ? theoretical.candidates
          .map((row) => compactTheoreticalCandidateRow(row))
          .filter(Boolean)
      : [],
    candidateSet:
      theoretical.candidateSet && typeof theoretical.candidateSet === 'object'
        ? theoretical.candidateSet
        : {},
    checklist:
      theoretical.checklist && typeof theoretical.checklist === 'object'
        ? theoretical.checklist
        : null,
    planningRunId: theoretical.planningRunId || null,
    planningStatus: theoretical.planningStatus || 'completed',
    generatedAt: Number(theoretical.generatedAt || 0),
  };
  if (typeof theoretical.currentlyViewingCandidate === 'number') {
    compact.currentlyViewingCandidate = theoretical.currentlyViewingCandidate;
  }
  return compact;
}

function hasRenderableCandidatePlacements(plan) {
  return Boolean(plan && Array.isArray(plan.placements));
}

const layoutPlanner = {
  /**
   * Check if a tile is reserved by the planner.
   * @param {string} roomName
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isTileBlocked(roomName, x, y) {
    return constructionBlocker.isTileBlocked(roomName, x, y);
  },
  /**
   * Plan layout for given room name using preset matrix.
   * @param {string} roomName
   */
  plan(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return;
    this.buildTheoreticalLayout(roomName);
  },

  /**
   * Ensure a layout plan exists for the room. Creates one if missing.
   * @param {string} roomName
   */
  ensurePlan(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return;
    const mem = Memory.rooms[roomName];
    const pipelineStatus =
      mem && mem.layout && mem.layout.theoreticalPipeline
        ? mem.layout.theoreticalPipeline.status
        : null;
    const pipelineActive =
      mem &&
      mem.layout &&
      mem.layout.theoreticalPipeline &&
      mem.layout.theoreticalPipeline.status !== 'completed' &&
      mem.layout.theoreticalPipeline.status !== 'paused_phase_10' &&
      mem.layout.theoreticalPipeline.status !== 'paused_phase_9' &&
      mem.layout.theoreticalPipeline.status !== 'paused_phase_8';
    const explicitRecalcRequested =
      Memory.settings &&
      Memory.settings.layoutRecalculateRequested &&
      (Memory.settings.layoutRecalculateRequested === 'all' ||
        Memory.settings.layoutRecalculateRequested === roomName);
    if (
      !mem ||
      !mem.layout ||
      mem.layout.planVersion !== 2 ||
      mem.layout.mode !== 'theoretical' ||
      mem.layout.rebuildLayout ||
      mem.layout.manualPhaseRequest ||
      explicitRecalcRequested ||
      (!mem.layout.theoretical &&
        (pipelineStatus === 'paused_phase_10' || pipelineStatus === 'paused_phase_9' || pipelineStatus === 'paused_phase_8'))
    ) {
      this.plan(roomName);
    }
  },

  /**
   * Generate dynamic layout positions based on terrain and spawn anchor.
   * @param {string} roomName
   * @codex-owner layoutPlanner
   */
  populateDynamicLayout(roomName) {
    // Backward-compatible entrypoint retained for callers; all planning is theoretical.
    this.buildTheoreticalLayout(roomName);
  },

  _clearTheoreticalPlanningTasks(roomName, runId = null) {
    const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
    if (!container || !Array.isArray(container.tasks)) return;
    for (let i = container.tasks.length - 1; i >= 0; i--) {
      const task = container.tasks[i];
      if (task.name !== PLAN_LAYOUT_PARENT_TASK && task.name !== PLAN_LAYOUT_CANDIDATE_TASK) {
        continue;
      }
      if (runId && task.data && task.data.runId && task.data.runId !== runId) {
        continue;
      }
      container.tasks.splice(i, 1);
    }
  },

  _compactPipelineRun(run, top3Results = {}, winnerIndex = null) {
    if (!run || typeof run !== 'object') return null;
    return {
      runId: run.runId || null,
      status: run.status || 'unknown',
      createdAt: Number(run.createdAt || 0),
      completedAt: Number(run.completedAt || 0),
      staleAt: Number(run.staleAt || 0),
      staleReason: run.staleReason || null,
      bestCandidateIndex:
        typeof winnerIndex === 'number' ? winnerIndex : run.bestCandidateIndex || null,
      phases: run.phases || {},
      topResults: top3Results,
      compactedAt: Game.time,
    };
  },

  _compactCandidatePlan(plan, options = {}) {
    if (!plan || typeof plan !== 'object') return null;
    const keepPlacements = options.keepPlacements === true;
    const compact = {
      index: typeof plan.index === 'number' ? plan.index : null,
      anchor: plan.anchor || null,
      weightedScore: Number(plan.weightedScore || 0),
      weightedMetrics: plan.weightedMetrics || {},
      weightedContributions: plan.weightedContributions || {},
      validation: plan.validation || [],
      stampStats: plan.stampStats || {},
      stampPruning: plan.stampPruning || {},
      sourceLogistics: plan.sourceLogistics || {},
      foundationDebug: plan.foundationDebug || {},
      sourceResourceDebug: plan.sourceResourceDebug || {},
      logisticsRoutes: plan.logisticsRoutes || {},
      defenseScore: Number(plan.defenseScore || 0),
      completedAt: Number(plan.completedAt || 0),
      compacted: keepPlacements !== true,
      selectionRejected: plan.selectionRejected === true,
      hardRejectFlags: Array.isArray(plan.hardRejectFlags) ? plan.hardRejectFlags : [],
      structureCounts:
        plan.structureCounts && typeof plan.structureCounts === 'object'
          ? plan.structureCounts
          : countPlacementsByType(plan.placements),
    };
    if (keepPlacements) {
      compact.placements = Array.isArray(plan.placements) ? plan.placements : [];
      compact.labPlanning = plan.labPlanning || {};
      compact.structurePlanning = plan.structurePlanning || {};
      compact.refinementDebug = plan.refinementDebug || {};
      compact.validStructurePositions = plan.validStructurePositions || {};
      if (plan.foundationSnapshot) compact.foundationSnapshot = plan.foundationSnapshot;
      if (plan.fullOptimization) compact.fullOptimization = plan.fullOptimization;
      if (plan.refinementInput) compact.refinementInput = plan.refinementInput;
      return compact;
    }
    compact.labPlanning = compactLabPlanningDebug(plan.labPlanning);
    compact.structurePlanning = compactStructurePlanningDebug(plan.structurePlanning);
    compact.refinementDebug = summarizeRefinement(plan.refinementDebug);
    compact.validStructurePositions = compactValidStructureDebug(plan.validStructurePositions);
    return compact;
  },

  _pruneTheoreticalMemory(roomName, options = {}) {
    if (!Memory.rooms || !Memory.rooms[roomName]) return null;
    const roomMem = Memory.rooms[roomName];
    const layout = roomMem.layout;
    if (!layout) return null;

    const summary = {
      roomName,
      tick: Game.time,
      reason: options.reason || 'auto',
      removedCandidates: 0,
      removedCandidatePlans: 0,
      removedPipelineResults: 0,
      removedPipelineRuns: 0,
      compactedCandidatePlans: 0,
      keptCandidates: 0,
      keptPipelineRuns: 0,
      removedTotal: 0,
    };

    const pipeline = layout.theoreticalPipeline || null;
    const theoretical = layout.theoretical || null;
    const plans = layout.theoreticalCandidatePlans || {};
    const hasPersistedBasePlan = Boolean(
      roomMem.basePlan &&
        Array.isArray(roomMem.basePlan.buildQueue) &&
        roomMem.basePlan.buildQueue.length > 0,
    );
    const winnerIndex =
      pipeline && typeof pipeline.bestCandidateIndex === 'number'
        ? pipeline.bestCandidateIndex
        : theoretical && typeof theoretical.selectedCandidateIndex === 'number'
          ? theoretical.selectedCandidateIndex
          : null;

    const scoreByIndex = {};
    if (pipeline && pipeline.results) {
      for (const key in pipeline.results) {
        const result = pipeline.results[key] || {};
        const idx = Number(result.index !== undefined ? result.index : key);
        if (!Number.isFinite(idx)) continue;
        scoreByIndex[idx] = Number(result.weightedScore || 0);
      }
    }
    if ((!Object.keys(scoreByIndex).length) && theoretical && Array.isArray(theoretical.candidates)) {
      for (const candidate of theoretical.candidates) {
        if (!candidate || typeof candidate.index !== 'number') continue;
        const weighted =
          typeof candidate.weightedScore === 'number'
            ? candidate.weightedScore
            : Number(candidate.initialScore || 0);
        scoreByIndex[candidate.index] = weighted;
      }
    }
    for (const key of Object.keys(plans)) {
      const idx = Number(key);
      if (!Number.isFinite(idx)) continue;
      if (scoreByIndex[idx] === undefined) {
        scoreByIndex[idx] = Number(plans[key] && plans[key].weightedScore ? plans[key].weightedScore : 0);
      }
    }

    let ranked = Object.keys(scoreByIndex)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => Number(scoreByIndex[b] || 0) - Number(scoreByIndex[a] || 0));
    if (typeof winnerIndex === 'number' && ranked.indexOf(winnerIndex) === -1) {
      ranked.unshift(winnerIndex);
    }
    ranked = ranked.slice(0, THEORETICAL_KEEP_TOP);
    const requestedOverlayIndex =
      Memory.settings && typeof Memory.settings.layoutCandidateOverlayIndex === 'number'
        ? Memory.settings.layoutCandidateOverlayIndex
        : -1;
    if (requestedOverlayIndex >= 0 && ranked.indexOf(requestedOverlayIndex) === -1) {
      ranked.push(requestedOverlayIndex);
    }
    const keepSet = {};
    for (const idx of ranked) keepSet[String(idx)] = true;
    const keepFullSet = {};
    const selectedIndex =
      theoretical && typeof theoretical.selectedCandidateIndex === 'number'
        ? theoretical.selectedCandidateIndex
        : null;
    const currentDisplayIndex =
      typeof layout.currentDisplayCandidateIndex === 'number'
        ? layout.currentDisplayCandidateIndex
        : null;
    const explicitlyRequestedOverlayIndex =
      requestedOverlayIndex >= 0 ? requestedOverlayIndex : null;
    for (const idx of [explicitlyRequestedOverlayIndex, currentDisplayIndex]) {
      if (typeof idx !== 'number' || !keepSet[String(idx)]) continue;
      if (!hasPersistedBasePlan || idx !== winnerIndex || idx === explicitlyRequestedOverlayIndex) {
        keepFullSet[String(idx)] = true;
      }
    }
    if (!hasPersistedBasePlan) {
      for (const idx of [winnerIndex, selectedIndex]) {
        if (typeof idx === 'number' && keepSet[String(idx)]) keepFullSet[String(idx)] = true;
      }
    }
    if (!hasPersistedBasePlan && Object.keys(keepFullSet).length === 0 && ranked.length > 0) {
      keepFullSet[String(ranked[0])] = true;
    }

    if (theoretical && Array.isArray(theoretical.candidates)) {
      const before = theoretical.candidates.length;
      theoretical.candidates = theoretical.candidates.filter((candidate) => {
        const idx = candidate && typeof candidate.index === 'number' ? candidate.index : null;
        return idx !== null && keepSet[String(idx)] === true;
      });
      summary.removedCandidates += Math.max(0, before - theoretical.candidates.length);
      summary.keptCandidates = theoretical.candidates.length;
    }

    if (layout.theoreticalCandidatePlans && typeof layout.theoreticalCandidatePlans === 'object') {
      const compactPlans = {};
      for (const key in layout.theoreticalCandidatePlans) {
        if (!keepSet[String(key)]) {
          summary.removedCandidatePlans += 1;
          continue;
        }
        const plan = layout.theoreticalCandidatePlans[key] || {};
        const keepFull = keepFullSet[String(key)] === true;
        compactPlans[key] = this._compactCandidatePlan(plan, { keepPlacements: keepFull });
        if (!keepFull) summary.compactedCandidatePlans += 1;
      }
      layout.theoreticalCandidatePlans = compactPlans;
    }

    if (pipeline && pipeline.results && typeof pipeline.results === 'object') {
      const compactResults = {};
      for (const key in pipeline.results) {
        if (!keepSet[String(key)]) {
          summary.removedPipelineResults += 1;
          continue;
        }
        const result = pipeline.results[key] || {};
        compactResults[key] = {
          index: typeof result.index === 'number' ? result.index : Number(key),
          weightedScore: Number(result.weightedScore || 0),
          weightedMetrics: result.weightedMetrics || {},
          weightedContributions: result.weightedContributions || {},
          validation: result.validation || [],
          defenseScore: Number(result.defenseScore || 0),
          completedAt: Number(result.completedAt || 0),
        };
      }
      pipeline.results = compactResults;
      if (Array.isArray(pipeline.candidates)) {
        pipeline.candidates = pipeline.candidates.filter((candidate) => {
          return candidate && typeof candidate.index === 'number' && keepSet[String(candidate.index)];
        });
      }
    }

    if (layout.pipelineRuns && typeof layout.pipelineRuns === 'object') {
      const runIds = Object.keys(layout.pipelineRuns);
      if (runIds.length > 0) {
        let keepRunId = options.runId || (pipeline && pipeline.runId) || null;
        if (!keepRunId) {
          keepRunId = runIds.sort((a, b) => {
            const ra = layout.pipelineRuns[a] || {};
            const rb = layout.pipelineRuns[b] || {};
            return Number(rb.createdAt || 0) - Number(ra.createdAt || 0);
          })[0];
        }
        const topResults = pipeline && pipeline.results ? pipeline.results : {};
        const compact = this._compactPipelineRun(layout.pipelineRuns[keepRunId], topResults, winnerIndex);
        const compactRuns = {};
        if (compact) compactRuns[keepRunId] = compact;
        summary.removedPipelineRuns = Math.max(0, runIds.length - Object.keys(compactRuns).length);
        layout.pipelineRuns = compactRuns;
        summary.keptPipelineRuns = Object.keys(compactRuns).length;
      }
    }

    summary.removedTotal =
      summary.removedCandidates +
      summary.removedCandidatePlans +
      summary.removedPipelineResults +
      summary.removedPipelineRuns;
    if (layout.theoretical && pipeline && pipeline.status === 'completed') {
      layout.theoretical = compactCompletedTheoreticalState(layout.theoretical);
    }
    const resolvedDisplayIndex = this._resolveDisplayedCandidateIndex(roomMem);
    if (resolvedDisplayIndex !== null) {
      layout.currentDisplayCandidateIndex = resolvedDisplayIndex;
      if (layout.theoretical) {
        layout.theoretical.currentlyViewingCandidate = resolvedDisplayIndex;
      }
    }
    layout.memTrimLast = summary;
    if (!Memory.stats) Memory.stats = {};
    Memory.stats.memTrimLast = summary;
    return summary;
  },

  resetRoomPlan(roomName, options = {}) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    const mem = Memory.rooms[roomName];
    htm.init();

    this._clearTheoreticalPlanningTasks(roomName);
    const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
    if (container && Array.isArray(container.tasks)) {
      for (let i = container.tasks.length - 1; i >= 0; i--) {
        const task = container.tasks[i];
        if (
          task.name === 'BUILD_CLUSTER' ||
          task.name === 'BUILD_LAYOUT_PART' ||
          task.name === PLAN_LAYOUT_PARENT_TASK ||
          task.name === PLAN_LAYOUT_CANDIDATE_TASK
        ) {
          container.tasks.splice(i, 1);
        }
      }
    }

    delete mem.layout;
    if (options.scrubDistanceTransform !== false) {
      delete mem.distanceTransform;
    }
  },

  _resolveRecalculateDebugOptions(options = {}) {
    const phaseFrom = normalizePhase(options.phaseFrom, 1);
    const phaseTo = normalizePhase(options.phaseTo, 11);
    const from = Math.min(phaseFrom, phaseTo);
    const to = Math.max(phaseFrom, phaseTo);
    const subPhaseRaw = options.subPhase ? String(options.subPhase).toLowerCase() : null;
    const subPhaseMap = {
      foundation: { from: 1, to: 4 },
      placement: { from: 5, to: 8 },
      evaluation: { from: 9, to: 10 },
      persist: { from: 11, to: 11 },
      all: { from: 1, to: 11 },
    };
    const mapped = subPhaseRaw && subPhaseMap[subPhaseRaw] ? subPhaseMap[subPhaseRaw] : null;
    return {
      phaseFrom: mapped ? mapped.from : from,
      phaseTo: mapped ? mapped.to : to,
      subPhase: mapped ? subPhaseRaw : null,
      fullReset: (mapped ? mapped.from : from) <= 3,
    };
  },

  _resetTheoreticalFromPhase(roomName, debugOptions, options = {}) {
    htm.init();
    const mem = Memory.rooms && Memory.rooms[roomName];
    if (!mem || !mem.layout) return false;
    const layout = mem.layout;
    const pipeline = layout.theoreticalPipeline;
    if (!pipeline || !Array.isArray(pipeline.candidates) || !pipeline.candidates.length) {
      return false;
    }

    pipeline.stopAtPhase = typeof options.stopAtPhase === 'number' ? options.stopAtPhase : 11;

    if (debugOptions.phaseFrom <= 8) {
      pipeline.results = {};
      pipeline.bestCandidateIndex = null;
      pipeline.activeCandidate = null;
      pipeline.activeCandidateIndex = null;
      pipeline.lastResultsDone = 0;
      pipeline.lastProgressTick = Game.time;
      pipeline.status = 'running';
      pipeline.updatedAt = Game.time;
      delete pipeline.completedAt;
      layout.theoreticalCandidatePlans = {};
      this._clearTheoreticalPlanningTasks(roomName);
      htm.addColonyTask(
        roomName,
        PLAN_LAYOUT_PARENT_TASK,
        { roomName, runId: pipeline.runId, candidateCount: pipeline.candidateCount },
        0,
        2000,
        1,
        'layoutPlanner',
        { module: 'layoutPlanner' },
        { allowDuplicate: true, expectedCpu: EXPECTED_CPU_PARENT_TASK },
      );
      for (const candidate of pipeline.candidates) {
        htm.addColonyTask(
          roomName,
          PLAN_LAYOUT_CANDIDATE_TASK,
          { roomName, runId: pipeline.runId, candidateIndex: candidate.index, anchor: candidate.anchor },
          1,
          2000,
          1,
          'layoutPlanner',
          { module: 'layoutPlanner' },
          {
            parentTaskId: pipeline.runId,
            subOrder: candidate.index,
            allowDuplicate: true,
            expectedCpu: EXPECTED_CPU_CANDIDATE_TASK,
          },
        );
      }
    }

    if (debugOptions.phaseFrom >= 9) {
      pipeline.status = 'running';
      pipeline.updatedAt = Game.time;
      pipeline.activeCandidate = null;
      pipeline.activeCandidateIndex = null;
      delete pipeline.completedAt;
      if (debugOptions.phaseFrom >= 10) {
        pipeline.bestCandidateIndex = null;
      }
    }

    layout.theoretical = Object.assign({}, layout.theoretical || {}, {
      planningStatus: 'running',
      checklist: this._buildTheoreticalChecklist(roomName, pipeline, pipeline.candidates),
      debug: {
        phaseFrom: debugOptions.phaseFrom,
        phaseTo: debugOptions.phaseTo,
        subPhase: debugOptions.subPhase,
      },
    });

    if (options.scrubDistanceTransform) delete mem.distanceTransform;
    return true;
  },


  initializeManualPhaseRun(roomName, basePhaseTo = 4, basePhaseFrom = 1) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return false;
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    const mem = Memory.rooms[roomName];
    if (!mem.layout) mem.layout = {};

    const mapped = mapBasePhaseToDebugWindow(basePhaseFrom, basePhaseTo);
    mem.layout.manualPhaseRequest = {
      baseFrom: mapped.baseFrom,
      baseTo: mapped.baseTo,
      phaseFrom: mapped.debugFrom,
      phaseTo: mapped.debugTo,
      initializedAt: Game.time,
    };
    return true;
  },

  recalculateRoom(roomName, options = {}) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return false;

    const debugOptions = this._resolveRecalculateDebugOptions(options);
    if (debugOptions.fullReset) {
      this.resetRoomPlan(roomName, options);
      this.buildTheoreticalLayout(roomName);
      return true;
    }

    const resumed = this._resetTheoreticalFromPhase(roomName, debugOptions, {
      scrubDistanceTransform: options.scrubDistanceTransform,
      stopAtPhase: options.stopAtPhase,
    });
    if (!resumed) {
      this.resetRoomPlan(roomName, options);
    }
    this.buildTheoreticalLayout(roomName);
    return true;
  },

  _applyTheoreticalPlacements(layoutMem, generated, options = {}) {
    if (!layoutMem || !generated || !Array.isArray(generated.placements)) return;
    layoutMem.matrix = {};
    layoutMem.reserved = {};
    layoutMem.roadMatrix = {};
    layoutMem.status = layoutMem.status || { clusters: {}, structures: {} };
    layoutMem.mode = options.mode || layoutMem.mode || 'theoretical';
    layoutMem.baseAnchor = { x: generated.anchor.x, y: generated.anchor.y };

    for (const placement of generated.placements) {
      const { x, y, type, rcl, tag } = placement;
      if (type === ROAD_TYPE) {
        if (!layoutMem.roadMatrix[x]) layoutMem.roadMatrix[x] = {};
        layoutMem.roadMatrix[x][y] = tag ? { rcl: rcl || 1, tag } : { rcl: rcl || 1 };
      }
      if (!layoutMem.matrix[x]) layoutMem.matrix[x] = {};
      if (layoutMem.matrix[x][y] && layoutMem.matrix[x][y].structureType !== ROAD_TYPE) {
        continue;
      }
      layoutMem.matrix[x][y] = tag
        ? { structureType: type, rcl: rcl || 1, tag }
        : { structureType: type, rcl: rcl || 1 };
      if (!layoutMem.reserved[x]) layoutMem.reserved[x] = {};
      layoutMem.reserved[x][y] = true;
    }
  },

  _resolveDisplayedCandidateIndex(mem) {
    if (!mem || !mem.layout) return null;
    const plans = mem.layout.theoreticalCandidatePlans || {};
    const available = Object.keys(plans)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (!available.length) return null;
    const renderable = available.filter((index) => hasRenderableCandidatePlacements(plans[String(index)]));

    const preferred =
      Memory &&
      Memory.settings &&
      typeof Memory.settings.layoutCandidateOverlayIndex === 'number'
        ? Memory.settings.layoutCandidateOverlayIndex
        : -1;

    if (preferred >= 0 && renderable.includes(preferred)) {
      return preferred;
    }

    const selected =
      mem.layout.theoretical &&
      typeof mem.layout.theoretical.selectedCandidateIndex === 'number'
        ? mem.layout.theoretical.selectedCandidateIndex
        : null;

    if (selected !== null && renderable.includes(selected)) {
      return selected;
    }

    if (renderable.length) return renderable[0];
    if (preferred >= 0 && available.includes(preferred)) {
      return preferred;
    }
    if (preferred === -1 && selected !== null && available.includes(selected)) {
      return selected;
    }
    return available[0];
  },

  _refreshTheoreticalDisplay(roomName, force = false) {
    const mem = Memory.rooms && Memory.rooms[roomName];
    if (!mem || !mem.layout) return;
    const layout = mem.layout;
    const candidateIndex = this._resolveDisplayedCandidateIndex(mem);
    if (candidateIndex === null) return;
    if (!force && layout.currentDisplayCandidateIndex === candidateIndex) {
      return;
    }

    const plan = layout.theoreticalCandidatePlans
      ? layout.theoreticalCandidatePlans[candidateIndex]
      : null;
    if (!plan || !Array.isArray(plan.placements)) return;

    this._applyTheoreticalPlacements(layout, {
      anchor: plan.anchor || { x: 25, y: 25 },
      placements: plan.placements,
    }, { candidateIndex });
    layout.currentDisplayCandidateIndex = candidateIndex;
    if (layout.theoretical) {
      layout.theoretical.currentlyViewingCandidate = candidateIndex;
    }
  },

  _buildTheoreticalChecklist(roomName, pipeline, candidateRows, options = {}) {
    const total = pipeline && typeof pipeline.candidateCount === 'number' ? pipeline.candidateCount : 0;
    const done = pipeline && pipeline.results ? Object.keys(pipeline.results).length : 0;
    const hasWinner = pipeline && typeof pipeline.bestCandidateIndex === 'number';
    const finalized = pipeline && pipeline.status === 'completed';
    const roomMem = Memory.rooms && Memory.rooms[roomName] ? Memory.rooms[roomName] : {};
    const dtReady = Array.isArray(roomMem.distanceTransform) && roomMem.distanceTransform.length >= 2500;
    const scanned =
      pipeline &&
      pipeline.candidateSet &&
      typeof pipeline.candidateSet.totalCandidates === 'number' &&
      pipeline.candidateSet.totalCandidates > 0;
    const filtered =
      pipeline &&
      pipeline.candidateSet &&
      typeof pipeline.candidateSet.filteredCandidates === 'number'
        ? pipeline.candidateSet.filteredCandidates
        : total;
    const scannedCandidates =
      pipeline &&
      pipeline.candidateSet &&
      typeof pipeline.candidateSet.scannedCandidates === 'number'
        ? pipeline.candidateSet.scannedCandidates
        : 0;
    const fallbackUsed =
      pipeline && pipeline.candidateSet ? Boolean(pipeline.candidateSet.fallbackUsed) : false;
    const progress = total > 0 ? `${done}/${total}` : 'X';
    const persisted = options.persisted === true || finalized;
    const candidatePlans =
      roomMem &&
      roomMem.layout &&
      roomMem.layout.theoreticalCandidatePlans &&
      typeof roomMem.layout.theoreticalCandidatePlans === 'object'
        ? roomMem.layout.theoreticalCandidatePlans
        : {};
    const completedPlans = Object.keys(candidatePlans)
      .map((index) => candidatePlans[index])
      .filter((plan) => plan && Array.isArray(plan.placements));
    const foundationCoreCount = completedPlans.reduce((sum, plan) => {
      const debug = plan.foundationDebug || {};
      return sum + Number(debug.coreStructuresPlaced || 0);
    }, 0);
    const sourceContainerCount = completedPlans.reduce((sum, plan) => {
      const debug = plan.sourceResourceDebug || {};
      return sum + Number(debug.sourceContainersPlaced || 0);
    }, 0);
    const sourceLinkCount = completedPlans.reduce((sum, plan) => {
      const debug = plan.sourceResourceDebug || {};
      return sum + Number(debug.sourceLinksPlaced || 0);
    }, 0);
    const sourceRouteConnected = completedPlans.reduce((sum, plan) => {
      const debug = plan.sourceResourceDebug || {};
      return sum + Number(debug.sourceRoutesConnected || 0);
    }, 0);
    const sourceRouteTarget = completedPlans.reduce((sum, plan) => {
      const debug = plan.sourceResourceDebug || {};
      return sum + Number(debug.sourceRouteTargets || 0);
    }, 0);
    const mineralContainerCount = completedPlans.reduce((sum, plan) => {
      const debug = plan.sourceResourceDebug || {};
      return sum + Number(debug.mineralContainerPlaced || 0);
    }, 0);
    const mineralRouteTarget = completedPlans.reduce((sum, plan) => {
      const debug = plan.sourceResourceDebug || {};
      return sum + Number(debug.mineralRouteTarget || 0);
    }, 0);
    const mineralRouteConnected = completedPlans.reduce((sum, plan) => {
      const debug = plan.sourceResourceDebug || {};
      return sum + Number(debug.mineralRouteConnected || 0);
    }, 0);
    const validDebugSample = completedPlans.length > 0
      ? completedPlans[completedPlans.length - 1].validStructurePositions || {}
      : {};
    const refinement = pipeline && pipeline.refinement ? pipeline.refinement : null;
    const candidateStates = (candidateRows || []).map((candidate) => {
      const complete =
        pipeline &&
        pipeline.results &&
        pipeline.results[candidate.index] &&
        pipeline.results[candidate.index].completedAt;
      const active = pipeline && pipeline.activeCandidateIndex === candidate.index;
      return {
        index: candidate.index,
        complete: Boolean(complete),
        active: Boolean(active),
      };
    });

    const phaseWindow = readPhaseWindow();
    const recalcScope = readRecalcScope();
    const filterDetail = fallbackUsed
      ? 'Only Controller Seed (fallback)'
      : !scanned
      ? 'Candidate scan pending'
      : filtered <= 1
      ? 'Single viable seed after filter'
      : `${filtered}/${Math.max(scannedCandidates, filtered)} seeds kept`;
    const stages = [
      {
        number: 1,
        label: 'Distance Transform',
        status: dtReady ? 'done' : 'pending',
        progress: dtReady ? '✔' : 'X',
        detail: dtReady ? 'Distance map cached' : 'Distance map missing',
      },
      {
        number: 2,
        label: 'Candidate Filter',
        status: scanned ? 'done' : 'pending',
        progress: scanned ? `✔ ${filtered}` : 'X',
        detail: filterDetail,
      },
      {
        number: 3,
        label: 'Candidate Pre-Scoring',
        status: total > 0 ? 'done' : 'pending',
        progress: total > 0 ? `✔ ${total}` : 'X',
        detail: total > 0 ? `Top ${total} seeds scored` : 'No seeds scored yet',
      },
      {
        number: 4,
        label: 'Core + Foundations',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          total > 0
            ? done > 0
              ? `Core placed ${foundationCoreCount} (sum over ${done} candidates)`
              : `Working ${progress}`
            : 'Awaiting candidates',
      },
      {
        number: 5,
        label: 'Sources + Resources',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          total > 0
            ? done > 0
              ? `Containers ${sourceContainerCount}, links ${sourceLinkCount}, routes ${sourceRouteConnected}/${Math.max(sourceRouteTarget, 0)}`
                + `, mineral ${mineralContainerCount} route ${mineralRouteConnected}/${Math.max(mineralRouteTarget, 0)}`
              : `Working ${progress}`
            : 'Awaiting candidates',
      },
      {
        number: 6,
        label: 'Valid Positions (rough)',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          done > 0
            ? `candidates:${Number(validDebugSample.totalCandidates || 0)} pattern:${Number(validDebugSample.patternStructure || 0)} walkable:${Number(validDebugSample.walkable || 0)}`
            : 'Awaiting candidates',
      },
      {
        number: 7,
        label: 'Valid Positions (fine)',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          done > 0
            ? `structureClear:${Number(validDebugSample.structureClear || 0)} adjacentRoad:${Number(validDebugSample.adjacentRoad || 0)} canPlace:${Number(validDebugSample.canPlace || 0)}`
            : 'Awaiting candidates',
      },
      {
        number: 8,
        label: 'Road Network Evaluation',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          total > 0 ? (done >= total ? 'Road tags + connectivity evaluated' : `Working ${progress}`) : 'Awaiting candidates',
      },
      {
        number: 9,
        label: 'End Evaluation (Weighted)',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail: buildRefinementDetail(refinement, done, total),
      },
      {
        number: 10,
        label: 'Winner Selection',
        status: hasWinner ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: hasWinner ? '✔' : done > 0 ? `${done}/${Math.max(total, 1)}` : 'X',
        detail: hasWinner ? `Winner: C${pipeline.bestCandidateIndex + 1}` : 'No winner selected',
      },
      {
        number: 11,
        label: 'Persist + Overlay',
        status: persisted ? 'done' : hasWinner ? 'in_progress' : 'pending',
        progress: persisted ? '✔' : hasWinner ? '10/11' : 'X',
        detail: persisted ? 'Plan persisted and rendered' : hasWinner ? 'Persist queued' : 'Waiting for winner',
      },
    ].map((stage) =>
      Object.assign({}, stage, {
        activeInDebugWindow: stage.number >= phaseWindow.from && stage.number <= phaseWindow.to,
      }),
    );

    return {
      stages,
      candidateStates,
      summary: { done, total, finalized },
      debug: {
        phaseWindow,
        recalcScope,
      },
    };
  },

  _writeTheoreticalLayoutFromPlan(room, generated, pipeline) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
    const mem = Memory.rooms[room.name];
    if (!mem.layout) mem.layout = {};
    generated.meta = generated.meta || {};
    generated.meta.refinementDebug = summarizeRefinement(pipeline && pipeline.refinement);
    generated.meta.fullSelectionRerank =
      pipeline && pipeline.fullSelectionRerank ? pipeline.fullSelectionRerank : null;
    const selectedResult =
      pipeline &&
      pipeline.results &&
      typeof pipeline.bestCandidateIndex === 'number' &&
      pipeline.results[pipeline.bestCandidateIndex]
        ? pipeline.results[pipeline.bestCandidateIndex]
        : null;
    if (selectedResult && typeof selectedResult.weightedScore === 'number') {
      generated.evaluation = Object.assign({}, generated.evaluation || {}, {
        rawWeightedScore:
          typeof selectedResult.rawWeightedScore === 'number'
            ? selectedResult.rawWeightedScore
            : generated.evaluation && typeof generated.evaluation.weightedScore === 'number'
              ? generated.evaluation.weightedScore
              : 0,
        selectionPenalty: Number(selectedResult.selectionPenalty || 0),
        weightedScore: Number(selectedResult.weightedScore || 0),
      });
    }
    const planMode = 'theoretical';
    mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
    this._applyTheoreticalPlacements(mem.layout, generated, {
      candidateIndex: pipeline.bestCandidateIndex,
      mode: planMode,
    });

    const spawnCandidate = generated.placements.find((p) => p.type === SPAWN_TYPE);
    const controllerContainer = generated.placements.find((p) => p.tag === 'controller.container');
    const sourceContainers = generated.placements.filter(
      (p) => p.tag && p.tag.startsWith('source.container.'),
    );
    const candidateRows = (pipeline.candidates || []).map((candidate) => {
      const result = pipeline.results && pipeline.results[candidate.index];
      return {
        index: candidate.index,
        anchor: candidate.anchor,
        initialScore: candidate.initialScore,
        initialMetrics: candidate.initialMetrics,
        initialContributions: candidate.initialContributions,
        weightedScore: result ? result.weightedScore : null,
        weightedMetrics: result ? result.weightedMetrics : null,
        weightedContributions: result ? result.weightedContributions : null,
        selectionRejected: result ? result.selectionRejected === true : false,
        hardRejectFlags: result ? result.hardRejectFlags || [] : [],
        validation: result ? result.validation : [],
        defenseScore: result ? result.defenseScore : 0,
        completedAt: result ? result.completedAt : null,
        selected: result ? result.index === pipeline.bestCandidateIndex : false,
      };
    });

    const selectedEvaluation = generated.evaluation || {};
    const checklist = this._buildTheoreticalChecklist(
      room.name,
      pipeline,
      pipeline.candidates || [],
      { persisted: true },
    );

    mem.layout.theoreticalCandidatePlans[pipeline.bestCandidateIndex] = {
      index: pipeline.bestCandidateIndex,
      anchor: { x: generated.anchor.x, y: generated.anchor.y },
      placements: generated.placements,
      weightedScore: selectedEvaluation.weightedScore || 0,
      rawWeightedScore:
        typeof selectedEvaluation.rawWeightedScore === 'number'
          ? selectedEvaluation.rawWeightedScore
          : selectedEvaluation.weightedScore || 0,
      selectionPenalty: Number(selectedEvaluation.selectionPenalty || 0),
      weightedMetrics: selectedEvaluation.metrics || {},
      weightedContributions: selectedEvaluation.contributions || {},
      validation: generated.meta.validation || [],
      stampStats: generated.meta.stampStats || {},
      stampPruning: generated.meta.stampPruning || {},
      sourceLogistics: generated.meta.sourceLogistics || {},
      foundationDebug: generated.meta.foundationDebug || {},
      sourceResourceDebug: generated.meta.sourceResourceDebug || {},
      logisticsRoutes: generated.meta.logisticsRoutes || {},
      labPlanning: generated.meta.labPlanning || {},
      structurePlanning: generated.meta.structurePlanning || {},
      refinementDebug: generated.meta.refinementDebug || {},
      validStructurePositions: generated.meta.validStructurePositions || {},
      defenseScore: generated.meta.defenseScore || 0,
      completedAt: Game.time,
      refinementInput: null,
    };

    mem.layout.theoretical = compactCompletedTheoreticalState({
      controllerPos: { x: room.controller.pos.x, y: room.controller.pos.y },
      spawnCandidate: spawnCandidate
        ? {
            x: spawnCandidate.x,
            y: spawnCandidate.y,
            score: generated.anchor.score || 0,
          }
        : null,
      upgraderSlots: generated.meta.upgraderSlots || [],
      controllerContainer: controllerContainer || null,
      sourceContainers,
      foundationDebug: generated.meta.foundationDebug || {},
      sourceResourceDebug: generated.meta.sourceResourceDebug || {},
      logisticsRoutes: generated.meta.logisticsRoutes || {},
      labPlanning: generated.meta.labPlanning || {},
      structurePlanning: generated.meta.structurePlanning || {},
      refinementDebug: generated.meta.refinementDebug || {},
      fullSelectionRerank: generated.meta.fullSelectionRerank || {},
      wallDistance: generated.analysis.dt || [],
      controllerDistance: toArrayMap(generated.analysis.controllerDistance || {}),
      floodScore: Array.isArray(generated.analysis.flood) ? generated.analysis.flood.length : 0,
      floodTiles: Array.isArray(generated.analysis.flood)
        ? generated.analysis.flood.map((tile) => ({ x: tile.x, y: tile.y, d: tile.d }))
        : [],
      mincutProxy: generated.placements.filter((p) => p.type === RAMPART_TYPE).length,
      validation: generated.meta.validation || [],
      validStructurePositions: generated.meta.validStructurePositions || {},
      structurePlanning: generated.meta.structurePlanning || {},
      refinementDebug: generated.meta.refinementDebug || {},
      selectedCandidateIndex: pipeline.bestCandidateIndex,
      selectedWeightedScore: selectedEvaluation.weightedScore || 0,
      selectedMetrics: selectedEvaluation.metrics || {},
      selectedContributions: selectedEvaluation.contributions || {},
      evaluationWeights: selectedEvaluation.weights || {},
      candidates: candidateRows,
      candidateSet: pipeline.candidateSet || {},
      checklist,
      planningRunId: pipeline.runId,
      planningStatus: 'completed',
      generatedAt: Game.time,
    });
    mem.layout.theoretical.currentlyViewingCandidate =
      typeof mem.layout.currentDisplayCandidateIndex === 'number'
        ? mem.layout.currentDisplayCandidateIndex
        : pipeline.bestCandidateIndex;
    mem.layout.planVersion = 2;
    mem.layout.mode = planMode;
    persistBasePlan(room.name, generated, pipeline);
    this._refreshTheoreticalDisplay(room.name, true);
  },

  _initializeTheoreticalPipeline(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return null;
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    const mem = Memory.rooms[roomName];
    if (!mem.layout) mem.layout = {};

    const topN = normalizeTopN(
      readNumberSetting('layoutPlanningTopCandidates', DEFAULT_THEORETICAL_TOP_N),
    );
    const harabiStages = readTheoreticalHarabiStages();
    const candidateSet = buildCompendium.buildCandidateSet(roomName, {
      topN,
      extensionPattern: readLayoutPattern(),
      harabiStage: harabiStages.requested,
    });
    if (!candidateSet || !Array.isArray(candidateSet.candidates) || !candidateSet.candidates.length) {
      return null;
    }

    const runId = `${roomName}:${Game.time}`;
    const manualRequest = mem.layout.manualPhaseRequest || null;
    const refinementSettings = readRefinementSettings();
    const runtimeMode =
      Memory && Memory.settings && typeof Memory.settings.runtimeMode === 'string'
        ? String(Memory.settings.runtimeMode).toLowerCase()
        : 'live';
    const refinementEnabled = refinementSettings.enabled === true && runtimeMode === 'theoretical';
    const pipeline = {
      runId,
      status: 'running',
      startedAt: Game.time,
      updatedAt: Game.time,
      completedAt: null,
      bestCandidateIndex: null,
      activeCandidate: null,
      activeCandidateIndex: null,
      lastProgressTick: Game.time,
      lastResultsDone: 0,
      candidateCount: candidateSet.candidates.length,
      requestedHarabiStage: harabiStages.requested,
      candidateHarabiStage: harabiStages.candidate,
      finalHarabiStage: harabiStages.final,
      stopAtPhase:
        manualRequest && typeof manualRequest.phaseTo === 'number'
          ? manualRequest.phaseTo
          : 11,
      candidateSet: {
        topN,
        dtThreshold: candidateSet.dtThreshold,
        totalCandidates: candidateSet.totalCandidates,
        filteredCandidates: candidateSet.filteredCandidates,
        swampRatio: candidateSet.swampRatio,
        fallbackUsed: candidateSet.fallbackUsed,
        requestedHarabiStage: harabiStages.requested,
        candidateHarabiStage: harabiStages.candidate,
        finalHarabiStage: harabiStages.final,
      },
      candidates: candidateSet.candidates.map((candidate) => ({
        index: candidate.index,
        anchor: candidate.anchor,
        initialScore: candidate.initialScore,
        initialMetrics: candidate.initialMetrics,
        initialContributions: candidate.initialContributions,
      })),
      results: {},
      refinement: {
        enabled: refinementEnabled,
        status: refinementEnabled ? 'pending' : refinementSettings.enabled ? 'disabled-runtime' : 'disabled',
        seedIndices: [],
        generation: 0,
        maxGenerations: refinementSettings.maxGenerations,
        variantsPerGeneration: refinementSettings.variantsPerGeneration,
        attemptedMutations: 0,
        acceptedMutations: 0,
        bestScoreBefore: 0,
        bestScoreAfter: 0,
        improvementPct: 0,
        minBucket: refinementSettings.minBucket,
        topSeeds: refinementSettings.topSeeds,
        history: [],
      },
      expectedCpu: {
        parentTask: EXPECTED_CPU_PARENT_TASK,
        candidateTask: EXPECTED_CPU_CANDIDATE_TASK,
        fullPreview: EXPECTED_CPU_FULL_PREVIEW,
        refinementVariant: EXPECTED_CPU_REFINEMENT_VARIANT,
      },
    };

    mem.layout.theoreticalPipeline = pipeline;
    mem.layout.theoreticalCandidatePlans = {};
    mem.layout.theoretical = {
      controllerPos: { x: room.controller.pos.x, y: room.controller.pos.y },
      selectedCandidateIndex: null,
      selectedWeightedScore: 0,
      selectedMetrics: {},
      selectedContributions: {},
      evaluationWeights: {},
      candidates: pipeline.candidates.map((candidate) => ({
        index: candidate.index,
        anchor: candidate.anchor,
        initialScore: candidate.initialScore,
        initialMetrics: candidate.initialMetrics,
        initialContributions: candidate.initialContributions,
        weightedScore: null,
        weightedMetrics: null,
        weightedContributions: null,
        validation: [],
        defenseScore: 0,
        completedAt: null,
        selected: false,
      })),
      candidateSet: pipeline.candidateSet,
      checklist: this._buildTheoreticalChecklist(roomName, pipeline, pipeline.candidates),
      generatedAt: Game.time,
      currentlyViewingCandidate: 0,
      planningRunId: runId,
      planningStatus: 'running',
    };
    mem.layout.planVersion = 2;
    this._clearTheoreticalPlanningTasks(roomName);

    htm.addColonyTask(
      roomName,
      PLAN_LAYOUT_PARENT_TASK,
      {
        roomName,
        runId,
        candidateCount: pipeline.candidateCount,
      },
      0,
      2000,
      1,
      'layoutPlanner',
      { module: 'layoutPlanner' },
      { allowDuplicate: true, expectedCpu: EXPECTED_CPU_PARENT_TASK },
    );

    for (const candidate of pipeline.candidates) {
      htm.addColonyTask(
        roomName,
        PLAN_LAYOUT_CANDIDATE_TASK,
        {
          roomName,
          runId,
          candidateIndex: candidate.index,
          anchor: candidate.anchor,
        },
        1,
        2000,
        1,
        'layoutPlanner',
        { module: 'layoutPlanner' },
        {
          parentTaskId: runId,
          subOrder: candidate.index,
          allowDuplicate: true,
          expectedCpu: EXPECTED_CPU_CANDIDATE_TASK,
        },
      );
    }

    return pipeline;
  },

  _initializeRefinementIfNeeded(pipeline, ranked) {
    if (!pipeline || !Array.isArray(ranked)) return;
    const refinement = pipeline.refinement || null;
    if (!refinement || refinement.enabled !== true) return;
    if (Array.isArray(refinement.seedIndices) && refinement.seedIndices.length > 0) return;
    const topSeeds = Math.max(1, Math.min(5, Number(refinement.topSeeds || DEFAULT_REFINEMENT_TOP_SEEDS)));
    const seeds = ranked
      .slice(0, topSeeds)
      .map((entry) => Number(entry.index))
      .filter((idx) => Number.isFinite(idx));
    refinement.seedIndices = seeds;
    refinement.bestScoreBefore = ranked.length > 0 ? Number(ranked[0].weightedScore || 0) : 0;
    refinement.bestScoreAfter = refinement.bestScoreBefore;
    refinement.status = seeds.length > 0 ? 'running' : 'done';
  },

  _runRefinementStep(roomName, pipeline, mem) {
    if (!pipeline || !mem || !mem.layout) return;
    const refinement = pipeline.refinement || null;
    if (!refinement || refinement.enabled !== true) return;
    if (refinement.status !== 'running') return;
    const candidateHarabiStage =
      pipeline && typeof pipeline.candidateHarabiStage === 'string'
        ? pipeline.candidateHarabiStage
        : readTheoreticalHarabiStages().candidate;
    const minBucket = Number(refinement.minBucket || DEFAULT_REFINEMENT_MIN_BUCKET);
    const bucket = typeof Game.cpu.bucket === 'number' ? Game.cpu.bucket : 0;
    if (bucket < minBucket) {
      refinement.status = 'skipped-bucket';
      refinement.skipReason = 'bucket';
      return;
    }
    const maxGenerations = Math.max(1, Number(refinement.maxGenerations || DEFAULT_REFINEMENT_MAX_GENERATIONS));
    const variantsPerGeneration = Math.max(
      1,
      Number(refinement.variantsPerGeneration || DEFAULT_REFINEMENT_VARIANTS_PER_GENERATION),
    );
    const seedIndices = Array.isArray(refinement.seedIndices) ? refinement.seedIndices : [];
    if (!seedIndices.length) {
      refinement.status = 'done';
      return;
    }

    const cpuLimit = typeof Game.cpu.limit === 'number' ? Game.cpu.limit : 20;
    const softCeiling = cpuLimit + Math.max(0, Math.min(120, Math.floor((bucket - minBucket) / 20)));
    const startGen = Number(refinement.generation || 0);
    for (let generation = startGen; generation < maxGenerations; generation++) {
      if (typeof Game.cpu.getUsed === 'function' && Game.cpu.getUsed() >= softCeiling) break;
      for (const seedIndex of seedIndices) {
        if (typeof Game.cpu.getUsed === 'function' && Game.cpu.getUsed() >= softCeiling) break;
        const baseCandidate = (pipeline.candidates || []).find((row) => row && row.index === seedIndex);
        if (!baseCandidate || !baseCandidate.anchor) continue;
        for (let variant = 0; variant < variantsPerGeneration; variant++) {
          if (typeof Game.cpu.getUsed === 'function' && Game.cpu.getUsed() >= softCeiling) break;
          const mutation = buildReplayMutation(seedIndex, generation, variant);
          refinement.attemptedMutations = Number(refinement.attemptedMutations || 0) + 1;
          const generated = buildCompendium.generatePlanForAnchor(roomName, baseCandidate.anchor, {
            candidateMeta: baseCandidate,
            extensionPattern: readLayoutPattern(),
            harabiStage: candidateHarabiStage,
            mutation,
          });
          if (!generated || !generated.evaluation) continue;
          generated.meta = generated.meta || {};
          const selectionEvaluation = applySelectionPenaltyToGeneratedPlan(generated);
          const newScore = selectionEvaluation.weightedScore;
          const current = pipeline.results && pipeline.results[seedIndex] ? pipeline.results[seedIndex] : null;
          const currentScore = current ? Number(current.weightedScore || 0) : -Infinity;
          if (!(newScore > currentScore)) continue;

          mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
          mem.layout.theoreticalCandidatePlans[seedIndex] = {
            index: seedIndex,
            anchor: { x: generated.anchor.x, y: generated.anchor.y },
            placements: generated.placements,
            weightedScore: newScore,
            rawWeightedScore: selectionEvaluation.rawWeightedScore,
            selectionPenalty: selectionEvaluation.selectionPenalty,
            selectionRejected: selectionEvaluation.selectionRejected,
            hardRejectFlags: selectionEvaluation.hardRejectFlags,
            weightedMetrics: generated.evaluation.metrics || {},
            weightedContributions: generated.evaluation.contributions || {},
            validation: generated.meta && generated.meta.validation ? generated.meta.validation : [],
            stampStats: generated.meta && generated.meta.stampStats ? generated.meta.stampStats : {},
            stampPruning:
              generated.meta && generated.meta.stampPruning ? generated.meta.stampPruning : {},
            sourceLogistics:
              generated.meta && generated.meta.sourceLogistics ? generated.meta.sourceLogistics : {},
            foundationDebug:
              generated.meta && generated.meta.foundationDebug ? generated.meta.foundationDebug : {},
            sourceResourceDebug:
              generated.meta && generated.meta.sourceResourceDebug ? generated.meta.sourceResourceDebug : {},
            logisticsRoutes:
              generated.meta && generated.meta.logisticsRoutes ? generated.meta.logisticsRoutes : {},
            labPlanning:
              generated.meta && generated.meta.labPlanning ? generated.meta.labPlanning : {},
            structurePlanning:
              generated.meta && generated.meta.structurePlanning ? generated.meta.structurePlanning : {},
            foundationSnapshot:
              generated.meta && generated.meta.foundationSnapshot
                ? generated.meta.foundationSnapshot
                : null,
            fullOptimization:
              generated.meta && generated.meta.fullOptimization
                ? generated.meta.fullOptimization
                : null,
            refinementDebug: summarizeRefinement(refinement),
            validStructurePositions:
              generated.meta && generated.meta.validStructurePositions
                ? generated.meta.validStructurePositions
                : {},
            defenseScore:
              generated.meta && typeof generated.meta.defenseScore === 'number'
                ? generated.meta.defenseScore
                : 0,
            completedAt: Game.time,
            refinementMutation: mutation,
            refinementInput: {
              anchor: { x: baseCandidate.anchor.x, y: baseCandidate.anchor.y },
              mutation,
            },
          };
          pipeline.results[seedIndex] = {
            index: seedIndex,
            weightedScore: newScore,
            rawWeightedScore: selectionEvaluation.rawWeightedScore,
            selectionPenalty: selectionEvaluation.selectionPenalty,
            selectionRejected: selectionEvaluation.selectionRejected,
            hardRejectFlags: selectionEvaluation.hardRejectFlags,
            weightedMetrics: generated.evaluation.metrics || {},
            weightedContributions: generated.evaluation.contributions || {},
            validation: generated.meta && generated.meta.validation ? generated.meta.validation : [],
            defenseScore:
              generated.meta && typeof generated.meta.defenseScore === 'number'
                ? generated.meta.defenseScore
                : 0,
            completedAt: Game.time,
            refined: true,
          };
          refinement.acceptedMutations = Number(refinement.acceptedMutations || 0) + 1;
          if (Array.isArray(refinement.history) && refinement.history.length < 40) {
            refinement.history.push({
              tick: Game.time,
              generation: generation + 1,
              seedIndex,
              variant: variant + 1,
              score: newScore,
            });
          }
        }
      }
      refinement.generation = generation + 1;
      if (refinement.generation >= maxGenerations) break;
    }
    refinement.bestScoreAfter = Math.max(
      Number(refinement.bestScoreBefore || 0),
      ...Object.values(pipeline.results || {}).map((result) => Number(result && result.weightedScore ? result.weightedScore : 0)),
    );
    const before = Number(refinement.bestScoreBefore || 0);
    const after = Number(refinement.bestScoreAfter || 0);
    if (before > 0) {
      refinement.improvementPct = ((after - before) / before) * 100;
    } else {
      refinement.improvementPct = after > 0 ? 100 : 0;
    }
    if (Number(refinement.generation || 0) >= maxGenerations) {
      refinement.status = 'done';
    }
  },

  _rankPipelineResults(results = {}) {
    return Object.values(results || {}).sort((a, b) => {
      const aRejected = a && a.selectionRejected === true ? 1 : 0;
      const bRejected = b && b.selectionRejected === true ? 1 : 0;
      if (aRejected !== bRejected) return aRejected - bRejected;
      const aScore = Number(a && a.weightedScore ? a.weightedScore : 0);
      const bScore = Number(b && b.weightedScore ? b.weightedScore : 0);
      if (bScore !== aScore) return bScore - aScore;
      return Number(a && a.index ? a.index : 0) - Number(b && b.index ? b.index : 0);
    });
  },

  _pickBestSelectableResult(ranked = []) {
    if (!Array.isArray(ranked) || ranked.length === 0) return null;
    return ranked.find((result) => !(result && result.selectionRejected === true)) || null;
  },

  _rerankTopCandidatesWithFullPlans(roomName, pipeline, mem, ranked = []) {
    if (!pipeline || !mem || !mem.layout) return Array.isArray(ranked) ? ranked : [];
    const requestedHarabiStage =
      typeof pipeline.requestedHarabiStage === 'string' ? pipeline.requestedHarabiStage : 'foundation';
    const candidateHarabiStage =
      typeof pipeline.candidateHarabiStage === 'string' ? pipeline.candidateHarabiStage : requestedHarabiStage;
    const finalHarabiStage =
      typeof pipeline.finalHarabiStage === 'string' ? pipeline.finalHarabiStage : requestedHarabiStage;
    if (
      requestedHarabiStage !== 'full' ||
      finalHarabiStage !== 'full' ||
      candidateHarabiStage === finalHarabiStage
    ) {
      return Array.isArray(ranked) ? ranked : this._rankPipelineResults(pipeline.results);
    }

    const rankedRows = Array.isArray(ranked) && ranked.length > 0
      ? ranked.slice()
      : this._rankPipelineResults(pipeline.results);
    if (rankedRows.length === 0) return rankedRows;

    const rerankCount = Math.max(
      1,
      Math.min(DEFAULT_FULL_SELECTION_RERANK_CANDIDATES, rankedRows.length),
    );
    // The finalist rerank is only a selection pass. Keep it on the cheap estimate-defense
    // path so we can compare practical candidates without running full minCut smoothing
    // multiple times in a single theoretical tick.
    const defensePlanningMode = readFullSelectionRerankDefensePlanningMode();
    mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
    const rerankedCandidates = [];

    for (let i = 0; i < rerankCount; i++) {
      const baseResult = rankedRows[i];
      if (!baseResult || typeof baseResult.index !== 'number') continue;
      const selectedCandidate = (pipeline.candidates || []).find((candidate) => candidate.index === baseResult.index);
      if (!selectedCandidate || !selectedCandidate.anchor) continue;
      const selectedPlan = mem.layout.theoreticalCandidatePlans[String(selectedCandidate.index)] || null;
      const refinementInput =
        selectedPlan &&
        selectedPlan.refinementInput &&
        selectedPlan.refinementInput.anchor &&
        selectedPlan.refinementInput.mutation
          ? selectedPlan.refinementInput
          : null;

      const generated = buildCompendium.generatePlanForAnchor(
        roomName,
        refinementInput && refinementInput.anchor ? refinementInput.anchor : selectedCandidate.anchor,
        {
          candidateMeta: selectedCandidate,
          extensionPattern: readLayoutPattern(),
          harabiStage: finalHarabiStage,
          defensePlanningMode,
          mutation: refinementInput ? refinementInput.mutation : null,
        },
      );
      if (!generated) continue;

      generated.meta = generated.meta || {};
      generated.meta.refinementDebug = summarizeRefinement(pipeline.refinement);
      const selectionEvaluation = applySelectionPenaltyToGeneratedPlan(generated);
      const validationSummary = selectionEvaluation.validationSummary;
      const rawWeightedScore = selectionEvaluation.rawWeightedScore;
      const rerankedScore = selectionEvaluation.weightedScore;

      pipeline.results[selectedCandidate.index] = {
        index: selectedCandidate.index,
        weightedScore: rerankedScore,
        rawWeightedScore,
        selectionScore: rerankedScore,
        selectionPenalty: validationSummary.penalty,
        selectionRejected: selectionEvaluation.selectionRejected,
        hardRejectFlags: selectionEvaluation.hardRejectFlags,
        weightedMetrics: generated.evaluation ? generated.evaluation.metrics || {} : {},
        weightedContributions: generated.evaluation ? generated.evaluation.contributions || {} : {},
        validation: generated.meta.validation || [],
        defenseScore:
          generated.meta && typeof generated.meta.defenseScore === 'number'
            ? generated.meta.defenseScore
            : 0,
        completedAt: Game.time,
        fullMaterialized: true,
        rerankedFromFoundationScore: Number(baseResult.weightedScore || 0),
      };

      mem.layout.theoreticalCandidatePlans[selectedCandidate.index] = {
        index: selectedCandidate.index,
        anchor: { x: generated.anchor.x, y: generated.anchor.y },
        placements: generated.placements,
        weightedScore: rerankedScore,
        rawWeightedScore,
        selectionPenalty: validationSummary.penalty,
        selectionRejected: selectionEvaluation.selectionRejected,
        hardRejectFlags: selectionEvaluation.hardRejectFlags,
        weightedMetrics: generated.evaluation ? generated.evaluation.metrics || {} : {},
        weightedContributions: generated.evaluation ? generated.evaluation.contributions || {} : {},
        validation: generated.meta.validation || [],
        stampStats: generated.meta.stampStats || {},
        stampPruning: generated.meta.stampPruning || {},
        sourceLogistics: generated.meta.sourceLogistics || {},
        foundationDebug: generated.meta.foundationDebug || {},
        sourceResourceDebug: generated.meta.sourceResourceDebug || {},
        logisticsRoutes: generated.meta.logisticsRoutes || {},
        labPlanning: generated.meta.labPlanning || {},
        structurePlanning: generated.meta.structurePlanning || {},
        foundationSnapshot: generated.meta.foundationSnapshot || null,
        fullOptimization: generated.meta.fullOptimization || null,
        refinementDebug: generated.meta.refinementDebug || {},
        validStructurePositions: generated.meta.validStructurePositions || {},
        defenseScore:
          generated.meta && typeof generated.meta.defenseScore === 'number'
            ? generated.meta.defenseScore
            : 0,
        completedAt: Game.time,
        refinementInput: refinementInput || null,
      };

      rerankedCandidates.push({
        index: selectedCandidate.index,
        foundationScore: Number(baseResult.weightedScore || 0),
        rawWeightedScore,
        weightedScore: rerankedScore,
        selectionPenalty: validationSummary.penalty,
        selectionRejected: selectionEvaluation.selectionRejected,
        criticalCount: validationSummary.criticalCount,
        majorCount: validationSummary.majorCount,
      });
    }

    const reranked = this._rankPipelineResults(pipeline.results);
    const bestSelectable = this._pickBestSelectableResult(reranked);
    pipeline.fullSelectionRerank = {
      enabled: rerankedCandidates.length > 0,
      defensePlanningMode,
      rerankedCount: rerankedCandidates.length,
      topN: rerankCount,
      selectedIndex: bestSelectable ? bestSelectable.index : null,
      candidates: rerankedCandidates,
      completedAt: Game.time,
    };
    return reranked;
  },

  _materializeTheoreticalFullPreview(roomName, pipeline, mem, selectedCandidate, selectedResult, options = {}) {
    if (!pipeline || !mem || !mem.layout || !selectedCandidate || !selectedCandidate.anchor) return false;
    const requestedHarabiStage =
      typeof pipeline.requestedHarabiStage === 'string' ? pipeline.requestedHarabiStage : 'foundation';
    const candidateHarabiStage =
      typeof pipeline.candidateHarabiStage === 'string' ? pipeline.candidateHarabiStage : requestedHarabiStage;
    const finalHarabiStage =
      typeof pipeline.finalHarabiStage === 'string' ? pipeline.finalHarabiStage : requestedHarabiStage;
    if (
      requestedHarabiStage !== 'full' ||
      finalHarabiStage !== 'full' ||
      candidateHarabiStage === finalHarabiStage
    ) {
      return false;
    }
    const refinementInput =
      options.refinementInput && typeof options.refinementInput === 'object'
        ? options.refinementInput
        : null;
    const defensePlanningMode = readTheoreticalDefensePlanningMode();
    const mutationKey = refinementMutationKey(refinementInput);
    if (
      pipeline.fullPreviewCandidateIndex === selectedCandidate.index &&
      String(pipeline.fullPreviewMutationKey || '') === mutationKey &&
      String(pipeline.fullPreviewDefensePlanningMode || '') === defensePlanningMode
    ) {
      return false;
    }

    const generated = buildCompendium.generatePlanForAnchor(
      roomName,
      refinementInput && refinementInput.anchor ? refinementInput.anchor : selectedCandidate.anchor,
      {
        candidateMeta: selectedCandidate,
        extensionPattern: readLayoutPattern(),
        harabiStage: finalHarabiStage,
        defensePlanningMode,
        mutation: refinementInput ? refinementInput.mutation : null,
      },
    );
    if (!generated) return false;
    generated.meta = generated.meta || {};
    generated.meta.refinementDebug = summarizeRefinement(pipeline.refinement);
    generated.meta.fullSelectionRerank = pipeline.fullSelectionRerank || null;
    if (selectedResult && typeof selectedResult.weightedScore === 'number') {
      generated.evaluation = Object.assign({}, generated.evaluation || {}, {
        rawWeightedScore:
          typeof selectedResult.rawWeightedScore === 'number'
            ? selectedResult.rawWeightedScore
            : generated.evaluation && typeof generated.evaluation.weightedScore === 'number'
              ? generated.evaluation.weightedScore
              : 0,
        selectionPenalty: Number(selectedResult.selectionPenalty || 0),
        weightedScore: Number(selectedResult.weightedScore || 0),
      });
    }
    persistBasePlan(roomName, generated, pipeline);
    const spawnCandidate = Array.isArray(generated.placements)
      ? generated.placements.find((p) => p.type === SPAWN_TYPE)
      : null;
    const controllerContainer = Array.isArray(generated.placements)
      ? generated.placements.find((p) => p.tag === 'controller.container')
      : null;
    const sourceContainers = Array.isArray(generated.placements)
      ? generated.placements.filter((p) => p.tag && p.tag.startsWith('source.container.'))
      : [];
    mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
    mem.layout.theoreticalCandidatePlans[selectedCandidate.index] = {
      index: selectedCandidate.index,
      anchor: { x: generated.anchor.x, y: generated.anchor.y },
      placements: generated.placements,
      weightedScore:
        selectedResult && typeof selectedResult.weightedScore === 'number'
          ? selectedResult.weightedScore
          : 0,
      weightedMetrics:
        selectedResult && selectedResult.weightedMetrics ? selectedResult.weightedMetrics : {},
      weightedContributions:
        selectedResult && selectedResult.weightedContributions
          ? selectedResult.weightedContributions
          : {},
      validation: generated.meta.validation || [],
      stampStats: generated.meta.stampStats || {},
      stampPruning: generated.meta.stampPruning || {},
      sourceLogistics: generated.meta.sourceLogistics || {},
      foundationDebug: generated.meta.foundationDebug || {},
      sourceResourceDebug: generated.meta.sourceResourceDebug || {},
      logisticsRoutes: generated.meta.logisticsRoutes || {},
      labPlanning: generated.meta.labPlanning || {},
      structurePlanning: generated.meta.structurePlanning || {},
      foundationSnapshot: generated.meta.foundationSnapshot || null,
      fullOptimization: generated.meta.fullOptimization || null,
      refinementDebug: generated.meta.refinementDebug || {},
      validStructurePositions: generated.meta.validStructurePositions || {},
      defenseScore:
        generated.meta && typeof generated.meta.defenseScore === 'number'
          ? generated.meta.defenseScore
          : 0,
      completedAt: Game.time,
      refinementInput: refinementInput || null,
    };
    mem.layout.theoretical = compactCompletedTheoreticalState(Object.assign({}, mem.layout.theoretical || {}, {
      spawnCandidate: spawnCandidate
        ? {
            x: spawnCandidate.x,
            y: spawnCandidate.y,
            score: generated.anchor && typeof generated.anchor.score === 'number' ? generated.anchor.score : 0,
          }
        : null,
      upgraderSlots: generated.meta.upgraderSlots || [],
      controllerContainer: controllerContainer || null,
      sourceContainers,
      foundationDebug: generated.meta.foundationDebug || {},
      sourceResourceDebug: generated.meta.sourceResourceDebug || {},
      logisticsRoutes: generated.meta.logisticsRoutes || {},
      labPlanning: generated.meta.labPlanning || {},
      structurePlanning: generated.meta.structurePlanning || {},
      refinementDebug: generated.meta.refinementDebug || {},
      fullSelectionRerank: generated.meta.fullSelectionRerank || {},
      wallDistance: generated.analysis && generated.analysis.dt ? generated.analysis.dt : [],
      controllerDistance:
        generated.analysis && generated.analysis.controllerDistance
          ? toArrayMap(generated.analysis.controllerDistance)
          : [],
      floodScore:
        generated.analysis && Array.isArray(generated.analysis.flood)
          ? generated.analysis.flood.length
          : 0,
      floodTiles:
        generated.analysis && Array.isArray(generated.analysis.flood)
          ? generated.analysis.flood.map((tile) => ({ x: tile.x, y: tile.y, d: tile.d }))
          : [],
      mincutProxy: Array.isArray(generated.placements)
        ? generated.placements.filter((p) => p.type === RAMPART_TYPE).length
        : 0,
      validation: generated.meta.validation || [],
      validStructurePositions: generated.meta.validStructurePositions || {},
      selectedCandidateIndex: selectedCandidate.index,
      selectedWeightedScore:
        selectedResult && typeof selectedResult.weightedScore === 'number'
          ? selectedResult.weightedScore
          : 0,
      selectedMetrics:
        selectedResult && selectedResult.weightedMetrics ? selectedResult.weightedMetrics : {},
      selectedContributions:
        selectedResult && selectedResult.weightedContributions
          ? selectedResult.weightedContributions
          : {},
      defensePlanningMode,
      planningRunId: pipeline.runId,
      planningStatus: pipeline.status || 'running',
      generatedAt: Game.time,
    }));
    pipeline.fullPreviewCandidateIndex = selectedCandidate.index;
    pipeline.fullPreviewMutationKey = mutationKey;
    pipeline.fullPreviewDefensePlanningMode = defensePlanningMode;
    pipeline.fullPreviewCompletedAt = Game.time;
    this._refreshTheoreticalDisplay(roomName);
    return true;
  },

  _canReuseMaterializedFullPreview(pipeline, selectedCandidate, selectedPlan, refinementInput = null) {
    if (!pipeline || !selectedCandidate || typeof selectedCandidate.index !== 'number') return false;
    const requestedHarabiStage =
      typeof pipeline.requestedHarabiStage === 'string' ? pipeline.requestedHarabiStage : 'foundation';
    const candidateHarabiStage =
      typeof pipeline.candidateHarabiStage === 'string' ? pipeline.candidateHarabiStage : requestedHarabiStage;
    const finalHarabiStage =
      typeof pipeline.finalHarabiStage === 'string' ? pipeline.finalHarabiStage : requestedHarabiStage;
    if (
      requestedHarabiStage !== 'full' ||
      finalHarabiStage !== 'full' ||
      candidateHarabiStage === finalHarabiStage
    ) {
      return false;
    }
    if (!selectedPlan || !Array.isArray(selectedPlan.placements) || selectedPlan.placements.length === 0) {
      return false;
    }
    if (
      !selectedPlan.fullOptimization ||
      typeof selectedPlan.fullOptimization !== 'object'
    ) {
      return false;
    }
    const mutationKey = refinementMutationKey(refinementInput);
    const defensePlanningMode = readTheoreticalDefensePlanningMode();
    return (
      pipeline.fullPreviewCandidateIndex === selectedCandidate.index &&
      String(pipeline.fullPreviewMutationKey || '') === mutationKey &&
      String(pipeline.fullPreviewDefensePlanningMode || '') === defensePlanningMode
    );
  },

  _finalizeTheoreticalFromMaterializedFullPreview(room, pipeline, mem, selectedCandidate, selectedPlan) {
    if (!room || !pipeline || !mem || !mem.layout || !selectedCandidate || !selectedPlan) return false;
    const selectedResult =
      pipeline.results && typeof selectedCandidate.index === 'number'
        ? pipeline.results[selectedCandidate.index] || null
        : null;
    const candidateRows = (pipeline.candidates || []).map((candidate) => {
      const result = pipeline.results && pipeline.results[candidate.index];
      return {
        index: candidate.index,
        anchor: candidate.anchor,
        initialScore: candidate.initialScore,
        initialMetrics: candidate.initialMetrics,
        initialContributions: candidate.initialContributions,
        weightedScore: result ? result.weightedScore : null,
        weightedMetrics: result ? result.weightedMetrics : null,
        weightedContributions: result ? result.weightedContributions : null,
        selectionRejected: result ? result.selectionRejected === true : false,
        hardRejectFlags: result ? result.hardRejectFlags || [] : [],
        validation: result ? result.validation : [],
        defenseScore: result ? result.defenseScore : 0,
        completedAt: result ? result.completedAt : null,
        selected: result ? result.index === pipeline.bestCandidateIndex : false,
      };
    });
    const checklist = this._buildTheoreticalChecklist(
      room.name,
      pipeline,
      pipeline.candidates || [],
      { persisted: true },
    );
    mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
    mem.layout.theoreticalCandidatePlans[selectedCandidate.index] = Object.assign({}, selectedPlan, {
      weightedScore:
        selectedResult && typeof selectedResult.weightedScore === 'number'
          ? selectedResult.weightedScore
          : Number(selectedPlan.weightedScore || 0),
      rawWeightedScore:
        selectedResult && typeof selectedResult.rawWeightedScore === 'number'
          ? selectedResult.rawWeightedScore
          : Number(selectedPlan.rawWeightedScore || selectedPlan.weightedScore || 0),
      selectionPenalty:
        selectedResult && typeof selectedResult.selectionPenalty === 'number'
          ? Number(selectedResult.selectionPenalty || 0)
          : Number(selectedPlan.selectionPenalty || 0),
      weightedMetrics:
        selectedResult && selectedResult.weightedMetrics ? selectedResult.weightedMetrics : selectedPlan.weightedMetrics || {},
      weightedContributions:
        selectedResult && selectedResult.weightedContributions
          ? selectedResult.weightedContributions
          : selectedPlan.weightedContributions || {},
      completedAt: Game.time,
    });
    this._applyTheoreticalPlacements(
      mem.layout,
      {
        anchor: selectedPlan.anchor || selectedCandidate.anchor,
        placements: selectedPlan.placements,
      },
      {
        candidateIndex: selectedCandidate.index,
        mode: 'theoretical',
      },
    );
    mem.layout.theoretical = compactCompletedTheoreticalState(
      Object.assign({}, mem.layout.theoretical || {}, {
        candidates: candidateRows,
        checklist,
        selectedCandidateIndex: selectedCandidate.index,
        selectedWeightedScore:
          selectedResult && typeof selectedResult.weightedScore === 'number'
            ? selectedResult.weightedScore
            : Number(selectedPlan.weightedScore || 0),
        selectedMetrics:
          selectedResult && selectedResult.weightedMetrics ? selectedResult.weightedMetrics : selectedPlan.weightedMetrics || {},
        selectedContributions:
          selectedResult && selectedResult.weightedContributions
            ? selectedResult.weightedContributions
            : selectedPlan.weightedContributions || {},
        refinementDebug: summarizeRefinement(pipeline.refinement),
        fullSelectionRerank: pipeline.fullSelectionRerank || {},
        planningRunId: pipeline.runId,
        planningStatus: pipeline.status || 'completed',
        generatedAt: Game.time,
      }),
    );
    mem.layout.theoretical.currentlyViewingCandidate =
      typeof mem.layout.currentDisplayCandidateIndex === 'number'
        ? mem.layout.currentDisplayCandidateIndex
        : selectedCandidate.index;
    mem.layout.planVersion = 2;
    mem.layout.mode = 'theoretical';
    this._refreshTheoreticalDisplay(room.name, true);
    return true;
  },

  _processTheoreticalPipeline(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return;
    const mem = Memory.rooms[roomName];
    if (!mem || !mem.layout || !mem.layout.theoreticalPipeline) return;
    const pipeline = mem.layout.theoreticalPipeline;
    if (pipeline.status === 'completed') return;
    const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
    if (!container || !Array.isArray(container.tasks)) return;
    const basePerTick = normalizeCandidatesPerTick(
      readNumberSetting('layoutPlanningCandidatesPerTick', DEFAULT_THEORETICAL_CANDIDATES_PER_TICK),
    );
    const maxPerTick = Math.max(
      basePerTick,
      Math.min(
        DEFAULT_THEORETICAL_MAX_CANDIDATES_PER_TICK,
        Math.floor(
          readNumberSetting(
            'layoutPlanningMaxCandidatesPerTick',
            DEFAULT_THEORETICAL_MAX_CANDIDATES_PER_TICK,
          ),
        ),
      ),
    );
    const dynamicBatching = readBoolSetting(
      'layoutPlanningDynamicBatching',
      DEFAULT_THEORETICAL_DYNAMIC_BATCH === 1,
    );
    const bucket = typeof Game.cpu.bucket === 'number' ? Game.cpu.bucket : 0;
    const cpuLimit = typeof Game.cpu.limit === 'number' ? Game.cpu.limit : 20;
    const requestedHarabiStage =
      typeof pipeline.requestedHarabiStage === 'string'
        ? pipeline.requestedHarabiStage
        : readTheoreticalHarabiStages().requested;
    const candidateHarabiStage =
      typeof pipeline.candidateHarabiStage === 'string'
        ? pipeline.candidateHarabiStage
        : readTheoreticalHarabiStages().candidate;
    const finalHarabiStage =
      typeof pipeline.finalHarabiStage === 'string'
        ? pipeline.finalHarabiStage
        : requestedHarabiStage;
    let burstMultiplier = 1;
    if (dynamicBatching) {
      if (bucket >= 9800) burstMultiplier = 8;
      else if (bucket >= 9500) burstMultiplier = 6;
      else if (bucket >= 9000) burstMultiplier = 4;
      else if (bucket >= 8000) burstMultiplier = 2;
      else if (bucket <= 2000) burstMultiplier = 1;
    }
    const plannedBatchSize = Math.max(1, Math.min(maxPerTick, basePerTick * burstMultiplier));
    const extraCpuBudget = dynamicBatching
      ? Math.max(0, Math.floor((bucket - 8500) / 18))
      : 0;
    const cpuCeiling = cpuLimit + Math.max(0, Math.min(130, extraCpuBudget));
    const expectedCandidateCpu = Math.max(
      1,
      Number(
        pipeline &&
        pipeline.expectedCpu &&
        Number.isFinite(Number(pipeline.expectedCpu.candidateTask))
          ? pipeline.expectedCpu.candidateTask
          : EXPECTED_CPU_CANDIDATE_TASK,
      ),
    );
    const currentCpuUsed = typeof Game.cpu.getUsed === 'function' ? Game.cpu.getUsed() : 0;
    const remainingCpuBudget = Math.max(0, cpuCeiling - currentCpuUsed);
    const cpuSizedBatch = Math.max(1, Math.floor(remainingCpuBudget / expectedCandidateCpu));
    const effectiveBatchSize = Math.max(1, Math.min(plannedBatchSize, cpuSizedBatch));

    let processed = 0;
    while (processed < effectiveBatchSize) {
      if (typeof Game.cpu.getUsed === 'function' && Game.cpu.getUsed() >= cpuCeiling) break;
      const nextTask = container.tasks
        .filter(
          (task) =>
            task.name === PLAN_LAYOUT_CANDIDATE_TASK &&
            task.data &&
            task.data.runId === pipeline.runId &&
            (!task.claimedUntil || task.claimedUntil <= Game.time),
        )
        .sort((a, b) => {
          const ao = typeof a.subOrder === 'number' ? a.subOrder : 999;
          const bo = typeof b.subOrder === 'number' ? b.subOrder : 999;
          return ao - bo;
        })[0];

      if (!nextTask) break;
      const candidateIndex = nextTask.data.candidateIndex;
      const candidate = pipeline.candidates.find((c) => c.index === candidateIndex);
      if (!candidate) {
        container.tasks.splice(container.tasks.indexOf(nextTask), 1);
        continue;
      }
      pipeline.activeCandidate = candidate.index;
      pipeline.activeCandidateIndex = candidate.index;

      const generated = buildCompendium.generatePlanForAnchor(roomName, candidate.anchor, {
        candidateMeta: candidate,
        extensionPattern: readLayoutPattern(),
        // Candidate ranking stays on the stabilized foundation footprint; the
        // expensive full materialization is deferred to the single winning plan.
        harabiStage: candidateHarabiStage,
      });
      if (generated) {
        generated.meta = generated.meta || {};
        generated.meta.refinementDebug = summarizeRefinement(pipeline.refinement);
        const selectionEvaluation = applySelectionPenaltyToGeneratedPlan(generated);
        mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
        mem.layout.theoreticalCandidatePlans[candidate.index] = {
          index: candidate.index,
          anchor: { x: generated.anchor.x, y: generated.anchor.y },
          placements: generated.placements,
          weightedScore: selectionEvaluation.weightedScore,
          rawWeightedScore: selectionEvaluation.rawWeightedScore,
          selectionPenalty: selectionEvaluation.selectionPenalty,
          selectionRejected: selectionEvaluation.selectionRejected,
          hardRejectFlags: selectionEvaluation.hardRejectFlags,
          weightedMetrics: generated.evaluation ? generated.evaluation.metrics || {} : {},
          weightedContributions:
            generated.evaluation && generated.evaluation.contributions
              ? generated.evaluation.contributions
              : {},
          validation: generated.meta && generated.meta.validation ? generated.meta.validation : [],
          stampStats: generated.meta && generated.meta.stampStats ? generated.meta.stampStats : {},
          stampPruning:
            generated.meta && generated.meta.stampPruning ? generated.meta.stampPruning : {},
          sourceLogistics:
            generated.meta && generated.meta.sourceLogistics ? generated.meta.sourceLogistics : {},
          foundationDebug:
            generated.meta && generated.meta.foundationDebug ? generated.meta.foundationDebug : {},
          sourceResourceDebug:
            generated.meta && generated.meta.sourceResourceDebug ? generated.meta.sourceResourceDebug : {},
          logisticsRoutes:
            generated.meta && generated.meta.logisticsRoutes ? generated.meta.logisticsRoutes : {},
          labPlanning:
            generated.meta && generated.meta.labPlanning ? generated.meta.labPlanning : {},
          structurePlanning:
            generated.meta && generated.meta.structurePlanning ? generated.meta.structurePlanning : {},
          foundationSnapshot:
            generated.meta && generated.meta.foundationSnapshot
              ? generated.meta.foundationSnapshot
              : null,
          fullOptimization:
            generated.meta && generated.meta.fullOptimization
              ? generated.meta.fullOptimization
              : null,
          refinementDebug:
            generated.meta && generated.meta.refinementDebug ? generated.meta.refinementDebug : {},
          validStructurePositions:
            generated.meta && generated.meta.validStructurePositions
              ? generated.meta.validStructurePositions
              : {},
          defenseScore:
            generated.meta && typeof generated.meta.defenseScore === 'number'
              ? generated.meta.defenseScore
              : 0,
          completedAt: Game.time,
          refinementInput: null,
        };
        pipeline.results[candidate.index] = {
          index: candidate.index,
          weightedScore: selectionEvaluation.weightedScore,
          rawWeightedScore: selectionEvaluation.rawWeightedScore,
          selectionPenalty: selectionEvaluation.selectionPenalty,
          selectionRejected: selectionEvaluation.selectionRejected,
          hardRejectFlags: selectionEvaluation.hardRejectFlags,
          weightedMetrics: generated.evaluation ? generated.evaluation.metrics || {} : {},
          weightedContributions: generated.evaluation
            ? generated.evaluation.contributions || {}
            : {},
          validation: generated.meta && generated.meta.validation ? generated.meta.validation : [],
          defenseScore:
            generated.meta && typeof generated.meta.defenseScore === 'number'
              ? generated.meta.defenseScore
              : 0,
          completedAt: Game.time,
        };
      }

      container.tasks.splice(container.tasks.indexOf(nextTask), 1);
      processed += 1;
      pipeline.updatedAt = Game.time;
      pipeline.activeCandidate = null;
      pipeline.activeCandidateIndex = null;
    }

    const completed = Object.keys(pipeline.results || {}).length;
    if (completed > Number(pipeline.lastResultsDone || 0)) {
      pipeline.lastResultsDone = completed;
      pipeline.lastProgressTick = Game.time;
    }
    const parentTask = container.tasks.find(
      (task) =>
        task.name === PLAN_LAYOUT_PARENT_TASK &&
        task.data &&
        task.data.runId === pipeline.runId,
    );
    if (parentTask) {
      parentTask.progress = `${completed}/${pipeline.candidateCount}`;
    }
    const candidateRows = (pipeline.candidates || []).map((candidate) => {
      const result = pipeline.results && pipeline.results[candidate.index];
      return {
        index: candidate.index,
        anchor: candidate.anchor,
        initialScore: candidate.initialScore,
        initialMetrics: candidate.initialMetrics,
        initialContributions: candidate.initialContributions,
        weightedScore: result ? result.weightedScore : null,
        weightedMetrics: result ? result.weightedMetrics : null,
        weightedContributions: result ? result.weightedContributions : null,
        selectionRejected: result ? result.selectionRejected === true : false,
        hardRejectFlags: result ? result.hardRejectFlags || [] : [],
        validation: result ? result.validation : [],
        defenseScore: result ? result.defenseScore : 0,
        completedAt: result ? result.completedAt : null,
        selected: result ? result.index === pipeline.bestCandidateIndex : false,
      };
    });
    mem.layout.theoretical = Object.assign({}, mem.layout.theoretical || {}, {
      candidates: candidateRows,
      checklist: this._buildTheoreticalChecklist(roomName, pipeline, pipeline.candidates),
      candidateSet: pipeline.candidateSet || {},
      refinementDebug: summarizeRefinement(pipeline.refinement),
      planningRunId: pipeline.runId,
      planningStatus: pipeline.status,
      generatedAt: Game.time,
    });
    this._refreshTheoreticalDisplay(roomName);
    if (completed < pipeline.candidateCount) return;

    const stopAtPhase = typeof pipeline.stopAtPhase === 'number' ? pipeline.stopAtPhase : 11;
    if (stopAtPhase <= 9) {
      pipeline.status = 'paused_phase_9';
      pipeline.completedAt = Game.time;
      this._refreshTheoreticalDisplay(roomName);
      return;
    }

    let ranked = this._rankPipelineResults(pipeline.results);
    let best = this._pickBestSelectableResult(ranked);
    if (!best) {
      pipeline.status = 'completed';
      pipeline.completedAt = Game.time;
      pipeline.bestCandidateIndex = null;
      mem.layout.theoretical = Object.assign({}, mem.layout.theoretical || {}, {
        selectedCandidateIndex: null,
        selectedWeightedScore: 0,
        refinementDebug: summarizeRefinement(pipeline.refinement),
        planningStatus: pipeline.status,
        generatedAt: Game.time,
      });
      this._refreshTheoreticalDisplay(roomName);
      return;
    }
    const selectedCandidateBeforeRefinement = pipeline.candidates.find((c) => c.index === best.index);
    const selectedPreviewPlanBeforeRefinement =
      selectedCandidateBeforeRefinement &&
      mem.layout.theoreticalCandidatePlans &&
      mem.layout.theoreticalCandidatePlans[String(selectedCandidateBeforeRefinement.index)]
        ? mem.layout.theoreticalCandidatePlans[String(selectedCandidateBeforeRefinement.index)]
        : null;
    if (
      selectedCandidateBeforeRefinement &&
      !this._canReuseMaterializedFullPreview(
        pipeline,
        selectedCandidateBeforeRefinement,
        selectedPreviewPlanBeforeRefinement,
        null,
      ) &&
      this._materializeTheoreticalFullPreview(
        roomName,
        pipeline,
        mem,
        selectedCandidateBeforeRefinement,
        best,
      )
    ) {
      return;
    }

    this._initializeRefinementIfNeeded(pipeline, ranked);
    if (pipeline.refinement && pipeline.refinement.enabled === true) {
      this._runRefinementStep(roomName, pipeline, mem);
      ranked = this._rankPipelineResults(pipeline.results);
      best = this._pickBestSelectableResult(ranked);
      if (!best) {
        pipeline.status = 'completed';
        pipeline.completedAt = Game.time;
        pipeline.bestCandidateIndex = null;
        mem.layout.theoretical = Object.assign({}, mem.layout.theoretical || {}, {
          selectedCandidateIndex: null,
          selectedWeightedScore: 0,
          refinementDebug: summarizeRefinement(pipeline.refinement),
          planningStatus: pipeline.status,
          generatedAt: Game.time,
        });
        this._refreshTheoreticalDisplay(roomName);
        return;
      }
      const selectedPlanAfterRefinement =
        mem.layout.theoreticalCandidatePlans &&
        mem.layout.theoreticalCandidatePlans[String(best.index)]
          ? mem.layout.theoreticalCandidatePlans[String(best.index)]
          : null;
      const refinementInput =
        selectedPlanAfterRefinement &&
        selectedPlanAfterRefinement.refinementInput &&
        selectedPlanAfterRefinement.refinementInput.anchor &&
        selectedPlanAfterRefinement.refinementInput.mutation
          ? selectedPlanAfterRefinement.refinementInput
          : null;
      const selectedCandidateAfterRefinement = pipeline.candidates.find((c) => c.index === best.index);
      if (
        selectedCandidateAfterRefinement &&
        this._materializeTheoreticalFullPreview(
          roomName,
          pipeline,
          mem,
          selectedCandidateAfterRefinement,
          best,
          { refinementInput },
        )
      ) {
        return;
      }
      if (String(pipeline.refinement.status || '') === 'running') {
        pipeline.updatedAt = Game.time;
        mem.layout.theoretical = Object.assign({}, mem.layout.theoretical || {}, {
          checklist: this._buildTheoreticalChecklist(roomName, pipeline, pipeline.candidates),
          planningStatus: pipeline.status,
          generatedAt: Game.time,
        });
        this._refreshTheoreticalDisplay(roomName);
        return;
      }
    }
    ranked = this._rerankTopCandidatesWithFullPlans(roomName, pipeline, mem, ranked);
    best = this._pickBestSelectableResult(ranked);
    if (!best) {
      pipeline.status = 'completed';
      pipeline.completedAt = Game.time;
      pipeline.bestCandidateIndex = null;
      mem.layout.theoretical = Object.assign({}, mem.layout.theoretical || {}, {
        selectedCandidateIndex: null,
        selectedWeightedScore: 0,
        refinementDebug: summarizeRefinement(pipeline.refinement),
        planningStatus: pipeline.status,
        generatedAt: Game.time,
      });
      this._refreshTheoreticalDisplay(roomName);
      return;
    }
    pipeline.activeCandidate = null;
    pipeline.activeCandidateIndex = null;
    pipeline.bestCandidateIndex = best.index;
    const deferFinalFullMaterialization =
      requestedHarabiStage === 'full' &&
      finalHarabiStage === 'full' &&
      candidateHarabiStage !== finalHarabiStage &&
      typeof Game.cpu.getUsed === 'function' &&
      Game.cpu.getUsed() >= Math.max(cpuLimit * 0.75, cpuCeiling - 8);
    if (deferFinalFullMaterialization) {
      pipeline.updatedAt = Game.time;
      mem.layout.theoretical = Object.assign({}, mem.layout.theoretical || {}, {
        selectedCandidateIndex: best.index,
        selectedWeightedScore: best.weightedScore || 0,
        refinementDebug: summarizeRefinement(pipeline.refinement),
        planningStatus: pipeline.status,
        generatedAt: Game.time,
      });
      this._refreshTheoreticalDisplay(roomName);
      return;
    }
    pipeline.status = stopAtPhase <= 10 ? 'paused_phase_10' : 'completed';
    pipeline.completedAt = Game.time;

    const selectedCandidate = pipeline.candidates.find((c) => c.index === best.index);
    if (!selectedCandidate) return;
    if (stopAtPhase <= 10) {
      mem.layout.theoretical = Object.assign({}, mem.layout.theoretical || {}, {
        selectedCandidateIndex: best.index,
        selectedWeightedScore: best.weightedScore || 0,
        refinementDebug: summarizeRefinement(pipeline.refinement),
        planningStatus: 'paused_phase_10',
        generatedAt: Game.time,
      });
      this._pruneTheoreticalMemory(roomName, { runId: pipeline.runId, reason: 'phase10-complete' });
      this._refreshTheoreticalDisplay(roomName);
      return;
    }
    const selectedPlan =
      mem.layout.theoreticalCandidatePlans &&
      mem.layout.theoreticalCandidatePlans[String(best.index)]
        ? mem.layout.theoreticalCandidatePlans[String(best.index)]
        : null;
    const refinementInput =
      selectedPlan &&
      selectedPlan.refinementInput &&
      selectedPlan.refinementInput.anchor &&
      selectedPlan.refinementInput.mutation
        ? selectedPlan.refinementInput
        : null;
    if (
      this._canReuseMaterializedFullPreview(
        pipeline,
        selectedCandidate,
        selectedPlan,
        refinementInput,
      )
    ) {
      // Reuse the already materialized full preview so phase-10 overlay output
      // and the persisted final plan stay identical instead of re-pathing again.
      this._finalizeTheoreticalFromMaterializedFullPreview(
        room,
        pipeline,
        mem,
        selectedCandidate,
        selectedPlan,
      );
      this._pruneTheoreticalMemory(roomName, { runId: pipeline.runId, reason: 'completed' });
      this._clearTheoreticalPlanningTasks(roomName, pipeline.runId);
      statsConsole.run([['layoutPlanner.theoretical', Game.cpu.getUsed()]]);
      return;
    }
    const generated = buildCompendium.generatePlanForAnchor(
      roomName,
      refinementInput ? refinementInput.anchor : selectedCandidate.anchor,
      {
        candidateMeta: selectedCandidate,
        extensionPattern: readLayoutPattern(),
        harabiStage: finalHarabiStage,
        defensePlanningMode: readTheoreticalDefensePlanningMode(),
        mutation: refinementInput ? refinementInput.mutation : null,
      },
    );
    if (!generated) return;
    generated.meta = generated.meta || {};
    generated.meta.refinementDebug = summarizeRefinement(pipeline.refinement);

    this._writeTheoreticalLayoutFromPlan(room, generated, pipeline);
    this._pruneTheoreticalMemory(roomName, { runId: pipeline.runId, reason: 'completed' });
    this._clearTheoreticalPlanningTasks(roomName, pipeline.runId);
    statsConsole.run([['layoutPlanner.theoretical', Game.cpu.getUsed()]]);
  },

  /**
   * Build a theoretical, spawn-independent room plan for overlays.
   * This mode avoids construction and is intended for visual evaluation only.
   * @param {string} roomName
   */
  buildTheoreticalLayout(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return;
    htm.init();
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    const mem = Memory.rooms[roomName];
    if (!mem.layout) mem.layout = {};
    mem.layout.mode = 'theoretical';

    const manualMode = Boolean(
      Memory.settings && Memory.settings.layoutPlanningManualMode,
    );
    const manualBypass = Boolean(
      Memory.settings && Memory.settings.layoutPlanningManualBypassOnce,
    );

    if (manualMode && mem.layout.manualPhaseRequest) {
      const req = mem.layout.manualPhaseRequest;
      delete mem.layout.manualPhaseRequest;
      if (!Memory.settings) Memory.settings = {};
      Memory.settings.layoutPlanningManualBypassOnce = true;
      this.recalculateRoom(roomName, {
        mode: 'theoretical',
        scrubDistanceTransform: req.phaseFrom <= 3,
        phaseFrom: req.phaseFrom,
        phaseTo: req.phaseTo,
        stopAtPhase: req.phaseTo,
      });
      Memory.settings.layoutPlanningManualBypassOnce = false;
      return;
    }

    if (
      manualMode &&
      !manualBypass &&
      !mem.layout.theoreticalPipeline &&
      !mem.layout.theoretical
    ) {
      return;
    }

    if (mem.layout.rebuildLayout) {
      delete mem.layout.theoreticalPipeline;
      delete mem.layout.theoreticalCandidatePlans;
      delete mem.layout.theoretical;
      delete mem.layout.planVersion;
      delete mem.layout.currentDisplayCandidateIndex;
      this._clearTheoreticalPlanningTasks(roomName);
      delete mem.layout.rebuildLayout;
    }

    const replanInterval = Math.max(
      50,
      readNumberSetting('layoutPlanningReplanInterval', DEFAULT_THEORETICAL_REPLAN_INTERVAL),
    );
    const theoretical = mem.layout.theoretical || null;
    const isFreshPlan =
      theoretical &&
      mem.layout.planVersion === 2 &&
      mem.layout.mode === 'theoretical' &&
      typeof theoretical.generatedAt === 'number' &&
      Game.time - theoretical.generatedAt < replanInterval;

    if (
      mem.layout.theoreticalPipeline &&
      mem.layout.theoreticalPipeline.status === 'completed'
    ) {
      if (isFreshPlan) {
        this._refreshTheoreticalDisplay(roomName);
        return;
      }
      delete mem.layout.theoreticalPipeline;
    }

    if (!mem.layout.theoreticalPipeline && isFreshPlan) {
      this._refreshTheoreticalDisplay(roomName);
      return;
    }
    if (!mem.layout.theoreticalPipeline) {
      const pipeline = this._initializeTheoreticalPipeline(roomName);
      if (!pipeline) {
        // Fallback to direct single-run generation if no candidate scan is possible.
        const pattern = readLayoutPattern();
        const generated = buildCompendium.generatePlan(roomName, {
          extensionPattern: pattern,
          harabiStage: readHarabiStage(),
        });
        if (!generated) return;
        const singlePipeline = {
          runId: `${roomName}:${Game.time}:fallback`,
          bestCandidateIndex:
            generated.selection && typeof generated.selection.selectedCandidateIndex === 'number'
              ? generated.selection.selectedCandidateIndex
              : 0,
          candidateSet: (generated.selection && generated.selection.candidateSet) || {},
          candidates: (generated.selection && generated.selection.candidates) || [],
          results: {},
        };
        if (Array.isArray(singlePipeline.candidates)) {
          for (const candidate of singlePipeline.candidates) {
            singlePipeline.results[candidate.index] = {
              index: candidate.index,
              weightedScore: candidate.weightedScore || 0,
              weightedMetrics: candidate.weightedMetrics || {},
              weightedContributions: candidate.weightedContributions || {},
              validation: candidate.validation || [],
              defenseScore: candidate.defenseScore || 0,
              completedAt: Game.time,
            };
          }
        }
        this._writeTheoreticalLayoutFromPlan(room, generated, singlePipeline);
        this._pruneTheoreticalMemory(roomName, { runId: singlePipeline.runId, reason: 'fallback-completed' });
        statsConsole.run([['layoutPlanner.theoretical', Game.cpu.getUsed()]]);
        return;
      }
    }

    this._processTheoreticalPipeline(roomName);
  },
};

module.exports = layoutPlanner;
