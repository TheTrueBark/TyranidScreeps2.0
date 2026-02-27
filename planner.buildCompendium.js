/** @codex-owner layoutPlanner */
const foundation = require('./planner.baseplannerFoundation');
const floodFillAlgorithm = require('./algorithm.floodFill');
const minCutAlgorithm = require('./algorithm.minCut');
const checkerboard = require('./algorithm.checkerboard');

const STRUCTURES = {
  SPAWN: typeof STRUCTURE_SPAWN !== 'undefined' ? STRUCTURE_SPAWN : 'spawn',
  EXTENSION: typeof STRUCTURE_EXTENSION !== 'undefined' ? STRUCTURE_EXTENSION : 'extension',
  TOWER: typeof STRUCTURE_TOWER !== 'undefined' ? STRUCTURE_TOWER : 'tower',
  STORAGE: typeof STRUCTURE_STORAGE !== 'undefined' ? STRUCTURE_STORAGE : 'storage',
  TERMINAL: typeof STRUCTURE_TERMINAL !== 'undefined' ? STRUCTURE_TERMINAL : 'terminal',
  LINK: typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link',
  CONTAINER: typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container',
  ROAD: typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road',
  LAB: typeof STRUCTURE_LAB !== 'undefined' ? STRUCTURE_LAB : 'lab',
  FACTORY: typeof STRUCTURE_FACTORY !== 'undefined' ? STRUCTURE_FACTORY : 'factory',
  OBSERVER: typeof STRUCTURE_OBSERVER !== 'undefined' ? STRUCTURE_OBSERVER : 'observer',
  POWER_SPAWN:
    typeof STRUCTURE_POWER_SPAWN !== 'undefined' ? STRUCTURE_POWER_SPAWN : 'powerSpawn',
  NUKER: typeof STRUCTURE_NUKER !== 'undefined' ? STRUCTURE_NUKER : 'nuker',
  EXTRACTOR: typeof STRUCTURE_EXTRACTOR !== 'undefined' ? STRUCTURE_EXTRACTOR : 'extractor',
  RAMPART: typeof STRUCTURE_RAMPART !== 'undefined' ? STRUCTURE_RAMPART : 'rampart',
};

const TERRAIN_WALL_MASK = typeof TERRAIN_MASK_WALL !== 'undefined' ? TERRAIN_MASK_WALL : 1;
const TERRAIN_SWAMP_MASK = typeof TERRAIN_MASK_SWAMP !== 'undefined' ? TERRAIN_MASK_SWAMP : 2;
const FIND_SOURCES_CONST = typeof FIND_SOURCES !== 'undefined' ? FIND_SOURCES : 'FIND_SOURCES';
const FIND_MINERALS_CONST =
  typeof FIND_MINERALS !== 'undefined' ? FIND_MINERALS : 'FIND_MINERALS';
const LOOK_STRUCTURES_CONST =
  typeof LOOK_STRUCTURES !== 'undefined' ? LOOK_STRUCTURES : 'structure';
const OBSTACLE_TYPES =
  typeof OBSTACLE_OBJECT_TYPES !== 'undefined' && Array.isArray(OBSTACLE_OBJECT_TYPES)
    ? new Set(OBSTACLE_OBJECT_TYPES)
    : new Set();

const DEFAULT_PRE_WEIGHTS = {
  controllerDist: -2.6,
  avgSourceDist: -0.65,
  mineralDist: -0.2,
  dtValue: 1.4,
  exitDist: 0.8,
  exitDistPenalty: -4.2,
  terrainQuality: 0.8,
  symmetry: 0.3,
  defenseRampart: 0.9,
  defenseStandoff: 1.1,
};

const DEFAULT_FINAL_WEIGHTS = {
  avgExtDist: 0.14,
  maxExtDist: 0.07,
  minTowerDamage: 0.13,
  rampartEff: 0.09,
  roadEff: 0.02,
  sourceDist: 0.07,
  controllerDist: 0.15,
  compactness: 0.04,
  openAreaEff: 0.04,
  labQuality: 0.04,
  hubQuality: 0.04,
  rangedBuffer: 0.06,
  logisticsCoverage: 0.1,
  infraCost: 0.05,
};

function key(x, y) {
  return `${x}:${y}`;
}

function parseKey(id) {
  const [x, y] = String(id).split(':').map(Number);
  return { x, y };
}

const {
  inBounds,
  idx,
  chebyshev,
  manhattan,
  clamp01,
  mean,
  neighbors8,
  neighbors4,
  buildTerrainMatrices,
  ensureDistanceTransform,
} = foundation;

function findFirstNonEmpty(room, queries) {
  if (!room || typeof room.find !== 'function') return [];
  for (const q of queries) {
    const found = room.find(q);
    if (Array.isArray(found) && found.length > 0) return found;
  }
  return [];
}

function computeStaticBlockedMatrix(room) {
  const blocked = new Array(2500).fill(0);
  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      const structures = room.lookForAt(LOOK_STRUCTURES_CONST, x, y) || [];
      const obstacle = structures.some((s) => {
        if (!s || !s.structureType) return false;
        if (s.structureType === STRUCTURES.ROAD || s.structureType === STRUCTURES.CONTAINER) {
          return false;
        }
        return OBSTACLE_TYPES.has(s.structureType);
      });
      blocked[idx(x, y)] = obstacle ? 1 : 0;
    }
  }
  return blocked;
}

function computeDistanceMap(walkableWithPlan, origin) {
  const dist = {};
  if (!origin) return dist;
  const q = [{ x: origin.x, y: origin.y }];
  dist[key(origin.x, origin.y)] = 0;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const base = dist[key(cur.x, cur.y)];
    for (const n of neighbors8(cur.x, cur.y)) {
      if (walkableWithPlan[idx(n.x, n.y)] !== 1) continue;
      const k = key(n.x, n.y);
      if (dist[k] !== undefined) continue;
      dist[k] = base + 1;
      q.push(n);
    }
  }
  return dist;
}


function createPlanContext(room, matrices) {
  return {
    roomName: room.name,
    placements: [],
    blocked: new Set(),
    roads: new Set(),
    ramparts: new Set(),
    roadBlockedByStructures: new Set(),
    reserved: new Set(),
    structuresByPos: new Map(),
    matrices,
    meta: {
      upgraderSlots: [],
      validation: [],
      defenseScore: 0,
      spawnExits: [],
      stampStats: {
        bigPlaced: 0,
        smallPlaced: 0,
        capacitySlots: 0,
        requiredSlots: 0,
        smallFallbackReasons: {},
        bigCenters: [],
        smallCenters: [],
      },
      sourceLogistics: {},
      foundationDebug: {},
      sourceResourceDebug: {},
      logisticsRoutes: {},
      labPlanning: {
        mode: 'foundation-preview',
        computed: false,
        clusterFound: false,
        sourceLabs: [],
        reactionLabs: [],
        totalLabs: 0,
      },
      structurePlanning: {
        mode: 'foundation-preview',
        computed: false,
        placements: [],
        counts: {},
      },
      validStructurePositions: {
        totalCandidates: 0,
        patternStructure: 0,
        walkable: 0,
        staticClear: 0,
        reservedClear: 0,
        structureClear: 0,
        roadClear: 0,
        adjacentRoad: 0,
        labReserveClear: 0,
        canPlace: 0,
        positions: [],
        truncated: false,
      },
    },
  };
}

function isTileWalkableForPlacement(ctx, x, y) {
  const id = idx(x, y);
  if (ctx.matrices.walkableMatrix[id] !== 1) return false;
  if (ctx.matrices.staticBlocked[id] === 1) return false;
  if (ctx.blocked.has(key(x, y))) return false;
  return true;
}

function canPlaceStructure(ctx, type, x, y, options = {}) {
  if (!inBounds(x, y)) return false;
  const id = idx(x, y);
  if (type !== STRUCTURES.ROAD) {
    if (ctx.matrices.exitProximity[id] === 1) return false;
    if (!options.ignoreReservation && ctx.reserved.has(key(x, y))) return false;
    if (type !== STRUCTURES.RAMPART && !options.allowOnRoad && ctx.roads.has(key(x, y))) return false;
    if (!options.allowOnBlocked && !isTileWalkableForPlacement(ctx, x, y)) return false;
  } else {
    if (ctx.matrices.walkableMatrix[id] !== 1) return false;
    if (ctx.roadBlockedByStructures && ctx.roadBlockedByStructures.has(key(x, y))) return false;
    if (ctx.structuresByPos.has(key(x, y))) return false;
  }
  return true;
}

function reserveTile(ctx, x, y, tag) {
  if (!inBounds(x, y)) return false;
  const id = idx(x, y);
  if (ctx.matrices.walkableMatrix[id] !== 1) return false;
  if (ctx.matrices.exitProximity[id] === 1) return false;
  const k = key(x, y);
  if (ctx.structuresByPos.has(k)) return false;
  ctx.reserved.add(k);
  if (tag) ctx.meta.spawnExits.push({ x, y, tag });
  return true;
}

function addPlacement(ctx, type, x, y, rcl, tag = null, options = {}) {
  if (!canPlaceStructure(ctx, type, x, y, options)) return false;
  const k = key(x, y);
  if (type !== STRUCTURES.ROAD && ctx.blocked.has(k)) return false;
  if (type === STRUCTURES.ROAD && ctx.roads.has(k)) return false;
  if (type === STRUCTURES.ROAD && ctx.structuresByPos.has(k)) return false;
  ctx.placements.push({ type, x, y, rcl, tag });
  if (type === STRUCTURES.ROAD) {
    ctx.roads.add(k);
  } else if (type === STRUCTURES.RAMPART) {
    ctx.ramparts.add(k);
  } else {
    ctx.roadBlockedByStructures.add(k);
    ctx.blocked.add(k);
    ctx.structuresByPos.set(k, type);
  }
  return true;
}

function walkableWithPlan(ctx) {
  const arr = ctx.matrices.walkableMatrix.slice();
  for (const k of ctx.blocked) {
    const p = parseKey(k);
    arr[idx(p.x, p.y)] = 0;
  }
  return arr;
}

function countWalkableNeighbors(ctx, x, y) {
  let count = 0;
  for (const n of neighbors8(x, y)) {
    if (isTileWalkableForPlacement(ctx, n.x, n.y)) count += 1;
  }
  return count;
}

function findBestByCandidates(candidates, scorer) {
  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = scorer(c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function assignExtensionRcl(index) {
  if (index < 5) return 2;
  if (index < 10) return 3;
  if (index < 20) return 4;
  if (index < 30) return 5;
  if (index < 40) return 6;
  if (index < 50) return 7;
  return 8;
}

function resolveLayoutPattern(options = {}) {
  const raw = options.layoutPattern || options.extensionPattern || 'parity';
  const normalized = String(raw).toLowerCase();
  if (normalized === 'cluster3' || normalized === 'harabi' || normalized === 'diag2') {
    return 'cluster3';
  }
  return 'parity';
}

function resolveHarabiStage(options = {}) {
  // Harabi runtime now uses foundation as the single planning baseline.
  return 'foundation';
}

function normalizeMutationOptions(mutation = null) {
  if (!mutation || typeof mutation !== 'object') return {};
  const toInt = (value, fallback = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.trunc(num);
  };
  return {
    anchorDx: Math.max(-2, Math.min(2, toInt(mutation.anchorDx, 0))),
    anchorDy: Math.max(-2, Math.min(2, toInt(mutation.anchorDy, 0))),
    roadAngleShift: Math.max(-16, Math.min(16, toInt(mutation.roadAngleShift, 0))),
    slotOrderShift: Math.max(-16, Math.min(16, toInt(mutation.slotOrderShift, 0))),
    routeTieBreakShift: Math.max(-16, Math.min(16, toInt(mutation.routeTieBreakShift, 0))),
  };
}

function deterministicJitter(x, y, shift) {
  const s = Number(shift || 0);
  const hash = ((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) >>> 0;
  return hash % 2;
}

function isHarabiPattern(pattern) {
  const normalized = String(pattern || 'parity').toLowerCase();
  return normalized === 'cluster3' || normalized === 'harabi' || normalized === 'diag2';
}

const HARABI_ROAD_STAMP_5 = {
  roads: [
    { x: 0, y: -2 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -2, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 0, y: 2 },
  ],
  slots: (() => {
    const roadKeys = new Set([
      '0:-2',
      '-1:-1',
      '1:-1',
      '-2:0',
      '2:0',
      '-1:1',
      '1:1',
      '0:2',
    ]);
    const slots = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (roadKeys.has(`${dx}:${dy}`)) continue;
        slots.push({ x: dx, y: dy });
      }
    }
    return slots;
  })(),
};

function applyRoadStamp(ctx, center, roadOffsets, tag = 'road.stamp') {
  for (const o of roadOffsets) {
    const x = center.x + o.x;
    const y = center.y + o.y;
    if (!inBounds(x, y)) continue;
    addPlacement(ctx, STRUCTURES.ROAD, x, y, 1, tag);
  }
}

function projectStampSlots(center, slotOffsets) {
  const slots = [];
  for (const o of slotOffsets) {
    slots.push({ x: center.x + o.x, y: center.y + o.y, dx: o.x, dy: o.y });
  }
  return slots;
}

function stampCrossSlots(center) {
  if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') return [];
  return [
    { x: center.x, y: center.y },
    { x: center.x, y: center.y - 1 },
    { x: center.x - 1, y: center.y },
    { x: center.x + 1, y: center.y },
    { x: center.x, y: center.y + 1 },
  ].filter((p) => inBounds(p.x, p.y));
}

function inferStampGeometryFromRoadStamps(ctx) {
  const roadStampSet = new Set(
    (ctx.placements || [])
      .filter((p) => p && p.type === STRUCTURES.ROAD && String(p.tag || '') === 'road.stamp')
      .map((p) => key(p.x, p.y)),
  );
  const bigOffsets = HARABI_ROAD_STAMP_5.roads;
  const smallOffsets = [
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  const hasRoad = (x, y) => roadStampSet.has(key(x, y));
  const centers = new Set();
  for (const rk of roadStampSet) {
    const pos = parseKey(rk);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        centers.add(key(pos.x + dx, pos.y + dy));
      }
    }
  }
  const bigCenters = [];
  const smallCentersRaw = [];
  for (const ck of centers) {
    const c = parseKey(ck);
    if (!inBounds(c.x, c.y)) continue;
    const bigMatch = bigOffsets.every((o) => hasRoad(c.x + o.x, c.y + o.y));
    if (bigMatch) {
      bigCenters.push(c);
      continue;
    }
    const smallMatch = smallOffsets.every((o) => hasRoad(c.x + o.x, c.y + o.y));
    if (smallMatch) smallCentersRaw.push(c);
  }
  const smallCenters = smallCentersRaw.filter((small) =>
    !bigCenters.some((big) => chebyshev(small, big) <= 1),
  );
  return { bigCenters, smallCenters };
}

function collectStampCenterOverrideKeys(ctx) {
  const keys = new Set();
  const explicitBig = Array.isArray(ctx && ctx.meta && ctx.meta.stampStats && ctx.meta.stampStats.bigCenters)
    ? ctx.meta.stampStats.bigCenters
    : [];
  for (const center of explicitBig) {
    if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') continue;
    keys.add(key(center.x, center.y));
  }
  const inferred = inferStampGeometryFromRoadStamps(ctx);
  for (const center of (inferred.bigCenters || [])) {
    if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') continue;
    keys.add(key(center.x, center.y));
  }
  for (const center of (inferred.smallCenters || [])) {
    if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') continue;
    keys.add(key(center.x, center.y));
  }
  return keys;
}

