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
  WALL: typeof STRUCTURE_WALL !== 'undefined' ? STRUCTURE_WALL : 'constructedWall',
};

const TERRAIN_WALL_MASK = typeof TERRAIN_MASK_WALL !== 'undefined' ? TERRAIN_MASK_WALL : 1;
const TERRAIN_SWAMP_MASK = typeof TERRAIN_MASK_SWAMP !== 'undefined' ? TERRAIN_MASK_SWAMP : 2;
function findSourcesConst() {
  return typeof FIND_SOURCES !== 'undefined' ? FIND_SOURCES : 'FIND_SOURCES';
}

function findMineralsConst() {
  return typeof FIND_MINERALS !== 'undefined' ? FIND_MINERALS : 'FIND_MINERALS';
}
const LOOK_STRUCTURES_CONST =
  typeof LOOK_STRUCTURES !== 'undefined' ? LOOK_STRUCTURES : 'structure';
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

const RAMPART_TARGET_STANDOFF = 4;
const RAMPART_EXIT_APPROACH_DEPTH = 7;
const RAMPART_DRAGONTOOTH_RESERVE_RADIUS = 1;
const DEFAULT_RAMPART_MINCUT_THICKNESS = 2;
const DEFAULT_RAMPART_MINCUT_NO_GO_DEPTH = 2;
const DEFAULT_RAMPART_MINCUT_DRAGON_TEETH_THICKNESS = 1;

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

function getObstacleStructureTypes() {
  return typeof OBSTACLE_OBJECT_TYPES !== 'undefined' && Array.isArray(OBSTACLE_OBJECT_TYPES)
    ? new Set(OBSTACLE_OBJECT_TYPES)
    : new Set();
}

function isStaticStructureObstacle(structure, obstacleTypes = getObstacleStructureTypes()) {
  if (!structure || !structure.structureType) return false;
  if (
    structure.structureType === STRUCTURES.ROAD ||
    structure.structureType === STRUCTURES.CONTAINER ||
    structure.structureType === STRUCTURES.WALL
  ) {
    return false;
  }
  return obstacleTypes.has(structure.structureType);
}

function computeStaticBlockedMatrix(room) {
  const blocked = new Array(2500).fill(0);
  const obstacleTypes = getObstacleStructureTypes();
  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      const structures = room.lookForAt(LOOK_STRUCTURES_CONST, x, y) || [];
      const obstacle = structures.some((s) => isStaticStructureObstacle(s, obstacleTypes));
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

function buildConnectedRoadKeys(roadKeys, seedKeys) {
  const connected = new Set();
  const queue = [];
  const seeds = seedKeys instanceof Set ? seedKeys : new Set(seedKeys || []);
  for (const seedKey of seeds) {
    if (!roadKeys || !roadKeys.has(seedKey) || connected.has(seedKey)) continue;
    connected.add(seedKey);
    queue.push(parseKey(seedKey));
  }
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const next of neighbors8(current.x, current.y)) {
      const nextKey = key(next.x, next.y);
      if (!roadKeys.has(nextKey) || connected.has(nextKey)) continue;
      connected.add(nextKey);
      queue.push(next);
    }
  }
  return connected;
}

function isSourceRoadAnchored(state, anchor, connectedRoadKeys) {
  if (!state || !(connectedRoadKeys instanceof Set)) return false;
  const anchorConnected = Boolean(anchor && anchor.key && connectedRoadKeys.has(anchor.key));
  const containerConnected =
    state.containerPos &&
    neighbors8(state.containerPos.x, state.containerPos.y).some((p) =>
      connectedRoadKeys.has(key(p.x, p.y)),
    );
  return Boolean(anchorConnected || containerConnected);
}

