const statsConsole = require('console.console');
const checkerboard = require('./algorithm.checkerboard');
const foundation = require('./planner.baseplannerFoundation');

/**
 * Standalone rampart min-cut debug planner for protecting a single XY target.
 * Persists its preview under room layout memory without touching the full
 * theoretical builder pipeline.
 * @codex-owner layoutPlanner
 * @codex-path Memory.rooms.roomName.layout.rampartMincut
 */

const RAMPART_TYPE = typeof STRUCTURE_RAMPART !== 'undefined' ? STRUCTURE_RAMPART : 'rampart';
const WALL_TYPE = typeof STRUCTURE_WALL !== 'undefined' ? STRUCTURE_WALL : 'constructedWall';
const DEFAULT_RAMPART_THICKNESS = 2;
const DEFAULT_NO_GO_DEPTH = 2;
const DEFAULT_DRAGON_TEETH_THICKNESS = 1;
const {
  inBounds,
  idx,
  chebyshev,
  neighbors8,
} = foundation;

function getBuildCompendiumHelpers() {
  const buildCompendium = require('./planner.buildCompendium');
  return buildCompendium && buildCompendium._helpers ? buildCompendium._helpers : {};
}

function key(x, y) {
  return `${x}:${y}`;
}

function parseKey(id) {
  const [x, y] = String(id).split(':').map(Number);
  return { x, y };
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sortByRoomPosition(left, right) {
  return left.y - right.y || left.x - right.x;
}

function normalizeTargetCoordinate(targetInput, yInput) {
  if (Number.isFinite(targetInput) && Number.isFinite(yInput)) {
    return { x: Math.trunc(Number(targetInput)), y: Math.trunc(Number(yInput)) };
  }
  if (typeof targetInput === 'string') {
    const match = targetInput.trim().match(/^(\d+)\s*[,/:]\s*(\d+)$/);
    if (match) {
      return { x: Number(match[1]), y: Number(match[2]) };
    }
  }
  if (targetInput && typeof targetInput === 'object') {
    if (targetInput.pos && Number.isFinite(targetInput.pos.x) && Number.isFinite(targetInput.pos.y)) {
      return {
        x: Math.trunc(Number(targetInput.pos.x)),
        y: Math.trunc(Number(targetInput.pos.y)),
      };
    }
    if (Number.isFinite(targetInput.x) && Number.isFinite(targetInput.y)) {
      return {
        x: Math.trunc(Number(targetInput.x)),
        y: Math.trunc(Number(targetInput.y)),
      };
    }
  }
  return null;
}

function buildPlannerContext(room, target) {
  const helpers = getBuildCompendiumHelpers();
  const buildTerrainMatrices =
    typeof helpers.buildTerrainMatrices === 'function'
      ? helpers.buildTerrainMatrices
      : foundation.buildTerrainMatrices;
  const computeStaticBlockedMatrix =
    typeof helpers.computeStaticBlockedMatrix === 'function'
      ? helpers.computeStaticBlockedMatrix
      : () => new Array(2500).fill(0);
  const matrices = buildTerrainMatrices(room);
  matrices.staticBlocked = computeStaticBlockedMatrix(room);
  const targetKey = key(target.x, target.y);
  return {
    roomName: room.name,
    placements: [
      {
        type: 'protected.target',
        x: target.x,
        y: target.y,
        rcl: 1,
        tag: 'protect.target',
      },
    ],
    blocked: new Set([targetKey]),
    roads: new Set(),
    ramparts: new Set(),
    roadBlockedByStructures: new Set([targetKey]),
    reserved: new Set(),
    structuresByPos: new Map([[targetKey, 'protected.target']]),
    matrices,
    meta: {
      validation: [],
      spawnExits: [],
      rampartPlanning: null,
      structurePlanning: { placements: [] },
      labPlanning: { sourceLabs: [], reactionLabs: [] },
      validStructurePositions: { positions: [] },
    },
  };
}

function floodReachable(walkableMatrix, seedPositions, blockedKeys) {
  const seen = new Set();
  const queue = [];
  const seeds = Array.isArray(seedPositions) ? seedPositions : [];
  const blocked = blockedKeys instanceof Set ? blockedKeys : new Set();
  for (const seed of seeds) {
    if (!seed || !inBounds(seed.x, seed.y)) continue;
    if (walkableMatrix[idx(seed.x, seed.y)] !== 1) continue;
    const seedKey = key(seed.x, seed.y);
    if (blocked.has(seedKey) || seen.has(seedKey)) continue;
    seen.add(seedKey);
    queue.push({ x: seed.x, y: seed.y });
  }
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const next of neighbors8(current.x, current.y)) {
      if (!inBounds(next.x, next.y)) continue;
      if (walkableMatrix[idx(next.x, next.y)] !== 1) continue;
      const nextKey = key(next.x, next.y);
      if (blocked.has(nextKey) || seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push(next);
    }
  }
  return seen;
}