function pruneUnusedRoadStamps(ctx, options = {}) {
  if (!ctx || !ctx.meta) return { removedRoadTiles: 0, prunedBig: 0, prunedSmall: 0 };
  if (!isHarabiPattern(options.layoutPattern || 'parity')) {
    return { removedRoadTiles: 0, prunedBig: 0, prunedSmall: 0 };
  }
  const explicitBigCenters = Array.isArray(ctx.meta.stampStats && ctx.meta.stampStats.bigCenters)
    ? ctx.meta.stampStats.bigCenters
    : [];
  const inferred = inferStampGeometryFromRoadStamps(ctx);
  const inferredSmallCenters = inferred.smallCenters || [];
  const occupied = new Set();
  for (const p of ctx.placements || []) {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    if (p.type === STRUCTURES.ROAD || p.type === STRUCTURES.RAMPART) continue;
    occupied.add(key(p.x, p.y));
  }
  const labPlanning = ctx.meta.labPlanning || {};
  for (const lab of (Array.isArray(labPlanning.sourceLabs) ? labPlanning.sourceLabs : [])) {
    if (!lab) continue;
    occupied.add(key(lab.x, lab.y));
  }
  for (const lab of (Array.isArray(labPlanning.reactionLabs) ? labPlanning.reactionLabs : [])) {
    if (!lab) continue;
    occupied.add(key(lab.x, lab.y));
  }
  const structurePlanning = ctx.meta.structurePlanning || {};
  for (const placement of (Array.isArray(structurePlanning.placements) ? structurePlanning.placements : [])) {
    if (!placement) continue;
    occupied.add(key(placement.x, placement.y));
  }

  const keepBigCenters = [];
  for (const center of explicitBigCenters) {
    const used = stampCrossSlots(center).some((slot) => occupied.has(key(slot.x, slot.y)));
    if (used) keepBigCenters.push(center);
  }
  const keepSmallCenters = [];
  for (const center of inferredSmallCenters) {
    const used = occupied.has(key(center.x, center.y));
    if (used) keepSmallCenters.push(center);
  }

  const keepRoadKeys = new Set();
  for (const center of keepBigCenters) {
    for (const o of HARABI_ROAD_STAMP_5.roads) {
      const x = center.x + o.x;
      const y = center.y + o.y;
      if (!inBounds(x, y)) continue;
      keepRoadKeys.add(key(x, y));
    }
  }
  const smallOffsets = [
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (const center of keepSmallCenters) {
    for (const o of smallOffsets) {
      const x = center.x + o.x;
      const y = center.y + o.y;
      if (!inBounds(x, y)) continue;
      keepRoadKeys.add(key(x, y));
    }
  }

  let removedRoadTiles = 0;
  ctx.placements = (ctx.placements || []).filter((placement) => {
    if (!placement || placement.type !== STRUCTURES.ROAD) return true;
    if (String(placement.tag || '') !== 'road.stamp') return true;
    const rk = key(placement.x, placement.y);
    if (keepRoadKeys.has(rk)) return true;
    removedRoadTiles += 1;
    return false;
  });
  if (removedRoadTiles > 0) {
    ctx.roads = new Set(
      (ctx.placements || [])
        .filter((p) => p && p.type === STRUCTURES.ROAD)
        .map((p) => key(p.x, p.y)),
    );
  }

  const prunedBig = Math.max(0, explicitBigCenters.length - keepBigCenters.length);
  const prunedSmall = Math.max(0, inferredSmallCenters.length - keepSmallCenters.length);
  if (ctx.meta.stampStats) {
    ctx.meta.stampStats.bigCenters = keepBigCenters.slice(0, 80);
    ctx.meta.stampStats.bigPlaced = keepBigCenters.length;
  }
  ctx.meta.stampPruning = {
    enabled: true,
    prunedBig,
    prunedSmall,
    keptBig: keepBigCenters.length,
    keptSmall: keepSmallCenters.length,
    removedRoadTiles,
  };
  return ctx.meta.stampPruning;
}

function getHarabiCoreStamp(anchor) {
  // Anchor is the candidate spawn position for the middle spawn in the top row.
  // Template source (absolute 1..5 coords) provided by user:
  // spawn: (2,2),(3,2),(4,2) / terminal: (2,3) / link: (4,3)
  // storage: (2,4) / powerSpawn: (4,4)
  // roads: (3,3),(3,4),(2,5),(1,4),(1,3),(1,2),(2,1),(3,1),(4,1),(5,2),(5,3),(5,4),(4,5)
  const center = { x: anchor.x, y: anchor.y + 1 };
  return {
    center,
    roads: [
      { x: -1, y: -2 }, { x: 0, y: -2 }, { x: 1, y: -2 },
      { x: -2, y: -1 }, { x: 2, y: -1 },
      { x: -2, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 },
      { x: -2, y: 1 }, { x: 0, y: 1 }, { x: 2, y: 1 },
      { x: -1, y: 2 }, { x: 1, y: 2 },
    ],
    slots: {
      spawn1: { x: 0, y: -1 }, // candidate anchor (required first spawn)
      spawn2: { x: -1, y: -1 },
      spawn3: { x: 1, y: -1 },
      terminal: { x: -1, y: 0 },
      link: { x: 1, y: 0 },
      storage: { x: -1, y: 1 },
      powerSpawn: { x: 1, y: 1 },
    },
  };
}

function addPatternRoadHalo(ctx, tiles, storage, pattern, preferredParity) {
  if (!Array.isArray(tiles) || tiles.length === 0) return;
  for (const tile of tiles) {
    if (!tile) continue;
    for (const n of neighbors8(tile.x, tile.y)) {
      if (!inBounds(n.x, n.y)) continue;
      if (
        checkerboard.classifyTileByPattern(n.x, n.y, storage, {
          pattern,
          preferredParity,
        }) !== 'road'
      ) {
        continue;
      }
      // Keep halo roads distinct from the actual stamp roads for diagnostics.
      addPlacement(ctx, STRUCTURES.ROAD, n.x, n.y, 1, 'road.stampHalo');
    }
  }
}

function collectValidStructurePositions(
  ctx,
  sortedFlood,
  storage,
  layoutPattern,
  preferredParity,
  options = {},
) {
  const depthLimit = Number.isFinite(options.depthLimit) ? Number(options.depthLimit) : 12;
  const labReserveKeys = options.labReserveKeys instanceof Set ? options.labReserveKeys : new Set();
  const centerOverrideKeys = options.centerOverrideKeys instanceof Set ? options.centerOverrideKeys : new Set();
  const excludedKeys = options.excludedKeys instanceof Set ? options.excludedKeys : new Set();
  const maxPositions = Number.isFinite(options.maxPositions) ? Math.max(1, Number(options.maxPositions)) : 300;
  const result = {
    totalCandidates: 0,
    patternStructure: 0,
    walkable: 0,
    staticClear: 0,
    reservedClear: 0,
    structureClear: 0,
    roadClear: 0,
    previewExcluded: 0,
    adjacentRoad: 0,
    labReserveClear: 0,
    canPlace: 0,
    positions: [],
    truncated: false,
  };
  if (!Array.isArray(sortedFlood) || !storage) return result;

  for (const node of sortedFlood) {
    if (!node || node.d > depthLimit) continue;
    result.totalCandidates += 1;
    const k = key(node.x, node.y);
    const patternType = checkerboard.classifyTileByPattern(node.x, node.y, storage, {
      pattern: layoutPattern,
      preferredParity,
    });
    if (patternType === 'structure' || centerOverrideKeys.has(k)) {
      result.patternStructure += 1;
    }
    if (ctx.matrices.walkableMatrix[idx(node.x, node.y)] !== 1) continue;
    result.walkable += 1;
    if (ctx.matrices.staticBlocked[idx(node.x, node.y)] === 1) continue;
    result.staticClear += 1;
    if (ctx.reserved.has(k)) continue;
    result.reservedClear += 1;
    if (ctx.structuresByPos.has(k)) continue;
    result.structureClear += 1;
    if (ctx.roads.has(k)) continue;
    result.roadClear += 1;
    if (excludedKeys.has(k)) {
      result.previewExcluded += 1;
      continue;
    }
    const hasAdjacentRoad = neighbors8(node.x, node.y).some((n) => ctx.roads.has(key(n.x, n.y)));
    if (!hasAdjacentRoad) continue;
    result.adjacentRoad += 1;
    if (result.positions.length < maxPositions) {
      result.positions.push({ x: node.x, y: node.y });
    } else {
      result.truncated = true;
    }
    if (labReserveKeys.has(k)) continue;
    result.labReserveClear += 1;
    if (!canPlaceStructure(ctx, STRUCTURES.EXTENSION, node.x, node.y)) continue;
    result.canPlace += 1;
  }
  return result;
}

function collectFoundationPreviewCandidates(
  ctx,
  storage,
  layoutPattern,
  preferredParity,
  options = {},
) {
  const centerOverrideKeys = options.centerOverrideKeys instanceof Set ? options.centerOverrideKeys : new Set();
  const depthLimit = Number.isFinite(options.depthLimit) ? Number(options.depthLimit) : 50;
  const spawnReference =
    options.spawnReference &&
    typeof options.spawnReference.x === 'number' &&
    typeof options.spawnReference.y === 'number'
      ? options.spawnReference
      : storage;
  const allowedRoadTags = new Set(options.allowedRoadTags || [
    'road.stamp',
    'road.coreStamp',
    'road.controllerStamp',
    'road.grid',
  ]);
  const allowedRoadKeys = new Set(
    (ctx.placements || [])
      .filter((p) => p && p.type === STRUCTURES.ROAD && allowedRoadTags.has(String(p.tag || '')))
      .map((p) => key(p.x, p.y)),
  );
  const nodes = [];
  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      const k = key(x, y);
      const d = chebyshev({ x, y }, spawnReference);
      if (d > depthLimit) continue;
      const patternType = checkerboard.classifyTileByPattern(x, y, storage, {
        pattern: layoutPattern,
        preferredParity,
      });
      if (patternType !== 'structure' && !centerOverrideKeys.has(k)) continue;
      if (ctx.matrices.walkableMatrix[idx(x, y)] !== 1) continue;
      if (ctx.matrices.staticBlocked[idx(x, y)] === 1) continue;
      if (ctx.reserved.has(k)) continue;
      if (ctx.structuresByPos.has(k)) continue;
      if (ctx.roads.has(k)) continue;
      const hasAdjacentAllowedRoad = neighbors8(x, y).some((n) => allowedRoadKeys.has(key(n.x, n.y)));
      if (!hasAdjacentAllowedRoad) continue;
      if (!canPlaceStructure(ctx, STRUCTURES.EXTENSION, x, y)) continue;
      nodes.push({ x, y, d });
    }
  }
  return nodes;
}

function planFoundationStructurePreview(
  ctx,
  sortedFlood,
  storage,
  layoutPattern,
  preferredParity,
  options = {},
) {
  const centerOverrideKeys = options.centerOverrideKeys instanceof Set ? options.centerOverrideKeys : new Set();
  const excludedKeys = options.excludedKeys instanceof Set ? options.excludedKeys : new Set();
  const depthLimit = Number.isFinite(options.depthLimit) ? Number(options.depthLimit) : 14;
  const slotOrderShift = Number.isFinite(options.slotOrderShift) ? Number(options.slotOrderShift) : 0;
  const spawnReference =
    options.spawnReference &&
    typeof options.spawnReference.x === 'number' &&
    typeof options.spawnReference.y === 'number'
      ? options.spawnReference
      : storage;
  const stampCenters = Array.isArray(options.stampCenters) ? options.stampCenters : [];
  const smallStampCenters = Array.isArray(options.smallStampCenters) ? options.smallStampCenters : [];
  const crossSlotToBucket = new Map();
  const bucketInfoById = new Map();
  for (let i = 0; i < stampCenters.length; i++) {
    const center = stampCenters[i];
    if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') continue;
    const id = `big:${i}`;
    bucketInfoById.set(id, { id, capacity: 5 });
    for (const slot of stampCrossSlots(center)) {
      crossSlotToBucket.set(key(slot.x, slot.y), id);
    }
  }
  for (let i = 0; i < smallStampCenters.length; i++) {
    const center = smallStampCenters[i];
    if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') continue;
    const id = `small:${i}`;
    bucketInfoById.set(id, { id, capacity: 1 });
    crossSlotToBucket.set(key(center.x, center.y), id);
  }
  const candidates = [];
  for (const node of sortedFlood || []) {
    if (!node || node.d > depthLimit) continue;
    const k = key(node.x, node.y);
    if (excludedKeys.has(k)) continue;
    const patternType = checkerboard.classifyTileByPattern(node.x, node.y, storage, {
      pattern: layoutPattern,
      preferredParity,
    });
    if (patternType !== 'structure' && !centerOverrideKeys.has(k)) continue;
    if (!neighbors8(node.x, node.y).some((n) => ctx.roads.has(key(n.x, n.y)))) continue;
    if (!canPlaceStructure(ctx, STRUCTURES.EXTENSION, node.x, node.y)) continue;
    candidates.push({
      x: node.x,
      y: node.y,
      d: Number(node.d || 0),
      centerBonus: centerOverrideKeys.has(k) ? 1 : 0,
      stampBucket: crossSlotToBucket.get(k) || null,
      spawnDist: chebyshev(node, spawnReference),
    });
  }

  const used = new Set();
  const placements = [];
  const selectedByKey = new Map();
  const bucketById = new Map();
  const ensureBucket = (bucketId, candidate) => {
    if (!bucketById.has(bucketId)) {
      bucketById.set(bucketId, {
        id: bucketId,
        candidates: [],
        minSpawnDist: Number(candidate && candidate.spawnDist ? candidate.spawnDist : 999),
      });
    }
    return bucketById.get(bucketId);
  };
  for (const candidate of candidates) {
    if (!candidate) continue;
    const bucketId = candidate.stampBucket || `solo:${candidate.x}:${candidate.y}`;
    const bucket = ensureBucket(bucketId, candidate);
    bucket.candidates.push(candidate);
    bucket.minSpawnDist = Math.min(bucket.minSpawnDist, Number(candidate.spawnDist || 999));
  }
  for (const bucket of bucketById.values()) {
    bucket.candidates.sort(
      (a, b) =>
        b.centerBonus - a.centerBonus ||
        a.spawnDist - b.spawnDist ||
        a.d - b.d ||
        manhattan(a, storage) - manhattan(b, storage) ||
        deterministicJitter(a.x, a.y, slotOrderShift) - deterministicJitter(b.x, b.y, slotOrderShift),
    );
  }
  const orderedBuckets = [...bucketById.values()].sort((a, b) => a.minSpawnDist - b.minSpawnDist);
  const allSorted = candidates
    .slice()
    .sort(
      (a, b) =>
        b.centerBonus - a.centerBonus ||
        a.spawnDist - b.spawnDist ||
        a.d - b.d ||
        manhattan(a, storage) - manhattan(b, storage) ||
        deterministicJitter(a.x, a.y, slotOrderShift) - deterministicJitter(b.x, b.y, slotOrderShift),
    );
  const placeCandidate = (type, tag, candidate) => {
    if (!candidate) return false;
    const k = key(candidate.x, candidate.y);
    if (used.has(k)) return false;
    used.add(k);
    placements.push({ type, x: candidate.x, y: candidate.y, tag });
    selectedByKey.set(k, { type, tag });
    return true;
  };
  const placeSingleClosest = (type, tag) => {
    for (const candidate of allSorted) {
      if (placeCandidate(type, tag, candidate)) return true;
    }
    return false;
  };
  const placeExtensionsByBucket = (count) => {
    let placed = 0;
    for (const bucket of orderedBuckets) {
      if (placed >= count) break;
      for (const candidate of bucket.candidates) {
        if (placed >= count) break;
        if (placeCandidate(STRUCTURES.EXTENSION, 'preview.extension', candidate)) {
          placed += 1;
        }
      }
    }
    return placed;
  };

  // Order requested by user:
  // first special buildings, then rank + fill extensions bucket by bucket (closest spawn first).
  placeSingleClosest(STRUCTURES.FACTORY, 'preview.factory');
  placeSingleClosest(STRUCTURES.NUKER, 'preview.nuker');
  placeSingleClosest(STRUCTURES.OBSERVER, 'preview.observer');
  placeExtensionsByBucket(60);

  const rankingLimit = Number.isFinite(options.rankingLimit)
    ? Math.max(1, Math.trunc(options.rankingLimit))
    : 200;
  const extensionOrder = [];
  let extensionOrderTotal = 0;
  for (const bucket of orderedBuckets) {
    for (const candidate of bucket.candidates) {
      extensionOrderTotal += 1;
      if (extensionOrder.length >= rankingLimit) continue;
      const k = key(candidate.x, candidate.y);
      const selected = selectedByKey.get(k) || null;
      extensionOrder.push({
        rank: extensionOrderTotal,
        x: candidate.x,
        y: candidate.y,
        bucket: bucket.id,
        spawnDist: Number(candidate.spawnDist || 0),
        center: candidate.centerBonus ? 1 : 0,
        selectedType: selected ? selected.type : null,
        selectedTag: selected ? selected.tag : null,
      });
    }
  }

  const counts = {};
  for (const placement of placements) {
    counts[placement.type] = Number(counts[placement.type] || 0) + 1;
  }
  return {
    mode: 'foundation-preview',
    computed: true,
    strategy: 'special-first + spawn-closest-rank + bucket-fill',
    placements,
    counts,
    ranking: {
      spawnRef: { x: spawnReference.x, y: spawnReference.y },
      orderedBuckets: orderedBuckets.length,
      extensionOrderTotal,
      extensionOrder,
      extensionOrderTruncated: extensionOrderTotal > extensionOrder.length,
    },
  };
}

function buildFullRoomNodes() {
  const nodes = [];
  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      nodes.push({ x, y, d: 0 });
    }
  }
  return nodes;
}

function pathRoads(ctx, from, to, options = {}) {
  if (!from || !to || typeof PathFinder === 'undefined' || typeof PathFinder.search !== 'function') {
    return [];
  }
  if (typeof RoomPosition === 'undefined') return [];
  const preferredRoads = options.preferredRoads || null;
  const avoidKeys = options.avoidKeys || null;
  const avoidPenalty = Number.isFinite(options.avoidPenalty) ? options.avoidPenalty : 15;
  const routeTieBreakShift = Number.isFinite(options.routeTieBreakShift)
    ? Number(options.routeTieBreakShift)
    : Number(ctx && ctx.meta ? ctx.meta.routeTieBreakShift || 0 : 0);

  const res = PathFinder.search(
    new RoomPosition(from.x, from.y, ctx.roomName),
    { pos: new RoomPosition(to.x, to.y, ctx.roomName), range: 1 },
    {
      plainCost: 1,
      swampCost: 1,
      maxOps: 10000,
      roomCallback: () => {
        if (!PathFinder.CostMatrix) return false;
        const costs = new PathFinder.CostMatrix();
        for (let y = 0; y <= 49; y++) {
          for (let x = 0; x <= 49; x++) {
            const id = idx(x, y);
            if (ctx.matrices.walkableMatrix[id] !== 1) {
              costs.set(x, y, 255);
              continue;
            }
            const k = key(x, y);
            if (ctx.structuresByPos.has(k)) {
              costs.set(x, y, 255);
              continue;
            }
            if (avoidKeys && avoidKeys.has(k)) {
              costs.set(x, y, avoidPenalty);
              continue;
            }
            if (ctx.roads.has(k) || (preferredRoads && preferredRoads.has(k))) {
              costs.set(x, y, 1);
            } else if (routeTieBreakShift !== 0) {
              // Deterministic tie-break to explore alternate but still stable logistics routes.
              costs.set(x, y, deterministicJitter(x, y, routeTieBreakShift) ? 2 : 3);
            }
          }
        }
        return costs;
      },
    },
  );
  if (!res || !Array.isArray(res.path)) return [];
  return res.path.map((p) => ({ x: p.x, y: p.y }));
}