function buildFallbackRoadPath(ctx, from, to, options = {}) {
  if (!from || !to) return [];
  const targetRange = Number.isFinite(options.targetRange)
    ? Math.max(0, Math.trunc(Number(options.targetRange)))
    : 1;
  const preferredRoads = options.preferredRoads || null;
  const avoidKeys = options.avoidKeys || null;
  const avoidPenalty = Number.isFinite(options.avoidPenalty) ? Number(options.avoidPenalty) : 15;
  const routeTieBreakShift = Number.isFinite(options.routeTieBreakShift)
    ? Number(options.routeTieBreakShift)
    : 0;
  const path = [];
  const visited = new Set([key(from.x, from.y)]);
  let current = { x: from.x, y: from.y };
  let guard = 0;
  while (chebyshev(current, to) > targetRange && guard < 250) {
    guard += 1;
    const candidates = neighbors8(current.x, current.y)
      .filter((next) => {
        const nextKey = key(next.x, next.y);
        if (visited.has(nextKey)) return false;
        const id = idx(next.x, next.y);
        if (!ctx || !ctx.matrices || ctx.matrices.walkableMatrix[id] !== 1) return false;
        if (ctx.structuresByPos && ctx.structuresByPos.has(nextKey)) return false;
        if (ctx.roadBlockedByStructures && ctx.roadBlockedByStructures.has(nextKey) && nextKey !== key(to.x, to.y)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aKey = key(a.x, a.y);
        const bKey = key(b.x, b.y);
        const aScore =
          chebyshev(a, to) +
          (avoidKeys && avoidKeys.has(aKey) ? avoidPenalty : 0) -
          (ctx.roads && ctx.roads.has(aKey) ? 0.25 : 0) -
          (preferredRoads && preferredRoads.has(aKey) ? 0.2 : 0);
        const bScore =
          chebyshev(b, to) +
          (avoidKeys && avoidKeys.has(bKey) ? avoidPenalty : 0) -
          (ctx.roads && ctx.roads.has(bKey) ? 0.25 : 0) -
          (preferredRoads && preferredRoads.has(bKey) ? 0.2 : 0);
        return (
          aScore - bScore ||
          deterministicJitter(a.x, a.y, routeTieBreakShift) - deterministicJitter(b.x, b.y, routeTieBreakShift)
        );
      });
    if (candidates.length === 0) return [];
    current = candidates[0];
    visited.add(key(current.x, current.y));
    path.push({ x: current.x, y: current.y });
  }
  return chebyshev(current, to) <= targetRange ? path : [];
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
        partialPlaced: 0,
        partialPlacedSlots: 0,
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
      foundationSnapshot: null,
      fullOptimization: null,
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
  const tileKey = key(x, y);
  if (type !== STRUCTURES.ROAD) {
    if (type === STRUCTURES.RAMPART) {
      if (ctx.matrices.walkableMatrix[id] !== 1) return false;
      if (ctx.matrices.exitProximity[id] === 1) return false;
      // Perimeter and support ramparts may overlap roads, but they should never
      // be planned directly on top of logistics/core structures.
      if (ctx.roadBlockedByStructures && ctx.roadBlockedByStructures.has(tileKey)) return false;
      if (ctx.structuresByPos.has(tileKey)) return false;
    }
    if (ctx.matrices.exitProximity[id] === 1) return false;
    if (type !== STRUCTURES.RAMPART && !options.ignoreReservation && ctx.reserved.has(tileKey)) {
      return false;
    }
    if (type !== STRUCTURES.RAMPART && !options.allowOnRoad && ctx.roads.has(tileKey)) return false;
    if (!options.allowOnBlocked && !isTileWalkableForPlacement(ctx, x, y)) return false;
  } else {
    if (ctx.matrices.walkableMatrix[id] !== 1) return false;
    if (ctx.roadBlockedByStructures && ctx.roadBlockedByStructures.has(tileKey)) return false;
    if (ctx.structuresByPos.has(tileKey)) return false;
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
  if (type !== STRUCTURES.ROAD && type !== STRUCTURES.RAMPART && ctx.blocked.has(k)) return false;
  if (type === STRUCTURES.ROAD && ctx.roads.has(k)) return false;
  if (type === STRUCTURES.RAMPART && ctx.ramparts.has(k)) return false;
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

function removePlacementAt(ctx, x, y, predicate = null) {
  if (!ctx || !Array.isArray(ctx.placements)) return null;
  const placementKey = key(x, y);
  const index = ctx.placements.findIndex((placement) => {
    if (!placement || placement.x !== x || placement.y !== y) return false;
    return typeof predicate === 'function' ? predicate(placement) : true;
  });
  if (index < 0) return null;
  const [removed] = ctx.placements.splice(index, 1);
  if (!removed) return null;
  if (removed.type === STRUCTURES.ROAD) {
    ctx.roads.delete(placementKey);
  } else if (removed.type === STRUCTURES.RAMPART) {
    ctx.ramparts.delete(placementKey);
  } else {
    ctx.structuresByPos.delete(placementKey);
    ctx.blocked.delete(placementKey);
    ctx.roadBlockedByStructures.delete(placementKey);
    ctx.reserved.delete(placementKey);
  }
  return removed;
}

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function rebuildRoadBlockedByStructures(ctx, options = {}) {
  const blocked = new Set();
  const labPlanning =
    options.labPlanning && typeof options.labPlanning === 'object'
      ? options.labPlanning
      : ctx && ctx.meta
      ? ctx.meta.labPlanning || {}
      : {};
  const structurePlanning =
    options.structurePlanning && typeof options.structurePlanning === 'object'
      ? options.structurePlanning
      : ctx && ctx.meta
      ? ctx.meta.structurePlanning || {}
      : {};
  for (const placement of ctx && Array.isArray(ctx.placements) ? ctx.placements : []) {
    if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
    if (placement.type === STRUCTURES.ROAD || placement.type === STRUCTURES.RAMPART) continue;
    blocked.add(key(placement.x, placement.y));
  }
  for (const lab of (Array.isArray(labPlanning.sourceLabs) ? labPlanning.sourceLabs : [])) {
    if (!lab || typeof lab.x !== 'number' || typeof lab.y !== 'number') continue;
    blocked.add(key(lab.x, lab.y));
  }
  for (const lab of (Array.isArray(labPlanning.reactionLabs) ? labPlanning.reactionLabs : [])) {
    if (!lab || typeof lab.x !== 'number' || typeof lab.y !== 'number') continue;
    blocked.add(key(lab.x, lab.y));
  }
  for (const placement of (Array.isArray(structurePlanning.placements) ? structurePlanning.placements : [])) {
    if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
    blocked.add(key(placement.x, placement.y));
  }
  if (ctx) ctx.roadBlockedByStructures = blocked;
  return blocked;
}

function hydrateContextFromPlacements(ctx, placements = []) {
  for (const placement of placements) {
    if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
    addPlacement(
      ctx,
      placement.type,
      placement.x,
      placement.y,
      placement.rcl,
      placement.tag || null,
      placement.type === STRUCTURES.RAMPART ? { allowOnBlocked: true } : {},
    );
  }
}

function buildFoundationSnapshotMeta(options = {}) {
  const placements = Array.isArray(options.placements) ? options.placements : [];
  const meta = options.meta && typeof options.meta === 'object' ? options.meta : {};
  const structurePlanning =
    meta.structurePlanning && typeof meta.structurePlanning === 'object' ? meta.structurePlanning : {};
  const ranking =
    structurePlanning.ranking && typeof structurePlanning.ranking === 'object'
      ? structurePlanning.ranking
      : {};
  const validPositions =
    meta.validStructurePositions && typeof meta.validStructurePositions === 'object'
      ? meta.validStructurePositions
      : {};
  const roadKeys = [];
  const roadTags = {};
  const coreStructures = [];
  for (const placement of placements) {
    if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
    if (placement.type === STRUCTURES.ROAD) {
      roadKeys.push(key(placement.x, placement.y));
      const tag = String(placement.tag || 'road');
      roadTags[tag] = Number(roadTags[tag] || 0) + 1;
      continue;
    }
    if (placement.type === STRUCTURES.RAMPART) continue;
    coreStructures.push({
      type: placement.type,
      x: placement.x,
      y: placement.y,
      tag: placement.tag || null,
      rcl: Number.isFinite(placement.rcl) ? Math.max(1, Math.trunc(Number(placement.rcl))) : null,
    });
  }
  roadKeys.sort();
  return {
    version: 'harabi-foundation-v1',
    anchor:
      options.anchor && typeof options.anchor.x === 'number' && typeof options.anchor.y === 'number'
        ? { x: options.anchor.x, y: options.anchor.y }
        : null,
    spawnReference:
      options.spawnReference &&
      typeof options.spawnReference.x === 'number' &&
      typeof options.spawnReference.y === 'number'
        ? { x: options.spawnReference.x, y: options.spawnReference.y }
        : null,
    coreStampCenter:
      options.coreStampCenter &&
      typeof options.coreStampCenter.x === 'number' &&
      typeof options.coreStampCenter.y === 'number'
        ? { x: options.coreStampCenter.x, y: options.coreStampCenter.y }
        : null,
    stampClusters: {
      big: cloneSerializable(meta.stampStats && meta.stampStats.bigCenters ? meta.stampStats.bigCenters : []),
      small: cloneSerializable(meta.stampStats && meta.stampStats.smallCenters ? meta.stampStats.smallCenters : []),
    },
    roadIdentity: {
      count: roadKeys.length,
      keys: roadKeys,
      tags: roadTags,
    },
    coreStructures,
    structurePlanning: {
      computed: Boolean(structurePlanning.computed),
      counts: cloneSerializable(structurePlanning.counts || {}),
      ranking: {
        distanceModel: ranking.distanceModel || 'spawn-origin-dual-v1',
        rangeMode: ranking.rangeMode || 'origin-flood-8way',
        roadSelection: ranking.roadSelection || 'foundation-road-net',
        extensionOrderTotal: Number(ranking.extensionOrderTotal || 0),
      },
    },
    validStructurePositions: {
      canPlace: Number(validPositions.canPlace || 0),
      totalCandidates: Number(validPositions.totalCandidates || 0),
      distanceModel: validPositions.distanceModel || ranking.distanceModel || 'spawn-origin-dual-v1',
    },
  };
}

function deserializeFoundationRanking(structurePlanning) {
  const planning = structurePlanning && typeof structurePlanning === 'object' ? structurePlanning : {};
  const ranking = planning.ranking && typeof planning.ranking === 'object' ? planning.ranking : {};
  const extensionOrder = Array.isArray(ranking.extensionOrder) ? ranking.extensionOrder : [];
  const orderedCandidates = extensionOrder.map((entry, index) => {
    const x = Number(entry && entry.x);
    const y = Number(entry && entry.y);
    const bucketId =
      entry && typeof entry.bucket === 'string' && entry.bucket.length > 0
        ? entry.bucket
        : `solo:${x}:${y}`;
    return {
      x,
      y,
      key: key(x, y),
      rank:
        entry && Number.isFinite(entry.rank)
          ? Math.max(1, Math.trunc(Number(entry.rank)))
          : index + 1,
      range:
        entry && Number.isFinite(entry.range) ? Math.max(0, Math.trunc(Number(entry.range))) : 0,
      rawOriginDist:
        entry && Number.isFinite(entry.rawOriginDist)
          ? Math.max(0, Math.trunc(Number(entry.rawOriginDist)))
          : Infinity,
      biasScore: Number(entry && entry.biasScore ? entry.biasScore : 0),
      compactScore: Number(entry && entry.compactScore ? entry.compactScore : 0),
      wallScore: Number(entry && entry.wallScore ? entry.wallScore : 0),
      roadAdjScore: Number(entry && entry.roadAdjScore ? entry.roadAdjScore : 0),
      centerBonus:
        entry && Number.isFinite(entry.center) ? Math.max(0, Math.trunc(Number(entry.center))) : 0,
      bucketId,
      bucketType:
        entry && typeof entry.bucketType === 'string' && entry.bucketType.length > 0
          ? entry.bucketType
          : 'solo',
      bucketCapacity:
        entry && Number.isFinite(entry.bucketCapacity)
          ? Math.max(1, Math.trunc(Number(entry.bucketCapacity)))
          : 1,
      candidateRcl:
        entry && Number.isFinite(entry.candidateRcl)
          ? Math.max(1, Math.trunc(Number(entry.candidateRcl)))
          : null,
      distanceSource:
        entry && typeof entry.distanceSource === 'string' && entry.distanceSource.length > 0
          ? entry.distanceSource
          : 'origin-flood-8way',
    };
  });
  const bucketById = new Map();
  for (const candidate of orderedCandidates) {
    if (!bucketById.has(candidate.bucketId)) {
      bucketById.set(candidate.bucketId, {
        id: candidate.bucketId,
        type: candidate.bucketType,
        capacity: candidate.bucketCapacity,
      });
    }
  }
  return {
    orderedCandidates,
    bucketById,
    distanceModel: ranking.distanceModel || 'spawn-origin-dual-v1',
    rangeMode: ranking.rangeMode || 'origin-flood-8way',
    roadSelection: ranking.roadSelection || 'foundation-road-net',
    spawnReference:
      ranking.spawnRef && typeof ranking.spawnRef.x === 'number' && typeof ranking.spawnRef.y === 'number'
        ? { x: ranking.spawnRef.x, y: ranking.spawnRef.y }
        : null,
    spawnStampCenter:
      ranking.spawnStampCenter &&
      typeof ranking.spawnStampCenter.x === 'number' &&
      typeof ranking.spawnStampCenter.y === 'number'
        ? { x: ranking.spawnStampCenter.x, y: ranking.spawnStampCenter.y }
        : null,
  };
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

function computeLocalTransitPenalty(ctx, x, y, options = {}) {
  const radius = Math.max(1, Number(options.radius || 2));
  const localWalkable = new Set();
  for (let tx = x - radius; tx <= x + radius; tx++) {
    for (let ty = y - radius; ty <= y + radius; ty++) {
      if (!inBounds(tx, ty) || (tx === x && ty === y)) continue;
      const id = idx(tx, ty);
      const tileKey = key(tx, ty);
      if (ctx.matrices.walkableMatrix[id] !== 1) continue;
      if (ctx.matrices.staticBlocked[id] === 1) continue;
      if (ctx.matrices.exitProximity && ctx.matrices.exitProximity[id] === 1) continue;
      if (ctx.blocked && ctx.blocked.has(tileKey)) continue;
      if (ctx.roadBlockedByStructures && ctx.roadBlockedByStructures.has(tileKey)) continue;
      if (ctx.structuresByPos && ctx.structuresByPos.has(tileKey)) continue;
      localWalkable.add(tileKey);
    }
  }

  const adjacentKeys = neighbors8(x, y)
    .filter((n) => localWalkable.has(key(n.x, n.y)))
    .map((n) => key(n.x, n.y));
  if (adjacentKeys.length <= 1) return 0;

  const visited = new Set();
  const queue = [adjacentKeys[0]];
  visited.add(adjacentKeys[0]);
  while (queue.length > 0) {
    const current = queue.shift();
    const pos = parseKey(current);
    for (const next of neighbors8(pos.x, pos.y)) {
      const nextKey = key(next.x, next.y);
      if (!localWalkable.has(nextKey) || visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push(nextKey);
    }
  }

  let penalty = 0;
  const disconnectedNeighbors = adjacentKeys.filter((tileKey) => !visited.has(tileKey)).length;
  if (disconnectedNeighbors > 0) penalty += 4 + disconnectedNeighbors;
  if (adjacentKeys.length <= 2) penalty += 1.5;
  else if (adjacentKeys.length === 3) penalty += 0.5;
  return penalty;
}

function scoreSourceLinkCandidate(ctx, storage, sourcePos, containerPos, roadAnchor, pos) {
  const sourcePenalty = chebyshev(pos, sourcePos) === 1 ? 0 : 1;
  const containerPenalty = Math.max(0, chebyshev(pos, containerPos) - 1) * 1.4;
  const transitPenalty = computeLocalTransitPenalty(ctx, pos.x, pos.y);
  const opennessBonus = countWalkableNeighbors(ctx, pos.x, pos.y) * 0.15;
  let continuationPenalty = 0;
  if (roadAnchor) {
    const dx = Math.sign(containerPos.x - roadAnchor.x);
    const dy = Math.sign(containerPos.y - roadAnchor.y);
    const continuation = { x: containerPos.x + dx, y: containerPos.y + dy };
    if (pos.x === continuation.x && pos.y === continuation.y) {
      continuationPenalty = 4;
    }
  }
  const corridorPenalty =
    roadAnchor && chebyshev(pos, roadAnchor) <= 1 && manhattan(pos, containerPos) === 1 ? 0.35 : 0;
  return (
    -manhattan(storage, pos) -
    sourcePenalty -
    containerPenalty -
    transitPenalty -
    continuationPenalty -
    corridorPenalty +
    opennessBonus
  );
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
  const raw = options.layoutPattern || options.extensionPattern || 'cluster3';
  const normalized = String(raw || 'cluster3').toLowerCase();
  if (normalized === 'cluster3' || normalized === 'harabi' || normalized === 'diag2') {
    return 'cluster3';
  }
  return 'cluster3';
}

function resolveHarabiStage(options = {}) {
  const raw =
    options && typeof options === 'object'
      ? options.harabiStage || options.layoutHarabiStage || null
      : null;
  const normalized = String(raw || 'full').toLowerCase();
  return normalized === 'foundation' ? 'foundation' : 'full';
}

function resolveDefensePlanningMode(options = {}) {
  const raw =
    options && typeof options === 'object'
      ? options.defensePlanningMode || options.layoutDefensePlanningMode || null
      : null;
  const normalized = String(raw || 'full').toLowerCase();
  return normalized === 'estimate' ? 'estimate' : 'full';
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

function evaluateHarabiStampSlots(ctx, candidateNode, stamp, options = {}) {
  if (!ctx || !candidateNode || !stamp) {
    return { slotCandidates: [], viableSlots: [] };
  }
  const storagePos = options.storagePos || null;
  const layoutPattern = options.layoutPattern || 'parity';
  const preferredParity = Number.isFinite(options.preferredParity)
    ? Number(options.preferredParity)
    : storagePos
    ? checkerboard.parityAt(storagePos.x, storagePos.y)
    : 0;
  const foundationOnly = options.foundationOnly === true;
  const slotCandidates = projectStampSlots(candidateNode, stamp.slots).filter((p) =>
    inBounds(p.x, p.y) &&
    (
      checkerboard.classifyTileByPattern(p.x, p.y, storagePos, {
        pattern: layoutPattern,
        preferredParity,
      }) === 'structure' ||
      (p.dx === 0 && p.dy === 0)
    ) &&
    ctx.matrices.walkableMatrix[idx(p.x, p.y)] === 1 &&
    ctx.matrices.staticBlocked[idx(p.x, p.y)] !== 1 &&
    !ctx.reserved.has(key(p.x, p.y)) &&
    !ctx.roads.has(key(p.x, p.y)) &&
    !ctx.structuresByPos.has(key(p.x, p.y))
  );
  const viableSlots = foundationOnly
    ? []
    : slotCandidates.filter((p) => canPlaceStructure(ctx, STRUCTURES.EXTENSION, p.x, p.y));
  return { slotCandidates, viableSlots };
}

function collectHarabiStampCapacityKeys(evaluation) {
  return new Set(
    (evaluation && Array.isArray(evaluation.viableSlots) ? evaluation.viableSlots : [])
      .filter((slot) => slot && typeof slot.x === 'number' && typeof slot.y === 'number')
      .map((slot) => key(slot.x, slot.y)),
  );
}

function getHarabiStampPlacementSlots(evaluation, options = {}) {
  if (options.foundationOnly === true) return [];
  const viableSlots =
    evaluation && Array.isArray(evaluation.viableSlots) ? evaluation.viableSlots : [];
  const maxSlots = Number.isFinite(options.maxSlots)
    ? Math.max(0, Math.trunc(Number(options.maxSlots)))
    : viableSlots.length;
  return viableSlots.slice(0, maxSlots);
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

function collectCoreStructureSlotKeys(coreStamp) {
  const keys = new Set();
  if (!coreStamp || !coreStamp.center || !coreStamp.slots) return keys;
  for (const rel of Object.values(coreStamp.slots)) {
    if (!rel || !Number.isFinite(rel.x) || !Number.isFinite(rel.y)) continue;
    keys.add(key(coreStamp.center.x + rel.x, coreStamp.center.y + rel.y));
  }
  return keys;
}

function collectCoreRoadKeys(coreStamp) {
  const keys = new Set();
  if (!coreStamp || !coreStamp.center || !Array.isArray(coreStamp.roads)) return keys;
  for (const rel of coreStamp.roads) {
    if (!rel || !Number.isFinite(rel.x) || !Number.isFinite(rel.y)) continue;
    const x = coreStamp.center.x + rel.x;
    const y = coreStamp.center.y + rel.y;
    if (!inBounds(x, y)) continue;
    keys.add(key(x, y));
  }
  return keys;
}

function collectHarabiControllerStampCenters(controllerPos, options = {}) {
  if (!controllerPos || !Number.isFinite(controllerPos.x) || !Number.isFinite(controllerPos.y)) return [];
  const coreStructureSlotKeys = options.coreStructureSlotKeys instanceof Set ? options.coreStructureSlotKeys : new Set();
  const canPlaceLink =
    typeof options.canPlaceLink === 'function' ? options.canPlaceLink : () => false;
  const canPlaceRoad =
    typeof options.canPlaceRoad === 'function' ? options.canPlaceRoad : () => false;
  const hasRoad = typeof options.hasRoad === 'function' ? options.hasRoad : () => false;
  const centers = [];

  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const center = { x: controllerPos.x + dx, y: controllerPos.y + dy };
      if (!inBounds(center.x, center.y)) continue;
      if (chebyshev(center, controllerPos) > 2) continue;
      if (coreStructureSlotKeys.has(key(center.x, center.y))) continue;
      if (!canPlaceLink(center.x, center.y)) continue;
      const ring = neighbors8(center.x, center.y);
      if (!ring.every((p) => inBounds(p.x, p.y) && chebyshev(p, controllerPos) <= 3)) continue;
      if (ring.some((p) => coreStructureSlotKeys.has(key(p.x, p.y)))) continue;
      const ringComplete = ring.every((p) => hasRoad(p.x, p.y) || canPlaceRoad(p.x, p.y));
      if (!ringComplete) continue;
      centers.push({ x: center.x, y: center.y, ring });
    }
  }
  return centers;
}

function hasHarabiControllerStampFit(anchor, controllerPos, matrices) {
  if (!anchor || !controllerPos || !matrices) return false;
  const coreStamp = getHarabiCoreStamp(anchor);
  if (!coreStamp || !coreStamp.center) return false;
  const coreStructureSlotKeys = collectCoreStructureSlotKeys(coreStamp);
  const coreRoadKeys = collectCoreRoadKeys(coreStamp);

  const canPlaceLink = (x, y) => {
    if (!inBounds(x, y)) return false;
    const k = key(x, y);
    if (coreRoadKeys.has(k)) return false;
    const id = idx(x, y);
    if (matrices.walkableMatrix[id] !== 1) return false;
    if (matrices.staticBlocked && matrices.staticBlocked[id] === 1) return false;
    if (matrices.exitProximity && matrices.exitProximity[id] === 1) return false;
    return true;
  };
  const canPlaceRoad = (x, y) => {
    if (!inBounds(x, y)) return false;
    const id = idx(x, y);
    if (matrices.walkableMatrix[id] !== 1) return false;
    if (matrices.staticBlocked && matrices.staticBlocked[id] === 1) return false;
    return true;
  };

  const centers = collectHarabiControllerStampCenters(controllerPos, {
    coreStructureSlotKeys,
    canPlaceLink,
    canPlaceRoad,
    hasRoad: (x, y) => coreRoadKeys.has(key(x, y)),
  });
  return centers.length > 0;
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
  if (options.foundationRanking) {
    return collectValidStructurePositionsFromRanking(options.foundationRanking, options.foundationSelection, {
      maxPositions: options.maxPositions,
      mode: options.mode,
      revisit: options.revisit,
    });
  }
  const depthLimit = Number.isFinite(options.depthLimit) ? Number(options.depthLimit) : 12;
  const requirePattern = options.requirePattern !== false;
  const labReserveKeys = options.labReserveKeys instanceof Set ? options.labReserveKeys : new Set();
  const centerOverrideKeys = options.centerOverrideKeys instanceof Set ? options.centerOverrideKeys : new Set();
  const excludedKeys = options.excludedKeys instanceof Set ? options.excludedKeys : new Set();
  const positionMetaByKey = options.positionMetaByKey instanceof Map ? options.positionMetaByKey : new Map();
  const allowedRoadTags = Array.isArray(options.allowedRoadTags) ? new Set(options.allowedRoadTags) : null;
  const allowedRoadKeys = allowedRoadTags
    ? new Set(
      (ctx.placements || [])
        .filter((p) => p && p.type === STRUCTURES.ROAD && allowedRoadTags.has(String(p.tag || '')))
        .map((p) => key(p.x, p.y)),
    )
    : null;
  const maxPositions = Number.isFinite(options.maxPositions) ? Math.max(1, Number(options.maxPositions)) : 300;
  const result = {
    mode: String(options.mode || 'strict-buildable-v1'),
    revisit: String(options.revisit || 'dual-layer-debug-candidates'),
    distanceModel: String(options.distanceModel || 'stamp-dt-hybrid-v1'),
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
    const isStructurePattern = patternType === 'structure' || centerOverrideKeys.has(k);
    if (isStructurePattern) {
      result.patternStructure += 1;
    } else if (requirePattern) {
      continue;
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
    const hasAdjacentRoad = neighbors8(node.x, node.y).some((n) => {
      const nk = key(n.x, n.y);
      if (allowedRoadKeys) return allowedRoadKeys.has(nk);
      return ctx.roads.has(nk);
    });
    if (!hasAdjacentRoad) continue;
    result.adjacentRoad += 1;
    if (labReserveKeys.has(k)) continue;
    result.labReserveClear += 1;
    if (!canPlaceStructure(ctx, STRUCTURES.EXTENSION, node.x, node.y)) continue;
    result.canPlace += 1;
    if (result.positions.length < maxPositions) {
      const pos = { x: node.x, y: node.y };
      const meta = positionMetaByKey.get(k) || null;
      if (meta && Number.isFinite(meta.dist)) pos.dist = Math.max(0, Math.trunc(Number(meta.dist)));
      if (meta && Number.isFinite(meta.range)) pos.range = Math.max(0, Math.trunc(Number(meta.range)));
      if (meta && Number.isFinite(meta.candidateRcl)) {
        pos.candidateRcl = Math.max(1, Math.trunc(Number(meta.candidateRcl)));
      }
      if (meta && typeof meta.bucket === 'string' && meta.bucket.length > 0) pos.bucket = meta.bucket;
      if (meta && Number.isFinite(meta.biasScore)) pos.biasScore = Number(meta.biasScore);
      if (meta && Number.isFinite(meta.compactScore)) pos.compactScore = Number(meta.compactScore);
      if (meta && Number.isFinite(meta.wallScore)) pos.wallScore = Number(meta.wallScore);
      if (meta && typeof meta.distanceSource === 'string' && meta.distanceSource.length > 0) {
        pos.distanceSource = meta.distanceSource;
      }
      result.positions.push(pos);
    } else {
      result.truncated = true;
    }
  }
  return result;
}

function buildOriginFloodDistanceMap(origin, graphKeys) {
  const distanceByKey = new Map();
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return distanceByKey;
  const originKey = key(origin.x, origin.y);
  const queue = [{ x: origin.x, y: origin.y }];
  distanceByKey.set(originKey, 0);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const currentKey = key(current.x, current.y);
    const base = Number(distanceByKey.get(currentKey) || 0);
    for (const next of neighbors8(current.x, current.y)) {
      const nextKey = key(next.x, next.y);
      if (!graphKeys.has(nextKey) || distanceByKey.has(nextKey)) continue;
      distanceByKey.set(nextKey, base + 1);
      queue.push(next);
    }
  }
  return distanceByKey;
}

function buildFoundationFloodDistanceByKey(ctx, origin) {
  const raw = computeDistanceMap(walkableWithPlan(ctx), origin);
  const map = new Map();
  for (const distanceKey in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, distanceKey)) continue;
    map.set(distanceKey, Number(raw[distanceKey]));
  }
  return map;
}

function rankFoundationSelectableCandidates(candidates, options = {}) {
  const storage = options.storage || null;
  const slotOrderShift = Number.isFinite(options.slotOrderShift) ? Number(options.slotOrderShift) : 0;
  const bucketById = new Map();

  for (const candidate of candidates || []) {
    if (!candidate || typeof candidate.bucketId !== 'string') continue;
    if (!bucketById.has(candidate.bucketId)) {
      bucketById.set(candidate.bucketId, {
        id: candidate.bucketId,
        type: candidate.bucketType || 'solo',
        center: candidate.bucketCenter || { x: candidate.x, y: candidate.y },
        candidates: [],
        capacity: 0,
      });
    }
    bucketById.get(candidate.bucketId).candidates.push(candidate);
  }

  for (const bucket of bucketById.values()) {
    bucket.capacity = bucket.candidates.length;
    bucket.candidates.sort(
      (a, b) =>
        Number(a.range || 0) - Number(b.range || 0) ||
        Number(b.centerBonus || 0) - Number(a.centerBonus || 0) ||
        Number(b.biasScore || 0) - Number(a.biasScore || 0) ||
        (Number.isFinite(a.rawOriginDist) ? Number(a.rawOriginDist) : Infinity) -
          (Number.isFinite(b.rawOriginDist) ? Number(b.rawOriginDist) : Infinity) ||
        (Number.isFinite(a.d) ? Number(a.d) : Infinity) -
          (Number.isFinite(b.d) ? Number(b.d) : Infinity) ||
        (storage ? manhattan(a, storage) - manhattan(b, storage) : 0) ||
        deterministicJitter(a.x, a.y, slotOrderShift) - deterministicJitter(b.x, b.y, slotOrderShift),
    );
  }

  const orderedCandidates = [];
  const usedKeys = new Set();
  const selectedCountsByBucket = new Map();
  const compareCandidate = (leftBucket, leftCandidate, rightBucket, rightCandidate) => {
    if (!rightCandidate) return -1;
    const leftPlaced = Number(selectedCountsByBucket.get(leftBucket.id) || 0);
    const rightPlaced = Number(selectedCountsByBucket.get(rightBucket.id) || 0);
    const leftRemaining = Math.max(0, Number(leftBucket.capacity || 0) - leftPlaced);
    const rightRemaining = Math.max(0, Number(rightBucket.capacity || 0) - rightPlaced);
    let leftPriorityRange = Number(leftCandidate.range || 0);
    let rightPriorityRange = Number(rightCandidate.range || 0);
    if (leftBucket.type === 'big' && leftPlaced > 0) {
      leftPriorityRange -= 1;
      if (leftRemaining <= 4) leftPriorityRange -= 1;
    }
    if (rightBucket.type === 'big' && rightPlaced > 0) {
      rightPriorityRange -= 1;
      if (rightRemaining <= 4) rightPriorityRange -= 1;
    }
    return (
      leftPriorityRange - rightPriorityRange ||
      Number(rightCandidate.biasScore || 0) - Number(leftCandidate.biasScore || 0) ||
      (Number.isFinite(leftCandidate.rawOriginDist) ? Number(leftCandidate.rawOriginDist) : Infinity) -
        (Number.isFinite(rightCandidate.rawOriginDist) ? Number(rightCandidate.rawOriginDist) : Infinity) ||
      leftBucket.id.localeCompare(rightBucket.id)
    );
  };

  while (true) {
    let bestBucket = null;
    let bestCandidate = null;
    for (const bucket of bucketById.values()) {
      const nextCandidate = bucket.candidates.find((candidate) => !usedKeys.has(candidate.key)) || null;
      if (!nextCandidate) continue;
      if (!bestCandidate || compareCandidate(bucket, nextCandidate, bestBucket, bestCandidate) < 0) {
        bestBucket = bucket;
        bestCandidate = nextCandidate;
      }
    }
    if (!bestBucket || !bestCandidate) break;
    usedKeys.add(bestCandidate.key);
    orderedCandidates.push(bestCandidate);
    selectedCountsByBucket.set(bestBucket.id, Number(selectedCountsByBucket.get(bestBucket.id) || 0) + 1);
  }

  return {
    orderedCandidates,
    bucketById,
  };
}

function buildFoundationPreviewRanking(
  ctx,
  sortedFlood,
  storage,
  layoutPattern,
  preferredParity,
  options = {},
) {
  const centerOverrideKeys = options.centerOverrideKeys instanceof Set ? options.centerOverrideKeys : new Set();
  const excludedKeys = options.excludedKeys instanceof Set ? options.excludedKeys : new Set();
  const labReserveKeys = options.labReserveKeys instanceof Set ? options.labReserveKeys : new Set();
  const depthLimit = Number.isFinite(options.depthLimit) ? Number(options.depthLimit) : 50;
  const slotOrderShift = Number.isFinite(options.slotOrderShift) ? Number(options.slotOrderShift) : 0;
  const terrainDt = Array.isArray(options.terrainDt) ? options.terrainDt : null;
  const useAllRoads = options.useAllRoads === true;
  const spawnReference =
    options.spawnReference &&
    typeof options.spawnReference.x === 'number' &&
    typeof options.spawnReference.y === 'number'
      ? options.spawnReference
      : storage;
  const stampCenters = Array.isArray(options.stampCenters) ? options.stampCenters : [];
  const smallStampCenters = Array.isArray(options.smallStampCenters) ? options.smallStampCenters : [];
  const floodDistanceByKey =
    options.floodDistanceByKey instanceof Map ? options.floodDistanceByKey : new Map();
  const allowedRoadTags =
    useAllRoads
      ? null
      : new Set(options.allowedRoadTags || [
        'road.stamp',
        'road.coreStamp',
        'road.controllerStamp',
        'road.grid',
      ]);
  const rawAllowedRoadKeys = useAllRoads
    ? new Set(ctx.roads || [])
    : new Set(
      (ctx.placements || [])
        .filter((p) => p && p.type === STRUCTURES.ROAD && allowedRoadTags.has(String(p.tag || '')))
        .map((p) => key(p.x, p.y)),
    );
  const allowedRoadKeys = (() => {
    const connectedKeys = buildMainRoadComponentKeys(ctx, storage, rawAllowedRoadKeys);
    return connectedKeys.size > 0 ? connectedKeys : rawAllowedRoadKeys;
  })();
  const summary = {
    mode: String(options.mode || 'strict-buildable-v1'),
    revisit: String(options.revisit || 'dual-layer-debug-candidates'),
    distanceModel: 'spawn-origin-dual-v1',
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

  if (!Array.isArray(sortedFlood) || !storage) {
    return {
      summary,
      orderedCandidates: [],
      bucketById: new Map(),
      spawnReference,
      spawnStampCenter: null,
      distanceModel: 'spawn-origin-dual-v1',
      rangeMode: 'origin-flood-8way',
    };
  }

  const slotClaimsByKey = new Map();
  const bucketInfoById = new Map();
  const registerSlotClaim = (x, y, bucketId) => {
    if (!inBounds(x, y)) return;
    const slotKey = key(x, y);
    const claims = slotClaimsByKey.get(slotKey) || [];
    if (!claims.includes(bucketId)) claims.push(bucketId);
    slotClaimsByKey.set(slotKey, claims);
  };
  for (let i = 0; i < stampCenters.length; i++) {
    const center = stampCenters[i];
    if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') continue;
    const id = `big:${i}`;
    bucketInfoById.set(id, {
      id,
      type: 'big',
      center: { x: center.x, y: center.y },
    });
    for (const slot of projectStampSlots(center, HARABI_ROAD_STAMP_5.slots)) {
      registerSlotClaim(slot.x, slot.y, id);
    }
  }
  for (let i = 0; i < smallStampCenters.length; i++) {
    const center = smallStampCenters[i];
    if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') continue;
    const id = `small:${i}`;
    bucketInfoById.set(id, {
      id,
      type: 'small',
      center: { x: center.x, y: center.y },
    });
    registerSlotClaim(center.x, center.y, id);
  }
  const orderedCoreBuckets = [...bucketInfoById.values()].sort(
    (a, b) =>
      chebyshev(a.center, spawnReference) - chebyshev(b.center, spawnReference) ||
      a.id.localeCompare(b.id),
  );
  const spawnStampCenter = orderedCoreBuckets.length > 0 ? orderedCoreBuckets[0].center : null;
  const resolveSlotBucket = (x, y) => {
    const claims = slotClaimsByKey.get(key(x, y)) || null;
    if (!claims || claims.length === 0) return null;
    if (claims.length === 1) return claims[0];
    let best = null;
    for (const bucketId of claims) {
      const info = bucketInfoById.get(bucketId) || null;
      if (!info || !info.center) continue;
      const centerMatch = info.center.x === x && info.center.y === y ? 1 : 0;
      const centerDist = chebyshev({ x, y }, info.center);
      const spawnDist = chebyshev(info.center, spawnReference);
      if (
        !best ||
        centerMatch > best.centerMatch ||
        (centerMatch === best.centerMatch && centerDist < best.centerDist) ||
        (centerMatch === best.centerMatch && centerDist === best.centerDist && spawnDist < best.spawnDist) ||
        (centerMatch === best.centerMatch &&
          centerDist === best.centerDist &&
          spawnDist === best.spawnDist &&
          bucketId.localeCompare(best.bucketId) < 0)
      ) {
        best = {
          bucketId,
          centerMatch,
          centerDist,
          spawnDist,
        };
      }
    }
    return best ? best.bucketId : claims[0];
  };
  const maxTerrainDt =
    terrainDt && terrainDt.length === 2500
      ? terrainDt.reduce((max, value) => {
        if (!Number.isFinite(value)) return max;
        return value > max ? value : max;
      }, 0)
      : 0;
  const wallScoreForTile = (x, y) => {
    if (!terrainDt || terrainDt.length !== 2500) return 0.5;
    const dtValue = Number(terrainDt[idx(x, y)] || 0);
    if (!Number.isFinite(dtValue) || dtValue <= 1) return 1;
    const span = Math.max(1, maxTerrainDt - 1);
    return clamp01(1 - (dtValue - 1) / span);
  };
  const compactScoreForTile = (x, y) => {
    const compactDistance = chebyshev({ x, y }, storage);
    return clamp01(1 - compactDistance / 25);
  };

  const graphCandidates = [];
  for (const node of sortedFlood || []) {
    if (!node) continue;
    const proximity = chebyshev(node, spawnReference);
    if (proximity > depthLimit) continue;
    summary.totalCandidates += 1;
    const candidateKey = key(node.x, node.y);
    const patternType = checkerboard.classifyTileByPattern(node.x, node.y, storage, {
      pattern: layoutPattern,
      preferredParity,
    });
    const isStructurePattern = patternType === 'structure' || centerOverrideKeys.has(candidateKey);
    if (isStructurePattern) summary.patternStructure += 1;
    if (ctx.matrices.walkableMatrix[idx(node.x, node.y)] !== 1) continue;
    summary.walkable += 1;
    if (ctx.matrices.staticBlocked[idx(node.x, node.y)] === 1) continue;
    summary.staticClear += 1;
    if (ctx.reserved.has(candidateKey)) continue;
    summary.reservedClear += 1;
    if (ctx.structuresByPos.has(candidateKey)) continue;
    summary.structureClear += 1;
    if (ctx.roads.has(candidateKey)) continue;
    summary.roadClear += 1;
    if (excludedKeys.has(candidateKey)) {
      summary.previewExcluded += 1;
      continue;
    }
    const roadAdj = neighbors8(node.x, node.y).reduce((sum, neighbor) => {
      return sum + Number(allowedRoadKeys.has(key(neighbor.x, neighbor.y)));
    }, 0);
    if (roadAdj <= 0) continue;
    summary.adjacentRoad += 1;
    if (labReserveKeys.has(candidateKey)) continue;
    summary.labReserveClear += 1;
    if (!canPlaceStructure(ctx, STRUCTURES.EXTENSION, node.x, node.y)) continue;
    const stampBucket = resolveSlotBucket(node.x, node.y);
    const bucketId = stampBucket || `solo:${node.x}:${node.y}`;
    const bucketInfo = bucketInfoById.get(bucketId) || null;
    graphCandidates.push({
      x: node.x,
      y: node.y,
      key: candidateKey,
      d: Number(
        floodDistanceByKey.has(candidateKey)
          ? floodDistanceByKey.get(candidateKey)
          : Number.isFinite(node.d)
            ? node.d
            : chebyshev(node, storage),
      ),
      centerBonus: centerOverrideKeys.has(candidateKey) ? 1 : 0,
      patternEligible: Boolean(isStructurePattern),
      stampBucket,
      bucketId,
      bucketType: bucketInfo && bucketInfo.type ? bucketInfo.type : 'solo',
      bucketCenter:
        bucketInfo && bucketInfo.center
          ? { x: bucketInfo.center.x, y: bucketInfo.center.y }
          : { x: node.x, y: node.y },
      compactScore: compactScoreForTile(node.x, node.y),
      wallScore: wallScoreForTile(node.x, node.y),
      roadAdjScore: clamp01(roadAdj / 8),
      rawOriginDist: Infinity,
      range: Infinity,
      spawnDist: Infinity,
      biasScore: 0,
      distanceSource: 'origin-flood-8way',
    });
  }

  const graphKeys = new Set([...allowedRoadKeys, ...graphCandidates.map((candidate) => candidate.key)]);
  const originDistanceByKey = buildOriginFloodDistanceMap(spawnReference, graphKeys);
  const originKey = key(spawnReference.x, spawnReference.y);
  const candidateByKey = new Map(graphCandidates.map((candidate) => [candidate.key, candidate]));
  const originFloodTiles = [...originDistanceByKey.entries()]
    .filter(([, distance]) => Number.isFinite(Number(distance)))
    .map(([tileKey, distance]) => {
      const pos = parseKey(tileKey);
      const candidate = candidateByKey.get(tileKey) || null;
      return {
        x: pos.x,
        y: pos.y,
        d: Math.max(0, Math.trunc(Number(distance))),
        kind:
          tileKey === originKey
            ? 'origin'
            : candidate
            ? 'candidate'
            : allowedRoadKeys.has(tileKey)
            ? 'road'
            : 'graph',
        bucket: candidate && candidate.bucketId ? candidate.bucketId : null,
        bucketType: candidate && candidate.bucketType ? candidate.bucketType : null,
        patternEligible: candidate ? Boolean(candidate.patternEligible) : null,
      };
    })
    .sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const originFloodStats = originFloodTiles.reduce((stats, tile) => {
    if (tile.kind === 'road') stats.roadTiles += 1;
    if (tile.kind === 'candidate') stats.candidateTiles += 1;
    return stats;
  }, {
    reachableTiles: originFloodTiles.length,
    roadTiles: 0,
    candidateTiles: 0,
  });

  for (const candidate of graphCandidates) {
    const rawOriginDist = Number(originDistanceByKey.get(candidate.key));
    const hasOriginDistance = Number.isFinite(rawOriginDist);
    candidate.rawOriginDist = hasOriginDistance ? rawOriginDist : Infinity;
    candidate.spawnDist = candidate.rawOriginDist;
  }

  const reachableCandidates = graphCandidates.filter((candidate) => Number.isFinite(candidate.rawOriginDist));
  const minReachableOriginDist = reachableCandidates.reduce((min, candidate) => {
    return Math.min(min, Number(candidate.rawOriginDist));
  }, Infinity);
  const normalizedOriginFloor = Number.isFinite(minReachableOriginDist) ? minReachableOriginDist : 0;

  for (const candidate of graphCandidates) {
    candidate.range = Number.isFinite(candidate.rawOriginDist)
      ? Math.max(0, candidate.rawOriginDist - normalizedOriginFloor)
      : 999;
    const contextualWallScore =
      candidate.wallScore * candidate.compactScore * clamp01(1 - candidate.range / 12);
    candidate.contextualWallScore = contextualWallScore;
    candidate.biasScore =
      candidate.compactScore * 0.55 + contextualWallScore * 0.35 + candidate.roadAdjScore * 0.10;
  }

  const rankedAll = rankFoundationSelectableCandidates(reachableCandidates, {
    storage,
    slotOrderShift,
  });
  for (let i = 0; i < rankedAll.orderedCandidates.length; i++) {
    const candidate = rankedAll.orderedCandidates[i];
    candidate.rank = i + 1;
    candidate.candidateRcl = assignExtensionRcl(i);
  }
  const rankedPattern = rankFoundationSelectableCandidates(
    reachableCandidates.filter((candidate) => candidate.patternEligible),
    {
      storage,
      slotOrderShift,
    },
  );
  for (let i = 0; i < rankedPattern.orderedCandidates.length; i++) {
    const candidate = rankedPattern.orderedCandidates[i];
    candidate.patternRank = i + 1;
    candidate.candidateRcl = assignExtensionRcl(i);
  }
  summary.canPlace = rankedAll.orderedCandidates.length;

  return {
    summary,
    graphCandidates,
    orderedCandidates: rankedAll.orderedCandidates,
    orderedPatternCandidates: rankedPattern.orderedCandidates,
    bucketById: rankedAll.bucketById,
    spawnReference,
    spawnStampCenter,
    distanceModel: 'spawn-origin-dual-v1',
    rangeMode: 'origin-flood-8way',
    roadSelection: useAllRoads ? 'final-road-net' : 'foundation-road-net',
    originFloodTiles,
    originFloodStats,
  };
}

function planFoundationStructurePreview(ranking, options = {}) {
  const rankingLimit = Number.isFinite(options.rankingLimit)
    ? Math.max(1, Math.trunc(options.rankingLimit))
    : 2500;
  const placements = [];
  const selectedByKey = new Map();
  const selectedCountsByBucket = new Map();
  const orderedCandidates = Array.isArray(ranking && ranking.orderedCandidates) ? ranking.orderedCandidates : [];
  const allCursor = { index: 0 };
  let extensionPlaced = 0;

  const selectNextCandidateFrom = (candidateList, cursorState, type, tag, placementOptions = {}) => {
    while (cursorState.index < candidateList.length) {
      const candidate = candidateList[cursorState.index];
      cursorState.index += 1;
      if (!candidate || selectedByKey.has(candidate.key)) continue;
      const plannedRcl = Number.isFinite(placementOptions.rcl)
        ? Math.max(1, Math.trunc(Number(placementOptions.rcl)))
        : null;
      placements.push({
        type,
        x: candidate.x,
        y: candidate.y,
        tag,
        range: Number.isFinite(candidate.range) ? candidate.range : null,
        rawOriginDist: Number.isFinite(candidate.rawOriginDist) ? candidate.rawOriginDist : null,
        distanceSource: candidate.distanceSource || null,
        stampBucket: candidate.stampBucket || null,
        bucketType: candidate.bucketType || 'solo',
        ...(plannedRcl !== null ? { rcl: plannedRcl } : {}),
      });
      selectedByKey.set(candidate.key, {
        type,
        tag,
        ...(plannedRcl !== null ? { rcl: plannedRcl } : {}),
      });
      selectedCountsByBucket.set(
        candidate.bucketId,
        Number(selectedCountsByBucket.get(candidate.bucketId) || 0) + 1,
      );
      return true;
    }
    return false;
  };
  const selectNextCandidate = (type, tag, placementOptions = {}) =>
    selectNextCandidateFrom(orderedCandidates, allCursor, type, tag, placementOptions);

  // Keep one shared picker so specials, extensions and remaining valid dots all
  // partition the same final ranking instead of diverging by pattern subset.
  selectNextCandidate(STRUCTURES.FACTORY, 'preview.factory', { rcl: 7 });
  selectNextCandidate(STRUCTURES.NUKER, 'preview.nuker', { rcl: 8 });
  selectNextCandidate(STRUCTURES.OBSERVER, 'preview.observer', { rcl: 8 });
  while (extensionPlaced < 60) {
    const placed = selectNextCandidate(STRUCTURES.EXTENSION, 'preview.extension', {
      rcl: assignExtensionRcl(extensionPlaced),
    });
    if (!placed) break;
    extensionPlaced += 1;
  }

  const extensionOrder = [];
  const extensionOrderTotal = orderedCandidates.length;
  for (const candidate of orderedCandidates) {
    if (!candidate) continue;
    if (extensionOrder.length >= rankingLimit) continue;
    const selected = selectedByKey.get(candidate.key) || null;
    const bucket = ranking.bucketById.get(candidate.bucketId) || null;
    const bucketPlaced = Number(selectedCountsByBucket.get(candidate.bucketId) || 0);
    const bucketCapacity = Math.max(1, Number(bucket && bucket.capacity ? bucket.capacity : 1));
    extensionOrder.push({
      rank: Number(candidate.rank || extensionOrder.length + 1),
      x: candidate.x,
      y: candidate.y,
      bucket: candidate.bucketId || null,
      bucketType: candidate.bucketType || 'solo',
      bucketPlaced,
      bucketCapacity,
      bucketRemaining: Math.max(0, bucketCapacity - bucketPlaced),
      range: Number.isFinite(candidate.range) ? candidate.range : 0,
      rawOriginDist: Number.isFinite(candidate.rawOriginDist) ? candidate.rawOriginDist : null,
      spawnDist: Number.isFinite(candidate.rawOriginDist) ? candidate.rawOriginDist : 0,
      center: candidate.centerBonus ? 1 : 0,
      biasScore: Number(candidate.biasScore || 0),
      compactScore: Number(candidate.compactScore || 0),
      wallScore: Number(candidate.wallScore || 0),
      roadAdjScore: Number(candidate.roadAdjScore || 0),
      distanceSource: candidate.distanceSource || 'origin-flood-8way',
      selectedType: selected ? selected.type : null,
      selectedTag: selected ? selected.tag : null,
      candidateRcl: Number.isFinite(candidate.candidateRcl) ? candidate.candidateRcl : null,
      selectedRcl:
        selected && Number.isFinite(selected.rcl)
          ? Math.max(1, Math.trunc(Number(selected.rcl)))
          : null,
    });
  }

  const counts = {};
  for (const placement of placements) {
    counts[placement.type] = Number(counts[placement.type] || 0) + 1;
  }

  return {
    preview: {
      mode: 'foundation-preview',
      computed: true,
      strategy: 'special-first + bucket-aware origin-flood rank',
      placements,
      counts,
      ranking: {
        spawnRef: { x: ranking.spawnReference.x, y: ranking.spawnReference.y },
        spawnStampCenter: ranking.spawnStampCenter
          ? { x: ranking.spawnStampCenter.x, y: ranking.spawnStampCenter.y }
          : null,
        rangeMode: ranking.rangeMode || 'origin-flood-8way',
        distanceModel: ranking.distanceModel || 'spawn-origin-dual-v1',
        roadSelection: ranking.roadSelection || 'foundation-road-net',
        originFloodTiles: Array.isArray(ranking.originFloodTiles) ? ranking.originFloodTiles : [],
        originFloodStats:
          ranking && ranking.originFloodStats && typeof ranking.originFloodStats === 'object'
            ? ranking.originFloodStats
            : { reachableTiles: 0, roadTiles: 0, candidateTiles: 0 },
        orderedBuckets: new Set(orderedCandidates.map((candidate) => candidate.bucketId)).size,
        extensionOrderTotal,
        extensionOrder,
        extensionOrderTruncated: extensionOrderTotal > extensionOrder.length,
      },
    },
    selection: {
      selectedByKey,
      selectedCountsByBucket,
    },
  };
}

function collectValidStructurePositionsFromRanking(ranking, selection, options = {}) {
  const maxPositions = Number.isFinite(options.maxPositions) ? Math.max(1, Number(options.maxPositions)) : 300;
  const result = Object.assign({}, ranking && ranking.summary ? ranking.summary : {}, {
    mode: String(options.mode || 'strict-buildable-v1'),
    revisit: String(options.revisit || 'dual-layer-debug-candidates'),
    distanceModel:
      ranking && typeof ranking.distanceModel === 'string'
        ? ranking.distanceModel
        : 'spawn-origin-dual-v1',
    positions: [],
    truncated: false,
  });
  const orderedCandidates = Array.isArray(ranking && ranking.orderedCandidates) ? ranking.orderedCandidates : [];
  const selectedByKey =
    selection && selection.selectedByKey instanceof Map ? selection.selectedByKey : new Map();
  const selectedCountsByBucket =
    selection && selection.selectedCountsByBucket instanceof Map
      ? selection.selectedCountsByBucket
      : new Map();
  let availableCount = 0;

  for (const candidate of orderedCandidates) {
    if (!candidate || selectedByKey.has(candidate.key)) continue;
    availableCount += 1;
    if (result.positions.length >= maxPositions) {
      result.truncated = true;
      continue;
    }
    const bucket = ranking.bucketById.get(candidate.bucketId) || null;
    const bucketPlaced = Number(selectedCountsByBucket.get(candidate.bucketId) || 0);
    const bucketCapacity = Math.max(1, Number(bucket && bucket.capacity ? bucket.capacity : 1));
    result.positions.push({
      x: candidate.x,
      y: candidate.y,
      dist: Number.isFinite(candidate.range) ? Math.max(0, Math.trunc(Number(candidate.range))) : null,
      range: Number.isFinite(candidate.range) ? Math.max(0, Math.trunc(Number(candidate.range))) : null,
      rawOriginDist:
        Number.isFinite(candidate.rawOriginDist) ? Math.max(0, Math.trunc(Number(candidate.rawOriginDist))) : null,
      candidateRcl:
        Number.isFinite(candidate.candidateRcl) ? Math.max(1, Math.trunc(Number(candidate.candidateRcl))) : null,
      bucket: candidate.bucketId || null,
      bucketType: candidate.bucketType || 'solo',
      bucketPlaced,
      bucketCapacity,
      bucketRemaining: Math.max(0, bucketCapacity - bucketPlaced),
      biasScore: Number(candidate.biasScore || 0),
      compactScore: Number(candidate.compactScore || 0),
      wallScore: Number(candidate.wallScore || 0),
      roadAdjScore: Number(candidate.roadAdjScore || 0),
      distanceSource: candidate.distanceSource || 'origin-flood-8way',
    });
  }
  result.canPlace = availableCount;
  return result;
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
  const targetRange = Number.isFinite(options.targetRange)
    ? Math.max(0, Math.trunc(Number(options.targetRange)))
    : 1;
  const fromKey = key(from.x, from.y);
  const toKey = key(to.x, to.y);
  const routeTieBreakShift = Number.isFinite(options.routeTieBreakShift)
    ? Number(options.routeTieBreakShift)
    : Number(ctx && ctx.meta ? ctx.meta.routeTieBreakShift || 0 : 0);
  const reachesTarget = (path) => {
    if (!Array.isArray(path) || path.length === 0) return false;
    const last = path[path.length - 1];
    if (!last || !Number.isFinite(last.x) || !Number.isFinite(last.y)) return false;
    return chebyshev(last, to) <= targetRange;
  };

  const res = PathFinder.search(
    new RoomPosition(from.x, from.y, ctx.roomName),
    { pos: new RoomPosition(to.x, to.y, ctx.roomName), range: targetRange },
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
            if (
              ctx.roadBlockedByStructures &&
              ctx.roadBlockedByStructures.has(k) &&
              k !== fromKey &&
              k !== toKey
            ) {
              costs.set(x, y, 255);
              continue;
            }
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
  const mappedPath =
    res && Array.isArray(res.path)
      ? res.path.map((p) => ({ x: p.x, y: p.y }))
      : [];
  if (reachesTarget(mappedPath)) return mappedPath;
  return buildFallbackRoadPath(ctx, from, to, {
    preferredRoads,
    avoidKeys,
    avoidPenalty,
    targetRange,
    routeTieBreakShift,
  });
}

function isRelocatableRoadBlocker(placement) {
  if (!placement) return false;
  if (placement.type !== STRUCTURES.EXTENSION) return false;
  return String(placement.tag || '').startsWith('extension.');
}

function pathRoadsAllowingSingleRelocation(ctx, from, to, options = {}) {
  if (!from || !to || typeof PathFinder === 'undefined' || typeof PathFinder.search !== 'function') {
    return { path: [], blockerKey: null };
  }
  if (typeof RoomPosition === 'undefined') return { path: [], blockerKey: null };
  const preferredRoads = options.preferredRoads || null;
  const avoidKeys = options.avoidKeys || null;
  const avoidPenalty = Number.isFinite(options.avoidPenalty) ? options.avoidPenalty : 15;
  const targetRange = Number.isFinite(options.targetRange)
    ? Math.max(0, Math.trunc(Number(options.targetRange)))
    : 1;
  const relocatableKeys = options.relocatableKeys instanceof Set ? options.relocatableKeys : new Set();
  const fromKey = key(from.x, from.y);
  const toKey = key(to.x, to.y);
  const reachesTarget = (path) => {
    if (!Array.isArray(path) || path.length === 0) return false;
    const last = path[path.length - 1];
    return Boolean(last && Number.isFinite(last.x) && Number.isFinite(last.y) && chebyshev(last, to) <= targetRange);
  };
  const res = PathFinder.search(
    new RoomPosition(from.x, from.y, ctx.roomName),
    { pos: new RoomPosition(to.x, to.y, ctx.roomName), range: targetRange },
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
            const tileKey = key(x, y);
            if (
              ctx.roadBlockedByStructures &&
              ctx.roadBlockedByStructures.has(tileKey) &&
              tileKey !== fromKey &&
              tileKey !== toKey &&
              !relocatableKeys.has(tileKey)
            ) {
              costs.set(x, y, 255);
              continue;
            }
            if (ctx.structuresByPos.has(tileKey) && tileKey !== fromKey && tileKey !== toKey) {
              if (relocatableKeys.has(tileKey)) {
                costs.set(x, y, 9);
              } else {
                costs.set(x, y, 255);
              }
              continue;
            }
            if (avoidKeys && avoidKeys.has(tileKey)) {
              costs.set(x, y, avoidPenalty);
              continue;
            }
            if (ctx.roads.has(tileKey) || (preferredRoads && preferredRoads.has(tileKey))) {
              costs.set(x, y, 1);
            }
          }
        }
        return costs;
      },
    },
  );
  const mappedPath = res && Array.isArray(res.path) ? res.path.map((p) => ({ x: p.x, y: p.y })) : [];
  const buildFallbackPath = () => {
    const path = [];
    const visited = new Set([fromKey]);
    const blockerKeys = new Set();
    let current = { x: from.x, y: from.y };
    let guard = 0;
    while (chebyshev(current, to) > targetRange && guard < 250) {
      guard += 1;
      const candidates = neighbors8(current.x, current.y)
        .filter((next) => {
          const nextKey = key(next.x, next.y);
          if (visited.has(nextKey)) return false;
          const id = idx(next.x, next.y);
          if (ctx.matrices.walkableMatrix[id] !== 1) return false;
          const isRelocatable = relocatableKeys.has(nextKey);
          if (
            ctx.roadBlockedByStructures &&
            ctx.roadBlockedByStructures.has(nextKey) &&
            nextKey !== fromKey &&
            nextKey !== toKey &&
            !isRelocatable
          ) {
            return false;
          }
          if (ctx.structuresByPos.has(nextKey) && nextKey !== fromKey && nextKey !== toKey && !isRelocatable) {
            return false;
          }
          if (isRelocatable && blockerKeys.size >= 1 && !blockerKeys.has(nextKey)) return false;
          return true;
        })
        .sort((left, right) => {
          const leftKey = key(left.x, left.y);
          const rightKey = key(right.x, right.y);
          const leftRelocatable = relocatableKeys.has(leftKey) ? 4 : 0;
          const rightRelocatable = relocatableKeys.has(rightKey) ? 4 : 0;
          const leftScore =
            chebyshev(left, to) +
            leftRelocatable +
            (avoidKeys && avoidKeys.has(leftKey) ? avoidPenalty : 0) -
            ((ctx.roads.has(leftKey) || (preferredRoads && preferredRoads.has(leftKey))) ? 0.25 : 0);
          const rightScore =
            chebyshev(right, to) +
            rightRelocatable +
            (avoidKeys && avoidKeys.has(rightKey) ? avoidPenalty : 0) -
            ((ctx.roads.has(rightKey) || (preferredRoads && preferredRoads.has(rightKey))) ? 0.25 : 0);
          return leftScore - rightScore || manhattan(left, to) - manhattan(right, to);
        });
      if (!candidates.length) return { path: [], blockerKey: null };
      const next = candidates[0];
      const nextKey = key(next.x, next.y);
      if (relocatableKeys.has(nextKey)) blockerKeys.add(nextKey);
      path.push(next);
      visited.add(nextKey);
      current = next;
    }
    if (chebyshev(current, to) > targetRange || blockerKeys.size > 1) {
      return { path: [], blockerKey: null };
    }
    return { path, blockerKey: [...blockerKeys][0] || null };
  };
  const resolvedPath = reachesTarget(mappedPath) ? mappedPath : buildFallbackPath().path;
  if (!reachesTarget(resolvedPath)) return { path: [], blockerKey: null };
  const blockerKeys = [...new Set(resolvedPath.map((step) => key(step.x, step.y)).filter((tileKey) => relocatableKeys.has(tileKey)))];
  if (blockerKeys.length > 1) return { path: [], blockerKey: null };
  return { path: resolvedPath, blockerKey: blockerKeys[0] || null };
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

function pickRoadOriginFromNetwork(roadKeys, targetPos, storagePos, options = {}) {
  if (!targetPos || typeof targetPos.x !== 'number' || typeof targetPos.y !== 'number') {
    return storagePos || null;
  }
  const network =
    roadKeys instanceof Set
      ? [...roadKeys]
      : Array.isArray(roadKeys)
      ? roadKeys
      : [];
  if (!network.length) return storagePos || null;
  const corePenaltyRange = Number.isFinite(options.corePenaltyRange)
    ? Math.max(0, Math.trunc(Number(options.corePenaltyRange)))
    : 2;
  const corePenalty = Number.isFinite(options.corePenalty) ? Number(options.corePenalty) : 6;
  let best = null;
  let bestScore = Infinity;
  for (const entry of network) {
    const pos =
      typeof entry === 'string'
        ? parseKey(entry)
        : entry && typeof entry.x === 'number' && typeof entry.y === 'number'
        ? { x: entry.x, y: entry.y }
        : null;
    if (!pos) continue;
    const score =
      manhattan(pos, targetPos) +
      (storagePos && chebyshev(pos, storagePos) <= corePenaltyRange ? corePenalty : 0);
    if (
      !best ||
      score < bestScore ||
      (score === bestScore && chebyshev(pos, targetPos) < chebyshev(best, targetPos))
    ) {
      best = pos;
      bestScore = score;
    }
  }
  return best || storagePos || null;
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

function collectExitRegions(ctx) {
  const regions = [];
  if (!ctx || !ctx.matrices || !Array.isArray(ctx.matrices.walkableMatrix)) return regions;
  const seen = new Set();
  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      if (x !== 0 && x !== 49 && y !== 0 && y !== 49) continue;
      if (ctx.matrices.walkableMatrix[idx(x, y)] !== 1) continue;
      const regionKey = key(x, y);
      if (seen.has(regionKey)) continue;
      const region = [];
      const queue = [{ x, y }];
      seen.add(regionKey);
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        region.push(current);
        for (const next of neighbors8(current.x, current.y)) {
          if (!inBounds(next.x, next.y)) continue;
          if (next.x !== 0 && next.x !== 49 && next.y !== 0 && next.y !== 49) continue;
          if (ctx.matrices.walkableMatrix[idx(next.x, next.y)] !== 1) continue;
          const nextKey = key(next.x, next.y);
          if (seen.has(nextKey)) continue;
          seen.add(nextKey);
          queue.push(next);
        }
      }
      if (region.length > 0) regions.push(region);
    }
  }
  return regions;
}