function buildOutsideSeeds(matrices) {
  const seeds = [];
  if (!matrices || !Array.isArray(matrices.walkableMatrix)) return seeds;
  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      if (x !== 0 && x !== 49 && y !== 0 && y !== 49) continue;
      if (matrices.walkableMatrix[idx(x, y)] !== 1) continue;
      seeds.push({ x, y });
    }
  }
  return seeds;
}

function collectExitRegions(matrices) {
  const regions = [];
  if (!matrices || !Array.isArray(matrices.walkableMatrix)) return regions;
  const seen = new Set();
  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      if (x !== 0 && x !== 49 && y !== 0 && y !== 49) continue;
      if (matrices.walkableMatrix[idx(x, y)] !== 1) continue;
      const startKey = key(x, y);
      if (seen.has(startKey)) continue;
      const tiles = [];
      const queue = [{ x, y }];
      seen.add(startKey);
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        tiles.push(current);
        for (const next of neighbors8(current.x, current.y)) {
          if (!inBounds(next.x, next.y)) continue;
          if (next.x !== 0 && next.x !== 49 && next.y !== 0 && next.y !== 49) continue;
          if (matrices.walkableMatrix[idx(next.x, next.y)] !== 1) continue;
          const nextKey = key(next.x, next.y);
          if (seen.has(nextKey)) continue;
          seen.add(nextKey);
          queue.push(next);
        }
      }
      tiles.sort(sortByRoomPosition);
      regions.push({
        id: regions.length,
        size: tiles.length,
        tiles,
      });
    }
  }
  return regions;
}

function buildStandaloneDefenseContext(ctx, target, options = {}) {
  const helpers = getBuildCompendiumHelpers();
  const buildExitApproachTargets =
    helpers && typeof helpers.buildExitApproachTargets === 'function'
      ? helpers.buildExitApproachTargets
      : () => [];
  const exitApproachTargets = buildExitApproachTargets(ctx, target, {
    force: true,
    includeRegion: false,
    depth: Number.isFinite(options.exitApproachDepth) ? Number(options.exitApproachDepth) : 7,
    reserveRadius: Number.isFinite(options.exitReserveRadius) ? Number(options.exitReserveRadius) : 1,
  });
  const protectedRadius = Number.isFinite(options.protectedRadius)
    ? Math.max(0, Math.trunc(Number(options.protectedRadius)))
    : 0;
  const structuresByPos = new Map();
  const corePoints = [];
  for (let dx = -protectedRadius; dx <= protectedRadius; dx++) {
    for (let dy = -protectedRadius; dy <= protectedRadius; dy++) {
      const x = target.x + dx;
      const y = target.y + dy;
      if (!inBounds(x, y)) continue;
      if (ctx.matrices.walkableMatrix[idx(x, y)] !== 1) continue;
      structuresByPos.set(key(x, y), 'protected.target');
      corePoints.push({ x, y });
    }
  }
  if (structuresByPos.size === 0) {
    structuresByPos.set(key(target.x, target.y), 'protected.target');
    corePoints.push({ x: target.x, y: target.y });
  }
  return {
    structuresByPos,
    corePoints,
    matrices: ctx.matrices,
    exitApproachTargets,
    exitRegions: collectExitRegions(ctx.matrices),
  };
}

function filterBoundaryTiles(ctx, tiles) {
  return (Array.isArray(tiles) ? tiles : []).filter((tile) => {
    if (!tile || !Number.isFinite(tile.x) || !Number.isFinite(tile.y)) return false;
    if (tile.x <= 0 || tile.x >= 49 || tile.y <= 0 || tile.y >= 49) return false;
    const id = idx(tile.x, tile.y);
    if (ctx.matrices.walkableMatrix[id] !== 1) return false;
    if (ctx.matrices.staticBlocked[id] === 1) return false;
    if (ctx.matrices.exitProximity[id] === 1) return false;
    return true;
  });
}

