/**
 * Flow-based minimum vertex cut extractor for planner rampart candidates.
 * Uses node-splitting (vin->vout capacity) + Dinic max-flow between
 * protected interior tiles and room exits.
 * @codex-owner layoutPlanner
 */

const INF = 1000000000;

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

function isBorder(x, y) {
  return x === 0 || x === 49 || y === 0 || y === 49;
}

function terrainCost(terrain) {
  if (terrain === 2) return INF; // wall / non-cuttable
  if (terrain === 1) return 6; // swamp
  return 2; // plain
}

function addEdge(graph, from, to, cap) {
  graph[from].push({ to, rev: graph[to].length, cap });
  graph[to].push({ to: from, rev: graph[from].length - 1, cap: 0 });
}

function bfsLevel(graph, source, sink, level) {
  level.fill(-1);
  const q = [source];
  level[source] = 0;
  for (let i = 0; i < q.length; i++) {
    const v = q[i];
    for (const e of graph[v]) {
      if (e.cap <= 0 || level[e.to] >= 0) continue;
      level[e.to] = level[v] + 1;
      q.push(e.to);
    }
  }
  return level[sink] >= 0;
}

function dfsFlow(graph, v, sink, pushed, level, it) {
  if (pushed === 0) return 0;
  if (v === sink) return pushed;
  for (; it[v] < graph[v].length; it[v]++) {
    const e = graph[v][it[v]];
    if (e.cap <= 0 || level[e.to] !== level[v] + 1) continue;
    const flow = dfsFlow(graph, e.to, sink, Math.min(pushed, e.cap), level, it);
    if (flow <= 0) continue;
    e.cap -= flow;
    graph[e.to][e.rev].cap += flow;
    return flow;
  }
  return 0;
}

function dinicMaxFlow(graph, source, sink, maxIterations = 200000) {
  const level = new Array(graph.length).fill(-1);
  const it = new Array(graph.length).fill(0);
  let flow = 0;
  let iterations = 0;

  while (bfsLevel(graph, source, sink, level)) {
    it.fill(0);
    while (iterations < maxIterations) {
      const pushed = dfsFlow(graph, source, sink, INF, level, it);
      if (!pushed) break;
      flow += pushed;
      iterations += 1;
    }
    if (iterations >= maxIterations) break;
  }

  return { flow, iterations, saturated: iterations >= maxIterations };
}

function residualReachable(graph, source) {
  const seen = new Set([source]);
  const q = [source];
  for (let i = 0; i < q.length; i++) {
    const v = q[i];
    for (const e of graph[v]) {
      if (e.cap <= 0 || seen.has(e.to)) continue;
      seen.add(e.to);
      q.push(e.to);
    }
  }
  return seen;
}