function terrainMoveCost(terrainType) {
  if (terrainType === 1) return 10;
  if (terrainType === 2) return 255;
  return 2;
}

function roadBuildCost(terrainType) {
  if (terrainType === 1) return 1500;
  if (terrainType === 2) return 45000;
  return 300;
}

function terrainClassFromMask(mask) {
  if ((mask & TERRAIN_WALL_MASK) !== 0) return 2;
  if ((mask & TERRAIN_SWAMP_MASK) !== 0) return 1;
  return 0;
}

function createTerrainAccessor(roomName) {
  let terrain = null;
  const room = Game.rooms && Game.rooms[roomName] ? Game.rooms[roomName] : null;
  if (room && typeof room.getTerrain === 'function') {
    terrain = room.getTerrain();
  } else if (
    Game.map &&
    typeof Game.map.getRoomTerrain === 'function'
  ) {
    terrain = Game.map.getRoomTerrain(roomName);
  }
  if (!terrain || typeof terrain.get !== 'function') {
    return () => 0;
  }
  return (x, y) => terrainClassFromMask(terrain.get(x, y));
}

function estimateRampartEnvelopeFromPoints(points, margin = 3) {
  if (!points.length) return [];
  let minX = 49;
  let maxX = 0;
  let minY = 49;
  let maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  minX = Math.max(2, minX - margin);
  maxX = Math.min(47, maxX + margin);
  minY = Math.max(2, minY - margin);
  maxY = Math.min(47, maxY + margin);
  const ring = [];
  for (let x = minX; x <= maxX; x++) {
    ring.push({ x, y: minY });
    ring.push({ x, y: maxY });
  }
  for (let y = minY + 1; y <= maxY - 1; y++) {
    ring.push({ x: minX, y });
    ring.push({ x: maxX, y });
  }
  return ring;
}

function estimateRampartEnvelope(ctx, margin = 3) {
  const points = [...ctx.structuresByPos.keys()].map(parseKey);
  return estimateRampartEnvelopeFromPoints(points, margin);
}

function isCoreDefenseStructure(placement, storagePos) {
  if (!placement) return false;
  if (placement.type === STRUCTURES.ROAD || placement.type === STRUCTURES.RAMPART) return false;
  const tag = String(placement.tag || '');
  if (tag.startsWith('source.')) return false;
  if (tag.startsWith('mineral.')) return false;
  if (tag === 'controller.container' || tag === 'controller.link') return false;
  if (storagePos && chebyshev(placement, storagePos) > 14) return false;
  return true;
}

function buildDefenseCutContext(ctx, storagePos) {
  const defenseMap = new Map();
  for (const placement of ctx.placements || []) {
    if (!isCoreDefenseStructure(placement, storagePos)) continue;
    defenseMap.set(key(placement.x, placement.y), placement.type);
  }
  return {
    structuresByPos: defenseMap,
    matrices: ctx.matrices,
  };
}

function pickBestRampartCut(ctx, storagePos) {
  const defenseCtx = buildDefenseCutContext(ctx, storagePos);
  const defensePoints = [...defenseCtx.structuresByPos.keys()].map(parseKey);
  if (!defensePoints.length) {
    return {
      line: [],
      standoff: 0,
      margin: 3,
      minCutMeta: { method: 'flow-mincut', reason: 'no-defense-points' },
    };
  }
  const targetStandoff = 3;
  let best = null;
  for (let margin = 3; margin <= 8; margin++) {
    const cut = minCutAlgorithm.computeRampartCut(defenseCtx, { margin });
    const line = cut.line && cut.line.length
      ? cut.line
      : estimateRampartEnvelopeFromPoints(defensePoints, margin);
    const standoff = computeMinRampartStandoff(ctx.placements, line, storagePos);
    const underPenalty = standoff < targetStandoff ? (targetStandoff - standoff) * 2000 : 0;
    const overPenalty = standoff > targetStandoff ? (standoff - targetStandoff) * 120 : 0;
    const sizePenalty = line.length * 1.2;
    const score = underPenalty + overPenalty + sizePenalty;
    if (!best || score < best.score) {
      best = {
        score,
        line,
        standoff,
        margin,
        minCutMeta: cut.meta || { method: 'flow-mincut', margin },
      };
    }
  }
  return best || {
    line: [],
    standoff: 0,
    margin: 3,
    minCutMeta: { method: 'flow-mincut', reason: 'no-solution' },
  };
}

function computeMinRampartStandoff(placements, rampartLine, storagePos) {
  if (!Array.isArray(rampartLine) || rampartLine.length === 0) return 0;
  const relevant = (placements || []).filter((p) => isCoreDefenseStructure(p, storagePos));
  if (!relevant.length) return 0;
  let minDistance = Infinity;
  for (const structure of relevant) {
    let closest = Infinity;
    for (const rp of rampartLine) {
      const d = chebyshev(structure, rp);
      if (d < closest) closest = d;
    }
    if (closest < minDistance) minDistance = closest;
  }
  return Number.isFinite(minDistance) ? minDistance : 0;
}

function computeTowerDamage(range) {
  if (range <= 5) return 600;
  if (range >= 20) return 150;
  const falloff = 0.75 * ((range - 5) / 15);
  return Math.round(600 * (1 - falloff));
}

function buildUpgraderArea(ctx, controllerPos, storage) {
  let bestSlots = null;
  let bestScore = -Infinity;

  const tryRect = (x0, y0, w, h) => {
    const slots = [];
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const p = { x: x0 + dx, y: y0 + dy };
        if (!inBounds(p.x, p.y) || !isTileWalkableForPlacement(ctx, p.x, p.y)) return;
        if (chebyshev(p, controllerPos) > 3) return;
        slots.push(p);
      }
    }
    if (!slots.length) return;
    const avgStorage = slots.reduce((s, p) => s + chebyshev(p, storage), 0) / slots.length;
    const score = 200 - avgStorage;
    if (score > bestScore) {
      bestScore = score;
      bestSlots = slots;
    }
  };

  for (let x = 2; x <= 46; x++) {
    for (let y = 2; y <= 46; y++) {
      tryRect(x, y, 4, 2);
      tryRect(x, y, 2, 4);
      tryRect(x, y, 3, 3);
    }
  }

  if (!bestSlots) return null;
  ctx.meta.upgraderSlots = bestSlots;
  return bestSlots;
}

function makePathCostHelper(roomName) {
  const cache = new Map();
  return function pathCost(from, to, range = 1) {
    const id = `${from.x},${from.y}->${to.x},${to.y}:${range}`;
    if (cache.has(id)) return cache.get(id);

    let cost = chebyshev(from, to);
    if (
      typeof PathFinder !== 'undefined' &&
      typeof PathFinder.search === 'function' &&
      typeof RoomPosition !== 'undefined'
    ) {
      const search = PathFinder.search(
        new RoomPosition(from.x, from.y, roomName),
        { pos: new RoomPosition(to.x, to.y, roomName), range },
        { plainCost: 1, swampCost: 1, maxOps: 4000 },
      );
      if (search && typeof search.cost === 'number' && Number.isFinite(search.cost)) {
        cost = search.cost;
      }
    }

    cache.set(id, cost);
    return cost;
  };
}

function computeDirectionalOpenDistances(matrices, x, y) {
  const dirs = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];
  const out = [];
  for (const [dx, dy] of dirs) {
    let px = x + dx;
    let py = y + dy;
    let dist = 0;
    while (inBounds(px, py) && matrices.walkableMatrix[idx(px, py)] === 1) {
      dist += 1;
      px += dx;
      py += dy;
    }
    out.push(dist);
  }
  return out;
}

function chooseLabClusterFromValidCandidates(candidates, storage, options = {}) {
  if (!Array.isArray(candidates) || candidates.length < 10 || !storage) return null;
  const stampCenterKeys =
    options && options.stampCenterKeys instanceof Set ? options.stampCenterKeys : new Set();
  const dist = (a, b) => chebyshev(a, b);
  const sortedByStorage = candidates
    .slice()
    .sort((a, b) => manhattan(a, storage) - manhattan(b, storage))
    .slice(0, 90);
  const sorted = [];
  const seen = new Set();
  for (const candidate of sortedByStorage) {
    if (sorted.length >= 70) break;
    const k = key(candidate.x, candidate.y);
    if (seen.has(k)) continue;
    seen.add(k);
    sorted.push(candidate);
  }
  // Ensure stamp centers are always evaluated for lab clustering if they are valid candidates.
  for (const candidate of sortedByStorage) {
    const k = key(candidate.x, candidate.y);
    if (!stampCenterKeys.has(k) || seen.has(k)) continue;
    seen.add(k);
    sorted.push(candidate);
  }
  let best = null;

  const nearbyCount = (point) =>
    sorted.reduce((sum, candidate) => sum + (dist(point, candidate) <= 2 ? 1 : 0), 0);

  const hubs = sorted
    .slice()
    .sort((a, b) => {
      const aScore = nearbyCount(a) * 10 - manhattan(a, storage);
      const bScore = nearbyCount(b) * 10 - manhattan(b, storage);
      return bScore - aScore;
    })
    .slice(0, 20);

  for (let i = 0; i < hubs.length; i++) {
    const hub = hubs[i];
    const local = sorted
      .filter((candidate) => dist(candidate, hub) <= 3)
      .slice(0, 30);
    for (let a = 0; a < local.length; a++) {
      for (let b = a + 1; b < local.length; b++) {
        const labA = local[a];
        const labB = local[b];
        if (dist(labA, labB) > 2) continue;
        const reactions = local
          .filter((candidate) => {
            if ((candidate.x === labA.x && candidate.y === labA.y) || (candidate.x === labB.x && candidate.y === labB.y)) {
              return false;
            }
            return dist(candidate, labA) <= 2 && dist(candidate, labB) <= 2;
          })
          .sort((left, right) =>
            Number(stampCenterKeys.has(key(right.x, right.y))) -
              Number(stampCenterKeys.has(key(left.x, left.y))) ||
            manhattan(left, hub) - manhattan(right, hub) ||
            manhattan(left, storage) - manhattan(right, storage),
          );
        if (reactions.length < 8) continue;
        const chosenReactions = reactions.slice(0, 8);
        const allLabs = [labA, labB, ...chosenReactions];
        const compactness = allLabs.reduce((sum, lab) => sum + manhattan(lab, hub), 0);
        const storageBias = allLabs.reduce((sum, lab) => sum + manhattan(lab, storage), 0);
        const centerHits = allLabs.reduce(
          (sum, lab) => sum + (stampCenterKeys.has(key(lab.x, lab.y)) ? 1 : 0),
          0,
        );
        const score = 500 - compactness - storageBias * 0.25 + centerHits * 12;
        if (!best || score > best.score) {
          best = {
            score,
            source1: { x: labA.x, y: labA.y },
            source2: { x: labB.x, y: labB.y },
            reactions: chosenReactions.map((lab) => ({ x: lab.x, y: lab.y })),
            hub: { x: hub.x, y: hub.y },
          };
        }
      }
    }
  }

  return best;
}

function computeTerrainQuality(matrices, x, y, radius = 7) {
  let plainCount = 0;
  let totalCount = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const t = matrices.terrainMatrix[idx(nx, ny)];
      if (t === 2) continue;
      totalCount += 1;
      if (t === 0) plainCount += 1;
    }
  }
  if (totalCount === 0) return 0;
  return plainCount / totalCount;
}

function estimateDefenseProxy(candidate, inputs = {}) {
  const {
    controllerPos,
    sources = [],
    mineral = null,
    matrices,
    margin = 3,
  } = inputs;
  const points = [{ x: candidate.x, y: candidate.y }];
  if (controllerPos) points.push({ x: controllerPos.x, y: controllerPos.y });
  for (const source of sources) {
    const p = source && source.pos ? source.pos : source;
    if (p && typeof p.x === 'number' && typeof p.y === 'number') {
      points.push({ x: p.x, y: p.y });
    }
  }
  if (mineral) {
    const mp = mineral.pos || mineral;
    if (mp && typeof mp.x === 'number' && typeof mp.y === 'number') {
      points.push({ x: mp.x, y: mp.y });
    }
  }
  if (!points.length) return { rampartOpen: 180, standoff: 0 };

  let minX = 49;
  let maxX = 0;
  let minY = 49;
  let maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  minX = Math.max(2, minX - margin);
  maxX = Math.min(47, maxX + margin);
  minY = Math.max(2, minY - margin);
  maxY = Math.min(47, maxY + margin);

  let rampartOpen = 0;
  for (let x = minX; x <= maxX; x++) {
    if (matrices.walkableMatrix[idx(x, minY)] === 1) rampartOpen += 1;
    if (maxY !== minY && matrices.walkableMatrix[idx(x, maxY)] === 1) rampartOpen += 1;
  }
  for (let y = minY + 1; y <= maxY - 1; y++) {
    if (matrices.walkableMatrix[idx(minX, y)] === 1) rampartOpen += 1;
    if (maxX !== minX && matrices.walkableMatrix[idx(maxX, y)] === 1) rampartOpen += 1;
  }

  let minStandoff = Infinity;
  for (const p of points) {
    const d = Math.min(p.x - minX, maxX - p.x, p.y - minY, maxY - p.y);
    if (Number.isFinite(d)) minStandoff = Math.min(minStandoff, d);
  }

  return {
    rampartOpen,
    standoff: Number.isFinite(minStandoff) ? minStandoff : 0,
  };
}

function detectCandidateDtThreshold(dt) {
  let maxDt = 0;
  for (let i = 0; i < dt.length; i++) {
    if (dt[i] > maxDt) maxDt = dt[i];
  }
  if (maxDt >= 3) return 3;
  if (maxDt >= 2) return 2;
  return 1;
}

function scoreCandidate(candidate, inputs) {
  const {
    controllerPos,
    sources,
    mineral,
    matrices,
    dt,
    pathCost,
    weights = DEFAULT_PRE_WEIGHTS,
  } = inputs;

  const { x, y } = candidate;
  const id = idx(x, y);
  const controllerDist = pathCost(candidate, controllerPos, 3);
  const sourceCosts = (sources || []).map((s) => {
    const p = s.pos || s;
    return pathCost(candidate, p, 1);
  });
  const avgSourceDist = sourceCosts.length ? mean(sourceCosts) : 25;
  const mineralDist = mineral ? chebyshev(candidate, mineral.pos || mineral) : 25;
  const dtValue = dt[id] || 0;
  const exitDist = Math.max(0, matrices.exitDistance[id]);
  const exitPenalty = exitDist < 8 ? 8 - exitDist : 0;
  const terrainQuality = computeTerrainQuality(matrices, x, y, 7);

  const dirDists = computeDirectionalOpenDistances(matrices, x, y);
  const meanDir = mean(dirDists);
  const variance = mean(dirDists.map((d) => (d - meanDir) * (d - meanDir)));
  const symmetry = 1 / (1 + Math.sqrt(variance));
  const defenseProxy = estimateDefenseProxy(candidate, {
    controllerPos,
    sources,
    mineral,
    matrices,
    margin: 3,
  });
  const defenseRampartScore = clamp01(1 - defenseProxy.rampartOpen / 180);
  const defenseStandoffScore = clamp01(defenseProxy.standoff / 6);

  const contributions = {
    controllerDist: weights.controllerDist * controllerDist,
    avgSourceDist: weights.avgSourceDist * avgSourceDist,
    mineralDist: weights.mineralDist * mineralDist,
    dtValue: weights.dtValue * dtValue,
    exitDist: weights.exitDist * exitDist,
    exitDistPenalty: weights.exitDistPenalty * exitPenalty,
    terrainQuality: weights.terrainQuality * terrainQuality * 20,
    symmetry: weights.symmetry * symmetry * 10,
    defenseRampart: weights.defenseRampart * defenseRampartScore * 20,
    defenseStandoff: weights.defenseStandoff * defenseStandoffScore * 12,
  };

  const score = Object.values(contributions).reduce((sum, value) => sum + value, 0);

  return {
    score,
    contributions,
    metrics: {
      controllerDist,
      avgSourceDist,
      mineralDist,
      dtValue,
      exitDist,
      exitPenalty,
      terrainQuality,
      symmetry,
      defenseRampart: defenseProxy.rampartOpen,
      defenseStandoff: defenseProxy.standoff,
    },
  };
}

function hasHarabiCoreStampFit(anchor, matrices) {
  if (!anchor || !matrices) return false;
  const stamp = getHarabiCoreStamp(anchor);
  if (!stamp || !stamp.center || !stamp.slots) return false;

  const structureSlots = [
    stamp.slots.spawn1,
    stamp.slots.spawn2,
    stamp.slots.spawn3,
    stamp.slots.storage,
    stamp.slots.terminal,
    stamp.slots.link,
    stamp.slots.powerSpawn,
  ];
  for (const rel of structureSlots) {
    const x = stamp.center.x + rel.x;
    const y = stamp.center.y + rel.y;
    if (!inBounds(x, y)) return false;
    const id = idx(x, y);
    if (matrices.walkableMatrix[id] !== 1) return false;
    if (matrices.staticBlocked && matrices.staticBlocked[id] === 1) return false;
    if (matrices.exitProximity && matrices.exitProximity[id] === 1) return false;
  }

  for (const rel of stamp.roads || []) {
    const x = stamp.center.x + rel.x;
    const y = stamp.center.y + rel.y;
    if (!inBounds(x, y)) return false;
    const id = idx(x, y);
    if (matrices.walkableMatrix[id] !== 1) return false;
    if (matrices.staticBlocked && matrices.staticBlocked[id] === 1) return false;
  }

  return true;
}