function splitBoundaryComponents(tiles) {
  const rows = (Array.isArray(tiles) ? tiles : [])
    .filter((tile) => tile && Number.isFinite(tile.x) && Number.isFinite(tile.y))
    .sort(sortByRoomPosition);
  const byKey = new Map(rows.map((tile) => [key(tile.x, tile.y), tile]));
  const seen = new Set();
  const components = [];
  for (const tile of rows) {
    const startKey = key(tile.x, tile.y);
    if (seen.has(startKey)) continue;
    const component = [];
    const queue = [tile];
    seen.add(startKey);
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
    components.push(component.sort(sortByRoomPosition));
  }
  return components;
}

function canonicalizeStandaloneBoundary(ctx, tiles, target, canonicalizeRampartBoundaryTiles) {
  const filtered = filterBoundaryTiles(ctx, tiles);
  const components = splitBoundaryComponents(filtered);
  if (components.length <= 1) {
    return filterBoundaryTiles(
      ctx,
      canonicalizeRampartBoundaryTiles(ctx, filtered, target),
    );
  }
  const merged = [];
  const claimed = new Set();
  for (const component of components) {
    const canonical = filterBoundaryTiles(
      ctx,
      canonicalizeRampartBoundaryTiles(ctx, component, target),
    );
    for (const tile of canonical) {
      const tileKey = key(tile.x, tile.y);
      if (claimed.has(tileKey)) continue;
      claimed.add(tileKey);
      merged.push(tile);
    }
  }
  return merged.sort(sortByRoomPosition);
}

function buildExitFacingOuterBand(ctx, target, boundaryTiles, outsideKeys, options = {}) {
  if (!ctx || !target || !Array.isArray(boundaryTiles) || boundaryTiles.length === 0) return [];
  const extraLayers = Number.isFinite(options.extraLayers)
    ? Math.max(0, Math.trunc(Number(options.extraLayers)))
    : 1;
  if (extraLayers <= 0) return [];
  const outside = outsideKeys instanceof Set ? outsideKeys : new Set();
  const occupied = new Set(boundaryTiles.map((tile) => key(tile.x, tile.y)));
  const currentSeeds = boundaryTiles.slice();
  const added = [];
  let frontier = currentSeeds;

  for (let layer = 0; layer < extraLayers; layer++) {
    const nextFrontierMap = new Map();
    for (const seed of frontier) {
      if (!seed || !Number.isFinite(seed.x) || !Number.isFinite(seed.y)) continue;
      const seedExitDistance = Number(ctx.matrices.exitDistance[idx(seed.x, seed.y)] || 0);
      const candidates = neighbors8(seed.x, seed.y)
        .filter((next) => inBounds(next.x, next.y))
        .filter((next) => outside.has(key(next.x, next.y)))
        .filter((next) => !occupied.has(key(next.x, next.y)))
        .filter((next) => ctx.matrices.walkableMatrix[idx(next.x, next.y)] === 1)
        .filter((next) => ctx.matrices.staticBlocked[idx(next.x, next.y)] !== 1)
        .filter((next) => ctx.matrices.exitProximity[idx(next.x, next.y)] !== 1)
        .filter((next) => Number(ctx.matrices.exitDistance[idx(next.x, next.y)] || 0) < seedExitDistance)
        .map((next) => {
          const exitDistance = Number(ctx.matrices.exitDistance[idx(next.x, next.y)] || 0);
          return {
            x: next.x,
            y: next.y,
            score:
              (seedExitDistance - exitDistance) * 10 +
              chebyshev(next, target) * 0.25,
          };
        })
        .sort((left, right) => right.score - left.score || sortByRoomPosition(left, right));
      for (const candidate of candidates) {
        const candidateKey = key(candidate.x, candidate.y);
        if (nextFrontierMap.has(candidateKey)) continue;
        nextFrontierMap.set(candidateKey, {
          x: candidate.x,
          y: candidate.y,
          tag: `rampart.edge.outer.${layer + 1}`,
        });
      }
    }
    const nextFrontier = [...nextFrontierMap.values()].sort(sortByRoomPosition);
    if (nextFrontier.length === 0) break;
    for (const tile of nextFrontier) {
      occupied.add(key(tile.x, tile.y));
      added.push(tile);
    }
    frontier = nextFrontier;
  }

  return added;
}

