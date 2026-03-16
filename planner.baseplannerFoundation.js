/** @codex-owner layoutPlanner */
const distanceTransform = require('./algorithm.distanceTransform');

const TERRAIN_WALL_MASK = typeof TERRAIN_MASK_WALL !== 'undefined' ? TERRAIN_MASK_WALL : 1;
const TERRAIN_SWAMP_MASK = typeof TERRAIN_MASK_SWAMP !== 'undefined' ? TERRAIN_MASK_SWAMP : 2;

function inBounds(x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function idx(x, y) {
  return y * 50 + x;
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function neighbors8(x, y) {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function neighbors4(x, y) {
  const out = [];
  if (x > 0) out.push({ x: x - 1, y });
  if (x < 49) out.push({ x: x + 1, y });
  if (y > 0) out.push({ x, y: y - 1 });
  if (y < 49) out.push({ x, y: y + 1 });
  return out;
}

/**
 * Build room terrain, walkability and exit-distance matrices.
 *
 * Phase-1 foundation from Baseplanner paper:
 * - utility math helpers
 * - terrain preprocessing
 * - exit tile distance propagation
 */
function buildTerrainMatrices(room) {
  const terrain = room.getTerrain();
  const terrainMatrix = new Array(2500).fill(0); // 0 plain, 1 swamp, 2 wall
  const walkableMatrix = new Array(2500).fill(1); // 1 walkable, 0 blocked
  const edgeExits = [];

  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      const id = idx(x, y);
      const t = terrain.get(x, y);
      if (t === TERRAIN_WALL_MASK) {
        terrainMatrix[id] = 2;
        walkableMatrix[id] = 0;
      } else if (t === TERRAIN_SWAMP_MASK) {
        terrainMatrix[id] = 1;
      } else {
        terrainMatrix[id] = 0;
      }

      if (walkableMatrix[id] === 1 && (x === 0 || x === 49 || y === 0 || y === 49)) {
        edgeExits.push({ x, y });
      }
    }
  }

  const exitProximity = new Array(2500).fill(0);
  for (const ex of edgeExits) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = ex.x + dx;
        const y = ex.y + dy;
        if (!inBounds(x, y)) continue;
        exitProximity[idx(x, y)] = 1;
      }
    }
  }

  const exitDistance = new Array(2500).fill(-1);
  const q = edgeExits.map((p) => ({ x: p.x, y: p.y }));
  for (const p of q) exitDistance[idx(p.x, p.y)] = 0;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const base = exitDistance[idx(cur.x, cur.y)];
    for (const n of neighbors8(cur.x, cur.y)) {
      const nid = idx(n.x, n.y);
      if (walkableMatrix[nid] === 0 || exitDistance[nid] !== -1) continue;
      exitDistance[nid] = base + 1;
      q.push(n);
    }
  }

  return { terrainMatrix, walkableMatrix, exitDistance, exitProximity, edgeExits };
}

function ensureDistanceTransform(room) {
  if (!room.memory) room.memory = {};
  const shouldUseStaticFallback =
    Array.isArray(room.memory.distanceTransform) && room.memory.distanceTransform.length === 0;
  if (!Array.isArray(room.memory.distanceTransform) || room.memory.distanceTransform.length !== 2500) {
    if (!shouldUseStaticFallback) {
      distanceTransform.distanceTransform(room);
    }
  }
  const dt = Array.isArray(room.memory.distanceTransform) ? room.memory.distanceTransform.slice() : [];
  if (dt.length !== 2500) {
    const fallback = new Array(2500).fill(0);
    for (let y = 0; y <= 49; y++) {
      for (let x = 0; x <= 49; x++) {
        fallback[idx(x, y)] = room.getTerrain().get(x, y) === TERRAIN_WALL_MASK ? 0 : 2;
      }
    }
    return fallback;
  }
  return dt;
}

module.exports = {
  inBounds,
  idx,
  chebyshev,
  manhattan,
  clamp01,
  mean,
  neighbors4,
  neighbors8,
  buildTerrainMatrices,
  ensureDistanceTransform,
};