function buildCandidateSet(roomName, options = {}) {
  const room = Game.rooms[roomName];
  if (!room || !room.controller || !room.controller.my) {
    return {
      roomName,
      candidates: [],
      dtThreshold: 3,
      totalCandidates: 0,
      scannedCandidates: 0,
      filteredCandidates: 0,
      fallbackUsed: true,
    };
  }

  const dt = ensureDistanceTransform(room);
  const sources = findFirstNonEmpty(room, [FIND_SOURCES_CONST, 'FIND_SOURCES', 1]);
  const minerals = findFirstNonEmpty(room, [FIND_MINERALS_CONST, 'FIND_MINERALS']);
  const mineral = minerals.length > 0 ? minerals[0] : null;

  const matrices = buildTerrainMatrices(room);
  matrices.staticBlocked = computeStaticBlockedMatrix(room);

  const controllerPos = { x: room.controller.pos.x, y: room.controller.pos.y };
  const pathCost = makePathCostHelper(roomName);
  const topN = Math.max(1, options.topN || 5);
  const useHarabi = isHarabiPattern(resolveLayoutPattern(options));

  const dtThreshold = options.dtThreshold || detectCandidateDtThreshold(dt);
  const minExitDistance = options.minExitDistance || 5;

  let swampTiles = 0;
  let walkableTiles = 0;
  for (let i = 0; i < matrices.walkableMatrix.length; i++) {
    if (matrices.walkableMatrix[i] !== 1) continue;
    walkableTiles += 1;
    if (matrices.terrainMatrix[i] === 1) swampTiles += 1;
  }
  const swampRatio = walkableTiles > 0 ? swampTiles / walkableTiles : 0;

  const allCandidates = [];
  const nonSwampCandidates = [];

  for (let x = 5; x <= 44; x++) {
    for (let y = 5; y <= 44; y++) {
      const id = idx(x, y);
      if (matrices.walkableMatrix[id] !== 1) continue;
      if (matrices.staticBlocked[id] === 1) continue;
      if ((dt[id] || 0) < dtThreshold) continue;
      if (Math.max(0, matrices.exitDistance[id]) < minExitDistance) continue;
      const c = { x, y };
      if (useHarabi && !hasHarabiCoreStampFit(c, matrices)) continue;
      allCandidates.push(c);
      if (matrices.terrainMatrix[id] !== 1) {
        nonSwampCandidates.push(c);
      }
    }
  }

  const preferNonSwamp = swampRatio <= 0.6;
  const working =
    preferNonSwamp && nonSwampCandidates.length >= topN
      ? nonSwampCandidates
      : allCandidates;

  const scored = working
    .map((candidate) => {
      const scoredCandidate = scoreCandidate(candidate, {
        controllerPos,
        sources,
        mineral,
        matrices,
        dt,
        pathCost,
      });
      return {
        index: -1,
        anchor: { x: candidate.x, y: candidate.y },
        initialScore: scoredCandidate.score,
        initialMetrics: scoredCandidate.metrics,
        initialContributions: scoredCandidate.contributions,
      };
    })
    .sort((a, b) => b.initialScore - a.initialScore)
    .slice(0, topN)
    .map((c, index) => Object.assign({}, c, { index }));

  if (scored.length === 0) {
    const fallback = {
      index: 0,
      anchor: {
        x: Math.min(44, Math.max(5, controllerPos.x + 6)),
        y: Math.min(44, Math.max(5, controllerPos.y)),
      },
      initialScore: 0,
      initialMetrics: {
        controllerDist: 0,
        avgSourceDist: 0,
        mineralDist: 0,
        dtValue: 0,
        exitDist: 0,
        exitPenalty: 0,
        terrainQuality: 0,
        symmetry: 0,
        defenseRampart: 0,
        defenseStandoff: 0,
      },
      initialContributions: {
        controllerDist: 0,
        avgSourceDist: 0,
        mineralDist: 0,
        dtValue: 0,
        exitDist: 0,
        exitDistPenalty: 0,
        terrainQuality: 0,
        symmetry: 0,
        defenseRampart: 0,
        defenseStandoff: 0,
      },
    };

    return {
      roomName,
      candidates: [fallback],
      dtThreshold,
      totalCandidates: allCandidates.length,
      scannedCandidates: allCandidates.length,
      filteredCandidates: working.length,
      fallbackUsed: true,
      swampRatio,
    };
  }

  return {
    roomName,
    candidates: scored,
    dtThreshold,
    totalCandidates: allCandidates.length,
    scannedCandidates: allCandidates.length,
    filteredCandidates: working.length,
    fallbackUsed: false,
    swampRatio,
  };
}

