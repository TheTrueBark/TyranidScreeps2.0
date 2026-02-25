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
    reserved: new Set(),
    structuresByPos: new Map(),
    matrices,
    meta: {
      upgraderSlots: [],
      validation: [],
      defenseScore: 0,
      spawnExits: [],
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
    if (!options.allowOnBlocked && !isTileWalkableForPlacement(ctx, x, y)) return false;
  } else {
    if (ctx.matrices.walkableMatrix[id] !== 1) return false;
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
  if (type === STRUCTURES.ROAD && ctx.structuresByPos.has(k)) return false;
  ctx.placements.push({ type, x, y, rcl, tag });
  if (type === STRUCTURES.ROAD) {
    ctx.roads.add(k);
  } else if (type === STRUCTURES.RAMPART) {
    ctx.ramparts.add(k);
  } else {
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

function pathRoads(ctx, from, to, options = {}) {
  if (!from || !to || typeof PathFinder === 'undefined' || typeof PathFinder.search !== 'function') {
    return [];
  }
  if (typeof RoomPosition === 'undefined') return [];
  const preferredRoads = options.preferredRoads || null;
  const avoidKeys = options.avoidKeys || null;
  const avoidPenalty = Number.isFinite(options.avoidPenalty) ? options.avoidPenalty : 15;

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
  const targetStandoff = 2;
  let best = null;
  for (let margin = 2; margin <= 6; margin++) {
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
  const { anchor, matrices, dt, sources, mineral, controllerPos, candidateMeta = null } = input;
  const ctx = createPlanContext(room, matrices);

  // Storage near anchor (range 1), needs high access.
  const storageCandidates = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (!canPlaceStructure(ctx, STRUCTURES.STORAGE, x, y)) continue;
      storageCandidates.push({ x, y });
    }
  }
  const storage =
    findBestByCandidates(storageCandidates, (p) => {
      const n = countWalkableNeighbors(ctx, p.x, p.y);
      const dtv = dt[idx(p.x, p.y)] || 0;
      const plainBonus = matrices.terrainMatrix[idx(p.x, p.y)] === 0 ? 1 : 0;
      if (n < 3 || dtv < 2) return -99999;
      return -chebyshev(p, anchor) + 3 * n + 2 * dtv + plainBonus;
    }) || anchor;
  addPlacement(ctx, STRUCTURES.STORAGE, storage.x, storage.y, 4, 'core.storage');

  // Spawn #1 near anchor/storage, needs 2 exits.
  const spawn1Candidates = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (!canPlaceStructure(ctx, STRUCTURES.SPAWN, x, y)) continue;
      spawn1Candidates.push({ x, y });
    }
  }
  const spawn1 = findBestByCandidates(spawn1Candidates, (p) => {
    const n = countWalkableNeighbors(ctx, p.x, p.y);
    const plainBonus = matrices.terrainMatrix[idx(p.x, p.y)] === 0 ? 1 : 0;
    if (n < 2) return -99999;
    return -chebyshev(p, anchor) + 2 * n + plainBonus;
  });
  if (spawn1) addPlacement(ctx, STRUCTURES.SPAWN, spawn1.x, spawn1.y, 1, 'spawn.1');
  if (spawn1 && sources.length > 0) {
    const nearestSource = sources
      .map((s) => ({ s, d: chebyshev(spawn1, s.pos) }))
      .sort((a, b) => a.d - b.d)[0].s;
    const exitCandidates = neighbors8(spawn1.x, spawn1.y)
      .filter((p) => isTileWalkableForPlacement(ctx, p.x, p.y))
      .filter((p) => !ctx.structuresByPos.has(key(p.x, p.y)))
      .sort((a, b) => chebyshev(a, nearestSource.pos) - chebyshev(b, nearestSource.pos));
    if (exitCandidates[0]) {
      reserveTile(ctx, exitCandidates[0].x, exitCandidates[0].y, 'spawn.1.exit');
    }
  }

  // Source containers + links.
  const sourceContainers = [];
  for (const src of sources) {
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

    const linkCandidates = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const p = { x: src.pos.x + dx, y: src.pos.y + dy };
        if (chebyshev(p, src.pos) > 2) continue;
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
    const slink = findBestByCandidates(workingLinkCandidates, (p) => {
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
        sourceContainers.length === 1 ? 5 : 7,
        `source.link.${src.id}`,
      );
    }
  }

  // Upgrader area + controller container/link.
  const upgraderSlots = buildUpgraderArea(ctx, controllerPos, storage);
  if (upgraderSlots) {
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
    if (ctrlLink) addPlacement(ctx, STRUCTURES.LINK, ctrlLink.x, ctrlLink.y, 6, 'controller.link');
  }

  // Terminal (range 1 to storage) and sink link (range 1 storage).
  const aroundStorage = neighbors8(storage.x, storage.y).filter((p) =>
    canPlaceStructure(ctx, STRUCTURES.TERMINAL, p.x, p.y),
  );
  const terminal = findBestByCandidates(aroundStorage, (p) => {
    const n = countWalkableNeighbors(ctx, p.x, p.y);
    return n;
  });
  if (terminal) addPlacement(ctx, STRUCTURES.TERMINAL, terminal.x, terminal.y, 6, 'core.terminal');

  const sinkCandidates = neighbors8(storage.x, storage.y).filter((p) =>
    canPlaceStructure(ctx, STRUCTURES.LINK, p.x, p.y),
  );
  const sinkLink = findBestByCandidates(sinkCandidates, (p) => {
    if (terminal && p.x === terminal.x && p.y === terminal.y) return -99999;
    return countWalkableNeighbors(ctx, p.x, p.y);
  });
  if (sinkLink) addPlacement(ctx, STRUCTURES.LINK, sinkLink.x, sinkLink.y, 5, 'link.sink');

  // Extension field: checkerboard from storage flood, <= 10 BFS.
  const parity = checkerboard.parityAt(storage.x, storage.y);
  const floodFromStorage = floodFillAlgorithm.floodFill(walkableWithPlan(ctx), storage, { maxDepth: 12 });
  let extIdx = 0;
  for (const node of floodFromStorage.sort((a, b) => a.d - b.d)) {
    if (extIdx >= 60) break;
    if (node.d > 10) continue;
    if (checkerboard.classifyTile(node.x, node.y, parity) !== 'structure') continue;
    if (!canPlaceStructure(ctx, STRUCTURES.EXTENSION, node.x, node.y)) continue;
    addPlacement(
      ctx,
      STRUCTURES.EXTENSION,
      node.x,
      node.y,
      assignExtensionRcl(extIdx),
      `extension.${extIdx + 1}`,
    );
    extIdx += 1;
  }

  // Labs: no fixed stamp; choose two source labs then overlap region.
  let sourceLab1 = null;
  let sourceLab2 = null;
  const terminalRef = terminal || storage;
  const lab1Candidates = floodFromStorage
    .filter((n) => n.d <= 8)
    .filter((n) => canPlaceStructure(ctx, STRUCTURES.LAB, n.x, n.y))
    .filter((n) => chebyshev(n, terminalRef) <= 5);
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

  const reactionLabs = [];
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

  // Rampart line proxy + ramparts over critical structures + controller ring.
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
  const rampartTiles = ctx.placements
    .filter((p) => p.type === STRUCTURES.RAMPART)
    .map((p) => ({ x: p.x, y: p.y }));
  const towers = [];
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

  // Spawn #2/#3 with spread and storage proximity.
  const spawnCandidates = floodFromStorage
    .filter((n) => canPlaceStructure(ctx, STRUCTURES.SPAWN, n.x, n.y))
    .filter((n) => chebyshev(n, storage) <= 6);
  const spawn2 = findBestByCandidates(spawnCandidates, (p) => {
    if (!spawn1) return -99999;
    const d1 = chebyshev(p, spawn1);
    const n = countWalkableNeighbors(ctx, p.x, p.y);
    if (d1 < 3 || n < 2) return -99999;
    return -2 * Math.abs(chebyshev(p, storage) - 3) + 3 + 2 * n;
  });
  if (spawn2) addPlacement(ctx, STRUCTURES.SPAWN, spawn2.x, spawn2.y, 7, 'spawn.2');

  const spawn3 = findBestByCandidates(spawnCandidates, (p) => {
    if (!spawn1 || !spawn2) return -99999;
    const d1 = chebyshev(p, spawn1);
    const d2 = chebyshev(p, spawn2);
    const n = countWalkableNeighbors(ctx, p.x, p.y);
    if (d1 < 3 || d2 < 3 || n < 2) return -99999;
    return -Math.abs(chebyshev(p, storage) - 4) + d1 + d2 + n;
  });
  if (spawn3) addPlacement(ctx, STRUCTURES.SPAWN, spawn3.x, spawn3.y, 8, 'spawn.3');

  // Factory / PowerSpawn / Nuker / Observer.
  const placeNearStorage = (type, maxRange, rcl, tag) => {
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

  // Roads: highest-traffic paths first + checkerboard interior + rampart line roads.
  const traffic = new Map();
  const touchTraffic = (p, weight) => {
    const k = key(p.x, p.y);
    traffic.set(k, (traffic.get(k) || 0) + weight);
  };
  const protectedRoads = new Set();
  const preferredRoads = new Set();
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
  if (controllerContainer) {
    logisticTargets.push({
      id: 'controller.container',
      pos: { x: controllerContainer.x, y: controllerContainer.y },
      weight: 6,
      protect: true,
      avoidSourceContainers: true,
    });
  } else if (upgraderSlots && upgraderSlots.length > 0) {
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
  logisticTargets.sort((a, b) => manhattan(storage, a.pos) - manhattan(storage, b.pos));
  let connectedLogistics = 0;
  const missingLogistics = [];
  for (const target of logisticTargets) {
    const avoidKeys = target.avoidSourceContainers ? new Set(sourceContainerKeys) : null;
    if (avoidKeys) avoidKeys.delete(key(target.pos.x, target.pos.y));
    let path = pathRoads(ctx, storage, target.pos, {
      preferredRoads,
      avoidKeys,
      avoidPenalty: 25,
    });
    if (!path.length && avoidKeys) {
      path = pathRoads(ctx, storage, target.pos, { preferredRoads });
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
  if (upgraderSlots && upgraderSlots.length > 0) {
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
    if (checkerboard.classifyTile(n.x, n.y, parity) === 'structure') continue;
    addPlacement(ctx, STRUCTURES.ROAD, n.x, n.y, 1, 'road.grid');
  }
  for (const rp of rampartTiles) {
    addPlacement(ctx, STRUCTURES.ROAD, rp.x, rp.y, 2, 'road.rampart');
  }

  const pruning = pruneRoadPlacements(ctx, {
    protectedRoads,
    keepTags: ['road.rampart', 'road.protected'],
    depthByKey: floodDepthByTile,
  });
  ctx.meta.roadPruning = pruning;

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
  if (ctrlLink && chebyshev(ctrlLink, controllerPos) > 2) {
    ctx.meta.validation.push('controller-link-range-fail');
  }

  const exts = ctx.placements.filter((p) => p.type === STRUCTURES.EXTENSION);
  const storageFlood = computeDistanceMap(walkableWithPlan(ctx), storage);
  for (const e of exts) {
    if (!checkerboard.sameParity(e, storage)) ctx.meta.validation.push(`extension-parity-fail:${e.x},${e.y}`);
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

  if (typeof ctx.meta.rampartStandoff === 'number' && ctx.meta.rampartStandoff > 0 && ctx.meta.rampartStandoff < 2) {
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



function structurePriority(type) {
  if (type === STRUCTURES.SPAWN || type === STRUCTURES.EXTENSION || type === STRUCTURES.STORAGE) return 1;
  if (type === STRUCTURES.TOWER || type === STRUCTURES.LINK || type === STRUCTURES.TERMINAL) return 2;
  if (type === STRUCTURES.CONTAINER || type === STRUCTURES.RAMPART || type === STRUCTURES.ROAD) return 3;
  return 4;
}

function buildQueueFromPlan(plan) {
  if (!plan || !Array.isArray(plan.placements)) return [];
  const spawn = plan.placements.find((p) => p.type === STRUCTURES.SPAWN) || { x: 25, y: 25 };
  const queue = plan.placements.map((placement, i) => ({
    type: placement.type,
    pos: { x: placement.x, y: placement.y },
    rcl: placement.rcl || 1,
    priority: structurePriority(placement.type),
    built: false,
    tag: placement.tag || null,
    sequence: i,
  }));

  queue.sort((a, b) => {
    if (a.rcl !== b.rcl) return a.rcl - b.rcl;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ad = Math.max(Math.abs(a.pos.x - spawn.x), Math.abs(a.pos.y - spawn.y));
    const bd = Math.max(Math.abs(b.pos.x - spawn.x), Math.abs(b.pos.y - spawn.y));
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

  const plan = buildPlanForAnchor(room, {
    anchor,
    matrices,
    dt,
    sources,
    mineral,
    controllerPos,
    candidateMeta: options.candidateMeta || anchorInput,
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