function buildDragonTeeth(ctx, target, boundaryTiles, outsideKeys, options = {}) {
  if (!ctx || !target || !Array.isArray(boundaryTiles) || boundaryTiles.length === 0) return [];
  const forwardLayers = Number.isFinite(options.forwardLayers)
    ? Math.max(0, Math.trunc(Number(options.forwardLayers)))
    : DEFAULT_DRAGON_TEETH_THICKNESS;
  if (forwardLayers <= 0) return [];
  const preferredParity = checkerboard.parityAt(target.x, target.y);
  const boundaryKeys = new Set(boundaryTiles.map((tile) => key(tile.x, tile.y)));
  const outside = outsideKeys instanceof Set ? outsideKeys : new Set();
  const occupied = new Set(boundaryKeys);
  const seenDepth = new Map();
  const candidates = new Map();
  const queue = boundaryTiles
    .filter((tile) => tile && Number.isFinite(tile.x) && Number.isFinite(tile.y))
    .map((tile) => ({
      x: tile.x,
      y: tile.y,
      depth: 0,
      exitDistance: Number(ctx.matrices.exitDistance[idx(tile.x, tile.y)] || 0),
    }));

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (!current || current.depth >= forwardLayers) continue;
    for (const next of neighbors8(current.x, current.y)) {
      const nextKey = key(next.x, next.y);
      if (boundaryKeys.has(nextKey) || !outside.has(nextKey)) continue;
      if (!inBounds(next.x, next.y)) continue;
      const nextId = idx(next.x, next.y);
      const candidateExitDistance = Number(ctx.matrices.exitDistance[nextId] || 0);
      if (ctx.matrices.walkableMatrix[nextId] !== 1) continue;
      if (ctx.matrices.staticBlocked[nextId] === 1) continue;
      if (ctx.matrices.exitProximity[nextId] === 1) continue;
      if (!(candidateExitDistance < current.exitDistance)) continue;
      const nextDepth = current.depth + 1;
      const previousDepth = seenDepth.get(nextKey);
      if (previousDepth !== undefined && previousDepth <= nextDepth) continue;
      seenDepth.set(nextKey, nextDepth);
      queue.push({
        x: next.x,
        y: next.y,
        depth: nextDepth,
        exitDistance: candidateExitDistance,
      });
      if (checkerboard.classifyTile(next.x, next.y, preferredParity) !== 'structure') continue;
      let supportAdjacency = 0;
      for (const neighbor of neighbors8(next.x, next.y)) {
        if (occupied.has(key(neighbor.x, neighbor.y))) supportAdjacency += 1;
      }
      if (supportAdjacency <= 0) continue;
      const score =
        supportAdjacency * 20 -
        nextDepth * 12 -
        chebyshev(next, target) * 3 -
        (Math.abs(next.x - target.x) + Math.abs(next.y - target.y)) * 0.1;
      const existing = candidates.get(nextKey);
      if (!existing || score > existing.score) {
        candidates.set(nextKey, {
          x: next.x,
          y: next.y,
          score,
          tag: 'wall.dragonTooth',
          type: WALL_TYPE,
        });
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || sortByRoomPosition(left, right))
    .map((tile) => ({
      type: tile.type,
      x: tile.x,
      y: tile.y,
      rcl: 2,
      tag: tile.tag,
    }));
}

function buildNoGoZone(insideKeys, outsideKeys, options = {}) {
  const inside = insideKeys instanceof Set ? insideKeys : new Set();
  const outside = outsideKeys instanceof Set ? outsideKeys : new Set();
  const inwardDepth = Number.isFinite(options.inwardDepth)
    ? Math.max(0, Math.trunc(Number(options.inwardDepth)))
    : DEFAULT_NO_GO_DEPTH;
  if (inwardDepth <= 0) return [];
  const noGo = new Map();
  for (const outsideKey of outside) {
    const outsideTile = parseKey(outsideKey);
    for (let dx = -inwardDepth; dx <= inwardDepth; dx++) {
      for (let dy = -inwardDepth; dy <= inwardDepth; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > inwardDepth) continue;
        const x = outsideTile.x + dx;
        const y = outsideTile.y + dy;
        if (!inBounds(x, y)) continue;
        const insideKey = key(x, y);
        if (!inside.has(insideKey) || noGo.has(insideKey)) continue;
        noGo.set(insideKey, { x, y });
      }
    }
  }
  return [...noGo.values()].sort(sortByRoomPosition);
}

