/**
 * Generic flood fill / weighted flood helper for planner-style 50x50 grids.
 * Supports plain BFS (default) and optional weighted expansion (Dijkstra-style)
 * to model swamp-heavy routing pressure during placement.
 * @codex-owner layoutPlanner
 */

function inBounds(x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function idx(x, y) {
  return y * 50 + x;
}

function makeNeighborList(diagonal = true) {
  const dirs = diagonal
    ? [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1],
      ]
    : [
        [0, -1],
        [-1, 0], [1, 0],
        [0, 1],
      ];
  return dirs;
}

function floodFill(walkableMatrix, start, options = {}) {
  if (!start || !inBounds(start.x, start.y)) return [];

  const maxDepth = typeof options.maxDepth === 'number' ? Math.max(0, options.maxDepth) : 50;
  const maxCost = typeof options.maxCost === 'number' ? Math.max(0, options.maxCost) : Infinity;
  const diagonal = options.diagonal !== false;
  const weighted = Boolean(options.weighted);

  const isWalkable =
    typeof options.isWalkable === 'function'
      ? options.isWalkable
      : (x, y) => Array.isArray(walkableMatrix) && walkableMatrix[idx(x, y)] === 1;

  const terrainMatrix = Array.isArray(options.terrainMatrix) ? options.terrainMatrix : null;
  const terrainCost =
    typeof options.terrainCost === 'function'
      ? options.terrainCost
      : (x, y) => {
          if (!terrainMatrix) return 1;
          const t = terrainMatrix[idx(x, y)] || 0;
          if (t === 2) return 999; // wall-like
          if (t === 1) return 5; // swamp
          return 1;
        };

  const out = [];
  const neighbors = makeNeighborList(diagonal);

  if (!weighted) {
    const seen = new Set([`${start.x}:${start.y}`]);
    const q = [{ x: start.x, y: start.y, d: 0, cost: 0 }];

    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      out.push(cur);
      if (cur.d >= maxDepth || cur.cost > maxCost) continue;
      for (const [dx, dy] of neighbors) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!inBounds(nx, ny) || !isWalkable(nx, ny)) continue;
        const k = `${nx}:${ny}`;
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ x: nx, y: ny, d: cur.d + 1, cost: cur.cost + 1 });
      }
    }
    return out;
  }

  // Weighted variant: Dijkstra-like expansion over grid.
  const bestCost = new Map();
  const queue = [{ x: start.x, y: start.y, d: 0, cost: 0 }];
  bestCost.set(`${start.x}:${start.y}`, 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost || a.d - b.d);
    const cur = queue.shift();
    const key = `${cur.x}:${cur.y}`;
    if (cur.cost !== bestCost.get(key)) continue;
    if (cur.d > maxDepth || cur.cost > maxCost) continue;
    out.push(cur);

    for (const [dx, dy] of neighbors) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny) || !isWalkable(nx, ny)) continue;
      const stepCost = Math.max(1, Number(terrainCost(nx, ny) || 1));
      const nextCost = cur.cost + stepCost;
      const nextDepth = cur.d + 1;
      if (nextDepth > maxDepth || nextCost > maxCost) continue;
      const nk = `${nx}:${ny}`;
      const known = bestCost.get(nk);
      if (known !== undefined && known <= nextCost) continue;
      bestCost.set(nk, nextCost);
      queue.push({ x: nx, y: ny, d: nextDepth, cost: nextCost });
    }
  }

  return out;
}

module.exports = {
  floodFill,
};