function findWalkablePathToAny(ctx, start, targets) {
  if (!ctx || !ctx.matrices || !Array.isArray(ctx.matrices.walkableMatrix) || !start) return [];
  const targetKeys = new Set(
    (targets || [])
      .filter((tile) => tile && Number.isFinite(tile.x) && Number.isFinite(tile.y))
      .map((tile) => key(tile.x, tile.y)),
  );
  if (targetKeys.size === 0) return [];
  const startKey = key(start.x, start.y);
  const queue = [{ x: start.x, y: start.y }];
  const parentByKey = new Map([[startKey, null]]);
  let reachedKey = targetKeys.has(startKey) ? startKey : null;
  for (let i = 0; i < queue.length && !reachedKey; i++) {
    const current = queue[i];
    for (const next of neighbors8(current.x, current.y)) {
      if (!inBounds(next.x, next.y)) continue;
      if (ctx.matrices.walkableMatrix[idx(next.x, next.y)] !== 1) continue;
      const nextKey = key(next.x, next.y);
      if (parentByKey.has(nextKey)) continue;
      parentByKey.set(nextKey, key(current.x, current.y));
      if (targetKeys.has(nextKey)) {
        reachedKey = nextKey;
        break;
      }
      queue.push(next);
    }
  }
  if (!reachedKey) return [];
  const path = [];
  let cursor = reachedKey;
  while (cursor) {
    path.push(parseKey(cursor));
    cursor = parentByKey.get(cursor) || null;
  }
  path.reverse();
  return path;
}

function selectExitRegionCenter(region = []) {
  const rows = Array.isArray(region) ? region.filter((tile) => tile && inBounds(tile.x, tile.y)) : [];
  if (rows.length === 0) return null;
  const sideCounts = {
    left: rows.filter((tile) => tile.x === 0).length,
    right: rows.filter((tile) => tile.x === 49).length,
    top: rows.filter((tile) => tile.y === 0).length,
    bottom: rows.filter((tile) => tile.y === 49).length,
  };
  const dominantSide = Object.keys(sideCounts).sort((a, b) => sideCounts[b] - sideCounts[a])[0];
  const edgeRows = rows.filter((tile) => {
    if (dominantSide === 'left') return tile.x === 0;
    if (dominantSide === 'right') return tile.x === 49;
    if (dominantSide === 'top') return tile.y === 0;
    return tile.y === 49;
  });
  const candidates = edgeRows.length > 0 ? edgeRows : rows;
  candidates.sort((a, b) => {
    if (dominantSide === 'left' || dominantSide === 'right') {
      return a.y - b.y || a.x - b.x;
    }
    return a.x - b.x || a.y - b.y;
  });
  const center = candidates[Math.floor((candidates.length - 1) / 2)];
  let inward = { x: 0, y: 0 };
  let lateral = { x: 0, y: 1 };
  if (dominantSide === 'left') {
    inward = { x: 1, y: 0 };
    lateral = { x: 0, y: 1 };
  } else if (dominantSide === 'right') {
    inward = { x: -1, y: 0 };
    lateral = { x: 0, y: 1 };
  } else if (dominantSide === 'top') {
    inward = { x: 0, y: 1 };
    lateral = { x: 1, y: 0 };
  } else {
    inward = { x: 0, y: -1 };
    lateral = { x: 1, y: 0 };
  }
  return { center, inward, lateral, dominantSide };
}

function buildExitApproachTargets(ctx, storagePos, options = {}) {
  if (!ctx || !storagePos) return [];
  const exitRegions = collectExitRegions(ctx);
  if (exitRegions.length === 0) return [];
  if (options.force !== true && exitRegions.length !== 1) return [];
  const approachDepth = Number.isFinite(options.depth)
    ? Math.max(2, Math.trunc(Number(options.depth)))
    : RAMPART_EXIT_APPROACH_DEPTH;
  const reserveRadius = Number.isFinite(options.reserveRadius)
    ? Math.max(0, Math.trunc(Number(options.reserveRadius)))
    : RAMPART_DRAGONTOOTH_RESERVE_RADIUS;
  const targets = new Map();
  for (const region of exitRegions) {
    const approach = selectExitRegionCenter(region);
    if (!approach || !approach.center) continue;
    const includeRegion = options.includeRegion === true;
    const exitBandHalfWidth = Math.max(
      0,
      Math.min(
        reserveRadius,
        Math.floor(((Array.isArray(region) ? region.length : 1) - 1) / 2),
      ),
    );

    const addTarget = (x, y) => {
      if (!inBounds(x, y)) return;
      if (ctx.matrices.walkableMatrix[idx(x, y)] !== 1) return;
      targets.set(key(x, y), { x, y });
    };

    for (let offset = -exitBandHalfWidth; offset <= exitBandHalfWidth; offset++) {
      addTarget(
        approach.center.x + approach.lateral.x * offset,
        approach.center.y + approach.lateral.y * offset,
      );
    }

    if (includeRegion) {
      for (const tile of region) {
        addTarget(tile.x, tile.y);
      }
    }

    for (let step = 1; step <= approachDepth; step++) {
      const baseX = approach.center.x + approach.inward.x * step;
      const baseY = approach.center.y + approach.inward.y * step;
      for (let dx = -reserveRadius; dx <= reserveRadius; dx++) {
        const x = baseX + approach.lateral.x * dx;
        const y = baseY + approach.lateral.y * dx;
        addTarget(x, y);
      }
    }
  }
  return [...targets.values()];
}

function buildDefenseCutContext(ctx, storagePos, options = {}) {
  const defenseMap = new Map();
  const corePoints = [];
  const includeExitApproachTargets = options.includeExitApproachTargets !== false;
  for (const placement of ctx.placements || []) {
    if (!isCoreDefenseStructure(placement, storagePos)) continue;
    defenseMap.set(key(placement.x, placement.y), placement.type);
    corePoints.push({ x: placement.x, y: placement.y });
  }
  const exitApproachTargets = buildExitApproachTargets(ctx, storagePos);
  if (includeExitApproachTargets) {
    for (const target of exitApproachTargets) {
      defenseMap.set(key(target.x, target.y), 'fortify.exitApproach');
    }
  }
  return {
    structuresByPos: defenseMap,
    corePoints,
    matrices: ctx.matrices,
    exitApproachTargets,
  };
}

function findRelocationPosition(ctx, placement, storagePos, layoutPattern, preferredParity, candidates, options = {}) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const avoidKeys = options.avoidKeys instanceof Set ? options.avoidKeys : new Set();
  for (const candidate of rows) {
    if (!candidate || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) continue;
    const candidateKey = key(candidate.x, candidate.y);
    if (avoidKeys.has(candidateKey)) continue;
    if (
      checkerboard.classifyTileByPattern(candidate.x, candidate.y, storagePos, {
        pattern: layoutPattern,
        preferredParity,
      }) !== 'structure'
    ) {
      continue;
    }
    if (!neighbors8(candidate.x, candidate.y).some((tile) => ctx.roads.has(key(tile.x, tile.y)))) continue;
    if (!canPlaceStructure(ctx, placement.type, candidate.x, candidate.y)) continue;
    return { x: candidate.x, y: candidate.y };
  }
  return null;
}

function resolveRampartMincutBuilderOptions(input = {}) {
  const source =
    input &&
    typeof input === 'object' &&
    input.rampartMincut &&
    typeof input.rampartMincut === 'object'
      ? input.rampartMincut
      : input && typeof input === 'object'
      ? input
      : {};
  const rampartThickness = Number.isFinite(source.rampartThickness)
    ? Math.max(1, Math.trunc(Number(source.rampartThickness)))
    : DEFAULT_RAMPART_MINCUT_THICKNESS;
  const noGoDepth = Number.isFinite(source.noGoDepth)
    ? Math.max(0, Math.trunc(Number(source.noGoDepth)))
    : DEFAULT_RAMPART_MINCUT_NO_GO_DEPTH;
  const dragonTeethThickness = Number.isFinite(source.dragonTeethThickness)
    ? Math.max(0, Math.trunc(Number(source.dragonTeethThickness)))
    : DEFAULT_RAMPART_MINCUT_DRAGON_TEETH_THICKNESS;
  return Object.assign({}, source, {
    rampartThickness,
    noGoDepth,
    dragonTeethThickness,
  });
}

function assessRampartMincutPlanResult(plan) {
  if (!plan || plan.ok !== true) {
    return { usable: false, reason: 'missing-plan' };
  }
  const meta = plan.meta && typeof plan.meta === 'object' ? plan.meta : {};
  const minCut = meta.minCut && typeof meta.minCut === 'object' ? meta.minCut : {};
  const minCutLineMetrics =
    minCut.lineMetrics && typeof minCut.lineMetrics === 'object' ? minCut.lineMetrics : {};
  const lineMetrics = meta.lineMetrics && typeof meta.lineMetrics === 'object' ? meta.lineMetrics : {};
  if (Number(meta.boundaryCount || 0) <= 0 || Number(meta.primaryBoundaryCount || 0) <= 0) {
    return { usable: false, reason: 'empty-boundary' };
  }
  if (minCutLineMetrics.touchesBorder === true || lineMetrics.touchesBorder === true) {
    return { usable: false, reason: 'touches-border' };
  }
  if (Number(meta.standoff || 0) > 0 && Number(meta.standoff || 0) < RAMPART_TARGET_STANDOFF) {
    return { usable: false, reason: 'standoff-too-low' };
  }
  if (Number(meta.noGoCount || 0) > 500) {
    return { usable: false, reason: 'nogo-too-large' };
  }
  return { usable: true, reason: 'accepted' };
}

function isRelocatableNoGoPlacement(placement) {
  if (!placement) return false;
  if (
    placement.type === STRUCTURES.ROAD ||
    placement.type === STRUCTURES.RAMPART ||
    placement.type === STRUCTURES.WALL ||
    placement.type === STRUCTURES.STORAGE ||
    placement.type === STRUCTURES.TERMINAL ||
    placement.type === STRUCTURES.LINK ||
    placement.type === STRUCTURES.CONTAINER
  ) {
    return false;
  }
  const tag = String(placement.tag || '');
  if (
    tag === 'spawn.1' ||
    tag === 'spawn.2' ||
    tag === 'spawn.3' ||
    tag === 'core.storage' ||
    tag === 'core.terminal' ||
    tag === 'link.sink' ||
    tag === 'controller.link' ||
    tag.startsWith('source.container.') ||
    tag.startsWith('source.link.') ||
    tag.startsWith('lab.source.') ||
    tag.startsWith('lab.reaction.') ||
    tag.startsWith('controller.') ||
    tag.startsWith('extractor')
  ) {
    return false;
  }
  return true;
}

function countStructureConflictsInZone(ctx, tiles) {
  if (!ctx || !Array.isArray(ctx.placements)) return 0;
  const zoneKeys = new Set(
    (Array.isArray(tiles) ? tiles : [])
      .filter((tile) => tile && Number.isFinite(tile.x) && Number.isFinite(tile.y))
      .map((tile) => key(tile.x, tile.y)),
  );
  if (zoneKeys.size === 0) return 0;
  return ctx.placements.filter((placement) => {
    if (!placement || !zoneKeys.has(key(placement.x, placement.y))) return false;
    return (
      placement.type !== STRUCTURES.ROAD &&
      placement.type !== STRUCTURES.RAMPART &&
      placement.type !== STRUCTURES.WALL
    );
  }).length;
}

function relocatePlacementsOutOfNoGoZone(
  ctx,
  noGoTiles,
  storagePos,
  layoutPattern,
  preferredParity,
  candidates,
  options = {},
) {
  const zoneKeys = new Set(
    (Array.isArray(noGoTiles) ? noGoTiles : [])
      .filter((tile) => tile && Number.isFinite(tile.x) && Number.isFinite(tile.y))
      .map((tile) => key(tile.x, tile.y)),
  );
  if (!ctx || !Array.isArray(ctx.placements) || zoneKeys.size === 0) {
    return { attempted: 0, relocated: 0, skipped: 0, remaining: 0 };
  }
  const avoidKeys = options.avoidKeys instanceof Set ? new Set(options.avoidKeys) : new Set();
  for (const zoneKey of zoneKeys) avoidKeys.add(zoneKey);
  const onRelocated = typeof options.onRelocated === 'function' ? options.onRelocated : null;
  const conflicts = ctx.placements
    .filter((placement) => placement && zoneKeys.has(key(placement.x, placement.y)))
    .filter((placement) => isRelocatableNoGoPlacement(placement))
    .sort((left, right) => {
      const leftType = String(left.type || '');
      const rightType = String(right.type || '');
      const leftPriority = leftType === STRUCTURES.EXTENSION ? 0 : leftType === STRUCTURES.TOWER ? 1 : 2;
      const rightPriority = rightType === STRUCTURES.EXTENSION ? 0 : rightType === STRUCTURES.TOWER ? 1 : 2;
      return leftPriority - rightPriority || String(left.tag || '').localeCompare(String(right.tag || ''));
    });
  let relocated = 0;
  let skipped = 0;
  for (const placement of conflicts) {
    const previous = removePlacementAt(
      ctx,
      placement.x,
      placement.y,
      (row) =>
        row &&
        row.type === placement.type &&
        row.x === placement.x &&
        row.y === placement.y &&
        row.tag === placement.tag,
    );
    if (!previous) {
      skipped += 1;
      continue;
    }
    const relocation = findRelocationPosition(
      ctx,
      previous,
      storagePos,
      layoutPattern,
      preferredParity,
      candidates,
      { avoidKeys },
    );
    if (!relocation) {
      addPlacement(ctx, previous.type, previous.x, previous.y, previous.rcl, previous.tag);
      skipped += 1;
      continue;
    }
    addPlacement(ctx, previous.type, relocation.x, relocation.y, previous.rcl, previous.tag);
    relocated += 1;
    if (onRelocated) {
      onRelocated(previous, relocation);
    }
  }
  return {
    attempted: conflicts.length,
    relocated,
    skipped,
    remaining: countStructureConflictsInZone(ctx, noGoTiles),
  };
}

function addRampartsOnRoadsInNoGoZone(ctx, noGoTiles) {
  if (!ctx || !Array.isArray(ctx.placements)) return { added: 0 };
  const zoneKeys = new Set(
    (Array.isArray(noGoTiles) ? noGoTiles : [])
      .filter((tile) => tile && Number.isFinite(tile.x) && Number.isFinite(tile.y))
      .map((tile) => key(tile.x, tile.y)),
  );
  if (zoneKeys.size === 0) return { added: 0 };
  let added = 0;
  for (const placement of ctx.placements.slice()) {
    if (!placement || placement.type !== STRUCTURES.ROAD) continue;
    const placementKey = key(placement.x, placement.y);
    if (!zoneKeys.has(placementKey) || ctx.ramparts.has(placementKey)) continue;
    if (addPlacement(ctx, STRUCTURES.RAMPART, placement.x, placement.y, 2, 'rampart.accessRoad', {
      allowOnBlocked: true,
    })) {
      added += 1;
    }
  }
  return { added };
}