function connectedComponents(points) {
  const pointById = new Array(2500);
  for (const point of points) {
    if (!point || !inBounds(point.x, point.y)) continue;
    pointById[idx(point.x, point.y)] = point;
  }
  const seen = new Uint8Array(2500);
  const components = [];

  for (const p of points) {
    if (!p || !inBounds(p.x, p.y)) continue;
    const startId = idx(p.x, p.y);
    if (!pointById[startId] || seen[startId] === 1) continue;
    const comp = [];
    const q = [startId];
    seen[startId] = 1;
    for (let i = 0; i < q.length; i++) {
      const curId = q[i];
      const cur = pointById[curId];
      if (!cur) continue;
      comp.push(cur);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (!inBounds(nx, ny)) continue;
          const neighborId = idx(nx, ny);
          if (!pointById[neighborId] || seen[neighborId] === 1) continue;
          seen[neighborId] = 1;
          q.push(neighborId);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

function connectBarrier(line, walkable, terrain) {
  if (!Array.isArray(line) || line.length <= 1) {
    return { line: Array.isArray(line) ? line : [], bridged: 0, components: line.length ? 1 : 0 };
  }
  const maxConnectCandidates = 220;
  if (line.length > maxConnectCandidates) {
    // Bridging is optional smoothing; skip it for very large cuts to avoid CPU timeouts.
    return { line, bridged: 0, components: connectedComponents(line).length, skipped: 'candidate-cap' };
  }
  const hasCpu =
    typeof Game !== 'undefined' &&
    Game &&
    Game.cpu &&
    typeof Game.cpu.getUsed === 'function';
  const startCpu = hasCpu ? Game.cpu.getUsed() : 0;
  const connectCpuBudget = 8;

  const byKey = new Set(line.map((p) => `${p.x}:${p.y}`));
  let components = connectedComponents(line);
  let bridged = 0;

  while (components.length > 1 && bridged < 32) {
    if (hasCpu && Game.cpu.getUsed() - startCpu >= connectCpuBudget) {
      return { line, bridged, components: components.length, skipped: 'cpu-budget' };
    }
    const a = components[0];
    const b = components[1];
    let bestA = a[0];
    let bestB = b[0];
    let bestDist = INF;
    for (const pa of a) {
      for (const pb of b) {
        const d = Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
        if (d < bestDist) {
          bestDist = d;
          bestA = pa;
          bestB = pb;
        }
      }
    }

    let x = bestA.x;
    let y = bestA.y;
    while (x !== bestB.x || y !== bestB.y) {
      if (x < bestB.x) x += 1;
      else if (x > bestB.x) x -= 1;
      if (y < bestB.y) y += 1;
      else if (y > bestB.y) y -= 1;
      if (!inBounds(x, y)) break;
      const id = idx(x, y);
      if (walkable[id] !== 1) continue;
      if ((terrain[id] || 0) === 2) continue;
      const k = `${x}:${y}`;
      if (!byKey.has(k)) {
        byKey.add(k);
        line.push({ x, y });
        bridged += 1;
      }
    }

    components = connectedComponents(line);
  }

  return { line, bridged, components: components.length };
}

function computeRampartCut(ctx, options = {}) {
  if (!ctx || !ctx.structuresByPos || typeof ctx.structuresByPos.keys !== 'function') {
    return { line: [], meta: { method: 'flow-mincut', candidates: 0, reason: 'missing-context' } };
  }

  const points = [...ctx.structuresByPos.keys()].map(parseKey).filter((p) => inBounds(p.x, p.y));
  if (!points.length) {
    return { line: [], meta: { method: 'flow-mincut', candidates: 0, reason: 'no-structures' } };
  }

  const walkable = (ctx.matrices && ctx.matrices.walkableMatrix) || new Array(2500).fill(1);
  const terrain = (ctx.matrices && ctx.matrices.terrainMatrix) || new Array(2500).fill(0);
  const exitDistance = (ctx.matrices && ctx.matrices.exitDistance) || new Array(2500).fill(0);

  const margin = Math.max(2, Math.min(8, Number(options.margin) || 4));
  const nodeIn = new Map();
  const nodeOut = new Map();
  const tiles = [];

  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      const id = idx(x, y);
      if (walkable[id] !== 1) continue;
      if ((terrain[id] || 0) === 2) continue;
      const k = `${x}:${y}`;
      tiles.push({ x, y, k, id });
    }
  }

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
  const coreMinX = Math.max(1, minX - margin);
  const coreMaxX = Math.min(48, maxX + margin);
  const coreMinY = Math.max(1, minY - margin);
  const coreMaxY = Math.min(48, maxY + margin);

  let nextNode = 2;
  for (const t of tiles) {
    nodeIn.set(t.k, nextNode++);
    nodeOut.set(t.k, nextNode++);
  }
  const source = 0;
  const sink = 1;
  const graph = Array.from({ length: nextNode }, () => []);

  const protectedSet = new Set(points.map((p) => `${p.x}:${p.y}`));

  for (const t of tiles) {
    const vin = nodeIn.get(t.k);
    const vout = nodeOut.get(t.k);
    if (vin === undefined || vout === undefined) continue;

    const isProtected = protectedSet.has(t.k);
    const inCoreBox = t.x >= coreMinX && t.x <= coreMaxX && t.y >= coreMinY && t.y <= coreMaxY;
    const atExit = isBorder(t.x, t.y) || (exitDistance[t.id] || 0) <= 0;

    const baseCost = terrainCost(terrain[t.id] || 0);
    const distBonus = Math.max(0, Math.min(4, (exitDistance[t.id] || 0) - 2));
    const cap = isProtected ? INF : Math.max(1, baseCost - Math.floor(distBonus / 2));
    addEdge(graph, vin, vout, cap);

    if (isProtected || inCoreBox) {
      addEdge(graph, source, vin, INF);
    }
    if (atExit) {
      addEdge(graph, vout, sink, INF);
    }

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = t.x + dx;
        const ny = t.y + dy;
        if (!inBounds(nx, ny)) continue;
        const nk = `${nx}:${ny}`;
        const nIn = nodeIn.get(nk);
        if (nIn === undefined) continue;
        addEdge(graph, vout, nIn, INF);
      }
    }
  }

  const flowResult = dinicMaxFlow(graph, source, sink);
  const reachable = residualReachable(graph, source);

  const line = [];
  for (const t of tiles) {
    if (protectedSet.has(t.k)) continue;
    const vin = nodeIn.get(t.k);
    const vout = nodeOut.get(t.k);
    if (vin === undefined || vout === undefined) continue;
    if (reachable.has(vin) && !reachable.has(vout)) {
      line.push({ x: t.x, y: t.y });
    }
  }

  line.sort((a, b) => a.y - b.y || a.x - b.x);
  const connected = connectBarrier(line, walkable, terrain);
  connected.line.sort((a, b) => a.y - b.y || a.x - b.x);

  return {
    line: connected.line,
    meta: {
      method: 'flow-mincut',
      margin,
      candidates: connected.line.length,
      flow: flowResult.flow,
      iterations: flowResult.iterations,
      saturated: flowResult.saturated,
      continuity: {
        components: connected.components,
        bridgedTiles: connected.bridged,
        connected: connected.components <= 1,
        skipped: connected.skipped || null,
      },
      bbox: { minX: coreMinX, minY: coreMinY, maxX: coreMaxX, maxY: coreMaxY },
    },
  };
}

module.exports = {
  computeRampartCut,
};