function trimCoordinateList(rows, maxEntries = 60) {
  const limit = Math.max(1, Math.trunc(Number(maxEntries) || 60));
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && Number.isFinite(row.x) && Number.isFinite(row.y))
    .sort(sortByRoomPosition);
  return {
    total: list.length,
    shown: list.slice(0, limit).map((row) => ({
      x: row.x,
      y: row.y,
      tag: row.tag || null,
      type: row.type || null,
    })),
    truncated: list.length > limit,
  };
}

function buildDebugPayload(input = {}, options = {}) {
  const maxEntries = Math.max(1, Math.trunc(Number(options.maxEntries) || 80));
  const defenseCtx = input.defenseCtx || {};
  const result = input.result || {};
  const exitRegions = Array.isArray(defenseCtx.exitRegions) ? defenseCtx.exitRegions : [];
  return {
    generatedAt:
      typeof Game !== 'undefined' && Game && Number.isFinite(Game.time) ? Number(Game.time) : 0,
    target: cloneSerializable(input.target || result.target || null),
    exits: {
      regionCount: exitRegions.length,
      regions: exitRegions.map((region) => ({
        id: region.id,
        size: Number(region.size || 0),
        coords: trimCoordinateList(region.tiles || [], maxEntries),
      })),
      approachTargets: trimCoordinateList(defenseCtx.exitApproachTargets || [], maxEntries),
    },
    mincut: {
      strategy: input.strategy || null,
      rawCut: trimCoordinateList(input.rawCutLine || [], maxEntries),
      canonicalBoundary: trimCoordinateList(input.boundaryTiles || [], maxEntries),
      outerBand: trimCoordinateList(input.outerBandTiles || [], maxEntries),
    },
    planned: {
      ramparts: trimCoordinateList(result.ramparts || [], maxEntries),
      dragonTeeth: trimCoordinateList(result.dragonTeeth || [], maxEntries),
      roads: trimCoordinateList(result.displayRoads || [], maxEntries),
      allPlacements: trimCoordinateList(result.placements || [], maxEntries),
    },
    zones: {
      inside: trimCoordinateList(input.insideTiles || [], maxEntries),
      outside: trimCoordinateList(input.outsideTiles || [], maxEntries),
      noGo: trimCoordinateList(result.noGoZone || [], maxEntries),
    },
    meta: cloneSerializable(result.meta || {}),
  };
}

function debugLinesFromPlan(plan, options = {}) {
  const payload = plan && plan.debug ? plan.debug : plan;
  if (!payload) return ['rampartMincutDump: no data'];
  const lines = [];
  lines.push(
    `[rampartMincut] target=${payload.target ? `${payload.target.x},${payload.target.y}` : 'n/a'} generatedAt=${payload.generatedAt || 'n/a'}`,
  );
  const exits = payload.exits || {};
  lines.push(
    `[rampartMincut] exits regions=${Number(exits.regionCount || 0)} approachTargets=${Number(exits.approachTargets && exits.approachTargets.total || 0)}`,
  );
  for (const region of Array.isArray(exits.regions) ? exits.regions : []) {
    const coords = Array.isArray(region.coords && region.coords.shown)
      ? region.coords.shown.map((row) => `${row.x},${row.y}`).join(' | ')
      : '';
    lines.push(
      `[rampartMincut] exitRegion#${region.id} size=${Number(region.size || 0)} shown=${Number(region.coords && region.coords.shown ? region.coords.shown.length : 0)}${region.coords && region.coords.truncated ? '+' : ''}${coords ? ` coords=${coords}` : ''}`,
    );
  }
  if (exits.approachTargets) {
    const coords = (exits.approachTargets.shown || []).map((row) => `${row.x},${row.y}`).join(' | ');
    lines.push(
      `[rampartMincut] exitApproach total=${Number(exits.approachTargets.total || 0)} shown=${Number((exits.approachTargets.shown || []).length)}${exits.approachTargets.truncated ? '+' : ''}${coords ? ` coords=${coords}` : ''}`,
    );
  }
  const mincut = payload.mincut || {};
  const planned = payload.planned || {};
  const zones = payload.zones || {};
  lines.push(
    `[rampartMincut] mincut raw=${Number(mincut.rawCut && mincut.rawCut.total || 0)} canonical=${Number(mincut.canonicalBoundary && mincut.canonicalBoundary.total || 0)} outer=${Number(mincut.outerBand && mincut.outerBand.total || 0)}`,
  );
  lines.push(
    `[rampartMincut] planned ramparts=${Number(planned.ramparts && planned.ramparts.total || 0)} dragonTeeth=${Number(planned.dragonTeeth && planned.dragonTeeth.total || 0)} roads=${Number(planned.roads && planned.roads.total || 0)} noGo=${Number(zones.noGo && zones.noGo.total || 0)}`,
  );
  const appendCoords = (label, entry) => {
    if (!entry) return;
    const coords = (entry.shown || []).map((row) => `${row.x},${row.y}${row.tag ? `(${row.tag})` : ''}`).join(' | ');
    lines.push(
      `[rampartMincut] ${label} shown=${Number((entry.shown || []).length)}${entry.truncated ? '+' : ''}${coords ? ` coords=${coords}` : ''}`,
    );
  };
  appendCoords('rawCut', mincut.rawCut);
  appendCoords('canonicalBoundary', mincut.canonicalBoundary);
  appendCoords('outerBand', mincut.outerBand);
  appendCoords('ramparts', planned.ramparts);
  appendCoords('dragonTeeth', planned.dragonTeeth);
  appendCoords('nogo', zones.noGo);
  return lines;
}