function computeRampartInteriorMetrics(ctx, rampartLine, storagePos, options = {}) {
  const line = Array.isArray(rampartLine) ? rampartLine : [];
  const blocked = new Set(line.map((tile) => key(tile.x, tile.y)));
  const walkable = ctx && ctx.matrices ? ctx.matrices.walkableMatrix || [] : [];
  const defenseCtx = buildDefenseCutContext(ctx, storagePos);
  const protectedKeys = [...defenseCtx.structuresByPos.keys()];
  const inside = new Set();
  const queue = [];
  const storageKey =
    storagePos && typeof storagePos.x === 'number' && typeof storagePos.y === 'number'
      ? key(storagePos.x, storagePos.y)
      : null;
  if (
    storagePos &&
    inBounds(storagePos.x, storagePos.y) &&
    walkable[idx(storagePos.x, storagePos.y)] === 1 &&
    !blocked.has(storageKey)
  ) {
    inside.add(storageKey);
    queue.push({ x: storagePos.x, y: storagePos.y });
  }
  let touchesBorder = false;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.x === 0 || current.x === 49 || current.y === 0 || current.y === 49) {
      touchesBorder = true;
    }
    for (const next of neighbors8(current.x, current.y)) {
      if (!inBounds(next.x, next.y)) continue;
      const nextKey = key(next.x, next.y);
      if (inside.has(nextKey) || blocked.has(nextKey)) continue;
      if (walkable[idx(next.x, next.y)] !== 1) continue;
      inside.add(nextKey);
      queue.push(next);
    }
  }

  let roadOverlayCount = 0;
  let wallAssistCount = 0;
  let diagonalGapCount = 0;
  let exitDistSum = 0;
  let exitDistMax = 0;
  const lineKeys = new Set(blocked);
  const terrainMatrix = ctx && ctx.matrices ? ctx.matrices.terrainMatrix || [] : [];
  const exitDistance = ctx && ctx.matrices ? ctx.matrices.exitDistance || [] : [];
  const neighborCounts = new Map();
  const isWallOrBorder = (x, y) => {
    if (!inBounds(x, y)) return true;
    const id = idx(x, y);
    if (walkable[id] !== 1) return true;
    return terrainMatrix[id] === 2;
  };
  for (const tile of line) {
    if (!tile || typeof tile.x !== 'number' || typeof tile.y !== 'number') continue;
    const tileKey = key(tile.x, tile.y);
    const dist = Math.max(0, Number(exitDistance[idx(tile.x, tile.y)] || 0));
    exitDistSum += dist;
    exitDistMax = Math.max(exitDistMax, dist);
    if (ctx && ctx.roads && ctx.roads.has(tileKey)) roadOverlayCount += 1;
    let neighbors = 0;
    let wallSupport = false;
    for (const next of neighbors8(tile.x, tile.y)) {
      if (lineKeys.has(key(next.x, next.y))) neighbors += 1;
      if (isWallOrBorder(next.x, next.y)) wallSupport = true;
    }
    neighborCounts.set(tileKey, neighbors);
    if (wallSupport) wallAssistCount += 1;
    for (const dx of [-1, 1]) {
      for (const dy of [-1, 1]) {
        const diagonal = { x: tile.x + dx, y: tile.y + dy };
        if (!inBounds(diagonal.x, diagonal.y)) continue;
        if (!lineKeys.has(key(diagonal.x, diagonal.y))) continue;
        const orthoA = { x: tile.x + dx, y: tile.y };
        const orthoB = { x: tile.x, y: tile.y + dy };
        const orthoAKey = key(orthoA.x, orthoA.y);
        const orthoBKey = key(orthoB.x, orthoB.y);
        if (lineKeys.has(orthoAKey) || lineKeys.has(orthoBKey)) continue;
        if (!inBounds(orthoA.x, orthoA.y) || !inBounds(orthoB.x, orthoB.y)) continue;
        if (walkable[idx(orthoA.x, orthoA.y)] !== 1 || walkable[idx(orthoB.x, orthoB.y)] !== 1) continue;
        diagonalGapCount += 1;
      }
    }
  }
  let leafCount = 0;
  for (const tile of line) {
    if (!tile || typeof tile.x !== 'number' || typeof tile.y !== 'number') continue;
    const neighborCount = Number(neighborCounts.get(key(tile.x, tile.y)) || 0);
    let wallSupport = false;
    for (const next of neighbors8(tile.x, tile.y)) {
      if (isWallOrBorder(next.x, next.y)) {
        wallSupport = true;
        break;
      }
    }
    if (neighborCount <= 1 && !wallSupport) leafCount += 1;
  }
  const protectedInsideCount = protectedKeys.reduce(
    (sum, protectedKey) => sum + (inside.has(protectedKey) ? 1 : 0),
    0,
  );
  const continuity =
    options.continuity && typeof options.continuity === 'object'
      ? options.continuity
      : { components: line.length > 0 ? 1 : 0, bridgedTiles: 0, connected: true };
  return {
    lineCount: line.length,
    interiorArea: inside.size,
    touchesBorder,
    protectedStructures: protectedKeys.length,
    protectedInsideCount,
    roadOverlayCount,
    wallAssistCount,
    diagonalGapCount: Math.floor(diagonalGapCount / 2),
    leafCount,
    exitDistAvg: line.length > 0 ? exitDistSum / line.length : 0,
    exitDistMax,
    continuity,
  };
}

function scoreRampartLineCandidate(ctx, rampartLine, storagePos, options = {}) {
  const targetStandoff = Number.isFinite(options.targetStandoff)
    ? Number(options.targetStandoff)
    : RAMPART_TARGET_STANDOFF;
  const metrics =
    options.metrics && typeof options.metrics === 'object'
      ? options.metrics
      : computeRampartInteriorMetrics(ctx, rampartLine, storagePos, options);
  const standoff =
    Number.isFinite(options.standoff)
      ? Number(options.standoff)
      : computeMinRampartStandoff(ctx.placements, rampartLine, storagePos);
  const continuity = metrics.continuity || {};
  const missingProtected = Math.max(
    0,
    Number(metrics.protectedStructures || 0) - Number(metrics.protectedInsideCount || 0),
  );
  const underPenalty = standoff < targetStandoff ? (targetStandoff - standoff) * 5000 : 0;
  const overPenalty = standoff > targetStandoff + 2 ? (standoff - (targetStandoff + 2)) * 140 : 0;
  const linePenalty = Number(metrics.lineCount || 0) * 120;
  const areaPenalty =
    Math.max(0, Number(metrics.interiorArea || 0) - Number(metrics.protectedStructures || 0)) * 0.45;
  const exitPenalty = Number(metrics.exitDistAvg || 0) * 1.5 + Number(metrics.exitDistMax || 0) * 0.35;
  const continuityPenalty = Math.max(0, Number(continuity.components || 1) - 1) * 4000;
  const leafPenalty = Number(metrics.leafCount || 0) * 260;
  const diagonalGapPenalty = Number(metrics.diagonalGapCount || 0) * 12000;
  const touchesBorderPenalty = metrics.touchesBorder ? 200000 : 0;
  const protectedPenalty = missingProtected * 100000;
  const roadBonus = Number(metrics.roadOverlayCount || 0) * 18;
  const wallBonus = Number(metrics.wallAssistCount || 0) * 12;
  return {
    score:
      underPenalty +
      overPenalty +
      linePenalty +
      areaPenalty +
      exitPenalty +
      continuityPenalty +
      leafPenalty +
      diagonalGapPenalty +
      touchesBorderPenalty +
      protectedPenalty -
      roadBonus -
      wallBonus,
    standoff,
    metrics: Object.assign({}, metrics, {
      targetStandoff,
      missingProtected,
      touchesBorderPenalty,
      protectedPenalty,
      linePenalty,
      areaPenalty,
      exitPenalty,
      continuityPenalty,
      leafPenalty,
      diagonalGapPenalty,
      roadBonus,
      wallBonus,
    }),
  };
}

function shouldProtectControllerWithRamparts(storagePos, controllerPos, rampartLine) {
  if (!storagePos || !controllerPos) return false;
  if (chebyshev(storagePos, controllerPos) <= 10) return true;
  let bestBoundaryDistance = Infinity;
  for (const tile of rampartLine || []) {
    const distance = chebyshev(tile, controllerPos);
    if (distance < bestBoundaryDistance) bestBoundaryDistance = distance;
  }
  return Number.isFinite(bestBoundaryDistance) && bestBoundaryDistance <= 5;
}

function isMainRoadSeedTag(tag) {
  return (
    tag === 'road.coreStamp' ||
    tag === 'road.stamp' ||
    tag === 'road.controllerStamp' ||
    tag === 'road.grid' ||
    tag === 'road.full' ||
    tag === 'road.protected'
  );
}

function buildMainRoadSeedKeys(ctx, storagePos) {
  const seeds = new Set();
  const placements = ctx && Array.isArray(ctx.placements) ? ctx.placements : [];
  for (const placement of placements) {
    if (!placement || placement.type !== STRUCTURES.ROAD) continue;
    const placementKey = key(placement.x, placement.y);
    const tag = String(placement.tag || '');
    if (isMainRoadSeedTag(tag)) {
      seeds.add(placementKey);
    }
  }
  if (storagePos && typeof storagePos.x === 'number' && typeof storagePos.y === 'number') {
    for (const roadKey of ctx && ctx.roads instanceof Set ? ctx.roads : []) {
      const pos = parseKey(roadKey);
      if (chebyshev(pos, storagePos) <= 3) seeds.add(roadKey);
    }
  }
  return seeds;
}

// Seed the "main road" component from the closest storage-adjacent roads only so
// clipped stamp fragments or one-gap wings near storage do not masquerade as the
// connected base network.
function buildStorageConnectedRoadSeedKeys(ctx, storagePos, roadKeys = null) {
  const seeds = new Set();
  const roads = roadKeys instanceof Set ? roadKeys : ctx && ctx.roads instanceof Set ? ctx.roads : new Set();
  const placements = ctx && Array.isArray(ctx.placements) ? ctx.placements : [];
  if (storagePos && typeof storagePos.x === 'number' && typeof storagePos.y === 'number') {
    let bestDistance = Infinity;
    for (const roadKey of roads) {
      const pos = parseKey(roadKey);
      const distance = chebyshev(pos, storagePos);
      if (distance > 3) continue;
      if (distance < bestDistance) {
        seeds.clear();
        bestDistance = distance;
      }
      if (distance === bestDistance) seeds.add(roadKey);
    }
    if (seeds.size > 0) return seeds;
  }
  for (const placement of placements) {
    if (!placement || placement.type !== STRUCTURES.ROAD) continue;
    const placementKey = key(placement.x, placement.y);
    if (roads.size > 0 && !roads.has(placementKey)) continue;
    if (String(placement.tag || '') !== 'road.coreStamp') continue;
    seeds.add(placementKey);
  }
  if (seeds.size > 0) return seeds;
  let bestDistance = Infinity;
  for (const placement of placements) {
    if (!placement || placement.type !== STRUCTURES.ROAD) continue;
    const placementKey = key(placement.x, placement.y);
    if (roads.size > 0 && !roads.has(placementKey)) continue;
    const tag = String(placement.tag || '');
    if (!isMainRoadSeedTag(tag)) continue;
    const distance =
      storagePos && typeof storagePos.x === 'number' && typeof storagePos.y === 'number'
        ? chebyshev(placement, storagePos)
        : 0;
    if (distance < bestDistance) {
      seeds.clear();
      bestDistance = distance;
    }
    if (distance === bestDistance) {
      seeds.add(placementKey);
    }
  }
  if (seeds.size > 0) return seeds;
  if (roads.size > 0) {
    let fallbackKey = null;
    let fallbackDistance = Infinity;
    for (const roadKey of roads) {
      const pos = parseKey(roadKey);
      const distance =
        storagePos && typeof storagePos.x === 'number' && typeof storagePos.y === 'number'
          ? chebyshev(pos, storagePos)
          : 0;
      if (distance < fallbackDistance) {
        fallbackKey = roadKey;
        fallbackDistance = distance;
      }
    }
    if (fallbackKey) seeds.add(fallbackKey);
  }
  return seeds;
}

function buildMainRoadComponentKeys(ctx, storagePos, roadKeys = null) {
  const roads = roadKeys instanceof Set ? roadKeys : ctx && ctx.roads instanceof Set ? ctx.roads : new Set();
  if (!(roads instanceof Set) || roads.size === 0) return new Set();
  const seedKeys = buildStorageConnectedRoadSeedKeys(ctx, storagePos, roads);
  if (seedKeys.size === 0) return new Set();
  return buildConnectedRoadKeys(roads, seedKeys);
}

function isRoadCompatibleRampartTile(ctx, x, y) {
  if (!ctx || typeof x !== 'number' || typeof y !== 'number') return false;
  return !ctx.structuresByPos.has(key(x, y));
}

function buildBoundaryComponents(tiles) {
  const placements = Array.isArray(tiles) ? tiles : [];
  if (placements.length === 0) return [];
  const byKey = new Map(
    placements
      .filter((tile) => tile && typeof tile.x === 'number' && typeof tile.y === 'number')
      .map((tile) => [key(tile.x, tile.y), tile]),
  );
  const seen = new Set();
  const components = [];
  for (const [tileKey, tile] of byKey.entries()) {
    if (seen.has(tileKey)) continue;
    const component = [];
    const queue = [tile];
    seen.add(tileKey);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      component.push(current);
      for (const next of neighbors8(current.x, current.y)) {
        const nextKey = key(next.x, next.y);
        if (!byKey.has(nextKey) || seen.has(nextKey)) continue;
        seen.add(nextKey);
        queue.push(byKey.get(nextKey));
      }
    }
    components.push(component);
  }
  return components;
}

function pruneUnsupportedBoundaryLeafTiles(ctx, tiles) {
  let line = normalizeRampartBoundaryTiles(ctx, tiles);
  if (line.length <= 1) return line;
  const terrainMatrix = ctx && ctx.matrices ? ctx.matrices.terrainMatrix || [] : [];
  const walkableMatrix = ctx && ctx.matrices ? ctx.matrices.walkableMatrix || [] : [];
  let changed = true;
  while (changed && line.length > 1) {
    changed = false;
    const lineKeys = new Set(line.map((tile) => key(tile.x, tile.y)));
    const survivors = [];
    for (const tile of line) {
      let neighborCount = 0;
      let wallSupport = false;
      for (const next of neighbors8(tile.x, tile.y)) {
        const nextKey = key(next.x, next.y);
        if (lineKeys.has(nextKey)) neighborCount += 1;
        if (
          !inBounds(next.x, next.y) ||
          walkableMatrix[idx(next.x, next.y)] !== 1 ||
          terrainMatrix[idx(next.x, next.y)] === 2
        ) {
          wallSupport = true;
        }
      }
      if (neighborCount <= 1 && !wallSupport) {
        changed = true;
        continue;
      }
      survivors.push(tile);
    }
    if (!changed) break;
    line = survivors;
  }
  return line;
}

function chooseDiagonalBridgeTile(ctx, orthoA, orthoB, storagePos) {
  const candidates = [orthoA, orthoB]
    .filter((tile) => tile && inBounds(tile.x, tile.y))
    .filter((tile) => ctx.matrices.walkableMatrix[idx(tile.x, tile.y)] === 1)
    .filter((tile) => canPlaceStructure(ctx, STRUCTURES.RAMPART, tile.x, tile.y, { allowOnBlocked: true }))
    .map((tile) => {
      const tileKey = key(tile.x, tile.y);
      const roadCompatible = isRoadCompatibleRampartTile(ctx, tile.x, tile.y);
      return {
        tile,
        score:
          (ctx.roads.has(tileKey) ? -4 : 0) +
          (roadCompatible ? -2 : 0) +
          (storagePos ? chebyshev(tile, storagePos) * 2 + manhattan(tile, storagePos) * 0.05 : 0) +
          deterministicJitter(tile.x, tile.y, 17) * 0.01,
      };
    })
    .sort((left, right) => left.score - right.score);
  return candidates.length > 0 ? candidates[0].tile : null;
}

function repairDiagonalBoundaryGaps(ctx, tiles, storagePos) {
  const line = normalizeRampartBoundaryTiles(ctx, tiles);
  if (line.length <= 1) return line;
  const lineKeys = new Set(line.map((tile) => key(tile.x, tile.y)));
  const additions = [];
  const claimed = new Set();
  for (const tile of line) {
    for (const dx of [-1, 1]) {
      for (const dy of [-1, 1]) {
        const diagonal = { x: tile.x + dx, y: tile.y + dy };
        const diagonalKey = key(diagonal.x, diagonal.y);
        if (!lineKeys.has(diagonalKey)) continue;
        const orthoA = { x: tile.x + dx, y: tile.y };
        const orthoB = { x: tile.x, y: tile.y + dy };
        const orthoAKey = key(orthoA.x, orthoA.y);
        const orthoBKey = key(orthoB.x, orthoB.y);
        if (lineKeys.has(orthoAKey) || lineKeys.has(orthoBKey)) continue;
        if (!inBounds(orthoA.x, orthoA.y) || !inBounds(orthoB.x, orthoB.y)) continue;
        if (
          ctx.matrices.walkableMatrix[idx(orthoA.x, orthoA.y)] !== 1 ||
          ctx.matrices.walkableMatrix[idx(orthoB.x, orthoB.y)] !== 1
        ) {
          continue;
        }
        const bridge = chooseDiagonalBridgeTile(ctx, orthoA, orthoB, storagePos);
        if (!bridge) continue;
        const bridgeKey = key(bridge.x, bridge.y);
        if (lineKeys.has(bridgeKey) || claimed.has(bridgeKey)) continue;
        claimed.add(bridgeKey);
        additions.push({ x: bridge.x, y: bridge.y, tag: 'rampart.edge.bridge' });
      }
    }
  }
  return additions.length > 0 ? normalizeRampartBoundaryTiles(ctx, line.concat(additions)) : line;
}

function selectBestBoundaryComponent(ctx, components, storagePos) {
  const rows = Array.isArray(components) ? components : [];
  if (rows.length <= 1) return rows[0] || [];
  const scored = rows.map((component, index) => {
    const score = scoreRampartLineCandidate(ctx, component, storagePos, {
      metrics: computeRampartInteriorMetrics(ctx, component, storagePos),
    });
    return {
      index,
      component,
      score: Number(score.score || 0),
      protectedInsideCount: Number(score.metrics.protectedInsideCount || 0),
      diagonalGapCount: Number(score.metrics.diagonalGapCount || 0),
      touchesBorder: score.metrics.touchesBorder === true,
    };
  });
  scored.sort(
    (left, right) =>
      left.score - right.score ||
      right.protectedInsideCount - left.protectedInsideCount ||
      left.diagonalGapCount - right.diagonalGapCount ||
      Number(left.touchesBorder) - Number(right.touchesBorder) ||
      left.component.length - right.component.length ||
      left.index - right.index,
  );
  return scored[0] ? scored[0].component : [];
}

function canonicalizeRampartBoundaryTiles(ctx, tiles, storagePos) {
  let line = normalizeRampartBoundaryTiles(ctx, tiles);
  if (line.length <= 1) return line;
  line = repairDiagonalBoundaryGaps(ctx, line, storagePos);
  line = pruneUnsupportedBoundaryLeafTiles(ctx, line);
  const components = buildBoundaryComponents(line);
  line = selectBestBoundaryComponent(ctx, components, storagePos);
  line = repairDiagonalBoundaryGaps(ctx, line, storagePos);
  line = pruneUnsupportedBoundaryLeafTiles(ctx, line);
  line = pruneRedundantBoundaryBlips(ctx, line, storagePos);
  return normalizeRampartBoundaryTiles(ctx, line);
}

function chooseRampartSupportTile(ctx, boundaryTile, storagePos, boundaryKeys, supportKeys) {
  if (!ctx || !boundaryTile || !storagePos) return null;
  const boundaryKey = key(boundaryTile.x, boundaryTile.y);
  const boundaryHasRoad = ctx.roads.has(boundaryKey);
  const boundaryDist = chebyshev(boundaryTile, storagePos);
  const candidates = neighbors8(boundaryTile.x, boundaryTile.y)
    .filter((tile) => inBounds(tile.x, tile.y))
    .filter((tile) => chebyshev(tile, storagePos) < boundaryDist)
    .filter((tile) => !boundaryKeys.has(key(tile.x, tile.y)) && !supportKeys.has(key(tile.x, tile.y)))
    .filter((tile) =>
      canPlaceStructure(ctx, STRUCTURES.RAMPART, tile.x, tile.y, { allowOnBlocked: true }),
    )
    .map((tile) => {
      const tileKey = key(tile.x, tile.y);
      const tileDist = chebyshev(tile, storagePos);
      let boundaryAdjacency = 0;
      let supportAdjacency = 0;
      let inwardRoadNeighbors = 0;
      for (const neighbor of neighbors8(tile.x, tile.y)) {
        const neighborKey = key(neighbor.x, neighbor.y);
        if (boundaryKeys.has(neighborKey)) boundaryAdjacency += 1;
        if (supportKeys.has(neighborKey)) supportAdjacency += 1;
        if (ctx.roads.has(neighborKey) && chebyshev(neighbor, storagePos) < tileDist) {
          inwardRoadNeighbors += 1;
        }
      }
      const tileHasRoad = ctx.roads.has(tileKey);
      return {
        tile,
        score:
          (boundaryHasRoad && tileHasRoad ? -28 : 0) +
          (tileHasRoad ? -12 : 0) -
          inwardRoadNeighbors * 10 -
          boundaryAdjacency * 6 -
          supportAdjacency * 4 -
          (boundaryDist - tileDist) * 2 +
          deterministicJitter(tile.x, tile.y, 29) * 0.01,
      };
    })
    .sort((left, right) => left.score - right.score);
  return candidates.length > 0 ? candidates[0].tile : null;
}

function addRampartSupportBand(ctx, rampartLine, storagePos) {
  if (!ctx || !storagePos || !Array.isArray(rampartLine) || rampartLine.length === 0) return [];
  const boundaryKeys = new Set(
    rampartLine
      .filter((tile) => tile && typeof tile.x === 'number' && typeof tile.y === 'number')
      .map((tile) => key(tile.x, tile.y)),
  );
  const supportKeys = new Set(
    (ctx.placements || [])
      .filter(
        (placement) =>
          placement &&
          placement.type === STRUCTURES.RAMPART &&
          String(placement.tag || '') === 'rampart.support',
      )
      .map((placement) => key(placement.x, placement.y)),
  );
  const orderedBoundary = rampartLine
    .slice()
    .sort((left, right) => {
      const leftRoad = Number(ctx.roads.has(key(left.x, left.y)));
      const rightRoad = Number(ctx.roads.has(key(right.x, right.y)));
      const leftNeighbors = neighbors8(left.x, left.y).filter((tile) => boundaryKeys.has(key(tile.x, tile.y))).length;
      const rightNeighbors = neighbors8(right.x, right.y).filter((tile) => boundaryKeys.has(key(tile.x, tile.y))).length;
      return (
        rightRoad - leftRoad ||
        rightNeighbors - leftNeighbors ||
        chebyshev(left, storagePos) - chebyshev(right, storagePos) ||
        left.y - right.y ||
        left.x - right.x
      );
    });
  const added = [];
  for (const boundaryTile of orderedBoundary) {
    const supportTile = chooseRampartSupportTile(
      ctx,
      boundaryTile,
      storagePos,
      boundaryKeys,
      supportKeys,
    );
    if (!supportTile) continue;
    if (
      addPlacement(ctx, STRUCTURES.RAMPART, supportTile.x, supportTile.y, 2, 'rampart.support', {
        allowOnBlocked: true,
      })
    ) {
      const supportKey = key(supportTile.x, supportTile.y);
      supportKeys.add(supportKey);
      added.push({ x: supportTile.x, y: supportTile.y });
    }
  }
  return added;
}

function ensureBoundaryRoadSupports(ctx, rampartLine, storagePos) {
  if (!ctx || !storagePos || !Array.isArray(rampartLine) || rampartLine.length === 0) return [];
  const boundaryKeys = new Set(
    rampartLine
      .filter((tile) => tile && typeof tile.x === 'number' && typeof tile.y === 'number')
      .map((tile) => key(tile.x, tile.y)),
  );
  const added = [];
  for (const boundaryTile of rampartLine) {
    if (!boundaryTile || typeof boundaryTile.x !== 'number' || typeof boundaryTile.y !== 'number') continue;
    const boundaryKey = key(boundaryTile.x, boundaryTile.y);
    if (!ctx.roads.has(boundaryKey)) continue;
    const boundaryDist = chebyshev(boundaryTile, storagePos);
    const hasInnerRampart = neighbors8(boundaryTile.x, boundaryTile.y).some((tile) => {
      if (!inBounds(tile.x, tile.y)) return false;
      if (chebyshev(tile, storagePos) >= boundaryDist) return false;
      return ctx.ramparts.has(key(tile.x, tile.y));
    });
    if (hasInnerRampart) continue;
    const candidate = neighbors8(boundaryTile.x, boundaryTile.y)
      .filter((tile) => inBounds(tile.x, tile.y))
      .filter((tile) => chebyshev(tile, storagePos) < boundaryDist)
      .filter((tile) => ctx.roads.has(key(tile.x, tile.y)))
      .filter((tile) => !boundaryKeys.has(key(tile.x, tile.y)) && !ctx.ramparts.has(key(tile.x, tile.y)))
      .filter((tile) =>
        canPlaceStructure(ctx, STRUCTURES.RAMPART, tile.x, tile.y, { allowOnBlocked: true }),
      )
      .map((tile) => {
        const tileDist = chebyshev(tile, storagePos);
        const deeperRoadNeighbors = neighbors8(tile.x, tile.y).filter((neighbor) => {
          if (!inBounds(neighbor.x, neighbor.y)) return false;
          const neighborKey = key(neighbor.x, neighbor.y);
          return ctx.roads.has(neighborKey) && chebyshev(neighbor, storagePos) < tileDist;
        }).length;
        const rampartAdjacency = neighbors8(tile.x, tile.y).filter((neighbor) =>
          ctx.ramparts.has(key(neighbor.x, neighbor.y)),
        ).length;
        return {
          tile,
          score:
            deeperRoadNeighbors * -20 -
            rampartAdjacency * 8 +
            tileDist +
            manhattan(tile, storagePos) * 0.05 +
            deterministicJitter(tile.x, tile.y, 31) * 0.01,
        };
      })
      .sort((left, right) => left.score - right.score)[0];
    if (!candidate) continue;
    if (
      addPlacement(ctx, STRUCTURES.RAMPART, candidate.tile.x, candidate.tile.y, 2, 'rampart.support', {
        allowOnBlocked: true,
      })
    ) {
      added.push({ x: candidate.tile.x, y: candidate.tile.y });
    }
  }
  return added;
}

