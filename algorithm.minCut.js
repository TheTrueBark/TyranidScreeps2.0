/**
 * Lightweight min-cut style rampart candidate extractor.
 * Uses perimeter candidates around core bbox and prefers tiles with
 * higher exit distance / lower terrain penalty.
 * @codex-owner layoutPlanner
 */

function parseKey(id) {
  const [x, y] = String(id).split(':').map(Number);
  return { x, y };
}

function idx(x, y) {
  return y * 50 + x;
}

function inBounds(x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function computeRampartCut(ctx, options = {}) {
  if (!ctx || !ctx.structuresByPos || typeof ctx.structuresByPos.keys !== 'function') {
    return { line: [], meta: { method: 'proxy-mincut', margin: 0, candidates: 0 } };
  }

  const points = [...ctx.structuresByPos.keys()].map(parseKey);
  if (!points.length) {
    return { line: [], meta: { method: 'proxy-mincut', margin: 0, candidates: 0 } };
  }

  const margin = Math.max(2, Math.min(10, Number(options.margin) || 4));
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

  const line = [];
  const seen = new Set();
  const add = (x, y) => {
    if (!inBounds(x, y)) return;
    const k = `${x}:${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    const id = idx(x, y);
    const walkable = !ctx.matrices || !ctx.matrices.walkableMatrix || ctx.matrices.walkableMatrix[id] === 1;
    if (!walkable) return;
    const terrain = ctx.matrices && ctx.matrices.terrainMatrix ? ctx.matrices.terrainMatrix[id] || 0 : 0;
    const exitDist = ctx.matrices && ctx.matrices.exitDistance ? Math.max(0, ctx.matrices.exitDistance[id] || 0) : 0;
    const terrainPenalty = terrain === 2 ? 99 : terrain === 1 ? 2 : 1;
    const score = exitDist * 2 - terrainPenalty;
    line.push({ x, y, score });
  };

  for (let x = minX; x <= maxX; x++) {
    add(x, minY);
    add(x, maxY);
  }
  for (let y = minY + 1; y <= maxY - 1; y++) {
    add(minX, y);
    add(maxX, y);
  }

  line.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);

  return {
    line: line.map((p) => ({ x: p.x, y: p.y })),
    meta: {
      method: 'proxy-mincut',
      margin,
      candidates: line.length,
      bbox: { minX, minY, maxX, maxY },
    },
  };
}

module.exports = {
  computeRampartCut,
};