function persistRoomPlan(roomName, result) {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  if (!Memory.rooms[roomName].layout) Memory.rooms[roomName].layout = {};
  Memory.rooms[roomName].layout.rampartMincut = cloneSerializable(result);
  return Memory.rooms[roomName].layout.rampartMincut;
}

function summarizePlan(result) {
  if (!result || result.ok !== true) return result;
  return {
    ok: true,
    roomName: result.roomName,
    target: cloneSerializable(result.target),
    ramparts: Number(result.meta && result.meta.boundaryCount ? result.meta.boundaryCount : 0),
    dragonTeeth: Number(result.meta && result.meta.dragonToothCount ? result.meta.dragonToothCount : 0),
    noGo: Number(result.meta && result.meta.noGoCount ? result.meta.noGoCount : 0),
    standoff: Number(result.meta && result.meta.standoff ? result.meta.standoff : 0),
    margin: Number(result.meta && result.meta.margin ? result.meta.margin : 0),
    sealed: result.meta && result.meta.sealed === true,
  };
}

function normalizePlannerOptions(options = {}) {
  const input = options && typeof options === 'object' ? options : {};
  const rampartThickness = Number.isFinite(input.rampartThickness)
    ? Math.max(1, Math.trunc(Number(input.rampartThickness)))
    : DEFAULT_RAMPART_THICKNESS;
  const noGoDepth = Number.isFinite(input.noGoDepth)
    ? Math.max(0, Math.trunc(Number(input.noGoDepth)))
    : DEFAULT_NO_GO_DEPTH;
  const dragonTeethThickness = Number.isFinite(input.dragonTeethThickness)
    ? Math.max(0, Math.trunc(Number(input.dragonTeethThickness)))
    : DEFAULT_DRAGON_TEETH_THICKNESS;
  return Object.assign({}, input, {
    rampartThickness,
    noGoDepth,
    dragonTeethThickness,
  });
}