function buildPlanForAnchor(room, input) {
  const {
    anchor,
    matrices,
    dt,
    sources,
    mineral,
    controllerPos,
    candidateMeta = null,
    layoutPattern = 'parity',
    harabiStage = 'foundation',
    mutation = null,
  } = input;
  const mutationOptions = normalizeMutationOptions(mutation);
  const ctx = createPlanContext(room, matrices);
  ctx.meta.routeTieBreakShift = mutationOptions.routeTieBreakShift || 0;
  const useHarabi = isHarabiPattern(layoutPattern);
  // Harabi cluster3 planning is foundation-only; "full" is intentionally retired.
  const foundationOnly = useHarabi;
  const coreStamp = useHarabi ? getHarabiCoreStamp(anchor) : null;
  const coreSlotAbs = (slotKey) => {
    if (!coreStamp || !coreStamp.slots[slotKey]) return null;
    return {
      x: coreStamp.center.x + coreStamp.slots[slotKey].x,
      y: coreStamp.center.y + coreStamp.slots[slotKey].y,
    };
  };
  const coreStructureSlotKeys = new Set();
  if (coreStamp && coreStamp.slots) {
    for (const rel of Object.values(coreStamp.slots)) {
      if (!rel) continue;
      coreStructureSlotKeys.add(key(coreStamp.center.x + rel.x, coreStamp.center.y + rel.y));
    }
  }
  if (coreStamp) {
    applyRoadStamp(ctx, coreStamp.center, coreStamp.roads, 'road.coreStamp');
    // Keep core stamp roads immutable; non-road placements must not consume them.
    for (const rel of coreStamp.roads || []) {
      const rx = coreStamp.center.x + rel.x;
      const ry = coreStamp.center.y + rel.y;
      if (!inBounds(rx, ry)) continue;
      ctx.reserved.add(key(rx, ry));
    }
  }

  // Storage near anchor (range 1), needs high access.
  const storageCandidates = [];
  const preferredStorage = coreSlotAbs('storage');
  if (
    preferredStorage &&
    canPlaceStructure(ctx, STRUCTURES.STORAGE, preferredStorage.x, preferredStorage.y)
  ) {
    storageCandidates.push(preferredStorage);
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (!canPlaceStructure(ctx, STRUCTURES.STORAGE, x, y)) continue;
      storageCandidates.push({ x, y });
    }
  }
  let storage = null;
  if (
    useHarabi &&
    preferredStorage &&
    canPlaceStructure(ctx, STRUCTURES.STORAGE, preferredStorage.x, preferredStorage.y)
  ) {
    storage = preferredStorage;
  } else {
    storage =
      findBestByCandidates(storageCandidates, (p) => {
        const n = countWalkableNeighbors(ctx, p.x, p.y);
        const dtv = dt[idx(p.x, p.y)] || 0;
        const plainBonus = matrices.terrainMatrix[idx(p.x, p.y)] === 0 ? 1 : 0;
        if (n < 3 || dtv < 2) return -99999;
        return -chebyshev(p, anchor) + 3 * n + 2 * dtv + plainBonus;
      }) || anchor;
  }
  addPlacement(ctx, STRUCTURES.STORAGE, storage.x, storage.y, 4, 'core.storage');
  if (useHarabi && preferredStorage && (storage.x !== preferredStorage.x || storage.y !== preferredStorage.y)) {
    ctx.meta.validation.push('core-stamp-storage-fallback');
  }

  // Spawn #1 near anchor/storage, needs 2 exits.
  const spawn1Candidates = [];
  const preferredSpawn1 = coreSlotAbs('spawn1');
  if (
    preferredSpawn1 &&
    canPlaceStructure(ctx, STRUCTURES.SPAWN, preferredSpawn1.x, preferredSpawn1.y)
  ) {
    spawn1Candidates.push(preferredSpawn1);
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (!canPlaceStructure(ctx, STRUCTURES.SPAWN, x, y)) continue;
      spawn1Candidates.push({ x, y });
    }
  }
  let spawn1 = null;
  if (
    useHarabi &&
    preferredSpawn1 &&
    canPlaceStructure(ctx, STRUCTURES.SPAWN, preferredSpawn1.x, preferredSpawn1.y)
  ) {
    spawn1 = preferredSpawn1;
  } else {
    spawn1 = findBestByCandidates(spawn1Candidates, (p) => {
      const n = countWalkableNeighbors(ctx, p.x, p.y);
      const plainBonus = matrices.terrainMatrix[idx(p.x, p.y)] === 0 ? 1 : 0;
      if (n < 2) return -99999;
      return -chebyshev(p, anchor) + 2 * n + plainBonus;
    });
  }
  if (spawn1) addPlacement(ctx, STRUCTURES.SPAWN, spawn1.x, spawn1.y, 1, 'spawn.1');
  if (useHarabi && preferredSpawn1 && (!spawn1 || spawn1.x !== preferredSpawn1.x || spawn1.y !== preferredSpawn1.y)) {
    ctx.meta.validation.push('core-stamp-spawn1-fallback');
  }
  if (spawn1 && sources.length > 0) {
    const nearestSource = sources
      .map((s) => ({ s, d: chebyshev(spawn1, s.pos) }))
      .sort((a, b) => a.d - b.d)[0].s;
    const exitCandidates = neighbors8(spawn1.x, spawn1.y)
      .filter((p) => isTileWalkableForPlacement(ctx, p.x, p.y))
      .filter((p) => !ctx.structuresByPos.has(key(p.x, p.y)))
      .filter((p) => !coreStructureSlotKeys.has(key(p.x, p.y)))
      .sort((a, b) => chebyshev(a, nearestSource.pos) - chebyshev(b, nearestSource.pos));
    if (exitCandidates[0]) {
      reserveTile(ctx, exitCandidates[0].x, exitCandidates[0].y, 'spawn.1.exit');
    }
  }

  // Source containers + links.
  const sourceContainers = [];
  const sourceRoadAnchors = [];
  for (const src of sources) {
    if (!src || !src.id || !src.pos) continue;
    const around = neighbors8(src.pos.x, src.pos.y).filter((p) =>
      canPlaceStructure(ctx, STRUCTURES.CONTAINER, p.x, p.y),
    );
    const cont = findBestByCandidates(around, (p) => {
      const n = countWalkableNeighbors(ctx, p.x, p.y);
      return -manhattan(storage, p) + 0.5 * n;
    });
    if (!cont) continue;
    addPlacement(ctx, STRUCTURES.CONTAINER, cont.x, cont.y, 1, `source.container.${src.id}`);
    sourceContainers.push({ source: src, pos: cont });
    ctx.meta.sourceLogistics[src.id] = {
      containerPos: { x: cont.x, y: cont.y },
      roadAnchored: false,
      linkPlaced: false,
      linkFallbackUsed: false,
    };

    // Reserve at least one adjacent road anchor tile before link placement.
    const anchorCandidates = neighbors8(cont.x, cont.y)
      .filter((p) => inBounds(p.x, p.y))
      .filter((p) => !ctx.structuresByPos.has(key(p.x, p.y)))
      .filter((p) => ctx.matrices.walkableMatrix[idx(p.x, p.y)] === 1)
      .sort((a, b) => manhattan(a, storage) - manhattan(b, storage));
    const roadAnchor = anchorCandidates.length > 0 ? anchorCandidates[0] : null;
    if (roadAnchor) {
      sourceRoadAnchors.push({ sourceId: src.id, x: roadAnchor.x, y: roadAnchor.y });
      reserveTile(ctx, roadAnchor.x, roadAnchor.y, `source.roadAnchor.${src.id}`);
    }

    const linkCandidates = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const p = { x: src.pos.x + dx, y: src.pos.y + dy };
        if (chebyshev(p, src.pos) > 2) continue;
        if (roadAnchor && p.x === roadAnchor.x && p.y === roadAnchor.y) continue;
        if (!canPlaceStructure(ctx, STRUCTURES.LINK, p.x, p.y)) continue;
        linkCandidates.push(p);
      }
    }
    const adjacentToContainer = linkCandidates.filter((p) => chebyshev(p, cont) <= 1);
    const nearContainer = linkCandidates.filter((p) => chebyshev(p, cont) <= 2);
    const workingLinkCandidates =
      adjacentToContainer.length > 0
        ? adjacentToContainer
        : nearContainer.length > 0
        ? nearContainer
        : linkCandidates;
    const primaryLinkCandidates = workingLinkCandidates.filter((p) => chebyshev(p, cont) <= 1);
    const candidatePool = primaryLinkCandidates.length > 0 ? primaryLinkCandidates : workingLinkCandidates;
    const slink = findBestByCandidates(candidatePool, (p) => {
      const sourcePenalty = chebyshev(p, src.pos) === 1 ? 0 : 1;
      const containerPenalty = Math.max(0, chebyshev(p, cont) - 1) * 1.4;
      return -manhattan(storage, p) - sourcePenalty - containerPenalty;
    });
    if (slink) {
      addPlacement(
        ctx,
        STRUCTURES.LINK,
        slink.x,
        slink.y,
        7,
        `source.link.${src.id}`,
      );
      if (ctx.meta.sourceLogistics[src.id]) {
        ctx.meta.sourceLogistics[src.id].linkPlaced = true;
        ctx.meta.sourceLogistics[src.id].linkFallbackUsed = candidatePool !== primaryLinkCandidates;
      }
    }
  }
  const sourceLinkPlacements = (ctx.placements || [])
    .filter((placement) => placement && placement.type === STRUCTURES.LINK)
    .filter((placement) => String(placement.tag || '').startsWith('source.link.'))
    .sort((left, right) => manhattan(storage, right) - manhattan(storage, left));
  for (let i = 0; i < sourceLinkPlacements.length; i++) {
    sourceLinkPlacements[i].rcl = i === 0 ? 6 : 7;
  }

  // Upgrader area + controller container/link.
  const upgraderSlots = foundationOnly ? null : buildUpgraderArea(ctx, controllerPos, storage);
  if (upgraderSlots && !foundationOnly && !useHarabi) {
    const ctrlContainerCandidates = neighbors8(controllerPos.x, controllerPos.y)
      .filter((p) => canPlaceStructure(ctx, STRUCTURES.CONTAINER, p.x, p.y))
      .filter((p) => upgraderSlots.some((s) => chebyshev(s, p) <= 1));
    const ctrlContainer = findBestByCandidates(ctrlContainerCandidates, (p) => -manhattan(storage, p));
    if (ctrlContainer) {
      addPlacement(
        ctx,
        STRUCTURES.CONTAINER,
        ctrlContainer.x,
        ctrlContainer.y,
        4,
        'controller.container',
      );
    }

    const ctrlLinkCandidates = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const p = { x: controllerPos.x + dx, y: controllerPos.y + dy };
        if (chebyshev(p, controllerPos) > 2) continue;
        if (!canPlaceStructure(ctx, STRUCTURES.LINK, p.x, p.y)) continue;
        if (!upgraderSlots.some((s) => chebyshev(s, p) <= 1)) continue;
        ctrlLinkCandidates.push(p);
      }
    }
    const ctrlLink = findBestByCandidates(ctrlLinkCandidates, (p) => -manhattan(storage, p));
    if (ctrlLink) addPlacement(ctx, STRUCTURES.LINK, ctrlLink.x, ctrlLink.y, 8, 'controller.link');
  }

  if (useHarabi) {
    const centers = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const c = { x: controllerPos.x + dx, y: controllerPos.y + dy };
        if (!inBounds(c.x, c.y)) continue;
        if (chebyshev(c, controllerPos) > 2) continue;
        if (coreStructureSlotKeys.has(key(c.x, c.y))) continue;
        const ring = neighbors8(c.x, c.y);
        if (!ring.every((p) => chebyshev(p, controllerPos) <= 3 && inBounds(p.x, p.y))) continue;
        if (ring.some((p) => coreStructureSlotKeys.has(key(p.x, p.y)))) continue;
        centers.push(c);
      }
    }
    const stampCenter = findBestByCandidates(centers, (c) => {
      if (!canPlaceStructure(ctx, STRUCTURES.LINK, c.x, c.y)) return -99999;
      const open = neighbors8(c.x, c.y).reduce(
        (sum, p) => sum + (canPlaceStructure(ctx, STRUCTURES.ROAD, p.x, p.y) ? 1 : 0),
        0,
      );
      return 20 * open - manhattan(c, storage);
    });
    if (stampCenter) {
      addPlacement(ctx, STRUCTURES.LINK, stampCenter.x, stampCenter.y, 8, 'controller.link');
      for (const p of neighbors8(stampCenter.x, stampCenter.y)) {
        if (chebyshev(p, controllerPos) > 3) continue;
        addPlacement(ctx, STRUCTURES.ROAD, p.x, p.y, 2, 'road.controllerStamp');
      }
      ctx.meta.upgraderSlots = neighbors8(stampCenter.x, stampCenter.y)
        .filter((p) => chebyshev(p, controllerPos) <= 3)
        .map((p) => ({ x: p.x, y: p.y }));
    }
  }

  // Terminal (range 1 to storage) and sink link (range 1 storage).
  const aroundStorage = neighbors8(storage.x, storage.y).filter((p) =>
    canPlaceStructure(ctx, STRUCTURES.TERMINAL, p.x, p.y),
  );
  const preferredTerminal = coreSlotAbs('terminal');
  if (
    preferredTerminal &&
    canPlaceStructure(ctx, STRUCTURES.TERMINAL, preferredTerminal.x, preferredTerminal.y)
  ) {
    aroundStorage.unshift(preferredTerminal);
  }
  let terminal = null;
  if (
    useHarabi &&
    preferredTerminal &&
    canPlaceStructure(ctx, STRUCTURES.TERMINAL, preferredTerminal.x, preferredTerminal.y)
  ) {
    terminal = preferredTerminal;
  } else {
    terminal = findBestByCandidates(aroundStorage, (p) => {
      const n = countWalkableNeighbors(ctx, p.x, p.y);
      return n;
    });
  }
  if (terminal) addPlacement(ctx, STRUCTURES.TERMINAL, terminal.x, terminal.y, 6, 'core.terminal');
  if (
    useHarabi &&
    preferredTerminal &&
    (!terminal || terminal.x !== preferredTerminal.x || terminal.y !== preferredTerminal.y)
  ) {
    ctx.meta.validation.push('core-stamp-terminal-fallback');
  }

  const sinkCandidates = neighbors8(storage.x, storage.y).filter((p) =>
    canPlaceStructure(ctx, STRUCTURES.LINK, p.x, p.y),
  );
  const preferredSinkLink = coreSlotAbs('link');
  if (
    preferredSinkLink &&
    canPlaceStructure(ctx, STRUCTURES.LINK, preferredSinkLink.x, preferredSinkLink.y)
  ) {
    sinkCandidates.unshift(preferredSinkLink);
  }
  let sinkLink = null;
  if (
    useHarabi &&
    preferredSinkLink &&
    canPlaceStructure(ctx, STRUCTURES.LINK, preferredSinkLink.x, preferredSinkLink.y)
  ) {
    sinkLink = preferredSinkLink;
  } else {
    sinkLink = findBestByCandidates(sinkCandidates, (p) => {
      if (terminal && p.x === terminal.x && p.y === terminal.y) return -99999;
      return countWalkableNeighbors(ctx, p.x, p.y);
    });
  }
  if (sinkLink) addPlacement(ctx, STRUCTURES.LINK, sinkLink.x, sinkLink.y, 5, 'link.sink');
  if (
    useHarabi &&
    preferredSinkLink &&
    (!sinkLink || sinkLink.x !== preferredSinkLink.x || sinkLink.y !== preferredSinkLink.y)
  ) {
    ctx.meta.validation.push('core-stamp-link-fallback');
  }

  // Core stamp occupants that should always be planned in Harabi mode.
  if (useHarabi) {
    const requiredCore = [
      { slot: 'spawn2', type: STRUCTURES.SPAWN, rcl: 7, tag: 'spawn.2' },
      { slot: 'spawn3', type: STRUCTURES.SPAWN, rcl: 8, tag: 'spawn.3' },
      { slot: 'powerSpawn', type: STRUCTURES.POWER_SPAWN, rcl: 8, tag: 'core.powerSpawn' },
    ];
    for (const cfg of requiredCore) {
      const pos = coreSlotAbs(cfg.slot);
      if (!pos) continue;
      if (canPlaceStructure(ctx, cfg.type, pos.x, pos.y)) {
        addPlacement(ctx, cfg.type, pos.x, pos.y, cfg.rcl, cfg.tag);
      } else {
        ctx.meta.validation.push(`core-stamp-${cfg.slot}-missing`);
      }
    }
  }

  // Extension field: checkerboard from storage flood, <= 10 BFS.
  const parity = checkerboard.parityAt(storage.x, storage.y);
  const floodFromStorage = floodFillAlgorithm.floodFill(walkableWithPlan(ctx), storage, { maxDepth: 12 });
  const extensionDepthLimit = isHarabiPattern(layoutPattern) ? 12 : 10;
  const labReserveKeys = new Set();
  if (!foundationOnly) {
    const terminalRef = terminal || storage;
    const reserveCandidates = floodFromStorage
      .filter((n) => n.d <= 9)
      .filter((n) => chebyshev(n, terminalRef) <= 6)
      .filter((n) =>
        checkerboard.classifyTileByPattern(n.x, n.y, storage, {
          pattern: layoutPattern,
          preferredParity: parity,
        }) === 'structure',
      )
      .filter((n) => canPlaceStructure(ctx, STRUCTURES.LAB, n.x, n.y))
      .sort((a, b) => {
        const aScore =
          (dt[idx(a.x, a.y)] || 0) +
          countWalkableNeighbors(ctx, a.x, a.y) -
          chebyshev(a, terminalRef) * 0.4;
        const bScore =
          (dt[idx(b.x, b.y)] || 0) +
          countWalkableNeighbors(ctx, b.x, b.y) -
          chebyshev(b, terminalRef) * 0.4;
        return bScore - aScore;
      })
      .slice(0, 14);
    for (const candidate of reserveCandidates) {
      labReserveKeys.add(key(candidate.x, candidate.y));
    }
  }
  let extIdx = 0;
  const sortedFlood = floodFromStorage.sort((a, b) => a.d - b.d);
  const placeExtensionTile = (x, y) => {
    if (extIdx >= 60) return false;
    if (labReserveKeys.has(key(x, y))) return false;
    if (
      checkerboard.classifyTileByPattern(x, y, storage, {
        pattern: layoutPattern,
        preferredParity: parity,
      }) !== 'structure'
    ) {
      return false;
    }
    if (!canPlaceStructure(ctx, STRUCTURES.EXTENSION, x, y)) return false;
    if (
      !addPlacement(
        ctx,
        STRUCTURES.EXTENSION,
        x,
        y,
        assignExtensionRcl(extIdx),
        `extension.${extIdx + 1}`,
      )
    ) {
      return false;
    }
    extIdx += 1;
    return true;
  };

  const addRoadHalo = (x, y) => {
    for (const n of neighbors8(x, y)) {
      if (!inBounds(n.x, n.y)) continue;
      if (checkerboard.classifyTileByPattern(n.x, n.y, storage, {
        pattern: layoutPattern,
        preferredParity: parity,
      }) !== 'road') {
        continue;
      }
      // Keep halo roads distinct from the actual stamp roads for diagnostics.
      addPlacement(ctx, STRUCTURES.ROAD, n.x, n.y, 1, 'road.stampHalo');
    }
  };

  if (isHarabiPattern(layoutPattern)) {
    const stampCenters = [];
    const capacitySlotKeys = new Set();
    // Keep Harabi foundation geometry identical for both foundation and full stage.
    // Full stage should enrich on top, not reshape the core stamp lattice.
    const stampDepthLimit = 11;
    const fallbackStructureCaps = {
      [STRUCTURES.EXTENSION]: 60,
      [STRUCTURES.TOWER]: 6,
      [STRUCTURES.LAB]: 10,
      [STRUCTURES.FACTORY]: 1,
      [STRUCTURES.OBSERVER]: 1,
      [STRUCTURES.NUKER]: 1,
      [STRUCTURES.SPAWN]: 3,
      [STRUCTURES.STORAGE]: 1,
      [STRUCTURES.TERMINAL]: 1,
      [STRUCTURES.POWER_SPAWN]: 1,
    };
    const structureLimitAtRcl8 = (type) => {
      if (
        typeof CONTROLLER_STRUCTURES !== 'undefined' &&
        CONTROLLER_STRUCTURES &&
        CONTROLLER_STRUCTURES[type] &&
        typeof CONTROLLER_STRUCTURES[type][8] === 'number'
      ) {
        return CONTROLLER_STRUCTURES[type][8];
      }
      return fallbackStructureCaps[type] || 0;
    };
    // Demand only slots for structures that must fit in general stamp fields.
    // Excludes containers and non-core links (both intentionally dynamic).
    const requiredStampSlots = foundationOnly
      ? 0
      : [
          STRUCTURES.EXTENSION,
          STRUCTURES.TOWER,
          STRUCTURES.LAB,
          STRUCTURES.FACTORY,
          STRUCTURES.OBSERVER,
          STRUCTURES.NUKER,
          STRUCTURES.SPAWN,
          STRUCTURES.STORAGE,
          STRUCTURES.TERMINAL,
          STRUCTURES.POWER_SPAWN,
        ].reduce((sum, type) => sum + structureLimitAtRcl8(type), 0) - 7;
    const targetBigCoverage = 12;
    const maxRoadStamps = 18;
    const minCenterSpacing = 4;
    const hasNearbyCenter = (node) => stampCenters.some((c) => chebyshev(c, node) < minCenterSpacing);
    const coreReference = coreStamp && coreStamp.center ? coreStamp.center : storage;
    const coreDistance = (node) => chebyshev(node, coreReference);
    const angleShiftRadians = (Math.PI / 8) * Number(mutationOptions.roadAngleShift || 0);
    const angleAroundCore = (node) => {
      const raw = Math.atan2(node.y - coreReference.y, node.x - coreReference.x);
      const shifted = raw + angleShiftRadians;
      const wrapped = shifted >= 0 ? shifted : shifted + 2 * Math.PI;
      return wrapped % (2 * Math.PI);
    };
    const sortedRoadNodes = sortedFlood
      .filter((node) => node.d <= stampDepthLimit)
      .filter((node) =>
        checkerboard.classifyTileByPattern(node.x, node.y, storage, {
          pattern: layoutPattern,
          preferredParity: parity,
        }) === 'road',
      );
    const roadNodesNearToFar = sortedRoadNodes
      .slice()
      .sort(
        (a, b) =>
          coreDistance(a) - coreDistance(b) ||
          a.d - b.d ||
          angleAroundCore(a) - angleAroundCore(b),
      );
    const bigEvalCache = new Map();
    const evalKeyFor = (node) => `${node.x}:${node.y}`;

    const evaluateStamp = (candidateNode, stamp) => {
      const roadTiles = stamp.roads
        .map((o) => ({ x: candidateNode.x + o.x, y: candidateNode.y + o.y }))
        .filter((p) => inBounds(p.x, p.y));
      const existingRoadCount = roadTiles.filter((p) => ctx.roads.has(key(p.x, p.y))).length;
      const placeableRoadCount = roadTiles.filter((p) => {
        if (ctx.roads.has(key(p.x, p.y))) return false;
        return canPlaceStructure(ctx, STRUCTURES.ROAD, p.x, p.y);
      }).length;
      const blockedRoadCount = Math.max(0, roadTiles.length - existingRoadCount - placeableRoadCount);
      const missingRoadCount = Math.max(0, roadTiles.length - existingRoadCount);
      const satisfiedRoadCount = existingRoadCount + placeableRoadCount;
      // Use in-bounds road count for thresholding so edge stamps can still be
      // considered when they are completable with a few roads.
      const roadOk =
        roadTiles.length > 0 &&
        (satisfiedRoadCount >= Math.max(2, Math.ceil(roadTiles.length * 0.45)) ||
          (blockedRoadCount === 0 && missingRoadCount <= 2));
      const slotCandidates = projectStampSlots(candidateNode, stamp.slots).filter((p) =>
        inBounds(p.x, p.y) &&
        (
          checkerboard.classifyTileByPattern(p.x, p.y, storage, {
            pattern: layoutPattern,
            preferredParity: parity,
          }) === 'structure' ||
          (p.dx === 0 && p.dy === 0)
        ) &&
        ctx.matrices.walkableMatrix[idx(p.x, p.y)] === 1 &&
        ctx.matrices.staticBlocked[idx(p.x, p.y)] !== 1 &&
        !ctx.reserved.has(key(p.x, p.y)) &&
        !ctx.roads.has(key(p.x, p.y)) &&
        !ctx.structuresByPos.has(key(p.x, p.y)),
      );
      const viableSlots = foundationOnly
        ? []
        : slotCandidates.filter((p) => canPlaceStructure(ctx, STRUCTURES.EXTENSION, p.x, p.y));
      return {
        stamp,
        roadOk,
        existingRoadCount,
        placeableRoadCount,
        blockedRoadCount,
        missingRoadCount,
        slotCandidates,
        viableSlots,
      };
    };

    const evaluateBigCached = (candidateNode) => {
      const k = evalKeyFor(candidateNode);
      if (!bigEvalCache.has(k)) {
        bigEvalCache.set(k, evaluateStamp(candidateNode, HARABI_ROAD_STAMP_5));
      }
      return bigEvalCache.get(k);
    };

    const tryApplyStamp = (candidateNode, evaluation, size, fallbackReason = null) => {
      applyRoadStamp(ctx, candidateNode, evaluation.stamp.roads, 'road.stamp');
      for (const slot of evaluation.slotCandidates || []) {
        capacitySlotKeys.add(key(slot.x, slot.y));
      }
      if (!foundationOnly) {
        const viable = evaluation.viableSlots;
        if (viable.length === evaluation.stamp.slots.length) {
          const placed = [];
          for (const p of viable) {
            if (extIdx >= 60) break;
            if (placeExtensionTile(p.x, p.y)) placed.push({ x: p.x, y: p.y });
          }
          if (placed.length > 0) {
            addPatternRoadHalo(ctx, placed, storage, layoutPattern, parity);
          }
        } else if (viable.length > 0) {
          const fallback = viable[0];
          if (placeExtensionTile(fallback.x, fallback.y)) {
            addPatternRoadHalo(
              ctx,
              [{ x: fallback.x, y: fallback.y }],
              storage,
              layoutPattern,
              parity,
            );
          }
        }
      }
      stampCenters.push({ x: candidateNode.x, y: candidateNode.y });
      addRoadHalo(candidateNode.x, candidateNode.y);
      ctx.meta.stampStats.capacitySlots = capacitySlotKeys.size;
      ctx.meta.stampStats.requiredSlots = requiredStampSlots;
      if (size === 'big') {
        ctx.meta.stampStats.bigPlaced += 1;
        if (ctx.meta.stampStats.bigCenters.length < 80) {
          ctx.meta.stampStats.bigCenters.push({ x: candidateNode.x, y: candidateNode.y });
        }
      } else if (size === 'small') {
        ctx.meta.stampStats.smallPlaced += 1;
        if (ctx.meta.stampStats.smallCenters.length < 80) {
          ctx.meta.stampStats.smallCenters.push({ x: candidateNode.x, y: candidateNode.y });
        }
        if (fallbackReason) {
          const reasons = ctx.meta.stampStats.smallFallbackReasons;
          reasons[fallbackReason] = (reasons[fallbackReason] || 0) + 1;
        }
      }
    };

    const hasCapacityCoverage = () =>
      foundationOnly ? false : capacitySlotKeys.size >= requiredStampSlots;

    // Phase 1: place large 3x3-diagonal road stamps first, moving out from the core.
    for (const nearNode of roadNodesNearToFar) {
      if (stampCenters.length >= maxRoadStamps) break;
      if (hasCapacityCoverage() && ctx.meta.stampStats.bigPlaced >= targetBigCoverage) break;
      if (hasNearbyCenter(nearNode)) continue;
      const big = evaluateBigCached(nearNode);
      if (!big.roadOk) continue;
      tryApplyStamp(nearNode, big, 'big');
    }

    // Phase 2 (small 2x2 fallback) is intentionally disabled.
    // We only want the large 3x3-diagonal road stamp topology.
  }

  if (!foundationOnly && !isHarabiPattern(layoutPattern) && extIdx < 60) {
    for (const node of sortedFlood) {
      if (extIdx >= 60) break;
      if (node.d > extensionDepthLimit) continue;
      placeExtensionTile(node.x, node.y);
    }
  }

  // Labs: no fixed stamp; choose two source labs then overlap region.
  let sourceLab1 = null;
  let sourceLab2 = null;
  const reactionLabs = [];
  const terminalRef = terminal || storage;
  const stampCenterKeys = new Set(
    ((ctx.meta && ctx.meta.stampStats && ctx.meta.stampStats.bigCenters) || [])
      .filter((pos) => pos && typeof pos.x === 'number' && typeof pos.y === 'number')
      .map((pos) => key(pos.x, pos.y)),
  );
  const labCandidates = floodFromStorage
    .filter((n) => n.d <= 8)
    .filter((n) => canPlaceStructure(ctx, STRUCTURES.LAB, n.x, n.y))
    .filter((n) => chebyshev(n, terminalRef) <= 8)
    .filter((n) => {
      if (ctx.roads.has(key(n.x, n.y))) return false;
      const patternClass = checkerboard.classifyTileByPattern(n.x, n.y, storage, {
        pattern: layoutPattern,
        preferredParity: parity,
      });
      const isStampCenter = stampCenterKeys.has(key(n.x, n.y));
      if (patternClass !== 'structure' && !isStampCenter) return false;
      return neighbors8(n.x, n.y).some((p) => ctx.roads.has(key(p.x, p.y)));
    });

  const cluster = chooseLabClusterFromValidCandidates(labCandidates, storage, {
    stampCenterKeys,
  });
  ctx.roadBlockedByStructures = ctx.roadBlockedByStructures || new Set();
  if (cluster) {
    const reservePreviewLab = (pos) => {
      if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
      ctx.roadBlockedByStructures.add(key(pos.x, pos.y));
    };
    reservePreviewLab(cluster.source1);
    reservePreviewLab(cluster.source2);
    for (const pos of cluster.reactions || []) {
      reservePreviewLab(pos);
    }
  }
  ctx.meta.labPlanning = {
    mode: foundationOnly ? 'foundation-preview' : 'placement',
    computed: true,
    clusterFound: Boolean(cluster),
    sourceLabs: cluster ? [cluster.source1, cluster.source2] : [],
    reactionLabs: cluster ? cluster.reactions.slice(0, 8) : [],
    totalLabs: cluster ? 2 + Math.min(8, cluster.reactions.length) : 0,
  };

  if (!foundationOnly) {
    if (cluster) {
      sourceLab1 = cluster.source1;
      sourceLab2 = cluster.source2;
      addPlacement(ctx, STRUCTURES.LAB, sourceLab1.x, sourceLab1.y, 6, 'lab.source.1');
      addPlacement(ctx, STRUCTURES.LAB, sourceLab2.x, sourceLab2.y, 6, 'lab.source.2');
      for (let i = 0; i < cluster.reactions.length; i++) {
        const cand = cluster.reactions[i];
        if (
          addPlacement(
            ctx,
            STRUCTURES.LAB,
            cand.x,
            cand.y,
            i < 1 ? 6 : i < 4 ? 7 : 8,
            `lab.reaction.${i + 1}`,
          )
        ) {
          reactionLabs.push(cand);
        }
      }
    } else {
      // Fallback: previous heuristic if a 10-lab cluster cannot be formed.
      const lab1Candidates = labCandidates.filter((n) => chebyshev(n, terminalRef) <= 5);
      sourceLab1 = findBestByCandidates(lab1Candidates, (p) => {
        const dtv = dt[idx(p.x, p.y)] || 0;
        return dtv + countWalkableNeighbors(ctx, p.x, p.y);
      });
      if (sourceLab1) addPlacement(ctx, STRUCTURES.LAB, sourceLab1.x, sourceLab1.y, 6, 'lab.source.1');

      if (sourceLab1) {
        const lab2Candidates = floodFromStorage
          .filter((n) => canPlaceStructure(ctx, STRUCTURES.LAB, n.x, n.y))
          .filter((n) => {
            const r = chebyshev(n, sourceLab1);
            return r >= 2 && r <= 3;
          });
        sourceLab2 = findBestByCandidates(lab2Candidates, (p) => dt[idx(p.x, p.y)] || 0);
        if (sourceLab2) addPlacement(ctx, STRUCTURES.LAB, sourceLab2.x, sourceLab2.y, 6, 'lab.source.2');
      }

      if (sourceLab1 && sourceLab2) {
        const reactionCandidates = floodFromStorage
          .filter((n) => canPlaceStructure(ctx, STRUCTURES.LAB, n.x, n.y))
          .filter((n) => chebyshev(n, sourceLab1) <= 2 && chebyshev(n, sourceLab2) <= 2)
          .sort((a, b) => chebyshev(a, terminalRef) - chebyshev(b, terminalRef));
        for (const cand of reactionCandidates) {
          if (reactionLabs.length >= 8) break;
          if (
            addPlacement(
              ctx,
              STRUCTURES.LAB,
              cand.x,
              cand.y,
              reactionLabs.length < 1 ? 6 : reactionLabs.length < 4 ? 7 : 8,
              `lab.reaction.${reactionLabs.length + 1}`,
            )
          ) {
            reactionLabs.push(cand);
          }
        }
      }
      ctx.meta.labPlanning = {
        mode: 'placement',
        computed: true,
        clusterFound: false,
        sourceLabs: sourceLab1 && sourceLab2 ? [sourceLab1, sourceLab2] : [],
        reactionLabs: reactionLabs.slice(0, 8),
        totalLabs: (sourceLab1 && sourceLab2 ? 2 : 0) + reactionLabs.length,
      };
    }
  }

  // Foundation preview structures are planned later on finalized stamp roads
  // (after early stamp pruning and before logistics roads are added).

  // Rampart line proxy + ramparts over critical structures + controller ring.
  let rampartTiles = [];
  const towers = [];
  if (!foundationOnly) {
    const rampartCut = pickBestRampartCut(ctx, storage);
    const rampartLine = rampartCut.line || [];
    ctx.meta.rampartMargin = rampartCut.margin;
    ctx.meta.rampartStandoff = rampartCut.standoff;
    ctx.meta.minCut = rampartCut.minCutMeta || { method: 'flow-mincut', margin: rampartCut.margin };
    for (const rp of rampartLine) {
      addPlacement(ctx, STRUCTURES.RAMPART, rp.x, rp.y, 2, 'rampart.edge', {
        allowOnBlocked: true,
      });
    }
    for (const p of ctx.placements) {
      if (
        p.type === STRUCTURES.SPAWN ||
        p.type === STRUCTURES.STORAGE ||
        p.type === STRUCTURES.TERMINAL ||
        p.type === STRUCTURES.TOWER ||
        p.type === STRUCTURES.LAB ||
        p.type === STRUCTURES.FACTORY ||
        p.type === STRUCTURES.POWER_SPAWN ||
        p.type === STRUCTURES.NUKER ||
        p.type === STRUCTURES.LINK
      ) {
        addPlacement(ctx, STRUCTURES.RAMPART, p.x, p.y, 2, 'rampart.core', { allowOnBlocked: true });
      }
    }
    for (const p of neighbors8(controllerPos.x, controllerPos.y)) {
      addPlacement(ctx, STRUCTURES.RAMPART, p.x, p.y, 2, 'rampart.controller', {
        allowOnBlocked: true,
      });
    }

    // Towers: greedily improve weakest rampart point with spread >= 4.
    rampartTiles = ctx.placements
      .filter((p) => p.type === STRUCTURES.RAMPART)
      .map((p) => ({ x: p.x, y: p.y }));
    const towerCandidates = floodFromStorage
      .filter((n) => canPlaceStructure(ctx, STRUCTURES.TOWER, n.x, n.y))
      .filter((n) => chebyshev(n, storage) <= 12);
    for (let i = 0; i < 6; i++) {
      const bestTower = findBestByCandidates(towerCandidates, (cand) => {
        if (towers.some((t) => chebyshev(t, cand) < 4)) return -99999;
        let weakest = Infinity;
        for (const rp of rampartTiles) {
          let dmg = 0;
          for (const t of towers) dmg += computeTowerDamage(chebyshev(t, rp));
          dmg += computeTowerDamage(chebyshev(cand, rp));
          weakest = Math.min(weakest, dmg);
        }
        return weakest === Infinity ? -99999 : weakest;
      });
      if (!bestTower) break;
      towers.push(bestTower);
      addPlacement(
        ctx,
        STRUCTURES.TOWER,
        bestTower.x,
        bestTower.y,
        i < 1 ? 3 : i < 2 ? 5 : 8,
        `tower.${i + 1}`,
      );
    }
  }

  // Spawn #2/#3 with spread and storage proximity.
  const spawnCandidates = floodFromStorage
    .filter((n) => canPlaceStructure(ctx, STRUCTURES.SPAWN, n.x, n.y))
    .filter((n) => chebyshev(n, storage) <= 6);
  const preferredSpawn2 = coreSlotAbs('spawn2');
  const preferredSpawn3 = coreSlotAbs('spawn3');
  if (preferredSpawn2 && canPlaceStructure(ctx, STRUCTURES.SPAWN, preferredSpawn2.x, preferredSpawn2.y)) {
    spawnCandidates.unshift(preferredSpawn2);
  }
  if (preferredSpawn3 && canPlaceStructure(ctx, STRUCTURES.SPAWN, preferredSpawn3.x, preferredSpawn3.y)) {
    spawnCandidates.unshift(preferredSpawn3);
  }
  const existingSpawn2 = ctx.placements.find((p) => p.tag === 'spawn.2');
  const spawn2 = existingSpawn2 || (foundationOnly ? null : findBestByCandidates(spawnCandidates, (p) => {
    if (!spawn1) return -99999;
    const d1 = chebyshev(p, spawn1);
    const n = countWalkableNeighbors(ctx, p.x, p.y);
    if (d1 < 3 || n < 2) return -99999;
    return -2 * Math.abs(chebyshev(p, storage) - 3) + 3 + 2 * n;
  }));
  if (spawn2 && !existingSpawn2) addPlacement(ctx, STRUCTURES.SPAWN, spawn2.x, spawn2.y, 7, 'spawn.2');

  const existingSpawn3 = ctx.placements.find((p) => p.tag === 'spawn.3');
  const spawn3 = existingSpawn3 || (foundationOnly ? null : findBestByCandidates(spawnCandidates, (p) => {
    if (!spawn1 || !spawn2) return -99999;
    const d1 = chebyshev(p, spawn1);
    const d2 = chebyshev(p, spawn2);
    const n = countWalkableNeighbors(ctx, p.x, p.y);
    if (d1 < 3 || d2 < 3 || n < 2) return -99999;
    return -Math.abs(chebyshev(p, storage) - 4) + d1 + d2 + n;
  }));
  if (spawn3 && !existingSpawn3) addPlacement(ctx, STRUCTURES.SPAWN, spawn3.x, spawn3.y, 8, 'spawn.3');

  // Factory / PowerSpawn / Nuker / Observer.
  const placeNearStorage = (type, maxRange, rcl, tag) => {
    if (foundationOnly) return;
    if (ctx.placements.some((p) => p.tag === tag)) return;
    if (useHarabi && type === STRUCTURES.POWER_SPAWN) {
      const preferred = coreSlotAbs('powerSpawn');
      if (preferred && canPlaceStructure(ctx, type, preferred.x, preferred.y)) {
        addPlacement(ctx, type, preferred.x, preferred.y, rcl, tag);
        return;
      }
    }
    const cands = floodFromStorage
      .filter((n) => chebyshev(n, storage) <= maxRange)
      .filter((n) => canPlaceStructure(ctx, type, n.x, n.y));
    const pos = findBestByCandidates(cands, (p) => countWalkableNeighbors(ctx, p.x, p.y));
    if (pos) addPlacement(ctx, type, pos.x, pos.y, rcl, tag);
  };
  placeNearStorage(STRUCTURES.FACTORY, 2, 7, 'core.factory');
  placeNearStorage(STRUCTURES.POWER_SPAWN, 3, 8, 'core.powerSpawn');
  placeNearStorage(STRUCTURES.NUKER, 4, 8, 'core.nuker');
  placeNearStorage(STRUCTURES.OBSERVER, 8, 8, 'core.observer');

  // Mineral extractor + container.
  if (mineral) {
    addPlacement(ctx, STRUCTURES.EXTRACTOR, mineral.pos.x, mineral.pos.y, 6, 'mineral.extractor');
    const mcands = neighbors8(mineral.pos.x, mineral.pos.y).filter((p) =>
      canPlaceStructure(ctx, STRUCTURES.CONTAINER, p.x, p.y),
    );
    const mcont = findBestByCandidates(mcands, (p) => -manhattan(storage, p));
    if (mcont) addPlacement(ctx, STRUCTURES.CONTAINER, mcont.x, mcont.y, 6, 'mineral.container');
  }

  const syncRoadBlockedByStructures = () => {
    const blocked = new Set();
    for (const placement of ctx.placements || []) {
      if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
      if (placement.type === STRUCTURES.ROAD || placement.type === STRUCTURES.RAMPART) continue;
      blocked.add(key(placement.x, placement.y));
    }
    for (const lab of (Array.isArray(ctx.meta.labPlanning.sourceLabs) ? ctx.meta.labPlanning.sourceLabs : [])) {
      if (!lab || typeof lab.x !== 'number' || typeof lab.y !== 'number') continue;
      blocked.add(key(lab.x, lab.y));
    }
    for (const lab of (Array.isArray(ctx.meta.labPlanning.reactionLabs) ? ctx.meta.labPlanning.reactionLabs : [])) {
      if (!lab || typeof lab.x !== 'number' || typeof lab.y !== 'number') continue;
      blocked.add(key(lab.x, lab.y));
    }
    const structurePlanning = ctx.meta.structurePlanning || {};
    for (const placement of (Array.isArray(structurePlanning.placements) ? structurePlanning.placements : [])) {
      if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
      blocked.add(key(placement.x, placement.y));
    }
    ctx.roadBlockedByStructures = blocked;
  };

  const computeFoundationStructurePreview = () => {
    const centerOverrideKeys = collectStampCenterOverrideKeys(ctx);
    const excludedKeys = new Set();
    const previewLabs = [
      ...(Array.isArray(ctx.meta.labPlanning.sourceLabs) ? ctx.meta.labPlanning.sourceLabs : []),
      ...(Array.isArray(ctx.meta.labPlanning.reactionLabs) ? ctx.meta.labPlanning.reactionLabs : []),
    ];
    for (const pos of previewLabs) {
      if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
      excludedKeys.add(key(pos.x, pos.y));
    }
    const previewCandidates = collectFoundationPreviewCandidates(
      ctx,
      storage,
      layoutPattern,
      parity,
      {
        depthLimit: 50,
        spawnReference: spawn1 || storage,
        centerOverrideKeys,
      },
    );
    return planFoundationStructurePreview(
      ctx,
      previewCandidates,
      storage,
      layoutPattern,
      parity,
      {
        centerOverrideKeys,
        excludedKeys,
        depthLimit: 50,
        slotOrderShift: mutationOptions.slotOrderShift || 0,
        spawnReference: spawn1 || storage,
        stampCenters:
          ctx.meta.stampStats && Array.isArray(ctx.meta.stampStats.bigCenters)
            ? ctx.meta.stampStats.bigCenters
            : [],
        smallStampCenters: inferStampGeometryFromRoadStamps(ctx).smallCenters || [],
      },
    );
  };

  if (foundationOnly) {
    // First pass: select preview occupancy for stamp-pruning decisions.
    ctx.meta.structurePlanning = computeFoundationStructurePreview();
    syncRoadBlockedByStructures();
  }

  // Remove unused stamp geometry before generating logistics roads so we avoid
  // stamp/road feedback loops and keep structure candidates stable.
  pruneUnusedRoadStamps(ctx, {
    layoutPattern,
  });

  if (foundationOnly) {
    // Second pass after prune: ensure final preview uses only surviving stamp layout.
    ctx.meta.structurePlanning = computeFoundationStructurePreview();
    syncRoadBlockedByStructures();
  }

  // Roads: highest-traffic paths first + checkerboard interior + rampart line roads.
  const traffic = new Map();
  const touchTraffic = (p, weight) => {
    const k = key(p.x, p.y);
    traffic.set(k, (traffic.get(k) || 0) + weight);
  };
  const protectedRoads = new Set();
  const preferredRoads = new Set();
  const sourceRoadAnchorById = new Map();
  for (const anchor of sourceRoadAnchors) {
    if (!anchor || !anchor.sourceId) continue;
    const anchorKey = key(anchor.x, anchor.y);
    sourceRoadAnchorById.set(anchor.sourceId, anchorKey);
    protectedRoads.add(anchorKey);
    preferredRoads.add(anchorKey);
    touchTraffic(anchor, 10);
  }
  const addRoutePath = (path, weight, protect = false) => {
    for (const step of path) {
      const k = key(step.x, step.y);
      touchTraffic(step, weight);
      preferredRoads.add(k);
      if (protect) protectedRoads.add(k);
    }
  };
  const logisticTargets = [];
  const sourceContainerKeys = new Set();
  const sourceContainerById = new Map();
  for (const sc of sourceContainers) {
    sourceContainerKeys.add(key(sc.pos.x, sc.pos.y));
    if (sc && sc.source && sc.source.id) sourceContainerById.set(sc.source.id, sc.pos);
  }
  for (const source of sources) {
    const sp = source && source.pos ? source.pos : source;
    if (!sp || typeof sp.x !== 'number' || typeof sp.y !== 'number') continue;
    const sid =
      source && source.id
        ? source.id
        : `${sp.x},${sp.y}`;
    logisticTargets.push({
      id: `source:${sid}`,
      pos: sourceContainerById.get(sid) || { x: sp.x, y: sp.y },
      weight: 8,
      protect: true,
      avoidSourceContainers: true,
    });
  }
  const controllerContainer = ctx.placements.find((p) => p.tag === 'controller.container');
  if (!foundationOnly && controllerContainer) {
    logisticTargets.push({
      id: 'controller.container',
      pos: { x: controllerContainer.x, y: controllerContainer.y },
      weight: 6,
      protect: true,
      avoidSourceContainers: true,
    });
  } else if (!foundationOnly && upgraderSlots && upgraderSlots.length > 0) {
    logisticTargets.push({
      id: 'controller.upgraderSlot',
      pos: upgraderSlots[0],
      weight: 6,
      protect: true,
      avoidSourceContainers: true,
    });
  }
  const mineralContainer = ctx.placements.find((p) => p.tag === 'mineral.container');
  if (mineralContainer) {
    logisticTargets.push({
      id: 'mineral.container',
      pos: { x: mineralContainer.x, y: mineralContainer.y },
      weight: 2,
      protect: true,
      avoidSourceContainers: true,
    });
  }
  // Prefer connecting logistics from already-planned foundation road lattice, not
  // directly from storage/core center. This avoids carving straight cuts through
  // the base interior just to reach remote sources/resources.
  const routeOriginRoads = (ctx.placements || [])
    .filter((p) => p && p.type === STRUCTURES.ROAD)
    .filter((p) => {
      const tag = String(p.tag || '');
      return tag === 'road.stamp' || tag === 'road.controllerStamp' || tag === 'road.grid';
    })
    .map((p) => ({ x: p.x, y: p.y }));
  const pickLogisticOrigin = (targetPos) => {
    if (!targetPos || !routeOriginRoads.length) return storage;
    let best = null;
    let bestScore = Infinity;
    for (const origin of routeOriginRoads) {
      const baseCorePenalty = chebyshev(origin, storage) <= 2 ? 6 : 0;
      const score = manhattan(origin, targetPos) + baseCorePenalty;
      if (score < bestScore) {
        bestScore = score;
        best = origin;
      }
    }
    return best || storage;
  };
  logisticTargets.sort((a, b) => manhattan(storage, a.pos) - manhattan(storage, b.pos));
  let connectedLogistics = 0;
  const missingLogistics = [];
  for (const target of logisticTargets) {
    const avoidKeys = target.avoidSourceContainers ? new Set(sourceContainerKeys) : null;
    if (avoidKeys) avoidKeys.delete(key(target.pos.x, target.pos.y));
    const routeOrigin = pickLogisticOrigin(target.pos);
    let path = pathRoads(ctx, routeOrigin, target.pos, {
      preferredRoads,
      avoidKeys,
      avoidPenalty: 25,
    });
    if (!path.length && avoidKeys) {
      path = pathRoads(ctx, routeOrigin, target.pos, { preferredRoads });
    }
    if (
      !path.length &&
      (routeOrigin.x !== storage.x || routeOrigin.y !== storage.y)
    ) {
      path = pathRoads(ctx, storage, target.pos, {
        preferredRoads,
        avoidKeys,
        avoidPenalty: 25,
      });
    }
    if (!path.length && chebyshev(storage, target.pos) > 1) {
      ctx.meta.validation.push(`missing-logistics-route:${target.id}`);
      missingLogistics.push(target.id);
      continue;
    }
    connectedLogistics += 1;
    addRoutePath(path, target.weight, target.protect);
  }
  ctx.meta.logisticsRoutes = {
    required: logisticTargets.length,
    connected: connectedLogistics,
    missing: missingLogistics,
  };

  const routeAndScorePath = (from, to, weight) => {
    if (!from || !to) return;
    const path = pathRoads(ctx, from, to, { preferredRoads });
    addRoutePath(path, weight, false);
  };
  if (!foundationOnly && upgraderSlots && upgraderSlots.length > 0) {
    for (const slot of upgraderSlots) {
      const path = pathRoads(ctx, storage, slot, { preferredRoads });
      addRoutePath(path, 1, true);
    }
  }
  if (spawn1) routeAndScorePath(storage, spawn1, 5);
  if (spawn2) routeAndScorePath(storage, spawn2, 3);
  if (spawn3) routeAndScorePath(storage, spawn3, 3);
  if (terminal) routeAndScorePath(storage, terminal, 3);
  if (sourceLab1) routeAndScorePath(storage, sourceLab1, 2);
  if (sourceLab2) routeAndScorePath(storage, sourceLab2, 2);
  for (const t of towers) routeAndScorePath(storage, t, 2);

  for (const rk of protectedRoads) {
    const p = parseKey(rk);
    addPlacement(ctx, STRUCTURES.ROAD, p.x, p.y, 1, 'road.protected');
  }

  for (const [k, tr] of traffic.entries()) {
    const p = parseKey(k);
    const id = idx(p.x, p.y);
    const terrainType = matrices.terrainMatrix[id];
    const moveCost = terrainMoveCost(terrainType);
    const benefit = tr * 120 * Math.max(0, moveCost - 1);
    const cost = roadBuildCost(terrainType);
    const score = benefit - 0.4 * cost;
    if (score > 0 || tr >= 6) {
      addPlacement(ctx, STRUCTURES.ROAD, p.x, p.y, 1, 'road.flow');
    }
  }

  const floodDepthByTile = new Map(floodFromStorage.map((n) => [key(n.x, n.y), n.d]));

  for (const n of floodFromStorage) {
    if (n.d > 10) continue;
    if (
      checkerboard.classifyTileByPattern(n.x, n.y, storage, {
        pattern: layoutPattern,
        preferredParity: parity,
      }) === 'structure'
    ) {
      continue;
    }
    addPlacement(ctx, STRUCTURES.ROAD, n.x, n.y, 1, 'road.grid');
  }
  for (const rp of rampartTiles) {
    addPlacement(ctx, STRUCTURES.ROAD, rp.x, rp.y, 2, 'road.rampart');
  }

  for (const sourceId in ctx.meta.sourceLogistics) {
    const state = ctx.meta.sourceLogistics[sourceId];
    const anchorKey = sourceRoadAnchorById.get(sourceId);
    if (!state) continue;
    if (anchorKey && ctx.roads.has(anchorKey)) {
      state.roadAnchored = true;
    } else if (state.containerPos) {
      const hasAdjacentRoad = neighbors8(state.containerPos.x, state.containerPos.y).some((p) =>
        ctx.roads.has(key(p.x, p.y)),
      );
      state.roadAnchored = hasAdjacentRoad;
    }
    if (!state.roadAnchored) {
      ctx.meta.validation.push(`source-road-anchor-missing:${sourceId}`);
    }
  }

  const pruning = pruneRoadPlacements(ctx, {
    protectedRoads,
    keepTags: [
      'road.rampart',
      'road.protected',
      'road.stamp',
      'road.stampHalo',
      'road.coreStamp',
      'road.controllerStamp',
    ],
    depthByKey: floodDepthByTile,
  });
  ctx.meta.roadPruning = pruning;

  const centerOverrideKeys = collectStampCenterOverrideKeys(ctx);
  const previewExcludedKeys = new Set();
  if (foundationOnly) {
    const structurePlanning = ctx.meta.structurePlanning || {};
    for (const placement of (Array.isArray(structurePlanning.placements) ? structurePlanning.placements : [])) {
      if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
      previewExcludedKeys.add(key(placement.x, placement.y));
    }
    const labPlanning = ctx.meta.labPlanning || {};
    for (const lab of (Array.isArray(labPlanning.sourceLabs) ? labPlanning.sourceLabs : [])) {
      if (!lab || typeof lab.x !== 'number' || typeof lab.y !== 'number') continue;
      previewExcludedKeys.add(key(lab.x, lab.y));
    }
    for (const lab of (Array.isArray(labPlanning.reactionLabs) ? labPlanning.reactionLabs : [])) {
      if (!lab || typeof lab.x !== 'number' || typeof lab.y !== 'number') continue;
      previewExcludedKeys.add(key(lab.x, lab.y));
    }
  }
  ctx.meta.validStructurePositions = collectValidStructurePositions(
    ctx,
    buildFullRoomNodes(),
    storage,
    layoutPattern,
    parity,
    {
      depthLimit: 50,
      labReserveKeys,
      centerOverrideKeys,
      excludedKeys: previewExcludedKeys,
      maxPositions: 2500,
    },
  );
  const sourceIds = sources
    .filter((src) => src && src.id)
    .map((src) => src.id);
  const logistics = ctx.meta.sourceLogistics || {};
  const sourceContainersPlaced = sourceContainers.length;
  const sourceLinksPlaced = sourceIds.reduce(
    (sum, sourceId) => sum + (logistics[sourceId] && logistics[sourceId].linkPlaced ? 1 : 0),
    0,
  );
  const sourceRoadAnchored = sourceIds.reduce(
    (sum, sourceId) => sum + (logistics[sourceId] && logistics[sourceId].roadAnchored ? 1 : 0),
    0,
  );
  const sourceRouteTargets = logisticTargets.filter((target) =>
    String(target && target.id || '').startsWith('source:'),
  );
  const missingSourceRoutes = missingLogistics.filter((id) => String(id || '').startsWith('source:'));
  const hasMineralContainer = Boolean(mineralContainer);
  const mineralRouteTarget = logisticTargets.some((target) => String(target && target.id || '') === 'mineral.container');
  const mineralRouteMissing = missingLogistics.some((id) => String(id || '') === 'mineral.container');
  ctx.meta.sourceResourceDebug = {
    foundationOnly,
    sourcesFound: sourceIds.length,
    sourceContainersPlaced,
    sourceLinksPlaced,
    sourceRoadAnchored,
    sourceRouteTargets: sourceRouteTargets.length,
    sourceRoutesConnected: Math.max(0, sourceRouteTargets.length - missingSourceRoutes.length),
    sourceRoutesMissing: missingSourceRoutes.length,
    mineralFound: mineral && mineral.pos ? 1 : 0,
    mineralContainerPlaced: hasMineralContainer ? 1 : 0,
    mineralRouteTarget: mineralRouteTarget ? 1 : 0,
    mineralRouteConnected: mineralRouteTarget && !mineralRouteMissing ? 1 : 0,
  };
  const coreTags = new Set(['spawn.1', 'spawn.2', 'spawn.3', 'core.storage', 'core.terminal', 'link.sink', 'core.powerSpawn']);
  const corePlacements = ctx.placements.filter((p) => p && coreTags.has(String(p.tag || '')));
  ctx.meta.foundationDebug = {
    foundationOnly,
    coreStructuresPlaced: corePlacements.length,
    coreRoadsPlaced: ctx.placements.filter((p) => p && p.type === STRUCTURES.ROAD && String(p.tag || '').startsWith('road.core')).length,
    stampBigPlaced: ctx.meta.stampStats ? Number(ctx.meta.stampStats.bigPlaced || 0) : 0,
    stampSmallPlaced: ctx.meta.stampStats ? Number(ctx.meta.stampStats.smallPlaced || 0) : 0,
    roadCount: ctx.roads.size,
  };

  // Validation.
  const spawns = ctx.placements.filter((p) => p.type === STRUCTURES.SPAWN);
  for (const sp of spawns) {
    if (countWalkableNeighbors(ctx, sp.x, sp.y) < 2) {
      ctx.meta.validation.push(`spawn-neighbor-fail:${sp.x},${sp.y}`);
    }
  }
  const st = ctx.placements.find((p) => p.type === STRUCTURES.STORAGE);
  if (st && countWalkableNeighbors(ctx, st.x, st.y) < 3) {
    ctx.meta.validation.push(`storage-neighbor-fail:${st.x},${st.y}`);
  }
  if (terminal && st && chebyshev(terminal, st) > 1) ctx.meta.validation.push('terminal-range-storage-fail');
  if (sinkLink && st && chebyshev(sinkLink, st) > 1) {
    ctx.meta.validation.push('sink-link-range-storage-fail');
  }
  for (const sc of sourceContainers) {
    const link = ctx.placements.find((p) => p.tag === `source.link.${sc.source.id}`);
    if (link && chebyshev(link, sc.source.pos) > 2) {
      ctx.meta.validation.push(`source-link-range-fail:${sc.source.id}`);
    }
    if (link && chebyshev(link, sc.pos) > 2) {
      ctx.meta.validation.push(`source-link-container-range-fail:${sc.source.id}`);
    }
  }
  const ctrlLink = ctx.placements.find((p) => p.tag === 'controller.link');
  if (useHarabi && !ctrlLink) {
    ctx.meta.validation.push('controller-link-missing');
  }
  if (ctrlLink && chebyshev(ctrlLink, controllerPos) > 2) {
    ctx.meta.validation.push('controller-link-range-fail');
  }

  const exts = ctx.placements.filter((p) => p.type === STRUCTURES.EXTENSION);
  const storageFlood = computeDistanceMap(walkableWithPlan(ctx), storage);
  for (const e of exts) {
    const expectedType = checkerboard.classifyTileByPattern(e.x, e.y, storage, {
      pattern: layoutPattern,
      preferredParity: parity,
    });
    if (expectedType !== 'structure') ctx.meta.validation.push(`extension-pattern-fail:${e.x},${e.y}`);
    const d = storageFlood[key(e.x, e.y)];
    if (d === undefined || d > 10) ctx.meta.validation.push(`extension-distance-fail:${e.x},${e.y}`);
  }

  for (const p of ctx.placements) {
    if (p.type !== STRUCTURES.ROAD && matrices.exitProximity[idx(p.x, p.y)] === 1) {
      ctx.meta.validation.push(`exit-proximity-fail:${p.x},${p.y},${p.type}`);
    }
  }

  if (sourceLab1 && sourceLab2) {
    for (const r of reactionLabs) {
      if (!(chebyshev(r, sourceLab1) <= 2 && chebyshev(r, sourceLab2) <= 2)) {
        ctx.meta.validation.push(`lab-range-fail:${r.x},${r.y}`);
      }
    }
  }

  if (
    typeof ctx.meta.rampartStandoff === 'number' &&
    ctx.meta.rampartStandoff > 0 &&
    ctx.meta.rampartStandoff < 3
  ) {
    ctx.meta.validation.push(`rampart-standoff-fail:${ctx.meta.rampartStandoff}`);
  }

  const pairwise = [];
  for (let i = 0; i < spawns.length; i++) {
    for (let j = i + 1; j < spawns.length; j++) {
      pairwise.push(chebyshev(spawns[i], spawns[j]));
    }
  }
  if (pairwise.some((d) => d < 3)) ctx.meta.validation.push('spawn-spread-fail');

  const maxContainers = ctx.placements.filter((p) => p.type === STRUCTURES.CONTAINER).length;
  if (maxContainers > 5) ctx.meta.validation.push('container-count-fail');

  for (const ex of ctx.meta.spawnExits) {
    if (ctx.structuresByPos.has(key(ex.x, ex.y))) {
      ctx.meta.validation.push(`spawn-exit-blocked:${ex.x},${ex.y}`);
    }
  }

  if (ctx.roads.size > 0) {
    const roadKeys = [...ctx.roads];
    const seen = new Set([roadKeys[0]]);
    const q = [parseKey(roadKeys[0])];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      for (const n of neighbors8(cur.x, cur.y)) {
        const nk = key(n.x, n.y);
        if (!ctx.roads.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        q.push(n);
      }
    }
    if (seen.size !== ctx.roads.size) {
      ctx.meta.validation.push(`road-network-disconnected:${seen.size}/${ctx.roads.size}`);
    }
  }

  let defenseScore = Infinity;
  for (const rp of rampartTiles) {
    let total = 0;
    for (const t of towers) total += computeTowerDamage(chebyshev(t, rp));
    defenseScore = Math.min(defenseScore, total);
  }
  if (defenseScore === Infinity) defenseScore = 0;
  ctx.meta.defenseScore = defenseScore;
  if (defenseScore < 1500) ctx.meta.validation.push(`defense-score-low:${defenseScore}`);

  const structurePlan = new Array(2500).fill(null);
  const roadPlan = new Array(2500).fill(0);
  const rampartPlan = new Array(2500).fill(0);
  for (const p of ctx.placements) {
    const id = idx(p.x, p.y);
    if (p.type === STRUCTURES.ROAD) {
      roadPlan[id] = 1;
    } else if (p.type === STRUCTURES.RAMPART) {
      rampartPlan[id] = 1;
    } else {
      structurePlan[id] = p.type;
    }
  }

  return {
    roomName: room.name,
    anchor: {
      x: anchor.x,
      y: anchor.y,
      score: candidateMeta && typeof candidateMeta.initialScore === 'number' ? candidateMeta.initialScore : 0,
    },
    placements: ctx.placements,
    analysis: {
      dt,
      flood: floodFromStorage.map((f) => ({ x: f.x, y: f.y, d: f.d })),
      controllerDistance: computeDistanceMap(walkableWithPlan(ctx), controllerPos),
      exitDistance: matrices.exitDistance,
      exitProximity: matrices.exitProximity,
      terrainMatrix: matrices.terrainMatrix,
      walkableMatrix: matrices.walkableMatrix,
      structurePlan,
      roadPlan,
      rampartPlan,
      terrainScanned: true,
    },
    meta: Object.assign({}, ctx.meta, {
      parity,
      layoutPattern,
      harabiStage,
      candidateIndex: candidateMeta ? candidateMeta.index : null,
      candidateInitialScore:
        candidateMeta && typeof candidateMeta.initialScore === 'number'
          ? candidateMeta.initialScore
          : 0,
      candidateInitialContributions:
        candidateMeta && candidateMeta.initialContributions
          ? candidateMeta.initialContributions
          : {},
      candidateInitialMetrics:
        candidateMeta && candidateMeta.initialMetrics
          ? candidateMeta.initialMetrics
          : {},
    }),
  };
}