function addRampartCorridorGuards(ctx, rampartLine, storagePos, options = {}) {
  if (!ctx || !storagePos || !Array.isArray(rampartLine) || rampartLine.length === 0) return [];
  const maxDepth = Number.isFinite(options.maxDepth) ? Math.max(1, Math.trunc(Number(options.maxDepth))) : 3;
  const added = [];
  const claimed = new Set();
  const roadKeys = new Set(ctx.roads || []);
  const visited = new Set();
  const queue = [];
  for (const boundary of rampartLine) {
    if (!boundary || typeof boundary.x !== 'number' || typeof boundary.y !== 'number') continue;
    const boundaryKey = key(boundary.x, boundary.y);
    if (!roadKeys.has(boundaryKey) || visited.has(boundaryKey)) continue;
    visited.add(boundaryKey);
    queue.push({ x: boundary.x, y: boundary.y, depth: 0 });
  }
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.depth >= maxDepth) continue;
    const currentDist = chebyshev(current, storagePos);
    const nextRoads = neighbors8(current.x, current.y)
      .filter((tile) => roadKeys.has(key(tile.x, tile.y)))
      .filter((tile) => {
        const nextKey = key(tile.x, tile.y);
        if (visited.has(nextKey)) return false;
        return chebyshev(tile, storagePos) <= currentDist;
      })
      .sort((left, right) => {
        const leftDist = chebyshev(left, storagePos);
        const rightDist = chebyshev(right, storagePos);
        return leftDist - rightDist || manhattan(left, storagePos) - manhattan(right, storagePos);
      });
    for (const next of nextRoads) {
      const nextKey = key(next.x, next.y);
      visited.add(nextKey);
      queue.push({ x: next.x, y: next.y, depth: current.depth + 1 });
      if (claimed.has(nextKey) || ctx.ramparts.has(nextKey)) continue;
      if (
        addPlacement(ctx, STRUCTURES.RAMPART, next.x, next.y, 2, 'rampart.corridor', {
          allowOnBlocked: true,
        })
      ) {
        claimed.add(nextKey);
        added.push({ x: next.x, y: next.y });
      }
    }
  }
  return added;
}

function pruneRedundantBoundaryBlips(ctx, tiles, storagePos) {
  let line = normalizeRampartBoundaryTiles(ctx, tiles);
  if (!ctx || !storagePos || line.length <= 4) return line;
  let changed = true;
  while (changed) {
    changed = false;
    const currentMetrics = computeRampartInteriorMetrics(ctx, line, storagePos);
    const currentScore = Number(
      scoreRampartLineCandidate(ctx, line, storagePos, { metrics: currentMetrics }).score || 0,
    );
    const lineKeys = new Set(line.map((tile) => key(tile.x, tile.y)));
    const candidates = line
      .map((tile) => {
        let neighborCount = 0;
        let wallSupport = false;
        for (const next of neighbors8(tile.x, tile.y)) {
          if (lineKeys.has(key(next.x, next.y))) neighborCount += 1;
          if (!inBounds(next.x, next.y) || ctx.matrices.walkableMatrix[idx(next.x, next.y)] !== 1) {
            wallSupport = true;
          }
        }
        return { tile, neighborCount, wallSupport };
      })
      .filter((entry) => entry.neighborCount <= 2 && !entry.wallSupport)
      .sort(
        (left, right) =>
          chebyshev(right.tile, storagePos) - chebyshev(left.tile, storagePos) ||
          manhattan(right.tile, storagePos) - manhattan(left.tile, storagePos),
      );
    for (const candidate of candidates) {
      const nextLine = line.filter((tile) => tile.x !== candidate.tile.x || tile.y !== candidate.tile.y);
      if (buildBoundaryComponents(nextLine).length !== 1) continue;
      const nextMetrics = computeRampartInteriorMetrics(ctx, nextLine, storagePos);
      if (nextMetrics.touchesBorder) continue;
      if (Number(nextMetrics.protectedInsideCount || 0) < Number(currentMetrics.protectedInsideCount || 0)) {
        continue;
      }
      const nextScore = Number(
        scoreRampartLineCandidate(ctx, nextLine, storagePos, { metrics: nextMetrics }).score || 0,
      );
      if (nextScore > currentScore + 0.001) continue;
      line = normalizeRampartBoundaryTiles(ctx, nextLine);
      changed = true;
      break;
    }
  }
  return line;
}

function pruneStrayInnerRamparts(ctx) {
  if (!ctx || !Array.isArray(ctx.placements)) return { removedSupports: 0, removedCorridors: 0 };
  const rampartKeys = new Set(
    (ctx.placements || [])
      .filter((placement) => placement && placement.type === STRUCTURES.RAMPART)
      .map((placement) => key(placement.x, placement.y)),
  );
  let removedSupports = 0;
  let removedCorridors = 0;
  ctx.placements = ctx.placements.filter((placement) => {
    if (!placement || placement.type !== STRUCTURES.RAMPART) return true;
    if (placement.tag !== 'rampart.support' && placement.tag !== 'rampart.corridor') return true;
    const adjacentRamparts = neighbors8(placement.x, placement.y).filter((tile) =>
      rampartKeys.has(key(tile.x, tile.y)),
    ).length;
    if (adjacentRamparts > 0) return true;
    ctx.ramparts.delete(key(placement.x, placement.y));
    if (placement.tag === 'rampart.support') {
      removedSupports += 1;
    } else {
      removedCorridors += 1;
    }
    return false;
  });
  return { removedSupports, removedCorridors };
}

function pruneDisconnectedRampartRoadPlacements(ctx, options = {}) {
  if (!ctx || !Array.isArray(ctx.placements) || !(ctx.roads instanceof Set)) {
    return {
      removedRoads: 0,
      removedCorridors: 0,
      removedSupports: 0,
      connectedRoadKeys: new Set(),
    };
  }
  const roadTagsByKey = new Map();
  for (const placement of ctx.placements) {
    if (!placement || placement.type !== STRUCTURES.ROAD) continue;
    const placementKey = key(placement.x, placement.y);
    if (!roadTagsByKey.has(placementKey)) roadTagsByKey.set(placementKey, new Set());
    if (placement.tag) roadTagsByKey.get(placementKey).add(String(placement.tag));
  }
  const seedKeys = new Set(
    [...(options.seedKeys instanceof Set ? options.seedKeys : buildMainRoadSeedKeys(ctx, options.storagePos))]
      .filter((placementKey) => roadTagsByKey.has(placementKey) && ctx.roads.has(placementKey)),
  );
  if (seedKeys.size === 0) {
    return {
      removedRoads: 0,
      removedCorridors: 0,
      removedSupports: 0,
      connectedRoadKeys: new Set(),
    };
  }
  const connectedRoadKeys = buildConnectedRoadKeys(ctx.roads, seedKeys);
  const disconnectedRampartRoadKeys = new Set(
    [...roadTagsByKey.entries()]
      .filter(([placementKey, tags]) => tags.has('road.rampart') && !connectedRoadKeys.has(placementKey))
      .map(([placementKey]) => placementKey),
  );
  if (disconnectedRampartRoadKeys.size === 0) {
    return {
      removedRoads: 0,
      removedCorridors: 0,
      removedSupports: 0,
      connectedRoadKeys,
    };
  }

  let removedRoads = 0;
  ctx.placements = ctx.placements.filter((placement) => {
    if (!placement || placement.type !== STRUCTURES.ROAD) return true;
    const placementKey = key(placement.x, placement.y);
    if (!disconnectedRampartRoadKeys.has(placementKey) || placement.tag !== 'road.rampart') return true;
    removedRoads += 1;
    return false;
  });
  for (const placementKey of disconnectedRampartRoadKeys) {
    ctx.roads.delete(placementKey);
  }

  let removedCorridors = 0;
  let removedSupports = 0;
  ctx.placements = ctx.placements.filter((placement) => {
    if (!placement || placement.type !== STRUCTURES.RAMPART) return true;
    if (placement.tag !== 'rampart.corridor' && placement.tag !== 'rampart.support') return true;
    const placementKey = key(placement.x, placement.y);
    if (ctx.roads.has(placementKey) && connectedRoadKeys.has(placementKey)) return true;
    ctx.ramparts.delete(placementKey);
    if (placement.tag === 'rampart.support') {
      removedSupports += 1;
    } else {
      removedCorridors += 1;
    }
    return false;
  });

  return { removedRoads, removedCorridors, removedSupports, connectedRoadKeys };
}

function ensureRoadCoverageUnderRamparts(ctx, rampartPlacements) {
  const ramparts = Array.isArray(rampartPlacements) ? rampartPlacements : [];
  let addedRoads = 0;
  let missingRoadTiles = 0;
  let skippedStructureTiles = 0;
  for (const placement of ramparts) {
    if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
    const placementKey = key(placement.x, placement.y);
    if (!isRoadCompatibleRampartTile(ctx, placement.x, placement.y)) {
      skippedStructureTiles += 1;
      continue;
    }
    if (ctx.roads.has(placementKey)) continue;
    if (addPlacement(ctx, STRUCTURES.ROAD, placement.x, placement.y, 2, 'road.rampart')) {
      addedRoads += 1;
      continue;
    }
    missingRoadTiles += 1;
  }
  return { addedRoads, missingRoadTiles, skippedStructureTiles };
}

function connectRampartRoadAccess(ctx, storagePos, rampartPlacements) {
  if (!ctx || !storagePos || !(ctx.roads instanceof Set)) {
    return { addedRoads: 0, connectedRoadKeys: new Set(), pathsBuilt: 0 };
  }
  let connectedRoadKeys = buildMainRoadComponentKeys(ctx, storagePos);
  if (connectedRoadKeys.size === 0) {
    return { addedRoads: 0, connectedRoadKeys, pathsBuilt: 0 };
  }
  const targets = (Array.isArray(rampartPlacements) ? rampartPlacements : []).filter((placement) => {
    if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') return false;
    const placementKey = key(placement.x, placement.y);
    return (
      isRoadCompatibleRampartTile(ctx, placement.x, placement.y) &&
      ctx.roads.has(placementKey) &&
      !connectedRoadKeys.has(placementKey)
    );
  });
  if (targets.length === 0) {
    return { addedRoads: 0, connectedRoadKeys, pathsBuilt: 0 };
  }

  let addedRoads = 0;
  let pathsBuilt = 0;
  for (const component of buildBoundaryComponents(targets)) {
    const target = component
      .slice()
      .sort(
        (left, right) =>
          chebyshev(left, storagePos) - chebyshev(right, storagePos) ||
          manhattan(left, storagePos) - manhattan(right, storagePos),
      )[0];
    if (!target) continue;
    const origin = pickRoadOriginFromNetwork(connectedRoadKeys, target, storagePos, {
      corePenaltyRange: 0,
      corePenalty: 0,
    });
    if (!origin) continue;
    const path = buildFallbackRoadPath(ctx, origin, target, {
      targetRange: 0,
      preferredRoads: ctx.roads,
    });
    if (!Array.isArray(path) || path.length === 0) continue;
    let pathAdded = false;
    for (const step of path) {
      if (addPlacement(ctx, STRUCTURES.ROAD, step.x, step.y, 2, 'road.rampartAccess')) {
        addedRoads += 1;
        pathAdded = true;
      }
    }
    if (!pathAdded) continue;
    pathsBuilt += 1;
    connectedRoadKeys = buildMainRoadComponentKeys(ctx, storagePos);
  }
  return { addedRoads, connectedRoadKeys, pathsBuilt };
}

function countAdjacentRoadStructures(ctx, component) {
  if (!ctx || !(ctx.structuresByPos instanceof Map)) return 0;
  const adjacent = new Set();
  for (const tile of component || []) {
    if (!tile || !Number.isFinite(tile.x) || !Number.isFinite(tile.y)) continue;
    for (const neighbor of neighbors8(tile.x, tile.y)) {
      const neighborKey = key(neighbor.x, neighbor.y);
      if (!ctx.structuresByPos.has(neighborKey)) continue;
      adjacent.add(neighborKey);
    }
  }
  return adjacent.size;
}

function connectDisconnectedBaseRoadComponents(ctx, storagePos, preferredRoads, options = {}) {
  // Some road-stamp wings can end up one blocker away from the main lattice on
  // terrain-heavy rooms. Reconnect those components before pruning so the base
  // does not collapse into a single trunk route.
  if (!ctx || !storagePos || !(preferredRoads instanceof Set)) {
    return {
      attempted: 0,
      connected: 0,
      relocated: 0,
      skipped: 0,
      missing: 0,
    };
  }
  const trafficWeight = Number.isFinite(options.trafficWeight) ? Number(options.trafficWeight) : 2;
  const roadKeys =
    options.roadKeys instanceof Set
      ? new Set(options.roadKeys)
      : new Set(
          (ctx.placements || [])
            .filter((placement) => placement && placement.type === STRUCTURES.ROAD)
            .filter((placement) => isMainRoadSeedTag(String(placement.tag || '')))
            .map((placement) => key(placement.x, placement.y)),
        );
  if (roadKeys.size === 0) {
    return {
      attempted: 0,
      connected: 0,
      relocated: 0,
      skipped: 0,
      missing: 0,
    };
  }
  let networkKeys = new Set([...roadKeys, ...preferredRoads]);
  let connectedKeys = buildConnectedRoadKeys(
    networkKeys,
    buildStorageConnectedRoadSeedKeys(ctx, storagePos, networkKeys),
  );
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const layoutPattern = options.layoutPattern || 'parity';
  const preferredParity = Number.isFinite(options.preferredParity)
    ? Number(options.preferredParity)
    : checkerboard.parityAt(storagePos.x, storagePos.y);
  const addProtectedPath =
    typeof options.addProtectedPath === 'function' ? options.addProtectedPath : null;
  const components = buildBoundaryComponents([...roadKeys].map(parseKey))
    .map((component) => {
      const componentKeys = new Set(component.map((tile) => key(tile.x, tile.y)));
      return {
        component,
        componentKeys,
        adjacentStructures: countAdjacentRoadStructures(ctx, component),
      };
    })
    .filter((row) => row.component.length > 0)
    .filter((row) => [...row.componentKeys].every((componentKey) => !connectedKeys.has(componentKey)))
    .filter((row) => row.component.length >= 4 || row.adjacentStructures > 0)
    .sort(
      (left, right) =>
        right.adjacentStructures - left.adjacentStructures ||
        right.component.length - left.component.length ||
        manhattan(left.component[0], storagePos) - manhattan(right.component[0], storagePos),
    );
  if (components.length === 0) {
    return {
      attempted: 0,
      connected: 0,
      relocated: 0,
      skipped: 0,
      missing: 0,
    };
  }

  let attempted = 0;
  let connected = 0;
  let relocated = 0;
  let skipped = 0;
  for (const row of components) {
    attempted += 1;
    const target = row.component
      .slice()
      .sort((left, right) => {
        const leftOrigin = pickRoadOriginFromNetwork(connectedKeys, left, storagePos, {
          corePenaltyRange: 0,
          corePenalty: 0,
        }) || storagePos;
        const rightOrigin = pickRoadOriginFromNetwork(connectedKeys, right, storagePos, {
          corePenaltyRange: 0,
          corePenalty: 0,
        }) || storagePos;
        return (
          chebyshev(left, leftOrigin) - chebyshev(right, rightOrigin) ||
          manhattan(left, leftOrigin) - manhattan(right, rightOrigin) ||
          chebyshev(left, storagePos) - chebyshev(right, storagePos)
        );
      })[0];
    const origin = pickRoadOriginFromNetwork(connectedKeys, target, storagePos, {
      corePenaltyRange: 0,
      corePenalty: 0,
    });
    if (!target || !origin) {
      skipped += 1;
      continue;
    }

    let path = pathRoads(ctx, origin, target, {
      preferredRoads,
      targetRange: 0,
    });
    let blockerKey = null;
    if (!path.length) {
      const relocatableKeys = new Set(
        (ctx.placements || [])
          .filter((placement) => isRelocatableRoadBlocker(placement))
          .map((placement) => key(placement.x, placement.y)),
      );
      const relocatedPath = pathRoadsAllowingSingleRelocation(ctx, origin, target, {
        preferredRoads,
        targetRange: 0,
        relocatableKeys,
      });
      path = relocatedPath.path;
      blockerKey = relocatedPath.blockerKey;
    }
    if (!path.length) {
      skipped += 1;
      continue;
    }

    let relocatedPlacement = null;
    if (blockerKey) {
      const blockerPos = parseKey(blockerKey);
      relocatedPlacement = removePlacementAt(
        ctx,
        blockerPos.x,
        blockerPos.y,
        (placement) => isRelocatableRoadBlocker(placement),
      );
      if (!relocatedPlacement) {
        skipped += 1;
        continue;
      }
      const relocation = findRelocationPosition(
        ctx,
        relocatedPlacement,
        storagePos,
        layoutPattern,
        preferredParity,
        candidates,
        {
          avoidKeys: new Set([
            ...networkKeys,
            ...path.map((step) => key(step.x, step.y)),
          ]),
        },
      );
      if (!relocation) {
        addPlacement(
          ctx,
          relocatedPlacement.type,
          relocatedPlacement.x,
          relocatedPlacement.y,
          relocatedPlacement.rcl,
          relocatedPlacement.tag,
        );
        skipped += 1;
        continue;
      }
      addPlacement(
        ctx,
        relocatedPlacement.type,
        relocation.x,
        relocation.y,
        relocatedPlacement.rcl,
        relocatedPlacement.tag,
      );
      relocated += 1;
    }

    if (addProtectedPath) {
      addProtectedPath(path, trafficWeight);
    } else {
      for (const step of path) {
        preferredRoads.add(key(step.x, step.y));
      }
    }
    for (const step of path) {
      networkKeys.add(key(step.x, step.y));
    }
    connectedKeys = buildConnectedRoadKeys(
      networkKeys,
      buildStorageConnectedRoadSeedKeys(ctx, storagePos, networkKeys),
    );
    connected += 1;
  }
  const missing = buildBoundaryComponents([...roadKeys].map(parseKey))
    .map((component) => new Set(component.map((tile) => key(tile.x, tile.y))))
    .filter((componentKeys) => [...componentKeys].every((componentKey) => !connectedKeys.has(componentKey)))
    .length;
  return {
    attempted,
    connected,
    relocated,
    skipped,
    missing,
  };
}

function pruneRogueEdgeRamparts(ctx, connectedRoadKeys) {
  if (!ctx || !Array.isArray(ctx.placements)) {
    return { removedEdges: 0 };
  }
  const connected = connectedRoadKeys instanceof Set ? connectedRoadKeys : new Set();
  const edgeKeys = new Set(
    ctx.placements
      .filter((placement) => placement && placement.type === STRUCTURES.RAMPART && placement.tag === 'rampart.edge')
      .map((placement) => key(placement.x, placement.y)),
  );
  const terrainMatrix = ctx && ctx.matrices ? ctx.matrices.terrainMatrix || [] : [];
  const walkableMatrix = ctx && ctx.matrices ? ctx.matrices.walkableMatrix || [] : [];
  let removedEdges = 0;
  ctx.placements = ctx.placements.filter((placement) => {
    if (!placement || placement.type !== STRUCTURES.RAMPART || placement.tag !== 'rampart.edge') return true;
    const placementKey = key(placement.x, placement.y);
    const requiresRoad = isRoadCompatibleRampartTile(ctx, placement.x, placement.y);
    if (requiresRoad) {
      if (!(ctx.roads.has(placementKey) && connected.has(placementKey))) {
        ctx.ramparts.delete(placementKey);
        removedEdges += 1;
        return false;
      }
    }
    let neighborCount = 0;
    let wallSupport = false;
    for (const next of neighbors8(placement.x, placement.y)) {
      if (edgeKeys.has(key(next.x, next.y))) neighborCount += 1;
      if (
        !inBounds(next.x, next.y) ||
        walkableMatrix[idx(next.x, next.y)] !== 1 ||
        terrainMatrix[idx(next.x, next.y)] === 2
      ) {
        wallSupport = true;
      }
    }
    if (neighborCount > 0 || wallSupport) return true;
    ctx.ramparts.delete(placementKey);
    removedEdges += 1;
    return false;
  });
  return { removedEdges };
}

function analyzeRampartEnclosure(ctx, storagePos, options = {}) {
  const placements = ctx && Array.isArray(ctx.placements) ? ctx.placements : [];
  const edgeRamparts = placements.filter(
    (placement) => placement && placement.type === STRUCTURES.RAMPART && placement.tag === 'rampart.edge',
  );
  const corridorRamparts = placements.filter(
    (placement) => placement && placement.type === STRUCTURES.RAMPART && placement.tag === 'rampart.corridor',
  );
  const supportRamparts = placements.filter(
    (placement) => placement && placement.type === STRUCTURES.RAMPART && placement.tag === 'rampart.support',
  );
  const seedKeys =
    options && options.seedKeys instanceof Set ? new Set(options.seedKeys) : buildMainRoadSeedKeys(ctx, storagePos);
  const connectedRoadKeys =
    ctx && ctx.roads instanceof Set && seedKeys.size > 0 ? buildConnectedRoadKeys(ctx.roads, seedKeys) : new Set();
  const rogueEdgeCount = edgeRamparts.filter((placement) => {
    const placementKey = key(placement.x, placement.y);
    if (!isRoadCompatibleRampartTile(ctx, placement.x, placement.y)) return false;
    return !ctx.roads.has(placementKey) || !connectedRoadKeys.has(placementKey);
  }).length;
  const rogueCorridorCount = corridorRamparts.filter((placement) => {
    const placementKey = key(placement.x, placement.y);
    return !ctx.roads.has(placementKey) || !connectedRoadKeys.has(placementKey);
  }).length;
  const rogueSupportCount = supportRamparts.filter((placement) => {
    const placementKey = key(placement.x, placement.y);
    return !ctx.roads.has(placementKey) || !connectedRoadKeys.has(placementKey);
  }).length;
  const missingRoadUnderRamparts = placements.filter(
    (placement) =>
      placement &&
      placement.type === STRUCTURES.RAMPART &&
      (
        placement.tag === 'rampart.edge' ||
        placement.tag === 'rampart.corridor' ||
        placement.tag === 'rampart.support'
      ) &&
      isRoadCompatibleRampartTile(ctx, placement.x, placement.y) &&
      !ctx.roads.has(key(placement.x, placement.y)),
  ).length;
  const interiorMetrics = computeRampartInteriorMetrics(ctx, edgeRamparts, storagePos);
  const reachableProtectedCount =
    Math.max(
      0,
      Number(interiorMetrics.protectedStructures || 0) - Number(interiorMetrics.protectedInsideCount || 0),
    ) + (interiorMetrics.touchesBorder ? 1 : 0);
  return {
    sealed:
      reachableProtectedCount === 0 &&
      interiorMetrics.touchesBorder !== true &&
      Number(interiorMetrics.diagonalGapCount || 0) === 0,
    reachableProtectedCount,
    boundaryCount: edgeRamparts.length,
    corridorCount: corridorRamparts.length,
    supportCount: supportRamparts.length,
    rogueEdgeCount,
    rogueCorridorCount,
    rogueSupportCount,
    diagonalGapCount: Number(interiorMetrics.diagonalGapCount || 0),
    missingRoadUnderRamparts,
    disconnectedRampartRoads: edgeRamparts.filter((placement) => {
      const placementKey = key(placement.x, placement.y);
      return isRoadCompatibleRampartTile(ctx, placement.x, placement.y) && ctx.roads.has(placementKey) && !connectedRoadKeys.has(placementKey);
    }).length,
    connectedRoadKeys,
    touchesBorder: interiorMetrics.touchesBorder === true,
  };
}

function finalizeFullRampartPlacements(ctx, rampartLine, storagePos, options = {}) {
  if (!ctx || !Array.isArray(ctx.placements)) {
    return {
      boundaryPlacedCount: 0,
      corridorCount: 0,
      supportCount: 0,
      removedRogueEdgeRamparts: 0,
      removedLegacyCorridors: 0,
      removedLegacyBoundaryRamparts: 0,
      removedLegacyRampartRoads: 0,
      ensuredBoundaryRoads: 0,
      accessRoadsAdded: 0,
      skippedBoundaryRoadOverlays: 0,
      missingRoadUnderRamparts: 0,
      diagonalGapCount: 0,
      disconnectedRampartRoadsRemoved: 0,
      disconnectedCorridorsRemoved: 0,
      disconnectedSupportsRemoved: 0,
      removedStrayCorridors: 0,
      removedStraySupports: 0,
      sealed: false,
      reachableProtectedCount: 0,
      rogueEdgeCount: 0,
      rogueCorridorCount: 0,
      rogueSupportCount: 0,
      connectedRoadKeys: new Set(),
      accessRoadRampartsAdded: 0,
    };
  }
  const desiredBoundaryRamparts = normalizeRampartBoundaryTiles(
    ctx,
    Array.isArray(options.desiredRamparts) && options.desiredRamparts.length > 0
      ? options.desiredRamparts
      : canonicalizeRampartBoundaryTiles(ctx, rampartLine, storagePos).map((tile) => ({
          x: tile.x,
          y: tile.y,
          tag: tile.tag || 'rampart.edge',
        })),
  );
  const desiredEdgeKeys = new Set(desiredBoundaryRamparts.map((tile) => key(tile.x, tile.y)));
  const desiredPrimaryLine = normalizeRampartBoundaryTiles(
    ctx,
    Array.isArray(options.primaryBoundary) && options.primaryBoundary.length > 0
      ? options.primaryBoundary
      : rampartLine,
  );
  let removedLegacyBoundaryRamparts = 0;
  let removedLegacyCorridors = 0;
  let removedOtherRamparts = 0;
  ctx.placements = ctx.placements.filter((placement) => {
    if (!placement || placement.type !== STRUCTURES.RAMPART) return true;
    const placementKey = key(placement.x, placement.y);
    if (isBoundaryRampartTag(placement.tag)) {
      if (desiredEdgeKeys.has(placementKey)) return true;
      ctx.ramparts.delete(placementKey);
      removedLegacyBoundaryRamparts += 1;
      return false;
    }
    if (placement.tag === 'rampart.corridor') {
      ctx.ramparts.delete(placementKey);
      removedLegacyCorridors += 1;
      return false;
    }
    if (String(placement.tag || '').startsWith('rampart.')) {
      ctx.ramparts.delete(placementKey);
      removedOtherRamparts += 1;
      return false;
    }
    return true;
  });

  let removedLegacyRampartRoads = 0;
  ctx.placements = ctx.placements.filter((placement) => {
    if (!placement || placement.type !== STRUCTURES.ROAD || placement.tag !== 'road.rampart') return true;
    const placementKey = key(placement.x, placement.y);
    if (desiredEdgeKeys.has(placementKey)) return true;
    ctx.roads.delete(placementKey);
    removedLegacyRampartRoads += 1;
    return false;
  });

  let boundaryPlacedCount = 0;
  for (const rp of desiredBoundaryRamparts) {
    if (addPlacement(ctx, STRUCTURES.RAMPART, rp.x, rp.y, 2, rp.tag || 'rampart.edge', { allowOnBlocked: true })) {
      boundaryPlacedCount += 1;
    }
  }
  const placedBoundaryRamparts = ctx.placements.filter(
    (placement) => placement && placement.type === STRUCTURES.RAMPART && isBoundaryRampartTag(placement.tag),
  );
  const placedPrimaryRamparts = ctx.placements.filter(
    (placement) => placement && placement.type === STRUCTURES.RAMPART && placement.tag === 'rampart.edge',
  );
  boundaryPlacedCount = placedBoundaryRamparts.length;
  addRampartSupportBand(
    ctx,
    placedPrimaryRamparts.length > 0 ? placedPrimaryRamparts : desiredPrimaryLine,
    storagePos,
  );
  ensureBoundaryRoadSupports(
    ctx,
    placedPrimaryRamparts.length > 0 ? placedPrimaryRamparts : desiredPrimaryLine,
    storagePos,
  );
  const placedSupportRamparts = ctx.placements.filter(
    (placement) => placement && placement.type === STRUCTURES.RAMPART && placement.tag === 'rampart.support',
  );
  const ensuredBoundaryRoads = ensureRoadCoverageUnderRamparts(
    ctx,
    placedBoundaryRamparts.concat(placedSupportRamparts),
  );
  const rampartAccess = connectRampartRoadAccess(
    ctx,
    storagePos,
    placedBoundaryRamparts.concat(placedSupportRamparts),
  );
  const initialConnectivity = pruneDisconnectedRampartRoadPlacements(ctx, {
    seedKeys: buildMainRoadSeedKeys(ctx, storagePos),
    storagePos,
  });
  const corridorRamparts = addRampartCorridorGuards(ctx, placedBoundaryRamparts, storagePos, { maxDepth: 3 });
  const finalConnectivity = pruneDisconnectedRampartRoadPlacements(ctx, {
    seedKeys: buildMainRoadSeedKeys(ctx, storagePos),
    storagePos,
  });
  const accessRoadRamparts = addRampartsOnRoadsInNoGoZone(ctx, options.noGoZone);
  const strayInnerRamparts = pruneStrayInnerRamparts(ctx);
  const rogueEdges = pruneRogueEdgeRamparts(ctx, finalConnectivity.connectedRoadKeys);
  const analysis = analyzeRampartEnclosure(ctx, storagePos, {
    seedKeys: buildMainRoadSeedKeys(ctx, storagePos),
  });
  return {
    boundaryPlacedCount,
    corridorCount: (ctx.placements || []).filter(
      (placement) => placement && placement.type === STRUCTURES.RAMPART && placement.tag === 'rampart.corridor',
    ).length,
    supportCount: (ctx.placements || []).filter(
      (placement) => placement && placement.type === STRUCTURES.RAMPART && placement.tag === 'rampart.support',
    ).length,
    removedLegacyBoundaryRamparts,
    removedLegacyCorridors,
    removedOtherRamparts,
    removedLegacyRampartRoads,
    ensuredBoundaryRoads: ensuredBoundaryRoads.addedRoads,
    accessRoadsAdded: rampartAccess.addedRoads,
    skippedBoundaryRoadOverlays: ensuredBoundaryRoads.skippedStructureTiles,
    missingRoadUnderRamparts: analysis.missingRoadUnderRamparts,
    disconnectedRampartRoadsRemoved: initialConnectivity.removedRoads + finalConnectivity.removedRoads,
    disconnectedCorridorsRemoved: initialConnectivity.removedCorridors + finalConnectivity.removedCorridors,
    disconnectedSupportsRemoved: initialConnectivity.removedSupports + finalConnectivity.removedSupports,
    removedStrayCorridors: strayInnerRamparts.removedCorridors,
    removedStraySupports: strayInnerRamparts.removedSupports,
    removedRogueEdgeRamparts: rogueEdges.removedEdges,
    reachableProtectedCount: analysis.reachableProtectedCount,
    rogueEdgeCount: analysis.rogueEdgeCount,
    rogueCorridorCount: analysis.rogueCorridorCount,
    rogueSupportCount: analysis.rogueSupportCount,
    diagonalGapCount: analysis.diagonalGapCount,
    disconnectedRampartRoads: analysis.disconnectedRampartRoads,
    sealed: analysis.sealed,
    connectedRoadKeys: analysis.connectedRoadKeys,
    seededCorridorCount: corridorRamparts.length,
    accessRoadRampartsAdded: accessRoadRamparts.added,
  };
}

