/**
 * Generic flood fill helper for planner-style 50x50 grids.
 * @codex-owner layoutPlanner
 */

function inBounds(x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function floodFill(walkableMatrix, start, options = {}) {
  if (!start || !inBounds(start.x, start.y)) return [];
  const maxDepth = typeof options.maxDepth === 'number' ? Math.max(0, options.maxDepth) : 50;
  const idx = (x, y) => y * 50 + x;
  const isWalkable =
    typeof options.isWalkable === 'function'
      ? options.isWalkable
      : (x, y) => Array.isArray(walkableMatrix) && walkableMatrix[idx(x, y)] === 1;

  const out = [];
  const seen = new Set([`${start.x}:${start.y}`]);
  const q = [{ x: start.x, y: start.y, d: 0 }];

  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    out.push(cur);
    if (cur.d >= maxDepth) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!inBounds(nx, ny) || !isWalkable(nx, ny)) continue;
        const k = `${nx}:${ny}`;
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ x: nx, y: ny, d: cur.d + 1 });
      }
    }
  }

  return out;
}

module.exports = {
  floodFill,
};