function computeCompactness(placements) {
  const structures = (placements || []).filter(
    (p) => p.type !== STRUCTURES.ROAD && p.type !== STRUCTURES.RAMPART,
  );
  if (!structures.length) return 0;
  let minX = 49;
  let maxX = 0;
  let minY = 49;
  let maxY = 0;
  for (const p of structures) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const area = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
  return clamp01(structures.length / area);
}

function evaluateOpenAreaEfficiency(placements) {
  const structures = (placements || []).filter(
    (p) => p.type !== STRUCTURES.ROAD && p.type !== STRUCTURES.RAMPART,
  );
  if (!structures.length) return 1;
  let minX = 49;
  let maxX = 0;
  let minY = 49;
  let maxY = 0;
  for (const p of structures) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const area = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
  const openTiles = Math.max(0, area - structures.length);
  return clamp01(1 - openTiles / area);
}

function evaluateLabQuality(placements) {
  const source1 = (placements || []).find((p) => p.tag === 'lab.source.1');
  const source2 = (placements || []).find((p) => p.tag === 'lab.source.2');
  const reactions = (placements || []).filter(
    (p) => p.tag && String(p.tag).startsWith('lab.reaction.'),
  );

  if (!source1 && !source2 && reactions.length === 0) return 1;
  if (!source1 || !source2) return 0;
  if (reactions.length === 0) return 1;

  let valid = 0;
  for (const r of reactions) {
    if (chebyshev(r, source1) <= 2 && chebyshev(r, source2) <= 2) valid += 1;
  }
  return valid / reactions.length;
}