function pickBestRampartCut(ctx, storagePos, options = {}) {
  const defenseCtx =
    options && options.defenseCtx && typeof options.defenseCtx === 'object'
      ? options.defenseCtx
      : buildDefenseCutContext(ctx, storagePos);
  const defensePoints = [...defenseCtx.structuresByPos.keys()].map(parseKey);
  const defensePlanningMode =
    String(
      options && typeof options === 'object' && options.strategy
        ? options.strategy
        : options && typeof options === 'object' && options.mode
        ? options.mode
        : 'full',
    ).toLowerCase() === 'estimate'
      ? 'estimate'
      : 'full';
  if (!defensePoints.length) {
    return {
      line: [],
      standoff: 0,
      margin: 3,
      minCutMeta: {
        method: defensePlanningMode === 'estimate' ? 'estimate-envelope' : 'flow-mincut',
        reason: 'no-defense-points',
        strategy: defensePlanningMode,
      },
    };
  }
  const targetStandoff = RAMPART_TARGET_STANDOFF;
  const maxMargin = defensePlanningMode === 'estimate' ? 6 : 8;
  let best = null;
  for (let margin = 3; margin <= maxMargin; margin++) {
    const cut =
      defensePlanningMode === 'full'
        ? minCutAlgorithm.computeRampartCut(defenseCtx, { margin })
        : null;
    const rawLine = cut && cut.line && cut.line.length
      ? cut.line
      : estimateRampartEnvelopeFromPoints(defensePoints, margin);
    const normalizedLine = normalizeRampartBoundaryTiles(ctx, rawLine);
    const connectedLine =
      defensePlanningMode === 'full' && typeof minCutAlgorithm.connectBarrier === 'function'
        ? minCutAlgorithm.connectBarrier(
            normalizedLine.slice(),
            (ctx && ctx.matrices && ctx.matrices.walkableMatrix) || new Array(2500).fill(1),
            (ctx && ctx.matrices && ctx.matrices.terrainMatrix) || new Array(2500).fill(0),
          )
        : {
            line: normalizedLine.slice(),
            bridged: 0,
            components: null,
            skipped: defensePlanningMode === 'estimate' ? 'estimate-skip' : null,
          };
    const line = normalizeRampartBoundaryTiles(ctx, connectedLine.line);
    const standoff = computeMinRampartStandoff(ctx.placements, line, storagePos);
    let exitDistSum = 0;
    let exitDistMax = 0;
    let exitDistCount = 0;
    for (const rp of line) {
      if (!rp || typeof rp.x !== 'number' || typeof rp.y !== 'number') continue;
      const dist = Math.max(0, ctx.matrices.exitDistance[idx(rp.x, rp.y)] || 0);
      exitDistSum += dist;
      exitDistMax = Math.max(exitDistMax, dist);
      exitDistCount += 1;
    }
    const exitDistAvg = exitDistCount > 0 ? exitDistSum / exitDistCount : 0;
    const lineMetrics = computeRampartInteriorMetrics(ctx, line, storagePos, {
      continuity: cut && cut.meta && cut.meta.continuity ? cut.meta.continuity : null,
    });
    const evaluation = scoreRampartLineCandidate(ctx, line, storagePos, {
      targetStandoff,
      standoff,
      metrics: Object.assign({}, lineMetrics, {
        exitDistAvg,
        exitDistMax,
      }),
    });
    const continuityMeta =
      cut && cut.meta && cut.meta.continuity
        ? cut.meta.continuity
        : {
            components: connectedLine.components,
            bridgedTiles: Number(connectedLine.bridged || 0),
            connected:
              typeof connectedLine.components === 'number'
                ? Number(connectedLine.components || 0) <= 1
                : null,
            skipped: connectedLine.skipped || 'estimate-envelope',
          };
    const metaBase =
      cut && cut.meta
        ? Object.assign({}, cut.meta)
        : {
            method: 'estimate-envelope',
            margin,
            candidates: line.length,
            continuity: continuityMeta,
          };
    if (metaBase && metaBase.continuity) {
      metaBase.continuity = Object.assign({}, metaBase.continuity, {
        components:
          typeof connectedLine.components === 'number'
            ? connectedLine.components
            : metaBase.continuity.components,
        bridgedTiles:
          Number((metaBase.continuity && metaBase.continuity.bridgedTiles) || 0) +
          Number(connectedLine.bridged || 0),
        connected:
          typeof connectedLine.components === 'number'
            ? Number(connectedLine.components || 0) <= 1
            : metaBase.continuity.connected,
        skipped: connectedLine.skipped || metaBase.continuity.skipped || null,
      });
    }
    if (!best || evaluation.score < best.score) {
      best = {
        score: evaluation.score,
        line,
        standoff,
        margin,
        filteredTiles: Math.max(0, (rawLine && rawLine.length ? rawLine.length : 0) - line.length),
        minCutMeta: Object.assign({}, metaBase, {
          strategy: defensePlanningMode,
          lineMetrics: evaluation.metrics,
        }),
      };
    }
  }
  return best || {
    line: [],
    standoff: 0,
    margin: 3,
    minCutMeta: {
      method: defensePlanningMode === 'estimate' ? 'estimate-envelope' : 'flow-mincut',
      reason: 'no-solution',
      strategy: defensePlanningMode,
    },
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

function isBoundaryRampartTag(tag) {
  return String(tag || '').startsWith('rampart.edge');
}

function normalizeRampartBoundaryTiles(ctx, tiles) {
  const out = [];
  const seen = new Set();
  for (const tile of tiles || []) {
    if (!tile || typeof tile.x !== 'number' || typeof tile.y !== 'number') continue;
    if (!inBounds(tile.x, tile.y)) continue;
    if (ctx && ctx.matrices && ctx.matrices.walkableMatrix[idx(tile.x, tile.y)] !== 1) continue;
    const tileKey = key(tile.x, tile.y);
    if (ctx && ctx.structuresByPos && ctx.structuresByPos.has(tileKey)) continue;
    if (seen.has(tileKey)) continue;
    seen.add(tileKey);
    out.push({ x: tile.x, y: tile.y, tag: tile.tag || null });
  }
  return out;
}

function buildRampartCoverageTargets(rampartPlacements) {
  const ramparts = (rampartPlacements || [])
    .filter((placement) => placement && placement.type === STRUCTURES.RAMPART)
    .map((placement) => ({
      x: placement.x,
      y: placement.y,
      tag: placement.tag || null,
    }));
  const boundary = ramparts.filter((placement) => isBoundaryRampartTag(placement.tag));
  return boundary.length > 0 ? boundary : ramparts;
}

function computeTowerCoverageStats(boundaryTiles, towers, exitDistanceMatrix = null) {
  const stats = {
    boundaryCount: 0,
    minDamage: 0,
    p25Damage: 0,
    avgDamage: 0,
    maxDamage: 0,
    exitWeightedAvg: 0,
    weakestTile: null,
  };
  if (!Array.isArray(boundaryTiles) || boundaryTiles.length === 0) return stats;

  const damages = [];
  let totalDamage = 0;
  let exitWeightedSum = 0;
  let exitWeightTotal = 0;
  let weakest = null;
  let weakestDamage = Infinity;
  for (const boundary of boundaryTiles) {
    let damage = 0;
    for (const tower of towers || []) {
      damage += computeTowerDamage(chebyshev(tower, boundary));
    }
    damages.push(damage);
    totalDamage += damage;
    const exitDist =
      exitDistanceMatrix && Number.isFinite(exitDistanceMatrix[idx(boundary.x, boundary.y)])
        ? Number(exitDistanceMatrix[idx(boundary.x, boundary.y)])
        : 0;
    const exitWeight = 1 + clamp01((12 - exitDist) / 12) * 1.5;
    exitWeightedSum += damage * exitWeight;
    exitWeightTotal += exitWeight;
    if (
      damage < weakestDamage ||
      (damage === weakestDamage &&
        weakest &&
        exitDist < (Number.isFinite(weakest.exitDist) ? weakest.exitDist : Infinity))
    ) {
      weakestDamage = damage;
      weakest = { x: boundary.x, y: boundary.y, tag: boundary.tag || null, damage, exitDist };
    }
  }

  damages.sort((left, right) => left - right);
  stats.boundaryCount = boundaryTiles.length;
  stats.minDamage = damages[0] || 0;
  stats.p25Damage = damages[Math.floor((damages.length - 1) * 0.25)] || stats.minDamage;
  stats.avgDamage = totalDamage / Math.max(1, boundaryTiles.length);
  stats.maxDamage = damages[damages.length - 1] || 0;
  stats.exitWeightedAvg = exitWeightTotal > 0 ? exitWeightedSum / exitWeightTotal : stats.avgDamage;
  stats.weakestTile = weakest;
  return stats;
}

function compareTowerCoverageStats(left, right) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  if ((left.minDamage || 0) !== (right.minDamage || 0)) {
    return (left.minDamage || 0) - (right.minDamage || 0);
  }
  if ((left.p25Damage || 0) !== (right.p25Damage || 0)) {
    return (left.p25Damage || 0) - (right.p25Damage || 0);
  }
  if ((left.exitWeightedAvg || 0) !== (right.exitWeightedAvg || 0)) {
    return (left.exitWeightedAvg || 0) - (right.exitWeightedAvg || 0);
  }
  if ((left.avgDamage || 0) !== (right.avgDamage || 0)) {
    return (left.avgDamage || 0) - (right.avgDamage || 0);
  }
  return (left.maxDamage || 0) - (right.maxDamage || 0);
}

function buildTowerCandidateTieBreak(candidate, boundaryTiles, storagePos) {
  const avgBoundaryRange =
    Array.isArray(boundaryTiles) && boundaryTiles.length > 0
      ? mean(boundaryTiles.map((boundary) => chebyshev(candidate, boundary)))
      : 25;
  return {
    avgBoundaryRange,
    storageRange: storagePos ? chebyshev(candidate, storagePos) : 25,
    jitter: deterministicJitter(candidate.x, candidate.y, 29),
  };
}

function compareTowerCandidateTieBreak(left, right) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  if (left.avgBoundaryRange !== right.avgBoundaryRange) {
    return right.avgBoundaryRange - left.avgBoundaryRange;
  }
  if (left.storageRange !== right.storageRange) {
    return right.storageRange - left.storageRange;
  }
  return right.jitter - left.jitter;
}