function planContextTarget(ctx, targetInput, options = {}) {
  const normalizedOptions = normalizePlannerOptions(options);
  const target = normalizeTargetCoordinate(targetInput);
  const helpers = getBuildCompendiumHelpers();
  if (!ctx || !target || !inBounds(target.x, target.y)) {
    return {
      ok: false,
      roomName: options && options.roomName ? options.roomName : ctx && ctx.roomName ? ctx.roomName : null,
      target: target || null,
      error: 'invalid-target',
    };
  }
  const pickBestRampartCut =
    helpers && typeof helpers.pickBestRampartCut === 'function'
      ? helpers.pickBestRampartCut
      : null;
  const canonicalizeRampartBoundaryTiles =
    helpers && typeof helpers.canonicalizeRampartBoundaryTiles === 'function'
      ? helpers.canonicalizeRampartBoundaryTiles
      : (context, tiles) => tiles || [];
  const computeRampartInteriorMetrics =
    helpers && typeof helpers.computeRampartInteriorMetrics === 'function'
      ? helpers.computeRampartInteriorMetrics
      : () => ({});
  if (!pickBestRampartCut) {
    return {
      ok: false,
      roomName: options && options.roomName ? options.roomName : ctx && ctx.roomName ? ctx.roomName : null,
      target,
      error: 'missing-rampart-helper',
    };
  }

  const defenseCtx =
    normalizedOptions.defenseCtx && typeof normalizedOptions.defenseCtx === 'object'
      ? normalizedOptions.defenseCtx
      : buildStandaloneDefenseContext(ctx, target, normalizedOptions);
  const strategy = String(normalizedOptions.strategy || 'full').toLowerCase() === 'estimate'
    ? 'estimate'
    : 'full';
  const cut = pickBestRampartCut(ctx, target, { strategy, defenseCtx });
  const rawCutLine = Array.isArray(cut && cut.line) ? cut.line.slice() : [];
  const boundaryTiles = canonicalizeStandaloneBoundary(
    ctx,
    rawCutLine,
    target,
    canonicalizeRampartBoundaryTiles,
  );
  const boundaryKeys = new Set(boundaryTiles.map((tile) => key(tile.x, tile.y)));
  const insideKeys = floodReachable(ctx.matrices.walkableMatrix, [target], boundaryKeys);
  const outsideKeys = floodReachable(
    ctx.matrices.walkableMatrix,
    buildOutsideSeeds(ctx.matrices),
    boundaryKeys,
  );
  const outerBandTiles = buildExitFacingOuterBand(
    ctx,
    target,
    boundaryTiles,
    outsideKeys,
    { extraLayers: Math.max(0, normalizedOptions.rampartThickness - 1) },
  );
  const primaryRamparts = boundaryTiles.map((tile) => ({
    type: RAMPART_TYPE,
    x: tile.x,
    y: tile.y,
    rcl: 2,
    tag: tile.tag || 'rampart.edge',
  }));
  const outerBandRamparts = outerBandTiles.map((tile) => ({
    type: RAMPART_TYPE,
    x: tile.x,
    y: tile.y,
    rcl: 2,
    tag: tile.tag || 'rampart.edge',
  }));
  const allRampartTiles = boundaryTiles.concat(outerBandTiles);
  const boundaryPlacements = primaryRamparts.concat(outerBandRamparts);
  const dragonToothFrontier = outerBandTiles.length > 0 ? outerBandTiles : boundaryTiles;
  const dragonTeeth = normalizedOptions.planDragonTeeth === false
    ? []
    : buildDragonTeeth(ctx, target, dragonToothFrontier, outsideKeys, {
        forwardLayers: normalizedOptions.dragonTeethThickness,
      });
  const noGoZone = buildNoGoZone(insideKeys, outsideKeys, {
    inwardDepth: normalizedOptions.noGoDepth,
  });
  const lineMetrics = computeRampartInteriorMetrics(ctx, boundaryTiles, target);
  const sealed =
    Number(lineMetrics.protectedStructures || 0) === Number(lineMetrics.protectedInsideCount || 0) &&
    lineMetrics.touchesBorder !== true &&
    Number(lineMetrics.diagonalGapCount || 0) === 0;

  const result = {
    ok: true,
    roomName:
      normalizedOptions.roomName || ctx.roomName || (ctx.meta && ctx.meta.roomName) || null,
    generatedAt:
      typeof Game !== 'undefined' && Game && Number.isFinite(Game.time) ? Number(Game.time) : 0,
    target: cloneSerializable(target),
    placements: boundaryPlacements.concat(dragonTeeth),
    primaryRamparts: cloneSerializable(primaryRamparts),
    outerBandRamparts: cloneSerializable(outerBandRamparts),
    ramparts: cloneSerializable(boundaryPlacements),
    dragonTeeth: cloneSerializable(dragonTeeth),
    displayRoads: allRampartTiles.map((tile) => ({ x: tile.x, y: tile.y, rcl: 2, tag: 'road.rampart' })),
    noGoZone: cloneSerializable(noGoZone),
    meta: {
      mode: 'standalone-rampart-mincut',
      strategy,
      rampartThickness: normalizedOptions.rampartThickness,
      noGoDepth: normalizedOptions.noGoDepth,
      dragonTeethThickness: normalizedOptions.dragonTeethThickness,
      boundaryCount: boundaryPlacements.length,
      primaryBoundaryCount: boundaryTiles.length,
      outerBandCount: outerBandTiles.length,
      dragonToothCount: dragonTeeth.length,
      noGoCount: noGoZone.length,
      exitApproachCount: Number(defenseCtx.exitApproachTargets ? defenseCtx.exitApproachTargets.length : 0),
      standoff: Number(cut && cut.standoff ? cut.standoff : 0),
      margin: Number(cut && cut.margin ? cut.margin : 0),
      filteredTiles: Number(cut && cut.filteredTiles ? cut.filteredTiles : 0),
      sealed,
      minCut: cloneSerializable(cut && cut.minCutMeta ? cut.minCutMeta : null),
      lineMetrics: cloneSerializable(lineMetrics),
    },
  };
  result.debug = buildDebugPayload(
    {
      target,
      strategy,
      defenseCtx,
      rawCutLine,
      boundaryTiles,
      outerBandTiles,
      insideTiles: [...insideKeys].map(parseKey),
      outsideTiles: [...outsideKeys].map(parseKey),
      result,
    },
    normalizedOptions.debug || {},
  );
  return result;
}