function evaluateHubQuality(placements) {
  const storage = (placements || []).find((p) => p.type === STRUCTURES.STORAGE);
  if (!storage) return 0;

  const nearbyCore = (placements || []).filter(
    (p) =>
      (p.type === STRUCTURES.TERMINAL ||
        p.type === STRUCTURES.FACTORY ||
        p.type === STRUCTURES.POWER_SPAWN ||
        (p.type === STRUCTURES.LINK && p.tag === 'link.sink')) &&
      chebyshev(p, storage) <= 2,
  );

  const required = [storage, ...nearbyCore];
  if (required.length <= 1) return 1;

  const blocked = new Set(
    (placements || [])
      .filter((p) => p.type !== STRUCTURES.ROAD && p.type !== STRUCTURES.RAMPART)
      .map((p) => key(p.x, p.y)),
  );

  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const x = storage.x + dx;
      const y = storage.y + dy;
      if (!inBounds(x, y)) continue;
      const k = key(x, y);
      if (blocked.has(k)) continue;
      let allReachable = true;
      for (const target of required) {
        if (chebyshev({ x, y }, target) > 1) {
          allReachable = false;
          break;
        }
      }
      if (allReachable) return 1;
    }
  }
  return 0;
}

function pruneRoadPlacements(ctx, options = {}) {
  const protectedRoads = options.protectedRoads || new Set();
  const keepTags = new Set(options.keepTags || []);
  const depthByKey = options.depthByKey || new Map();

  const roadByKey = new Map();
  for (const placement of ctx.placements) {
    if (!placement || placement.type !== STRUCTURES.ROAD) continue;
    const k = key(placement.x, placement.y);
    let entry = roadByKey.get(k);
    if (!entry) {
      entry = {
        x: placement.x,
        y: placement.y,
        depth: depthByKey.has(k) ? depthByKey.get(k) : 0,
        tags: new Set(),
      };
      roadByKey.set(k, entry);
    }
    if (placement.tag) entry.tags.add(placement.tag);
  }

  const candidates = [...roadByKey.values()].sort((a, b) => {
    if (b.depth !== a.depth) return b.depth - a.depth;
    const ad = Math.max(Math.abs(a.x - 25), Math.abs(a.y - 25));
    const bd = Math.max(Math.abs(b.x - 25), Math.abs(b.y - 25));
    return bd - ad;
  });

  const removeKeys = new Set();
  const protectedKeys = [];
  for (const road of candidates) {
    const rk = key(road.x, road.y);
    if (protectedRoads.has(rk)) {
      protectedKeys.push(rk);
      continue;
    }
    if ([...road.tags].some((tag) => keepTags.has(tag))) continue;

    const adjacentStructure = neighbors8(road.x, road.y).some((n) =>
      ctx.structuresByPos.has(key(n.x, n.y)),
    );
    if (adjacentStructure) continue;
    removeKeys.add(rk);
  }

  if (!removeKeys.size) {
    return {
      removed: 0,
      protected: protectedKeys.length,
      protectedKeys,
    };
  }

  ctx.placements = ctx.placements.filter((placement) => {
    if (!placement || placement.type !== STRUCTURES.ROAD) return true;
    return !removeKeys.has(key(placement.x, placement.y));
  });
  for (const rk of removeKeys) {
    ctx.roads.delete(rk);
  }

  return {
    removed: removeKeys.size,
    protected: protectedKeys.length,
    protectedKeys,
  };
}