function planTowerPlacements(towerCandidates, boundaryTiles, options = {}) {
  const candidates = Array.isArray(towerCandidates) ? towerCandidates : [];
  const boundary = Array.isArray(boundaryTiles) ? boundaryTiles : [];
  const maxTowers = Number.isFinite(options.maxTowers) ? Math.max(0, Math.trunc(options.maxTowers)) : 6;
  const minSpacing = Number.isFinite(options.minSpacing) ? Math.max(1, Math.trunc(options.minSpacing)) : 4;
  const towers = [];
  const picks = [];
  let coverage = computeTowerCoverageStats(boundary, towers, options.exitDistance || null);

  for (let i = 0; i < maxTowers; i++) {
    let bestCandidate = null;
    let bestCoverage = null;
    let bestTieBreak = null;
    for (const candidate of candidates) {
      if (!candidate || typeof candidate.x !== 'number' || typeof candidate.y !== 'number') continue;
      if (towers.some((tower) => chebyshev(tower, candidate) < minSpacing)) continue;
      const nextTowers = towers.concat({ x: candidate.x, y: candidate.y });
      const nextCoverage = computeTowerCoverageStats(boundary, nextTowers, options.exitDistance || null);
      const tieBreak = buildTowerCandidateTieBreak(candidate, boundary, options.storagePos || null);
      const coverageCmp = compareTowerCoverageStats(nextCoverage, bestCoverage);
      if (
        !bestCandidate ||
        coverageCmp > 0 ||
        (coverageCmp === 0 && compareTowerCandidateTieBreak(tieBreak, bestTieBreak) > 0)
      ) {
        bestCandidate = candidate;
        bestCoverage = nextCoverage;
        bestTieBreak = tieBreak;
      }
    }
    if (!bestCandidate) break;
    const tower = { x: bestCandidate.x, y: bestCandidate.y };
    towers.push(tower);
    coverage = bestCoverage || coverage;
    picks.push({
      x: tower.x,
      y: tower.y,
      rank: i + 1,
      minBoundaryDamage: coverage.minDamage,
      p25BoundaryDamage: coverage.p25Damage,
      avgBoundaryDamage: coverage.avgDamage,
      weakestBoundary: coverage.weakestTile,
    });
  }

  return {
    towers,
    coverage,
    picks,
    boundaryCount: boundary.length,
    objective: 'maximize-min-boundary-damage-v1',
  };
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
  const sources = findFirstNonEmpty(room, [findSourcesConst(), 'FIND_SOURCES', 1]);
  const minerals = findFirstNonEmpty(room, [findMineralsConst(), 'FIND_MINERALS']);
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
      if (useHarabi && !hasHarabiControllerStampFit(c, controllerPos, matrices)) continue;
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
    let fallbackAnchor = {
      x: Math.min(44, Math.max(5, controllerPos.x + 6)),
      y: Math.min(44, Math.max(5, controllerPos.y)),
    };
    if (useHarabi) {
      let bestFallback = null;
      for (let x = 5; x <= 44; x++) {
        for (let y = 5; y <= 44; y++) {
          const candidate = { x, y };
          if (!hasHarabiCoreStampFit(candidate, matrices)) continue;
          if (!hasHarabiControllerStampFit(candidate, controllerPos, matrices)) continue;
          const score = chebyshev(candidate, controllerPos);
          if (!bestFallback || score < bestFallback.score) {
            bestFallback = { x, y, score };
          }
        }
      }
      if (bestFallback) {
        fallbackAnchor = { x: bestFallback.x, y: bestFallback.y };
      }
    }
    const fallback = {
      index: 0,
      anchor: fallbackAnchor,
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
  const foundationOnly = useHarabi && harabiStage !== 'full';
  const coreStamp = useHarabi ? getHarabiCoreStamp(anchor) : null;
  const coreSlotAbs = (slotKey) => {
    if (!coreStamp || !coreStamp.slots[slotKey]) return null;
    return {
      x: coreStamp.center.x + coreStamp.slots[slotKey].x,
      y: coreStamp.center.y + coreStamp.slots[slotKey].y,
    };
  };
  const coreStructureSlotKeys = collectCoreStructureSlotKeys(coreStamp);
  const coreRoadKeys = collectCoreRoadKeys(coreStamp);
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
  let upgraderSlots = null;

  // Harabi controller stamp is highest priority and is locked in before core spawn slots.
  if (useHarabi) {
    const controllerCenters = collectHarabiControllerStampCenters(controllerPos, {
      coreStructureSlotKeys,
      canPlaceLink: (x, y) => canPlaceStructure(ctx, STRUCTURES.LINK, x, y),
      canPlaceRoad: (x, y) => canPlaceStructure(ctx, STRUCTURES.ROAD, x, y),
      hasRoad: (x, y) => ctx.roads.has(key(x, y)) || coreRoadKeys.has(key(x, y)),
    });
    const controllerReference = coreStamp && coreStamp.center ? coreStamp.center : anchor;
    const stampCenter = findBestByCandidates(controllerCenters, (center) => {
      const wallBuffer = Number(dt[idx(center.x, center.y)] || 0);
      const compactPenalty = manhattan(center, controllerReference);
      return wallBuffer * 2 - compactPenalty;
    });
    if (stampCenter) {
      addPlacement(ctx, STRUCTURES.LINK, stampCenter.x, stampCenter.y, 8, 'controller.link');
      const stampRing = Array.isArray(stampCenter.ring) ? stampCenter.ring : neighbors8(stampCenter.x, stampCenter.y);
      for (const p of stampRing) {
        addPlacement(ctx, STRUCTURES.ROAD, p.x, p.y, 2, 'road.controllerStamp');
      }
      const hasCompleteStamp = stampRing.every((p) => ctx.roads.has(key(p.x, p.y)));
      if (!hasCompleteStamp) {
        ctx.meta.validation.push('controller-stamp-incomplete');
      }
      upgraderSlots = stampRing
        .filter((p) => chebyshev(p, controllerPos) <= 3)
        .map((p) => ({ x: p.x, y: p.y }));
      ctx.meta.upgraderSlots = upgraderSlots.slice();
    } else {
      ctx.meta.validation.push('controller-stamp-missing');
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
    const slink = findBestByCandidates(candidatePool, (p) =>
      scoreSourceLinkCandidate(ctx, storage, src.pos, cont, roadAnchor, p),
    );
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
  if (!useHarabi) {
    upgraderSlots = foundationOnly ? null : buildUpgraderArea(ctx, controllerPos, storage);
  }
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
      const slotData = evaluateHarabiStampSlots(ctx, candidateNode, stamp, {
        storagePos: storage,
        layoutPattern,
        preferredParity: parity,
        foundationOnly,
      });
      return {
        stamp,
        roadOk,
        existingRoadCount,
        placeableRoadCount,
        blockedRoadCount,
        missingRoadCount,
        slotCandidates: slotData.slotCandidates,
        viableSlots: slotData.viableSlots,
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
      for (const slotKey of collectHarabiStampCapacityKeys(evaluation)) {
        capacitySlotKeys.add(slotKey);
      }
      if (!foundationOnly) {
        const viable = getHarabiStampPlacementSlots(evaluation, {
          foundationOnly,
          maxSlots: 60 - extIdx,
        });
        const placed = [];
        for (const p of viable) {
          if (placeExtensionTile(p.x, p.y)) placed.push({ x: p.x, y: p.y });
        }
        if (placed.length > 0) {
          addPatternRoadHalo(ctx, placed, storage, layoutPattern, parity);
        }
        if (viable.length > 0 && viable.length < evaluation.stamp.slots.length) {
          ctx.meta.stampStats.partialPlaced += 1;
          ctx.meta.stampStats.partialPlacedSlots += viable.length;
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
  let towerPlan = {
    towers: [],
    coverage: computeTowerCoverageStats([], []),
    picks: [],
    boundaryCount: 0,
    objective: 'maximize-min-boundary-damage-v1',
  };
  const towers = [];
  if (!foundationOnly) {
    const rampartCut = pickBestRampartCut(ctx, storage);
    const rampartLine = rampartCut.line || [];
    ctx.meta.rampartMargin = rampartCut.margin;
    ctx.meta.rampartStandoff = rampartCut.standoff;
    ctx.meta.minCut = rampartCut.minCutMeta || { method: 'flow-mincut', margin: rampartCut.margin };
    ctx.meta.rampartPlanning = {
      objective: 'protect-core-with-mincut-v1',
      boundaryCount: rampartLine.length,
      filteredBoundaryTiles: Number(rampartCut.filteredTiles || 0),
      margin: rampartCut.margin,
      standoff: rampartCut.standoff,
      targetStandoff: RAMPART_TARGET_STANDOFF,
      minCut: ctx.meta.minCut,
      lineMetrics:
        ctx.meta.minCut && ctx.meta.minCut.lineMetrics ? ctx.meta.minCut.lineMetrics : null,
    };
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

    // Towers: greedily maximize the weakest boundary damage first, then improve
    // low-percentile and average coverage as tie-breakers.
    rampartTiles = buildRampartCoverageTargets(ctx.placements);
    const towerCandidates = floodFromStorage
      .filter((n) => canPlaceStructure(ctx, STRUCTURES.TOWER, n.x, n.y))
      .filter((n) => chebyshev(n, storage) <= 12);
    towerPlan = planTowerPlacements(towerCandidates, rampartTiles, {
      maxTowers: 6,
      minSpacing: 4,
      exitDistance: ctx.matrices.exitDistance,
      storagePos: storage,
    });
    ctx.meta.towerPlanning = {
      objective: towerPlan.objective,
      boundaryCount: towerPlan.boundaryCount,
      picks: towerPlan.picks,
      coverage: towerPlan.coverage,
    };
    for (let i = 0; i < towerPlan.towers.length; i++) {
      const bestTower = towerPlan.towers[i];
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

  // Cluster3 preview ranking originates from the core stamp center / spawn stamp midpoint.
  const extensionDistanceReference =
    useHarabi && coreStamp && coreStamp.center
      ? { x: coreStamp.center.x, y: coreStamp.center.y }
      : spawn1 || storage || anchor;
  let finalFoundationRanking = null;
  let finalFoundationSelection = null;

  const computeFoundationStructurePreview = (options = {}) => {
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
    const ranking = buildFoundationPreviewRanking(
      ctx,
      buildFullRoomNodes(),
      storage,
      layoutPattern,
      parity,
      {
        centerOverrideKeys,
        excludedKeys,
        depthLimit: 50,
        slotOrderShift: mutationOptions.slotOrderShift || 0,
        terrainDt: dt,
        spawnReference: extensionDistanceReference,
        stampCenters:
          ctx.meta.stampStats && Array.isArray(ctx.meta.stampStats.bigCenters)
            ? ctx.meta.stampStats.bigCenters
            : [],
        smallStampCenters: inferStampGeometryFromRoadStamps(ctx).smallCenters || [],
        floodDistanceByKey: buildFoundationFloodDistanceByKey(ctx, storage),
        useAllRoads: options.useAllRoads === true,
      },
    );
    const preview = planFoundationStructurePreview(ranking, {
      rankingLimit: 2500,
    });
    return {
      ranking,
      preview: preview.preview,
      selection: preview.selection,
    };
  };

  if (foundationOnly) {
    // First pass: select preview occupancy for stamp-pruning decisions.
    const initialPreview = computeFoundationStructurePreview();
    ctx.meta.structurePlanning = initialPreview.preview;
    rebuildRoadBlockedByStructures(ctx);
  }

  // Remove unused stamp geometry before generating logistics roads so we avoid
  // stamp/road feedback loops and keep structure candidates stable.
  pruneUnusedRoadStamps(ctx, {
    layoutPattern,
  });

  if (foundationOnly) {
    // Second pass after prune: ensure final preview uses only surviving stamp layout.
    const prunedPreview = computeFoundationStructurePreview();
    ctx.meta.structurePlanning = prunedPreview.preview;
    rebuildRoadBlockedByStructures(ctx);
    // One more prune pass can be necessary when the second preview changes the
    // occupied stamp cross set versus the first preview.
    const stabilizationPrune = pruneUnusedRoadStamps(ctx, {
      layoutPattern,
    });
    if (Number(stabilizationPrune && stabilizationPrune.removedRoadTiles || 0) > 0) {
      const stabilizedPreview = computeFoundationStructurePreview();
      ctx.meta.structurePlanning = stabilizedPreview.preview;
      rebuildRoadBlockedByStructures(ctx);
    }
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
    sourceRoadAnchorById.set(anchor.sourceId, {
      x: anchor.x,
      y: anchor.y,
      key: key(anchor.x, anchor.y),
    });
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
      pos:
        (sourceRoadAnchorById.get(sid) && {
          x: sourceRoadAnchorById.get(sid).x,
          y: sourceRoadAnchorById.get(sid).y,
        }) ||
        sourceContainerById.get(sid) ||
        { x: sp.x, y: sp.y },
      weight: 8,
      protect: true,
      avoidSourceContainers: true,
      // Route source logistics onto the reserved anchor tile itself; otherwise a
      // path can stop at a different container-adjacent tile and leave an
      // isolated anchor road that incorrectly looks "connected" in validation.
      targetRange: sourceRoadAnchorById.has(sid) ? 0 : 1,
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
      return isMainRoadSeedTag(tag);
    })
    .map((p) => ({ x: p.x, y: p.y }));
  for (const road of routeOriginRoads) {
    preferredRoads.add(key(road.x, road.y));
  }
  const pickLogisticOrigin = (targetPos) => {
    if (!targetPos) return storage;
    const connectedPreferredRoads = buildMainRoadComponentKeys(ctx, storage, preferredRoads);
    const network =
      connectedPreferredRoads.size > 0
        ? connectedPreferredRoads
        : preferredRoads.size > 0
        ? preferredRoads
        : routeOriginRoads;
    return pickRoadOriginFromNetwork(network, targetPos, storage, {
      corePenaltyRange: 2,
      corePenalty: 6,
    }) || storage;
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
      targetRange: target.targetRange,
    });
    if (!path.length && avoidKeys) {
      path = pathRoads(ctx, routeOrigin, target.pos, {
        preferredRoads,
        targetRange: target.targetRange,
      });
    }
    if (
      !path.length &&
      (routeOrigin.x !== storage.x || routeOrigin.y !== storage.y)
    ) {
      path = pathRoads(ctx, storage, target.pos, {
        preferredRoads,
        avoidKeys,
        avoidPenalty: 25,
        targetRange: target.targetRange,
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
    return path;
  };
  const tryAddAlternateCoreRoute = (from, to, primaryPath, weight) => {
    if (!from || !to || !Array.isArray(primaryPath) || primaryPath.length === 0) return false;
    const primaryKeys = new Set(primaryPath.map((step) => key(step.x, step.y)));
    let altPath = pathRoads(ctx, from, to, {
      preferredRoads,
      avoidKeys: primaryKeys,
      avoidPenalty: 18,
    });
    let blockerKey = null;
    const distinctAltSteps = new Set(
      altPath
        .map((step) => key(step.x, step.y))
        .filter((stepKey) => !primaryKeys.has(stepKey)),
    );
    if (distinctAltSteps.size < 2) {
      const relocatableKeys = new Set(
        (ctx.placements || [])
          .filter((placement) => isRelocatableRoadBlocker(placement))
          .map((placement) => key(placement.x, placement.y)),
      );
      const relocated = pathRoadsAllowingSingleRelocation(ctx, from, to, {
        preferredRoads,
        avoidKeys: primaryKeys,
        avoidPenalty: 18,
        relocatableKeys,
      });
      altPath = relocated.path;
      blockerKey = relocated.blockerKey;
    }
    const distinctKeys = new Set(
      altPath
        .map((step) => key(step.x, step.y))
        .filter((stepKey) => !primaryKeys.has(stepKey)),
    );
    if (!altPath.length || distinctKeys.size < 2) return false;

    let relocatedPlacement = null;
    if (blockerKey) {
      const blockerPos = parseKey(blockerKey);
      relocatedPlacement = removePlacementAt(
        ctx,
        blockerPos.x,
        blockerPos.y,
        (placement) => isRelocatableRoadBlocker(placement),
      );
      if (!relocatedPlacement) return false;
      const relocation = findRelocationPosition(
        ctx,
        relocatedPlacement,
        storage,
        layoutPattern,
        parity,
        sortedFlood,
        {
          avoidKeys: new Set([
            ...primaryKeys,
            ...altPath.map((step) => key(step.x, step.y)),
          ]),
        },
      );
      if (!relocation) {
        addPlacement(
          ctx,
          relocatedPlacement.type,
          relocatedPlacement.x,
          relocatedPlacement.y,
          relocatedPlacement.rcl,
          relocatedPlacement.tag,
        );
        return false;
      }
      addPlacement(
        ctx,
        relocatedPlacement.type,
        relocation.x,
        relocation.y,
        relocatedPlacement.rcl,
        relocatedPlacement.tag,
      );
    }
    addRoutePath(altPath, weight, false);
    return true;
  };
  if (!foundationOnly && upgraderSlots && upgraderSlots.length > 0) {
    for (const slot of upgraderSlots) {
      const path = pathRoads(ctx, storage, slot, { preferredRoads });
      addRoutePath(path, 1, true);
    }
  }
  const spawn1Path = spawn1 ? routeAndScorePath(storage, spawn1, 5) : [];
  const spawn2Path = spawn2 ? routeAndScorePath(storage, spawn2, 3) : [];
  const spawn3Path = spawn3 ? routeAndScorePath(storage, spawn3, 3) : [];
  const terminalPath = terminal ? routeAndScorePath(storage, terminal, 3) : [];
  if (sourceLab1) routeAndScorePath(storage, sourceLab1, 2);
  if (sourceLab2) routeAndScorePath(storage, sourceLab2, 2);
  for (const t of towers) routeAndScorePath(storage, t, 2);
  const redundancyRoadKeys = new Set(routeOriginRoads.map((road) => key(road.x, road.y)));
  for (const path of [spawn1Path, spawn2Path, spawn3Path, terminalPath]) {
    for (const step of path || []) redundancyRoadKeys.add(key(step.x, step.y));
  }
  if (spawn1Path.length > 0) tryAddAlternateCoreRoute(storage, spawn1, spawn1Path, 3);
  if (spawn2Path.length > 0) tryAddAlternateCoreRoute(storage, spawn2, spawn2Path, 2);
  if (spawn3Path.length > 0) tryAddAlternateCoreRoute(storage, spawn3, spawn3Path, 2);
  if (terminalPath.length > 0) tryAddAlternateCoreRoute(storage, terminal, terminalPath, 2);
  const wingTargets = Array.isArray(ctx.meta && ctx.meta.stampStats && ctx.meta.stampStats.bigCenters)
    ? ctx.meta.stampStats.bigCenters
        .filter((center) => center && chebyshev(center, storage) >= 6)
        .slice()
        .sort(
          (left, right) =>
            chebyshev(right, storage) - chebyshev(left, storage) ||
            manhattan(right, storage) - manhattan(left, storage),
        )
        .slice(0, 1)
    : [];
  for (const wingTarget of wingTargets) {
    const primaryWingPath = pathRoads(ctx, storage, wingTarget, { preferredRoads });
    if (primaryWingPath.length > 0) {
      for (const step of primaryWingPath) redundancyRoadKeys.add(key(step.x, step.y));
      tryAddAlternateCoreRoute(storage, wingTarget, primaryWingPath, 2);
    }
  }
  ctx.meta.baseRoadRedundancy = connectDisconnectedBaseRoadComponents(
    ctx,
    storage,
    preferredRoads,
    {
      roadKeys: redundancyRoadKeys,
      layoutPattern,
      preferredParity: parity,
      candidates: sortedFlood,
      addProtectedPath: (path, weight) => addRoutePath(path, weight, true),
      trafficWeight: 2,
    },
  );

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
    storagePos: storage,
  });
  ctx.meta.roadPruning = pruning;

  const connectedBaseRoadKeys = buildMainRoadComponentKeys(ctx, storage);
  for (const sourceId in ctx.meta.sourceLogistics) {
    const state = ctx.meta.sourceLogistics[sourceId];
    const anchor = sourceRoadAnchorById.get(sourceId) || null;
    if (!state) continue;
    // Validate against the connected base-road component after final pruning, not
    // merely against "some road next to the container".
    state.roadAnchored = isSourceRoadAnchored(state, anchor, connectedBaseRoadKeys);
    if (!state.roadAnchored) {
      ctx.meta.validation.push(`source-road-anchor-missing:${sourceId}`);
    }
  }

  if (foundationOnly) {
    // The final foundation preview should use the same post-road candidate space
    // as the green valid dots, otherwise extension picks can lag behind the final
    // road net and visibly skip newly reachable structure tiles.
    const finalPreview = computeFoundationStructurePreview({ useAllRoads: true });
    ctx.meta.structurePlanning = finalPreview.preview;
    finalFoundationRanking = finalPreview.ranking;
    finalFoundationSelection = finalPreview.selection;
    rebuildRoadBlockedByStructures(ctx);
  }
  const structurePlanning = ctx.meta.structurePlanning || {};
  const rankingModel =
    structurePlanning &&
    structurePlanning.ranking &&
    typeof structurePlanning.ranking.distanceModel === 'string'
      ? structurePlanning.ranking.distanceModel
      : 'spawn-origin-dual-v1';
  if (foundationOnly && finalFoundationRanking) {
    // Reuse the exact final preview ranking for valid dots so extension picks and
    // visualized candidates stay on the same post-road, post-prune candidate space.
    ctx.meta.validStructurePositions = collectValidStructurePositions(
      ctx,
      [],
      storage,
      layoutPattern,
      parity,
      {
        foundationRanking: finalFoundationRanking,
        foundationSelection: finalFoundationSelection,
        maxPositions: 2500,
        mode: 'strict-buildable-v1',
        revisit: 'dual-layer-debug-candidates',
        distanceModel: rankingModel,
      },
    );
  } else {
    const centerOverrideKeys = collectStampCenterOverrideKeys(ctx);
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
        maxPositions: 2500,
        mode: 'strict-buildable-v1',
        revisit: 'dual-layer-debug-candidates',
        distanceModel: rankingModel,
        requirePattern: false,
      },
    );
  }
  ctx.meta.foundationSnapshot = buildFoundationSnapshotMeta({
    placements: ctx.placements,
    meta: ctx.meta,
    anchor,
    spawnReference: extensionDistanceReference,
    coreStampCenter: coreStamp && coreStamp.center ? coreStamp.center : null,
  });
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
    ctx.meta.rampartStandoff < RAMPART_TARGET_STANDOFF
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
  if (ctx.meta.baseRoadRedundancy && Number(ctx.meta.baseRoadRedundancy.missing || 0) > 0) {
    ctx.meta.validation.push(`base-road-redundancy-missing:${Number(ctx.meta.baseRoadRedundancy.missing || 0)}`);
  }

  let defenseScore = Infinity;
  for (const rp of rampartTiles) {
    let total = 0;
    for (const t of towers) total += computeTowerDamage(chebyshev(t, rp));
    defenseScore = Math.min(defenseScore, total);
  }
  if (defenseScore === Infinity) defenseScore = towerPlan.coverage.minDamage || 0;
  ctx.meta.defenseScore = defenseScore;
  if (ctx.meta.towerPlanning && ctx.meta.towerPlanning.coverage) {
    ctx.meta.towerPlanning.coverage.minBoundaryDamage = defenseScore;
  }
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

function buildHarabiFullPlanFromFoundation(room, input) {
  const {
    foundationPlan,
    matrices,
    dt,
    sources,
    controllerPos,
    candidateMeta = null,
    layoutPattern = 'cluster3',
  } = input;
  if (!room || !foundationPlan || !Array.isArray(foundationPlan.placements)) return foundationPlan;
  const defensePlanningMode = resolveDefensePlanningMode(input);

  const ctx = createPlanContext(room, matrices);
  hydrateContextFromPlacements(ctx, foundationPlan.placements);

  const foundationMeta =
    foundationPlan && foundationPlan.meta && typeof foundationPlan.meta === 'object'
      ? foundationPlan.meta
      : {};
  ctx.meta.upgraderSlots = cloneSerializable(foundationMeta.upgraderSlots || []);
  ctx.meta.spawnExits = cloneSerializable(foundationMeta.spawnExits || []);
  ctx.meta.stampStats = cloneSerializable(foundationMeta.stampStats || ctx.meta.stampStats);
  ctx.meta.sourceLogistics = cloneSerializable(foundationMeta.sourceLogistics || {});
  ctx.meta.foundationDebug = cloneSerializable(foundationMeta.foundationDebug || {});
  ctx.meta.sourceResourceDebug = cloneSerializable(foundationMeta.sourceResourceDebug || {});
  ctx.meta.logisticsRoutes = cloneSerializable(foundationMeta.logisticsRoutes || {});
  ctx.meta.labPlanning = cloneSerializable(foundationMeta.labPlanning || ctx.meta.labPlanning);
  ctx.meta.structurePlanning = cloneSerializable(
    foundationMeta.structurePlanning || ctx.meta.structurePlanning,
  );
  ctx.meta.foundationSnapshot = cloneSerializable(
    foundationMeta.foundationSnapshot ||
      buildFoundationSnapshotMeta({
        placements: foundationPlan.placements,
        meta: foundationMeta,
        anchor: foundationPlan.anchor,
        spawnReference:
          foundationMeta &&
          foundationMeta.structurePlanning &&
          foundationMeta.structurePlanning.ranking &&
          foundationMeta.structurePlanning.ranking.spawnRef
            ? foundationMeta.structurePlanning.ranking.spawnRef
            : foundationPlan.anchor,
        coreStampCenter:
          foundationMeta &&
          foundationMeta.foundationSnapshot &&
          foundationMeta.foundationSnapshot.coreStampCenter
            ? foundationMeta.foundationSnapshot.coreStampCenter
            : foundationPlan.anchor,
      }),
  );

  const anchor =
    foundationPlan.anchor && typeof foundationPlan.anchor.x === 'number'
      ? {
          x: foundationPlan.anchor.x,
          y: foundationPlan.anchor.y,
          score:
            typeof foundationPlan.anchor.score === 'number' ? foundationPlan.anchor.score : 0,
        }
      : { x: 25, y: 25, score: 0 };
  const storage =
    ctx.placements.find((placement) => placement && placement.tag === 'core.storage') ||
    ctx.placements.find((placement) => placement && placement.type === STRUCTURES.STORAGE) ||
    anchor;
  const terminal =
    ctx.placements.find((placement) => placement && placement.tag === 'core.terminal') ||
    ctx.placements.find((placement) => placement && placement.type === STRUCTURES.TERMINAL) ||
    null;
  const sinkLink =
    ctx.placements.find((placement) => placement && placement.tag === 'link.sink') || null;
  const parity =
    Number.isFinite(foundationMeta.parity) && storage
      ? Number(foundationMeta.parity)
      : checkerboard.parityAt(storage.x, storage.y);

  const ranking = deserializeFoundationRanking(ctx.meta.structurePlanning || {});
  const orderedCandidates = Array.isArray(ranking.orderedCandidates) ? ranking.orderedCandidates : [];
  const candidateByKey = new Map(orderedCandidates.map((candidate) => [candidate.key, candidate]));
  const previewPlacements = Array.isArray(ctx.meta.structurePlanning.placements)
    ? ctx.meta.structurePlanning.placements
    : [];
  const previewSpecialTagMap = new Map([
    ['preview.factory', { type: STRUCTURES.FACTORY, tag: 'core.factory' }],
    ['preview.nuker', { type: STRUCTURES.NUKER, tag: 'core.nuker' }],
    ['preview.observer', { type: STRUCTURES.OBSERVER, tag: 'core.observer' }],
  ]);
  const previewExtensionPlacements = previewPlacements.filter(
    (placement) => placement && placement.type === STRUCTURES.EXTENSION,
  );
  const previewSpecialPlacements = previewPlacements.filter((placement) =>
    previewSpecialTagMap.has(String(placement && placement.tag ? placement.tag : '')),
  );
  const selectedByKey = new Map();
  const selectedCountsByBucket = new Map();
  const markSelectedCandidate = (tileKey, type, tag, rcl) => {
    const candidate = candidateByKey.get(tileKey) || null;
    if (!candidate || selectedByKey.has(tileKey)) return;
    const plannedRcl = Number.isFinite(rcl) ? Math.max(1, Math.trunc(Number(rcl))) : null;
    selectedByKey.set(tileKey, {
      type,
      tag,
      ...(plannedRcl !== null ? { rcl: plannedRcl } : {}),
    });
    selectedCountsByBucket.set(
      candidate.bucketId,
      Number(selectedCountsByBucket.get(candidate.bucketId) || 0) + 1,
    );
  };

  const labPlanning = ctx.meta.labPlanning || {};
  const sourceLabPositions = Array.isArray(labPlanning.sourceLabs) ? labPlanning.sourceLabs : [];
  const reactionLabPositions = Array.isArray(labPlanning.reactionLabs) ? labPlanning.reactionLabs : [];
  const labKeys = new Set();
  const reactionLabs = [];
  let sourceLab1 = null;
  let sourceLab2 = null;
  const placeFixedLab = (pos, rcl, tag) => {
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return false;
    const placed = addPlacement(ctx, STRUCTURES.LAB, pos.x, pos.y, rcl, tag);
    if (placed) labKeys.add(key(pos.x, pos.y));
    return placed;
  };
  if (sourceLabPositions[0] && placeFixedLab(sourceLabPositions[0], 6, 'lab.source.1')) {
    sourceLab1 = { x: sourceLabPositions[0].x, y: sourceLabPositions[0].y };
  }
  if (sourceLabPositions[1] && placeFixedLab(sourceLabPositions[1], 6, 'lab.source.2')) {
    sourceLab2 = { x: sourceLabPositions[1].x, y: sourceLabPositions[1].y };
  }
  for (let i = 0; i < reactionLabPositions.length; i++) {
    const pos = reactionLabPositions[i];
    const rcl = i < 1 ? 6 : i < 4 ? 7 : 8;
    if (
      placeFixedLab(pos, rcl, `lab.reaction.${reactionLabs.length + 1}`)
    ) {
      reactionLabs.push({ x: pos.x, y: pos.y });
    }
  }

  for (const preview of previewSpecialPlacements) {
    const mapping = previewSpecialTagMap.get(String(preview.tag || '')) || null;
    if (!mapping) continue;
    if (addPlacement(ctx, mapping.type, preview.x, preview.y, preview.rcl || 8, mapping.tag)) {
      markSelectedCandidate(key(preview.x, preview.y), mapping.type, mapping.tag, preview.rcl || 8);
    }
  }

  const provisionalPlacements = ctx.placements.slice();
  let provisionalExtensionCount = 0;
  for (const preview of previewExtensionPlacements) {
    const previewKey = key(preview.x, preview.y);
    if (ctx.structuresByPos.has(previewKey) || labKeys.has(previewKey)) continue;
    provisionalPlacements.push({
      type: STRUCTURES.EXTENSION,
      x: preview.x,
      y: preview.y,
      rcl:
        Number.isFinite(preview.rcl) ? Math.max(1, Math.trunc(Number(preview.rcl))) : assignExtensionRcl(provisionalExtensionCount),
      tag: `preview.extension.${provisionalExtensionCount + 1}`,
    });
    provisionalExtensionCount += 1;
    if (provisionalExtensionCount >= 60) break;
  }

  const boundaryCtx = createPlanContext(room, matrices);
  hydrateContextFromPlacements(boundaryCtx, provisionalPlacements);
  const rampartSeedCut = pickBestRampartCut(boundaryCtx, storage, {
    strategy: defensePlanningMode,
  });
  const provisionalBoundary = Array.isArray(rampartSeedCut.line) ? rampartSeedCut.line : [];
  const towerCandidateKeys = new Set([
    ...ctx.structuresByPos.keys(),
    ...labKeys,
  ]);
  const towerCandidates = orderedCandidates
    .filter((candidate) => candidate && !towerCandidateKeys.has(candidate.key))
    .map((candidate) => ({ x: candidate.x, y: candidate.y, key: candidate.key }));
  const towerPlan = planTowerPlacements(towerCandidates, provisionalBoundary, {
    maxTowers: 6,
    minSpacing: 4,
    exitDistance: matrices.exitDistance,
    storagePos: storage,
  });
  const towers = [];
  for (let i = 0; i < towerPlan.towers.length; i++) {
    const tower = towerPlan.towers[i];
    const rcl = i < 1 ? 3 : i < 2 ? 5 : 8;
    if (addPlacement(ctx, STRUCTURES.TOWER, tower.x, tower.y, rcl, `tower.${i + 1}`)) {
      towers.push({ x: tower.x, y: tower.y });
      markSelectedCandidate(key(tower.x, tower.y), STRUCTURES.TOWER, `tower.${i + 1}`, rcl);
    }
  }

  let extensionIndex = 0;
  const actualExtensionKeys = new Set();
  let retainedPreviewExtensions = 0;
  for (const preview of previewExtensionPlacements) {
    if (!preview || typeof preview.x !== 'number' || typeof preview.y !== 'number') continue;
    if (extensionIndex >= 60) break;
    const previewKey = key(preview.x, preview.y);
    if (ctx.structuresByPos.has(previewKey) || labKeys.has(previewKey)) continue;
    const previewRcl = Number.isFinite(preview.rcl)
      ? Math.max(1, Math.trunc(Number(preview.rcl)))
      : assignExtensionRcl(extensionIndex);
    if (
      addPlacement(
        ctx,
        STRUCTURES.EXTENSION,
        preview.x,
        preview.y,
        previewRcl,
        `extension.${extensionIndex + 1}`,
      )
    ) {
      actualExtensionKeys.add(previewKey);
      retainedPreviewExtensions += 1;
      markSelectedCandidate(
        previewKey,
        STRUCTURES.EXTENSION,
        `extension.${extensionIndex + 1}`,
        previewRcl,
      );
      extensionIndex += 1;
    }
  }
  for (const candidate of orderedCandidates) {
    if (!candidate || extensionIndex >= 60) break;
    if (actualExtensionKeys.has(candidate.key)) continue;
    if (ctx.structuresByPos.has(candidate.key) || labKeys.has(candidate.key)) continue;
    if (
      addPlacement(
        ctx,
        STRUCTURES.EXTENSION,
        candidate.x,
        candidate.y,
        assignExtensionRcl(extensionIndex),
        `extension.${extensionIndex + 1}`,
      )
    ) {
      actualExtensionKeys.add(candidate.key);
      markSelectedCandidate(
        candidate.key,
        STRUCTURES.EXTENSION,
        `extension.${extensionIndex + 1}`,
        assignExtensionRcl(extensionIndex),
      );
      extensionIndex += 1;
    }
  }

  const rampartMincutOptions = resolveRampartMincutBuilderOptions(input);
  let rampartMincutPlanResult = null;
  let rampartMincutAssessment = { usable: false, reason: 'not-attempted' };
  try {
    const rampartMincutPlanner = require('./planner.rampartMincut');
    if (
      rampartMincutPlanner &&
      rampartMincutPlanner._helpers &&
      typeof rampartMincutPlanner._helpers.planContextTarget === 'function'
    ) {
      rampartMincutPlanResult = rampartMincutPlanner._helpers.planContextTarget(
        ctx,
        storage,
        Object.assign({}, rampartMincutOptions, {
          roomName: room.name,
          strategy: defensePlanningMode,
          defenseCtx: buildDefenseCutContext(ctx, storage, {
            includeExitApproachTargets: false,
          }),
        }),
      );
      rampartMincutAssessment = assessRampartMincutPlanResult(rampartMincutPlanResult);
      if (rampartMincutAssessment.usable !== true) {
        rampartMincutPlanResult = null;
      }
    }
  } catch (err) {
    rampartMincutPlanResult = null;
    rampartMincutAssessment = { usable: false, reason: 'module-error' };
  }
  const fallbackRampartCut =
    rampartMincutPlanResult && rampartMincutPlanResult.ok === true
      ? null
      : pickBestRampartCut(ctx, storage, {
          strategy: defensePlanningMode,
        });
  const rampartLine =
    rampartMincutPlanResult && rampartMincutPlanResult.ok === true
      ? (Array.isArray(rampartMincutPlanResult.primaryRamparts) ? rampartMincutPlanResult.primaryRamparts : [])
      : Array.isArray(fallbackRampartCut.line)
      ? fallbackRampartCut.line
      : [];
  const desiredRampartPlacements =
    rampartMincutPlanResult && rampartMincutPlanResult.ok === true
      ? (Array.isArray(rampartMincutPlanResult.ramparts) ? rampartMincutPlanResult.ramparts : [])
      : rampartLine.map((tile) => ({
          type: STRUCTURES.RAMPART,
          x: tile.x,
          y: tile.y,
          rcl: 2,
          tag: tile.tag || 'rampart.edge',
        }));
  const dragonTeethPlacements =
    rampartMincutPlanResult && rampartMincutPlanResult.ok === true
      ? (Array.isArray(rampartMincutPlanResult.dragonTeeth) ? rampartMincutPlanResult.dragonTeeth : [])
      : [];
  const noGoZone =
    rampartMincutPlanResult && rampartMincutPlanResult.ok === true
      ? (Array.isArray(rampartMincutPlanResult.noGoZone) ? rampartMincutPlanResult.noGoZone : [])
      : [];
  const reservedDefenseKeys = new Set(
    desiredRampartPlacements
      .concat(dragonTeethPlacements)
      .filter((tile) => tile && Number.isFinite(tile.x) && Number.isFinite(tile.y))
      .map((tile) => key(tile.x, tile.y)),
  );
  let noGoRelocation = {
    attempted: 0,
    relocated: 0,
    skipped: 0,
    remaining: countStructureConflictsInZone(ctx, noGoZone),
  };
  const rampartMargin =
    rampartMincutPlanResult && rampartMincutPlanResult.ok === true
      ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.margin || 0)
      : fallbackRampartCut.margin;
  const rampartStandoff =
    rampartMincutPlanResult && rampartMincutPlanResult.ok === true
      ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.standoff || 0)
      : fallbackRampartCut.standoff;
  ctx.meta.rampartMargin = rampartMargin;
  ctx.meta.rampartStandoff = rampartStandoff;
  ctx.meta.minCut =
    rampartMincutPlanResult && rampartMincutPlanResult.ok === true
      ? cloneSerializable(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.minCut ? rampartMincutPlanResult.meta.minCut : null)
      : fallbackRampartCut.minCutMeta || { method: 'flow-mincut', margin: fallbackRampartCut.margin };
  ctx.meta.rampartPlanning = {
    objective: 'protect-core-with-mincut-v1',
    mode: defensePlanningMode,
    source: rampartMincutPlanResult && rampartMincutPlanResult.ok === true ? 'rampartMincut-module' : 'legacy-rampart-cut',
    moduleAttempted: rampartMincutAssessment.reason !== 'not-attempted',
    moduleAccepted: Boolean(rampartMincutPlanResult && rampartMincutPlanResult.ok === true),
    moduleFallbackReason:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? null
        : rampartMincutAssessment.reason,
    foundationSeeded: true,
    boundaryCount: desiredRampartPlacements.length,
    primaryBoundaryCount:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.primaryBoundaryCount || rampartLine.length)
        : rampartLine.length,
    outerBandCount:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.outerBandCount || 0)
        : 0,
    dragonToothCount:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.dragonToothCount || 0)
        : 0,
    noGoCount:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.noGoCount || 0)
        : 0,
    rampartThickness:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.rampartThickness || rampartMincutOptions.rampartThickness)
        : 1,
    noGoDepth:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.noGoDepth || rampartMincutOptions.noGoDepth)
        : 0,
    dragonTeethThickness:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.dragonTeethThickness || rampartMincutOptions.dragonTeethThickness)
        : 0,
    noGoRelocationsAttempted: Number(noGoRelocation.attempted || 0),
    noGoRelocationsApplied: Number(noGoRelocation.relocated || 0),
    noGoRelocationsRemaining: Number(noGoRelocation.remaining || 0),
    filteredBoundaryTiles:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? Number(rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.filteredTiles || 0)
        : Number(fallbackRampartCut.filteredTiles || 0),
    margin: rampartMargin,
    standoff: rampartStandoff,
    targetStandoff: RAMPART_TARGET_STANDOFF,
    minCut: ctx.meta.minCut,
    lineMetrics:
      rampartMincutPlanResult && rampartMincutPlanResult.ok === true
        ? cloneSerializable(
            rampartMincutPlanResult.meta && rampartMincutPlanResult.meta.lineMetrics
              ? rampartMincutPlanResult.meta.lineMetrics
              : null,
          )
        : ctx.meta.minCut && ctx.meta.minCut.lineMetrics
        ? cloneSerializable(ctx.meta.minCut.lineMetrics)
        : null,
    controllerProtected: false,
  };
  let addedEdgeRamparts = 0;
  const rampartTiles = desiredRampartPlacements.map((placement) => ({
    x: placement.x,
    y: placement.y,
    tag: placement.tag || null,
  }));
  const towerCoverage = computeTowerCoverageStats(rampartTiles, towers, matrices.exitDistance);
  ctx.meta.towerPlanning = {
    objective: towerPlan.objective,
    boundaryMode: defensePlanningMode,
    boundaryCount: rampartTiles.length,
    picks: towerPlan.picks,
    coverage: towerCoverage,
  };

  rebuildRoadBlockedByStructures(ctx, {
    labPlanning: { sourceLabs: [], reactionLabs: [] },
    structurePlanning: { placements: [] },
  });
  const preferredRoads = new Set(ctx.roads);
  const protectedRoads = new Set();
  let addedFullRoads = 0;
  let addedRampartRoads = 0;
  const addProtectedPath = (from, to, tag = 'road.full') => {
    if (!to) return;
    const origin =
      from ||
      pickRoadOriginFromNetwork(preferredRoads, to, storage, {
        corePenaltyRange: 2,
        corePenalty: 4,
      }) ||
      storage;
    if (!origin) return;
    const path = pathRoads(ctx, origin, to, { preferredRoads });
    for (const step of path) {
      const stepKey = key(step.x, step.y);
      preferredRoads.add(stepKey);
      protectedRoads.add(stepKey);
      if (addPlacement(ctx, STRUCTURES.ROAD, step.x, step.y, 1, tag)) {
        addedFullRoads += 1;
      }
    }
  };
  const fullRoadTargets = [
    ...(sourceLab1 ? [sourceLab1] : []),
    ...(sourceLab2 ? [sourceLab2] : []),
    ...reactionLabs,
    ...towers,
  ];
  for (const placement of ctx.placements) {
    if (
      placement &&
      (placement.tag === 'core.factory' ||
        placement.tag === 'core.observer' ||
        placement.tag === 'core.nuker' ||
        placement.tag === 'spawn.2' ||
        placement.tag === 'spawn.3')
    ) {
      fullRoadTargets.push({ x: placement.x, y: placement.y });
    }
  }
  if (Array.isArray(ctx.meta.upgraderSlots) && ctx.meta.upgraderSlots[0]) {
    fullRoadTargets.push(ctx.meta.upgraderSlots[0]);
  }
  for (const target of fullRoadTargets) {
    addProtectedPath(null, target, 'road.full');
  }
  for (const rp of rampartTiles) {
    const rpKey = key(rp.x, rp.y);
    const hadRoad = ctx.roads.has(rpKey);
    if (addPlacement(ctx, STRUCTURES.ROAD, rp.x, rp.y, 2, 'road.rampart')) {
      addedRampartRoads += 1;
    }
    if (ctx.roads.has(rpKey)) {
      preferredRoads.add(rpKey);
      protectedRoads.add(rpKey);
    } else if (hadRoad) {
      protectedRoads.add(rpKey);
    }
  }
  const pruning = pruneRoadPlacements(ctx, {
    protectedRoads,
    keepTags: [
      'road.rampart',
      'road.protected',
      'road.flow',
      'road.full',
      'road.stamp',
      'road.stampHalo',
      'road.coreStamp',
      'road.controllerStamp',
      'road.grid',
    ],
    depthByKey: new Map(
      Array.isArray(foundationPlan.analysis && foundationPlan.analysis.flood)
        ? foundationPlan.analysis.flood.map((tile) => [key(tile.x, tile.y), Number(tile.d || 0)])
        : [],
    ),
    storagePos: storage,
  });
  ctx.meta.roadPruning = pruning;
  noGoRelocation = relocatePlacementsOutOfNoGoZone(
    ctx,
    noGoZone,
    storage,
    layoutPattern,
    parity,
    orderedCandidates,
    {
      avoidKeys: reservedDefenseKeys,
      onRelocated: (previous, relocation) => {
        const previousKey = key(previous.x, previous.y);
        const relocationKey = key(relocation.x, relocation.y);
        const tracked = selectedByKey.get(previousKey);
        if (tracked) {
          selectedByKey.delete(previousKey);
          const previousCandidate = candidateByKey.get(previousKey);
          if (previousCandidate) {
            selectedCountsByBucket.set(
              previousCandidate.bucketId,
              Math.max(0, Number(selectedCountsByBucket.get(previousCandidate.bucketId) || 0) - 1),
            );
          }
        }
        const relocationCandidate = candidateByKey.get(relocationKey);
        if (relocationCandidate) {
          selectedByKey.set(relocationKey, {
            type: previous.type,
            tag: previous.tag,
            ...(Number.isFinite(previous.rcl) ? { rcl: previous.rcl } : {}),
          });
          selectedCountsByBucket.set(
            relocationCandidate.bucketId,
            Number(selectedCountsByBucket.get(relocationCandidate.bucketId) || 0) + 1,
          );
        }
      },
    },
  );
  if (ctx.meta.rampartPlanning) {
    ctx.meta.rampartPlanning.noGoRelocationsAttempted = Number(noGoRelocation.attempted || 0);
    ctx.meta.rampartPlanning.noGoRelocationsApplied = Number(noGoRelocation.relocated || 0);
    ctx.meta.rampartPlanning.noGoRelocationsRemaining = Number(noGoRelocation.remaining || 0);
  }
  rebuildRoadBlockedByStructures(ctx, {
    labPlanning: { sourceLabs: [], reactionLabs: [] },
    structurePlanning: { placements: [] },
  });
  const rampartFinalization = finalizeFullRampartPlacements(ctx, rampartLine, storage, {
    desiredRamparts: desiredRampartPlacements,
    primaryBoundary: rampartLine,
    noGoZone,
  });
  for (const tooth of dragonTeethPlacements) {
    addPlacement(ctx, STRUCTURES.WALL, tooth.x, tooth.y, tooth.rcl || 2, tooth.tag || 'wall.dragonTooth');
  }
  if (Number(rampartFinalization.ensuredBoundaryRoads || 0) > 0) {
    addedRampartRoads += Number(rampartFinalization.ensuredBoundaryRoads || 0);
  }
  if (Number(rampartFinalization.disconnectedRampartRoadsRemoved || 0) > 0) {
    addedRampartRoads = Math.max(
      0,
      addedRampartRoads - Number(rampartFinalization.disconnectedRampartRoadsRemoved || 0),
    );
  }
  const finalCorridorCount = Number(rampartFinalization.corridorCount || 0);
  const finalSupportCount = Number(rampartFinalization.supportCount || 0);
  if (ctx.meta.rampartPlanning) {
    ctx.meta.rampartPlanning.boundaryPlacedCount = Number(rampartFinalization.boundaryPlacedCount || addedEdgeRamparts);
    ctx.meta.rampartPlanning.corridorCount = finalCorridorCount;
    ctx.meta.rampartPlanning.supportCount = finalSupportCount;
    ctx.meta.rampartPlanning.disconnectedRampartRoadsRemoved =
      Number(rampartFinalization.disconnectedRampartRoadsRemoved || 0);
    ctx.meta.rampartPlanning.disconnectedCorridorsRemoved =
      Number(rampartFinalization.disconnectedCorridorsRemoved || 0);
    ctx.meta.rampartPlanning.disconnectedSupportsRemoved =
      Number(rampartFinalization.disconnectedSupportsRemoved || 0);
    ctx.meta.rampartPlanning.removedStrayCorridors =
      Number(rampartFinalization.removedStrayCorridors || 0);
    ctx.meta.rampartPlanning.removedStraySupports =
      Number(rampartFinalization.removedStraySupports || 0);
    ctx.meta.rampartPlanning.missingRoadUnderRamparts =
      Number(rampartFinalization.missingRoadUnderRamparts || 0);
    ctx.meta.rampartPlanning.accessRoadsAdded =
      Number(rampartFinalization.accessRoadsAdded || 0);
    ctx.meta.rampartPlanning.accessRoadRampartsAdded =
      Number(rampartFinalization.accessRoadRampartsAdded || 0);
    ctx.meta.rampartPlanning.skippedBoundaryRoadOverlays =
      Number(rampartFinalization.skippedBoundaryRoadOverlays || 0);
    ctx.meta.rampartPlanning.diagonalGapCount = Number(rampartFinalization.diagonalGapCount || 0);
    ctx.meta.rampartPlanning.rogueEdgeCount = Number(rampartFinalization.rogueEdgeCount || 0);
    ctx.meta.rampartPlanning.rogueCorridorCount = Number(rampartFinalization.rogueCorridorCount || 0);
    ctx.meta.rampartPlanning.rogueSupportCount = Number(rampartFinalization.rogueSupportCount || 0);
    ctx.meta.rampartPlanning.removedRogueEdgeRamparts =
      Number(rampartFinalization.removedRogueEdgeRamparts || 0);
    ctx.meta.rampartPlanning.sealed = rampartFinalization.sealed === true;
    ctx.meta.rampartPlanning.reachableProtectedCount =
      Number(rampartFinalization.reachableProtectedCount || 0);
  }

  const remainingRanking = {
    summary: cloneSerializable(ctx.meta.validStructurePositions || {}),
    orderedCandidates,
    bucketById: ranking.bucketById,
    distanceModel: ranking.distanceModel,
  };
  ctx.meta.validStructurePositions = collectValidStructurePositionsFromRanking(
    remainingRanking,
    {
      selectedByKey,
      selectedCountsByBucket,
    },
    {
      maxPositions: 2500,
      mode: 'strict-buildable-v1',
      revisit: 'full-derived-from-foundation',
    },
  );

  const previewExtensionKeys = new Set(
    previewExtensionPlacements.map((placement) => key(placement.x, placement.y)),
  );
  const displacedPreviewExtensions = [...previewExtensionKeys].filter(
    (previewKey) => !actualExtensionKeys.has(previewKey),
  ).length;
  ctx.meta.fullOptimization = {
    mode: 'foundation-derived-full-v1',
    defensePlanningMode,
    sameAnchor: true,
    sameStampClusters: true,
    foundationDistanceModel: ranking.distanceModel,
    foundationRangeMode: ranking.rangeMode,
    foundationRoadSelection: ranking.roadSelection,
    fixedSpecials: previewSpecialPlacements.map((placement) => ({
      type: previewSpecialTagMap.get(String(placement.tag || '')).type,
      x: placement.x,
      y: placement.y,
      tag: previewSpecialTagMap.get(String(placement.tag || '')).tag,
    })),
    labsApplied: {
      sourceLabs: cloneSerializable(sourceLabPositions),
      reactionLabs: cloneSerializable(reactionLabs),
    },
    towers: {
      count: towers.length,
      picks: cloneSerializable(towerPlan.picks || []),
      coverage: cloneSerializable(towerCoverage || {}),
    },
    extensions: {
      count: extensionIndex,
      retainedPreviewExtensions,
      displacedPreviewExtensions,
    },
    roads: {
      addedFullRoads,
      addedRampartRoads,
      prunedRoads: Number(pruning && pruning.removed ? pruning.removed : 0),
      totalRoads: ctx.roads.size,
    },
    ramparts: {
      edgeCount: Number(rampartFinalization.boundaryPlacedCount || addedEdgeRamparts),
      corridorCount: finalCorridorCount,
      controllerProtected: false,
      source: ctx.meta.rampartPlanning ? ctx.meta.rampartPlanning.source : 'legacy-rampart-cut',
      dragonToothCount: dragonTeethPlacements.length,
      noGoCount: noGoZone.length,
      noGoRelocationsApplied: Number(noGoRelocation.relocated || 0),
      noGoRelocationsRemaining: Number(noGoRelocation.remaining || 0),
      disconnectedRampartRoadsRemoved: Number(rampartFinalization.disconnectedRampartRoadsRemoved || 0),
      disconnectedCorridorsRemoved: Number(rampartFinalization.disconnectedCorridorsRemoved || 0),
      missingRoadUnderRamparts: Number(rampartFinalization.missingRoadUnderRamparts || 0),
      accessRoadRampartsAdded: Number(rampartFinalization.accessRoadRampartsAdded || 0),
      skippedBoundaryRoadOverlays: Number(rampartFinalization.skippedBoundaryRoadOverlays || 0),
      diagonalGapCount: Number(rampartFinalization.diagonalGapCount || 0),
      rogueEdgeCount: Number(rampartFinalization.rogueEdgeCount || 0),
      rogueCorridorCount: Number(rampartFinalization.rogueCorridorCount || 0),
      removedRogueEdgeRamparts: Number(rampartFinalization.removedRogueEdgeRamparts || 0),
      sealed: rampartFinalization.sealed === true,
      reachableProtectedCount: Number(rampartFinalization.reachableProtectedCount || 0),
      lineMetrics:
        ctx.meta.minCut && ctx.meta.minCut.lineMetrics ? cloneSerializable(ctx.meta.minCut.lineMetrics) : null,
    },
  };
  ctx.meta.foundationSnapshot = cloneSerializable(
    ctx.meta.foundationSnapshot ||
      buildFoundationSnapshotMeta({
        placements: foundationPlan.placements,
        meta: foundationMeta,
        anchor,
        spawnReference: ranking.spawnReference || anchor,
        coreStampCenter: ranking.spawnStampCenter || anchor,
      }),
  );
  ctx.meta.sourceResourceDebug = Object.assign({}, ctx.meta.sourceResourceDebug || {}, {
    foundationOnly: false,
  });
  const coreTags = new Set([
    'spawn.1',
    'spawn.2',
    'spawn.3',
    'core.storage',
    'core.terminal',
    'link.sink',
    'core.powerSpawn',
  ]);
  const corePlacements = ctx.placements.filter((placement) =>
    placement && coreTags.has(String(placement.tag || '')),
  );
  ctx.meta.foundationDebug = Object.assign({}, ctx.meta.foundationDebug || {}, {
    foundationOnly: false,
    coreStructuresPlaced: corePlacements.length,
    coreRoadsPlaced: ctx.placements.filter(
      (placement) =>
        placement &&
        placement.type === STRUCTURES.ROAD &&
        String(placement.tag || '').startsWith('road.core'),
    ).length,
    stampBigPlaced: ctx.meta.stampStats ? Number(ctx.meta.stampStats.bigPlaced || 0) : 0,
    stampSmallPlaced: ctx.meta.stampStats ? Number(ctx.meta.stampStats.smallPlaced || 0) : 0,
    roadCount: ctx.roads.size,
  });

  const preservedValidation = (Array.isArray(foundationMeta.validation) ? foundationMeta.validation : []).filter(
    (message) =>
      /^core-stamp-/.test(String(message || '')) ||
      /^controller-stamp-/.test(String(message || '')) ||
      /^missing-logistics-route:/.test(String(message || '')) ||
      /^source-road-anchor-missing:/.test(String(message || '')),
  );
  const validation = preservedValidation.slice();
  const spawns = ctx.placements.filter((placement) => placement.type === STRUCTURES.SPAWN);
  for (const spawn of spawns) {
    if (countWalkableNeighbors(ctx, spawn.x, spawn.y) < 2) {
      validation.push(`spawn-neighbor-fail:${spawn.x},${spawn.y}`);
    }
  }
  if (storage && countWalkableNeighbors(ctx, storage.x, storage.y) < 3) {
    validation.push(`storage-neighbor-fail:${storage.x},${storage.y}`);
  }
  if (terminal && storage && chebyshev(terminal, storage) > 1) {
    validation.push('terminal-range-storage-fail');
  }
  const sinkLinkAllowedRange = isHarabiPattern(layoutPattern) ? 2 : 1;
  if (sinkLink && storage && chebyshev(sinkLink, storage) > sinkLinkAllowedRange) {
    validation.push('sink-link-range-storage-fail');
  }
  const sourceContainers = sources
    .map((source) => ({
      source,
      pos: ctx.placements.find(
        (placement) =>
          placement &&
          placement.type === STRUCTURES.CONTAINER &&
          placement.tag === `source.container.${source.id}`,
      ),
    }))
    .filter((row) => row.pos);
  for (const row of sourceContainers) {
    const link = ctx.placements.find(
      (placement) => placement && placement.tag === `source.link.${row.source.id}`,
    );
    if (link && chebyshev(link, row.source.pos) > 2) {
      validation.push(`source-link-range-fail:${row.source.id}`);
    }
    if (link && chebyshev(link, row.pos) > 2) {
      validation.push(`source-link-container-range-fail:${row.source.id}`);
    }
  }
  const controllerLink = ctx.placements.find((placement) => placement && placement.tag === 'controller.link');
  if (!controllerLink) validation.push('controller-link-missing');
  if (controllerLink && chebyshev(controllerLink, controllerPos) > 2) {
    validation.push('controller-link-range-fail');
  }
  const extensions = ctx.placements.filter((placement) => placement.type === STRUCTURES.EXTENSION);
  for (const extension of extensions) {
    const candidate = candidateByKey.get(key(extension.x, extension.y)) || null;
    if (!candidate) {
      validation.push(`extension-foundation-rank-missing:${extension.x},${extension.y}`);
    }
  }
  for (const placement of ctx.placements) {
    if (placement.type !== STRUCTURES.ROAD && matrices.exitProximity[idx(placement.x, placement.y)] === 1) {
      validation.push(`exit-proximity-fail:${placement.x},${placement.y},${placement.type}`);
    }
  }
  if (sourceLab1 && sourceLab2) {
    for (const reaction of reactionLabs) {
      if (!(chebyshev(reaction, sourceLab1) <= 2 && chebyshev(reaction, sourceLab2) <= 2)) {
        validation.push(`lab-range-fail:${reaction.x},${reaction.y}`);
      }
    }
  }
  if (
    typeof ctx.meta.rampartStandoff === 'number' &&
    ctx.meta.rampartStandoff > 0 &&
    ctx.meta.rampartStandoff < RAMPART_TARGET_STANDOFF
  ) {
    validation.push(`rampart-standoff-fail:${ctx.meta.rampartStandoff}`);
  }
  const spawnDistances = [];
  for (let i = 0; i < spawns.length; i++) {
    for (let j = i + 1; j < spawns.length; j++) {
      spawnDistances.push(chebyshev(spawns[i], spawns[j]));
    }
  }
  if (spawnDistances.some((distance) => distance < 3)) {
    validation.push('spawn-spread-fail');
  }
  const containerCount = ctx.placements.filter((placement) => placement.type === STRUCTURES.CONTAINER).length;
  if (containerCount > 5) validation.push('container-count-fail');
  for (const exit of ctx.meta.spawnExits || []) {
    if (ctx.structuresByPos.has(key(exit.x, exit.y))) {
      validation.push(`spawn-exit-blocked:${exit.x},${exit.y}`);
    }
  }
  if (ctx.roads.size > 0) {
    const roadKeys = [...ctx.roads];
    const seen = new Set([roadKeys[0]]);
    const queue = [parseKey(roadKeys[0])];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      for (const next of neighbors8(current.x, current.y)) {
        const nextKey = key(next.x, next.y);
        if (!ctx.roads.has(nextKey) || seen.has(nextKey)) continue;
        seen.add(nextKey);
        queue.push(next);
      }
    }
    if (seen.size !== ctx.roads.size) {
      validation.push(`road-network-disconnected:${seen.size}/${ctx.roads.size}`);
    }
  }
  if (ctx.meta.baseRoadRedundancy && Number(ctx.meta.baseRoadRedundancy.missing || 0) > 0) {
    validation.push(`base-road-redundancy-missing:${Number(ctx.meta.baseRoadRedundancy.missing || 0)}`);
  }
  const rampartPlanning = ctx.meta && ctx.meta.rampartPlanning ? ctx.meta.rampartPlanning : {};
  if (rampartPlanning.sealed === false) {
    validation.push(`rampart-boundary-leak:${Number(rampartPlanning.reachableProtectedCount || 0)}`);
  }
  if (Number(rampartPlanning.rogueEdgeCount || 0) > 0) {
    validation.push(`rampart-rogue-edge:${Number(rampartPlanning.rogueEdgeCount || 0)}`);
  }
  if (Number(rampartPlanning.rogueCorridorCount || 0) > 0) {
    validation.push(`rampart-rogue-corridor:${Number(rampartPlanning.rogueCorridorCount || 0)}`);
  }
  if (Number(rampartPlanning.missingRoadUnderRamparts || 0) > 0) {
    validation.push(`rampart-road-missing:${Number(rampartPlanning.missingRoadUnderRamparts || 0)}`);
  }
  if (Number(rampartPlanning.diagonalGapCount || 0) > 0) {
    validation.push(`rampart-diagonal-gap:${Number(rampartPlanning.diagonalGapCount || 0)}`);
  }
  if (Number(rampartPlanning.disconnectedRampartRoadsRemoved || 0) > 0) {
    validation.push(`rampart-road-disconnected:${Number(rampartPlanning.disconnectedRampartRoadsRemoved || 0)}`);
  }
  if (Number(rampartPlanning.noGoRelocationsRemaining || 0) > 0) {
    validation.push(`rampart-nogo-conflict:${Number(rampartPlanning.noGoRelocationsRemaining || 0)}`);
  }
  let defenseScore = Infinity;
  for (const rampart of rampartTiles) {
    let damage = 0;
    for (const tower of towers) damage += computeTowerDamage(chebyshev(tower, rampart));
    defenseScore = Math.min(defenseScore, damage);
  }
  if (defenseScore === Infinity) defenseScore = towerCoverage.minDamage || 0;
  ctx.meta.defenseScore = defenseScore;
  if (ctx.meta.towerPlanning && ctx.meta.towerPlanning.coverage) {
    ctx.meta.towerPlanning.coverage.minBoundaryDamage = defenseScore;
  }
  if (defenseScore < 1500) validation.push(`defense-score-low:${defenseScore}`);
  ctx.meta.validation = validation;

  const fullFlood = floodFillAlgorithm.floodFill(walkableWithPlan(ctx), storage, { maxDepth: 12 });
  const structurePlan = new Array(2500).fill(null);
  const roadPlan = new Array(2500).fill(0);
  const rampartPlan = new Array(2500).fill(0);
  for (const placement of ctx.placements) {
    const id = idx(placement.x, placement.y);
    if (placement.type === STRUCTURES.ROAD) {
      roadPlan[id] = 1;
    } else if (placement.type === STRUCTURES.RAMPART) {
      rampartPlan[id] = 1;
    } else {
      structurePlan[id] = placement.type;
    }
  }

  return {
    roomName: room.name,
    anchor: {
      x: anchor.x,
      y: anchor.y,
      score:
        candidateMeta && typeof candidateMeta.initialScore === 'number'
          ? candidateMeta.initialScore
          : typeof anchor.score === 'number'
          ? anchor.score
          : 0,
    },
    placements: ctx.placements,
    analysis: {
      dt,
      flood: fullFlood.map((tile) => ({ x: tile.x, y: tile.y, d: tile.d })),
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
      harabiStage: 'full',
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
        candidateMeta && candidateMeta.initialMetrics ? candidateMeta.initialMetrics : {},
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
  const removeDisconnected = options.removeDisconnected !== false;
  const storagePos = options.storagePos || null;

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
  const connectedRoadKeys =
    removeDisconnected && storagePos ? buildMainRoadComponentKeys(ctx, storagePos) : new Set();
  for (const road of candidates) {
    const rk = key(road.x, road.y);
    if (connectedRoadKeys.size > 0 && !connectedRoadKeys.has(rk)) {
      removeKeys.add(rk);
      continue;
    }
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
  const boundaryRamparts = buildRampartCoverageTargets(placements);
  const roads = placements.filter((p) => p.type === STRUCTURES.ROAD);
  const extensions = placements.filter((p) => p.type === STRUCTURES.EXTENSION);
  const terrainAt = createTerrainAccessor(roomName);

  const pathCost = makePathCostHelper(roomName);

  const extDists = extensions.map((e) => (storage ? chebyshev(e, storage) : 25));
  const avgExtDist = extDists.length ? mean(extDists) : 25;
  const maxExtDist = extDists.length ? Math.max(...extDists) : 40;

  const towerCoverage = computeTowerCoverageStats(
    boundaryRamparts,
    towers,
    plan && plan.analysis ? plan.analysis.exitDistance : null,
  );
  const minTowerDamage = towerCoverage.minDamage;

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
  const baseLogisticsCoverage =
    logistics && logistics.required > 0
      ? clamp01((logistics.connected || 0) / logistics.required)
      : 1;
  const baseRoadRedundancy =
    plan && plan.meta && plan.meta.baseRoadRedundancy ? plan.meta.baseRoadRedundancy : null;
  const redundancyCoverage =
    baseRoadRedundancy && Number(baseRoadRedundancy.attempted || 0) > 0
      ? clamp01(
          Math.max(
            0,
            Number(baseRoadRedundancy.connected || 0) - Number(baseRoadRedundancy.missing || 0),
          ) / Number(baseRoadRedundancy.attempted || 1),
        )
      : 1;
  const logisticsCoverage = Math.min(baseLogisticsCoverage, redundancyCoverage);
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
    p25TowerDamage: towerCoverage.p25Damage,
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
    baseRoadRedundancyCoverage: redundancyCoverage,
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
    rangedBuffer: clamp01(((metrics.rangedBuffer || 0) - RAMPART_TARGET_STANDOFF) / 4),
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
  const sources = findFirstNonEmpty(room, [findSourcesConst(), 'FIND_SOURCES', 1]);
  const minerals = findFirstNonEmpty(room, [findMineralsConst(), 'FIND_MINERALS']);
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

  const layoutPattern = resolveLayoutPattern(options);
  const harabiStage = resolveHarabiStage(options);
  const defensePlanningMode = resolveDefensePlanningMode(options);
  const candidateMeta = options.candidateMeta || anchorInput;
  const foundationInput = {
    anchor,
    matrices,
    dt,
    sources,
    mineral,
    controllerPos,
    candidateMeta,
    layoutPattern,
    harabiStage: 'foundation',
    mutation: mutationOptions,
  };
  const plan =
    isHarabiPattern(layoutPattern) && harabiStage === 'full'
      // Harabi full now derives from the stabilized foundation snapshot so the
      // winning anchor/stamp body stays fixed and only late structures/defense
      // are re-optimized inside that frozen footprint.
      ? buildHarabiFullPlanFromFoundation(room, {
          foundationPlan: buildPlanForAnchor(room, foundationInput),
          matrices,
          dt,
          sources,
          mineral,
          controllerPos,
          candidateMeta,
          layoutPattern,
          defensePlanningMode,
        })
      : buildPlanForAnchor(room, {
          anchor,
          matrices,
          dt,
          sources,
          mineral,
          controllerPos,
          candidateMeta,
          layoutPattern,
          harabiStage,
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
    layoutPattern: options.layoutPattern || options.extensionPattern,
    extensionPattern: options.extensionPattern,
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
    analyzeRampartEnclosure,
    assignExtensionRcl,
    buildDefenseCutContext,
    buildExitApproachTargets,
    canPlaceStructure,
    pickBestRampartCut,
    canonicalizeRampartBoundaryTiles,
    collectHarabiStampCapacityKeys,
    connectDisconnectedBaseRoadComponents,
    ensureBoundaryRoadSupports,
    finalizeFullRampartPlacements,
    floodFill: floodFillAlgorithm.floodFill,
    buildMainRoadComponentKeys,
    buildMainRoadSeedKeys,
    buildRampartCoverageTargets,
    computeTowerDamage,
    computeTowerCoverageStats,
    countStructureConflictsInZone,
    buildTerrainMatrices,
    buildConnectedRoadKeys,
    buildFoundationPreviewRanking,
    computeStaticBlockedMatrix,
    computeLocalTransitPenalty,
    computeRampartInteriorMetrics,
    isSourceRoadAnchored,
    isRelocatableNoGoPlacement,
    evaluateHarabiStampSlots,
    getHarabiStampPlacementSlots,
    pickRoadOriginFromNetwork,
    planTowerPlacements,
    planFoundationStructurePreview,
    pruneRedundantBoundaryBlips,
    pruneRoadPlacements,
    pruneStrayInnerRamparts,
    pruneDisconnectedRampartRoadPlacements,
    relocatePlacementsOutOfNoGoZone,
    resolveRampartMincutBuilderOptions,
    rankFoundationSelectableCandidates,
    scoreRampartLineCandidate,
    scoreCandidate,
    scoreSourceLinkCandidate,
    addRampartsOnRoadsInNoGoZone,
    detectCandidateDtThreshold,
  },
};