function planRoomTarget(roomName, targetInput, yInput, options = {}) {
  let normalizedYInput = yInput;
  let normalizedOptions = options;
  if (
    normalizedYInput &&
    typeof normalizedYInput === 'object' &&
    !Array.isArray(normalizedYInput) &&
    !Number.isFinite(normalizedYInput)
  ) {
    normalizedOptions = normalizedYInput;
    normalizedYInput = undefined;
  }
  const room = Game.rooms[roomName];
  if (!room) {
    return { ok: false, roomName, error: 'room-not-visible' };
  }
  const target = normalizeTargetCoordinate(targetInput, normalizedYInput);
  if (!target || !inBounds(target.x, target.y)) {
    return { ok: false, roomName, error: 'invalid-target' };
  }
  if (target.x === 0 || target.x === 49 || target.y === 0 || target.y === 49) {
    return { ok: false, roomName, target, error: 'target-on-border' };
  }
  const ctx = buildPlannerContext(room, target);
  const result = planContextTarget(ctx, target, Object.assign({}, normalizedOptions || {}, {
    roomName,
  }));
  if (!result || result.ok !== true) return result;

  persistRoomPlan(roomName, result);
  if (!Memory.stats) Memory.stats = {};
  if (statsConsole && typeof statsConsole.log === 'function') {
    try {
      statsConsole.log(
        `Rampart mincut planned for ${roomName} @ ${target.x},${target.y} (${boundaryPlacements.length} ramparts, ${dragonTeeth.length} dragon teeth).`,
        2,
      );
    } catch (err) {
      // Keep the standalone planner usable in stripped-down test harnesses.
    }
  }
  return result;
}

function clearRoomPlan(roomName) {
  if (
    Memory.rooms &&
    Memory.rooms[roomName] &&
    Memory.rooms[roomName].layout &&
    Memory.rooms[roomName].layout.rampartMincut
  ) {
    delete Memory.rooms[roomName].layout.rampartMincut;
  }
  return { ok: true, roomName, cleared: true };
}

function getRoomPlan(roomName) {
  return (
    Memory.rooms &&
    Memory.rooms[roomName] &&
    Memory.rooms[roomName].layout &&
    Memory.rooms[roomName].layout.rampartMincut
  ) || null;
}

function dumpRoomPlan(roomName, options = {}) {
  const plan = getRoomPlan(roomName);
  if (!plan) {
    const message = `rampartMincutDump: no data for ${roomName || 'unknown'}`;
    if (options.print !== false) console.log(message);
    return options.returnObject ? { ok: false, reason: 'missing-plan', roomName } : message;
  }
  const lines = debugLinesFromPlan(plan, options);
  if (options.print !== false) {
    for (const line of lines) console.log(line);
  }
  if (options.returnObject) {
    return {
      ok: true,
      roomName: plan.roomName,
      lines,
      payload: cloneSerializable(plan.debug || null),
    };
  }
  return `rampartMincutDump: printed ${lines.length} lines for ${plan.roomName}`;
}

module.exports = {
  planRoomTarget,
  clearRoomPlan,
  getRoomPlan,
  dumpRoomPlan,
  debugLinesFromPlan,
  summarizePlan,
  _helpers: {
    buildPlannerContext,
    buildDebugPayload,
    planContextTarget,
    canonicalizeStandaloneBoundary,
    buildStandaloneDefenseContext,
    collectExitRegions,
    splitBoundaryComponents,
    buildExitFacingOuterBand,
    buildDragonTeeth,
    buildNoGoZone,
    floodReachable,
    normalizeTargetCoordinate,
  },
};