function evaluateLayout(plan, roomName, options = {}) {
  const placements = plan.placements || [];
  const sources = options.sources || [];
  const controllerPos = options.controllerPos || null;
  const storage = placements.find((p) => p.type === STRUCTURES.STORAGE);
  const towers = placements.filter((p) => p.type === STRUCTURES.TOWER);
  const ramparts = placements.filter((p) => p.type === STRUCTURES.RAMPART);
  const roads = placements.filter((p) => p.type === STRUCTURES.ROAD);
  const extensions = placements.filter((p) => p.type === STRUCTURES.EXTENSION);
  const terrainAt = createTerrainAccessor(roomName);

  const pathCost = makePathCostHelper(roomName);

  const extDists = extensions.map((e) => (storage ? chebyshev(e, storage) : 25));
  const avgExtDist = extDists.length ? mean(extDists) : 25;
  const maxExtDist = extDists.length ? Math.max(...extDists) : 40;

  let minTowerDamage = 0;
  if (ramparts.length > 0 && towers.length > 0) {
    minTowerDamage = Math.min(
      ...ramparts.map((r) =>
        towers.reduce((sum, tower) => sum + computeTowerDamage(chebyshev(tower, r)), 0),
      ),
    );
  }

  const rampartCount = ramparts.length;
  const roadCount = roads.length;
  const roadBuildCostTotal = roads.reduce(
    (sum, road) => sum + roadBuildCost(terrainAt(road.x, road.y)),
    0,
  );
  const roadUpkeepProxy = roads.reduce((sum, road) => {
    const tt = terrainAt(road.x, road.y);
    return sum + (tt === 1 ? 5 : 1);
  }, 0);
  const rampartTerrainProxy = ramparts.reduce((sum, rp) => {
    const tt = terrainAt(rp.x, rp.y);
    return sum + (tt === 1 ? 3 : 1);
  }, 0);
  const infrastructureCost = roadBuildCostTotal + roadUpkeepProxy * 120 + rampartTerrainProxy * 250;

  const avgSourceDist =
    storage && sources.length
      ? mean(sources.map((s) => pathCost(s.pos || s, storage, 1)))
      : 50;

  const controllerDist =
    storage && controllerPos
      ? pathCost(storage, controllerPos, 3)
      : 50;

  const compactness = computeCompactness(placements);
  const openAreaEfficiency = evaluateOpenAreaEfficiency(placements);
  const labQuality = evaluateLabQuality(placements);
  const hubQuality = evaluateHubQuality(placements);
  const logistics =
    plan && plan.meta && plan.meta.logisticsRoutes ? plan.meta.logisticsRoutes : null;
  const logisticsCoverage =
    logistics && logistics.required > 0
      ? clamp01((logistics.connected || 0) / logistics.required)
      : 1;
  const edgeRamparts = ramparts.filter((r) => r.tag === 'rampart.edge');
  const protectedStructures = placements.filter((p) => isCoreDefenseStructure(p, storage));
  let minEdgeDistance = 0;
  if (edgeRamparts.length > 0 && protectedStructures.length > 0) {
    minEdgeDistance = Infinity;
    for (const structure of protectedStructures) {
      let closest = Infinity;
      for (const edge of edgeRamparts) {
        const d = chebyshev(structure, edge);
        if (d < closest) closest = d;
      }
      if (closest < minEdgeDistance) minEdgeDistance = closest;
    }
    if (!Number.isFinite(minEdgeDistance)) minEdgeDistance = 0;
  }
  const rangedBuffer = minEdgeDistance;

  const metrics = {
    avgExtDist,
    maxExtDist,
    minTowerDamage,
    rampartCount,
    roadCount,
    avgSourceDist,
    controllerDist,
    compactness,
    openAreaEfficiency,
    labQuality,
    hubQuality,
    rangedBuffer,
    logisticsCoverage,
    infrastructureCost,
  };

  return metrics;
}

function evaluateLayoutForRoom(roomOrName, layout, options = {}) {
  const roomName = typeof roomOrName === 'string' ? roomOrName : roomOrName && roomOrName.name;
  if (!roomName || !layout) return null;
  return evaluateLayout(layout, roomName, options);
}

function computeWeightedScore(metrics, weights = DEFAULT_FINAL_WEIGHTS) {
  const normalized = {
    avgExtDist: clamp01(1 - (metrics.avgExtDist || 0) / 25),
    maxExtDist: clamp01(1 - (metrics.maxExtDist || 0) / 40),
    minTowerDamage: clamp01((metrics.minTowerDamage || 0) / 3600),
    rampartEff: clamp01(1 - (metrics.rampartCount || 0) / 150),
    roadEff: clamp01(1 - (metrics.roadCount || 0) / 300),
    sourceDist: clamp01(1 - (metrics.avgSourceDist || 0) / 50),
    controllerDist: clamp01(1 - (metrics.controllerDist || 0) / 50),
    compactness: clamp01(metrics.compactness || 0),
    openAreaEff: clamp01(metrics.openAreaEfficiency || 0),
    labQuality: clamp01(metrics.labQuality || 0),
    hubQuality: clamp01(metrics.hubQuality || 0),
    rangedBuffer: clamp01(((metrics.rangedBuffer || 0) - 3) / 4),
    logisticsCoverage: clamp01(metrics.logisticsCoverage || 0),
    infraCost: clamp01(1 - (metrics.infrastructureCost || 0) / 300000),
  };

  const contributions = {};
  let score = 0;
  for (const metric in weights) {
    const contribution = (weights[metric] || 0) * (normalized[metric] || 0);
    contributions[metric] = {
      weight: weights[metric] || 0,
      normalized: normalized[metric] || 0,
      contribution,
      raw:
        metric === 'rampartEff'
          ? metrics.rampartCount
          : metric === 'roadEff'
          ? metrics.roadCount
          : metric === 'sourceDist'
          ? metrics.avgSourceDist
          : metric === 'avgExtDist'
          ? metrics.avgExtDist
          : metric === 'maxExtDist'
          ? metrics.maxExtDist
          : metric === 'minTowerDamage'
          ? metrics.minTowerDamage
          : metric === 'controllerDist'
          ? metrics.controllerDist
          : metric === 'compactness'
          ? metrics.compactness
          : metric === 'labQuality'
          ? metrics.labQuality
          : metric === 'openAreaEff'
          ? metrics.openAreaEfficiency
          : metric === 'rangedBuffer'
          ? metrics.rangedBuffer
          : metric === 'logisticsCoverage'
          ? metrics.logisticsCoverage
          : metric === 'infraCost'
          ? metrics.infrastructureCost
          : metrics.hubQuality,
    };
    score += contribution;
  }

  return { score, normalized, contributions, weights };
}



function structurePriority(type, tag = null, context = {}) {
  if (type === STRUCTURES.LINK) {
    const tagStr = String(tag || '');
    if (tagStr === 'link.sink') return 1;
    if (tagStr.startsWith('source.link.')) {
      const order = context.sourceLinkOrder || {};
      const rank = Number(order[tagStr]);
      if (Number.isFinite(rank)) return 2 + rank;
      return 3;
    }
    if (tagStr === 'controller.link') return 9;
    return 8;
  }
  if (type === STRUCTURES.SPAWN || type === STRUCTURES.EXTENSION || type === STRUCTURES.STORAGE) return 1;
  if (type === STRUCTURES.TOWER || type === STRUCTURES.TERMINAL || type === STRUCTURES.LAB) return 2;
  if (type === STRUCTURES.CONTAINER || type === STRUCTURES.RAMPART || type === STRUCTURES.ROAD) return 3;
  return 4;
}

function buildQueueFromPlan(plan) {
  if (!plan || !Array.isArray(plan.placements)) return [];
  const spawn = plan.placements.find((p) => p.type === STRUCTURES.SPAWN) || { x: 25, y: 25 };
  const storage = plan.placements.find((p) => p.type === STRUCTURES.STORAGE) || spawn;
  const floodDepth = new Map(
    Array.isArray(plan.analysis && plan.analysis.flood)
      ? plan.analysis.flood.map((tile) => [key(tile.x, tile.y), Number(tile.d || 0)])
      : [],
  );
  const getDepth = (x, y) => {
    const k = key(x, y);
    if (floodDepth.has(k)) return floodDepth.get(k);
    return chebyshev({ x, y }, storage);
  };
  const sourceLinks = (plan.placements || [])
    .filter((placement) => placement && placement.type === STRUCTURES.LINK)
    .filter((placement) => String(placement.tag || '').startsWith('source.link.'))
    .sort((left, right) => getDepth(right.x, right.y) - getDepth(left.x, left.y));
  const sourceLinkOrder = {};
  for (let i = 0; i < sourceLinks.length; i++) {
    sourceLinkOrder[String(sourceLinks[i].tag || '')] = i;
  }

  const queue = plan.placements.map((placement, i) => ({
    type: placement.type,
    pos: { x: placement.x, y: placement.y },
    rcl: placement.rcl || 1,
    priority: structurePriority(placement.type, placement.tag, { sourceLinkOrder }),
    depth: getDepth(placement.x, placement.y),
    built: false,
    tag: placement.tag || null,
    sequence: i,
  }));

  queue.sort((a, b) => {
    if (a.rcl !== b.rcl) return a.rcl - b.rcl;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ad = Number.isFinite(a.depth)
      ? a.depth
      : Math.max(Math.abs(a.pos.x - spawn.x), Math.abs(a.pos.y - spawn.y));
    const bd = Number.isFinite(b.depth)
      ? b.depth
      : Math.max(Math.abs(b.pos.x - spawn.x), Math.abs(b.pos.y - spawn.y));
    if (ad !== bd) return ad - bd;
    return a.sequence - b.sequence;
  });

  return queue;
}

function getNextBuild(room, buildQueue) {
  const rcl = room && room.controller ? room.controller.level || 1 : 1;
  const queue = Array.isArray(buildQueue) ? buildQueue : [];
  return queue.find((entry) => !entry.built && (entry.rcl || 1) <= rcl) || null;
}

function generatePlanForAnchor(roomName, anchorInput, options = {}) {
  const room = Game.rooms[roomName];
  if (!room || !room.controller || !room.controller.my) return null;

  const dt = ensureDistanceTransform(room);
  const sources = findFirstNonEmpty(room, [FIND_SOURCES_CONST, 'FIND_SOURCES', 1]);
  const minerals = findFirstNonEmpty(room, [FIND_MINERALS_CONST, 'FIND_MINERALS']);
  const mineral = minerals.length > 0 ? minerals[0] : null;

  const matrices = buildTerrainMatrices(room);
  matrices.staticBlocked = computeStaticBlockedMatrix(room);

  const controllerPos = { x: room.controller.pos.x, y: room.controller.pos.y };
  const sourceAnchor =
    anchorInput && anchorInput.anchor && typeof anchorInput.anchor.x === 'number'
      ? anchorInput.anchor
      : anchorInput;
  const anchor = {
    x: sourceAnchor && typeof sourceAnchor.x === 'number' ? sourceAnchor.x : 25,
    y: sourceAnchor && typeof sourceAnchor.y === 'number' ? sourceAnchor.y : 25,
    score:
      typeof anchorInput.initialScore === 'number'
        ? anchorInput.initialScore
        : typeof anchorInput.score === 'number'
        ? anchorInput.score
        : 0,
  };
  const mutationOptions = normalizeMutationOptions(options.mutation);
  if (mutationOptions.anchorDx || mutationOptions.anchorDy) {
    anchor.x = Math.max(1, Math.min(48, anchor.x + mutationOptions.anchorDx));
    anchor.y = Math.max(1, Math.min(48, anchor.y + mutationOptions.anchorDy));
  }

  const plan = buildPlanForAnchor(room, {
    anchor,
    matrices,
    dt,
    sources,
    mineral,
    controllerPos,
    candidateMeta: options.candidateMeta || anchorInput,
    layoutPattern: resolveLayoutPattern(options),
    harabiStage: resolveHarabiStage(options),
    mutation: mutationOptions,
  });

  const metrics = evaluateLayout(plan, roomName, { sources, controllerPos });
  const weighted = computeWeightedScore(metrics, options.finalWeights || DEFAULT_FINAL_WEIGHTS);

  plan.buildQueue = buildQueueFromPlan(plan);

  plan.evaluation = {
    weightedScore: weighted.score,
    normalized: weighted.normalized,
    contributions: weighted.contributions,
    weights: weighted.weights,
    metrics,
  };

  return plan;
}

function generatePlan(roomName, options = {}) {
  const candidateSet = buildCandidateSet(roomName, {
    topN: options.topN || 5,
    dtThreshold: options.dtThreshold,
    minExitDistance: options.minExitDistance,
  });

  if (!candidateSet.candidates.length) return null;

  const layouts = candidateSet.candidates.map((candidate) => {
    const plan = generatePlanForAnchor(roomName, candidate, {
      candidateMeta: candidate,
      finalWeights: options.finalWeights || DEFAULT_FINAL_WEIGHTS,
      layoutPattern: resolveLayoutPattern(options),
      harabiStage: resolveHarabiStage(options),
    });
    return {
      candidate,
      plan,
      weightedScore: plan && plan.evaluation ? plan.evaluation.weightedScore : 0,
    };
  });

  layouts.sort((a, b) => b.weightedScore - a.weightedScore);
  const best = layouts[0];
  if (!best || !best.plan) return null;

  best.plan.selection = {
    candidateCount: layouts.length,
    selectedCandidateIndex: best.candidate.index,
    selectedWeightedScore: best.weightedScore,
    candidateScores: layouts.map((entry) => ({
      index: entry.candidate.index,
      anchor: { x: entry.candidate.anchor.x, y: entry.candidate.anchor.y },
      initialScore: entry.candidate.initialScore,
      weightedScore: entry.weightedScore,
    })),
    candidates: layouts.map((entry) => ({
      index: entry.candidate.index,
      anchor: { x: entry.candidate.anchor.x, y: entry.candidate.anchor.y },
      initialScore: entry.candidate.initialScore,
      initialMetrics: entry.candidate.initialMetrics,
      initialContributions: entry.candidate.initialContributions,
      weightedScore: entry.plan.evaluation.weightedScore,
      weightedMetrics: entry.plan.evaluation.metrics,
      weightedContributions: entry.plan.evaluation.contributions,
      validation: entry.plan.meta.validation || [],
      defenseScore: entry.plan.meta.defenseScore || 0,
    })),
    candidateSet: {
      dtThreshold: candidateSet.dtThreshold,
      totalCandidates: candidateSet.totalCandidates,
      filteredCandidates: candidateSet.filteredCandidates,
      swampRatio: candidateSet.swampRatio,
      fallbackUsed: candidateSet.fallbackUsed,
    },
  };

  return best.plan;
}

function generateCompleteLayout(roomName, spawnPos, options = {}) {
  if (!roomName || !spawnPos) return null;
  return generatePlanForAnchor(roomName, { anchor: spawnPos, index: 0 }, options);
}

function generateOptimalLayout(roomName, options = {}) {
  return generatePlan(roomName, options);
}

module.exports = {
  generatePlan,
  generateOptimalLayout,
  generateCompleteLayout,
  buildCandidateSet,
  generatePlanForAnchor,
  evaluateLayout,
  evaluateLayoutForRoom,
  computeWeightedScore,
  buildQueueFromPlan,
  getNextBuild,
  _helpers: {
    assignExtensionRcl,
    floodFill: floodFillAlgorithm.floodFill,
    computeTowerDamage,
    buildTerrainMatrices,
    scoreCandidate,
    detectCandidateDtThreshold,
  },
};
