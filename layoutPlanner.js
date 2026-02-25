const statsConsole = require('console.console');
const distanceTransform = require('./algorithm.distanceTransform');
const htm = require('./manager.htm');
const constructionBlocker = require('./constructionBlocker');
const buildCompendium = require('./planner.buildCompendium');
const basePlanValidation = require('./manager.basePlanValidation');

/**
 * Modular layout planner storing structure matrix per room.
 * @codex-owner layoutPlanner
 */

const baseLayout = [
  { dx: 0, dy: 0, type: STRUCTURE_SPAWN, rcl: 1 },
  { dx: 1, dy: 0, type: STRUCTURE_EXTENSION, rcl: 2 },
  { dx: -1, dy: 0, type: STRUCTURE_EXTENSION, rcl: 2 },
  { dx: 0, dy: 1, type: STRUCTURE_EXTENSION, rcl: 2 },
  { dx: 0, dy: -1, type: STRUCTURE_EXTENSION, rcl: 2 },
  { dx: 1, dy: 1, type: STRUCTURE_TOWER, rcl: 3 },
  { dx: -1, dy: -1, type: STRUCTURE_STORAGE, rcl: 4 },
  { dx: -1, dy: 1, type: STRUCTURE_LINK, rcl: 5 },
  { dx: 1, dy: -1, type: STRUCTURE_EXTENSION, rcl: 6 },
];

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


function mapBasePhaseToDebugWindow(baseFrom = 1, baseTo = 6) {
  const phaseMap = {
    1: { from: 1, to: 3 },
    2: { from: 4, to: 4 },
    3: { from: 5, to: 7 },
    4: { from: 8, to: 9 },
    5: { from: 10, to: 10 },
    6: { from: 10, to: 10 },
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
    String(Memory.settings.layoutPlanningMode || 'standard').toLowerCase() === 'theoretical'
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
  };

  const validation = basePlanValidation.validateBasePlan(roomName, rawPlan);
  roomMem.basePlan = validation.normalizedPlan;
  roomMem.basePlan.validation = {
    valid: validation.valid,
    issues: validation.issues,
    autoFixes: validation.autoFixes,
    checkedAt: validation.checkedAt,
  };
  roomMem.basePlan.validationRecovery = basePlanValidation.handleValidationFailure(roomName, validation);
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

function normalizePhase(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(10, Math.floor(num)));
}

function readPhaseWindow() {
  const from = normalizePhase(
    readNumberSetting('layoutPlanningDebugPhaseFrom', 1),
    1,
  );
  const to = normalizePhase(
    readNumberSetting('layoutPlanningDebugPhaseTo', 10),
    10,
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
    mem.roadMatrix[tile.x][tile.y] = {
      planned: true,
      rcl: 1,
      plannedBy: 'layoutPlanner',
    };
  }
}

function reserve(mem, x, y, data) {
  if (!mem.matrix[x]) mem.matrix[x] = {};
  mem.matrix[x][y] = Object.assign(
    { planned: true, plannedBy: 'layoutPlanner', blockedUntil: Game.time + 1500 },
    data,
  );
  if (!mem.reserved[x]) mem.reserved[x] = {};
  mem.reserved[x][y] = true;
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
    if (isTheoreticalMode()) {
      this.buildTheoreticalLayout(roomName);
      return;
    }
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;
    const mem = Memory.rooms[roomName] || (Memory.rooms[roomName] = {});
    if (!mem.layout) mem.layout = { matrix: {}, reserved: {} };
    mem.layout.baseAnchor = mem.layout.baseAnchor || {
      x: spawn.pos.x,
      y: spawn.pos.y,
    };
    for (const p of baseLayout) {
      const x = mem.layout.baseAnchor.x + p.dx;
      const y = mem.layout.baseAnchor.y + p.dy;
      reserve(mem.layout, x, y, { structureType: p.type, rcl: p.rcl });
    }
    mem.layout.planVersion = 1;
    statsConsole.run([["layoutPlanner", Game.cpu.getUsed()]]);
    this.populateDynamicLayout(roomName);
  },

  /**
   * Ensure a layout plan exists for the room. Creates one if missing.
   * @param {string} roomName
   */
  ensurePlan(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return;
    if (isTheoreticalMode()) {
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
        pipelineActive ||
        mem.layout.rebuildLayout ||
        mem.layout.manualPhaseRequest ||
        explicitRecalcRequested ||
        (!mem.layout.theoretical &&
          (pipelineStatus === 'paused_phase_9' || pipelineStatus === 'paused_phase_8'))
      ) {
        this.buildTheoreticalLayout(roomName);
      }
      return;
    }
    const mem = Memory.rooms[roomName];
    if (!mem || !mem.layout || mem.layout.planVersion !== 1) {
      this.plan(roomName);
    }
  },

  /**
   * Generate dynamic layout positions based on terrain and spawn anchor.
   * @param {string} roomName
   * @codex-owner layoutPlanner
   */
  populateDynamicLayout(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return;
    if (isTheoreticalMode()) {
      this.buildTheoreticalLayout(roomName);
      return;
    }
    if (!room.memory.layout || !room.memory.layout.matrix) return;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    const mem = room.memory.layout;
    mem.roadMatrix = mem.roadMatrix || {};
    mem.status = mem.status || { clusters: {}, structures: {} };
    if (mem.rebuildLayout) {
      mem.matrix = {};
      mem.reserved = {};
      mem.roadMatrix = {};
      delete mem.rebuildLayout;
    }

    if (!room.memory.distanceTransform) {
      distanceTransform.distanceTransform(room);
    }
    const dt = room.memory.distanceTransform;

    function dtVal(x, y) {
      return dt[y * 50 + x] || 0;
    }

    function setCell(x, y, type, rcl) {
      if (x < 1 || x > 48 || y < 1 || y > 48) return false;
      if (layoutPlanner.isTileBlocked(roomName, x, y)) return false;
      const lookStructures = typeof LOOK_STRUCTURES !== 'undefined' ? LOOK_STRUCTURES : 'structure';
      if (room.lookForAt(lookStructures, x, y).length > 0) return false;
      if (!mem.matrix[x]) mem.matrix[x] = {};
      if (mem.matrix[x][y]) return false;
      mem.matrix[x][y] = {
        structureType: type,
        rcl,
        planned: true,
        plannedBy: 'layoutPlanner',
        blockedUntil: Game.time + 10000,
      };
      if (!mem.reserved[x]) mem.reserved[x] = {};
      mem.reserved[x][y] = true;
      return true;
    }

    // Choose open tile near spawn using distance transform
    let best = spawn.pos;
    let bestVal = -1;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const x = spawn.pos.x + dx;
        const y = spawn.pos.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        const val = dtVal(x, y);
        if (val > bestVal) {
          bestVal = val;
          best = new RoomPosition(x, y, roomName);
        }
      }
    }

    // Extension cluster pattern around chosen position
    const clusterId = 'extCluster1';
    const clusterPattern = [
      { dx: 0, dy: -1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
    ];
    const clusterPos = [];
    for (const p of clusterPattern) {
      const x = best.x + p.dx;
      const y = best.y + p.dy;
      if (setCell(x, y, STRUCTURE_EXTENSION, 2)) clusterPos.push({ x, y });
    }

    if (clusterPos.length > 0 && room.controller.level >= 2) {
      const queuePos = clusterPos.filter((pos) =>
        !room
          .lookForAt(typeof LOOK_STRUCTURES !== 'undefined' ? LOOK_STRUCTURES : 'structure', pos.x, pos.y)
          .some((s) => s.structureType === STRUCTURE_EXTENSION),
      );
      const total = clusterPos.length;
      mem.status.clusters[clusterId] = mem.status.clusters[clusterId] || {
        built: total - queuePos.length,
        total,
        complete: false,
      };
      if (
        queuePos.length > 0 &&
        !htm.hasTask(htm.LEVELS.COLONY, room.name, 'BUILD_CLUSTER', 'layoutPlanner')
      ) {
        htm.addColonyTask(
          room.name,
          'BUILD_CLUSTER',
          {
            roomName,
            clusterId,
            rcl: 2,
            structureType: STRUCTURE_EXTENSION,
            total,
          },
          4,
          1500,
          1,
          'layoutPlanner',
        );
      }
      for (const pos of queuePos) {
        if (
          2 <= room.controller.level &&
          !htm.taskExistsAt(htm.LEVELS.COLONY, room.name, 'BUILD_LAYOUT_PART', {
            x: pos.x,
            y: pos.y,
            structureType: STRUCTURE_EXTENSION,
          })
        ) {
          htm.addColonyTask(
            room.name,
            'BUILD_LAYOUT_PART',
            {
              roomName,
              structureType: STRUCTURE_EXTENSION,
              x: pos.x,
              y: pos.y,
            },
            5,
            1000,
            1,
            'layoutPlanner',
            {},
            { parentTaskId: clusterId },
          );
        }
      }
    }

    // Support structures around spawn
    const around = [
      { dx: 1, dy: 1, type: STRUCTURE_TOWER, rcl: 3 },
      { dx: -1, dy: 1, type: STRUCTURE_LINK, rcl: 5 },
      { dx: 1, dy: -1, type: STRUCTURE_STORAGE, rcl: 4 },
    ];
    for (const p of around) setCell(spawn.pos.x + p.dx, spawn.pos.y + p.dy, p.type, p.rcl);

    // Containers for controller and sources
    function openAround(pos, range) {
      const terrain = room.getTerrain();
      const spots = [];
      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          const x = pos.x + dx;
          const y = pos.y + dy;
          if (x < 1 || x > 48 || y < 1 || y > 48) continue;
          if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
          if (!layoutPlanner.isTileBlocked(roomName, x, y)) spots.push({ x, y });
        }
      }
      return spots;
    }

    if (room.controller) {
      const spots = openAround(room.controller.pos, 2);
      for (const s of spots) {
        if (setCell(s.x, s.y, STRUCTURE_CONTAINER, 1)) break;
      }
    }

    const sources = room.find(FIND_SOURCES);
    for (const src of sources) {
      const spots = openAround(src.pos, 1);
      for (const s of spots) {
        if (setCell(s.x, s.y, STRUCTURE_CONTAINER, 1)) break;
      }
    }

    // Road planning helper
    function planRoad(from, to) {
      if (!to) return;
      const res = PathFinder.search(from, { pos: to, range: 1 });
      for (const step of res.path) {
        if (layoutPlanner.isTileBlocked(roomName, step.x, step.y)) continue;
        if (!mem.roadMatrix[step.x]) mem.roadMatrix[step.x] = {};
        mem.roadMatrix[step.x][step.y] = {
          planned: true,
          rcl: 1,
          plannedBy: 'layoutPlanner',
        };
      }
    }

    planRoad(spawn.pos, room.controller && room.controller.pos);
    for (const src of sources) planRoad(spawn.pos, src.pos);
    const storageCell = Object.keys(mem.matrix)
      .map((x) =>
        Object.keys(mem.matrix[x])
          .map((y) => ({
            x: Number(x),
            y: Number(y),
            cell: mem.matrix[x][y],
          }))
          .filter((c) => c.cell.structureType === STRUCTURE_STORAGE)[0],
      )
      .filter(Boolean)[0];
    if (storageCell) planRoad(spawn.pos, new RoomPosition(storageCell.x, storageCell.y, roomName));

    // summarize structure totals for progress tracking
    const totals = {};
    for (const x in mem.matrix) {
      for (const y in mem.matrix[x]) {
        const t = mem.matrix[x][y].structureType;
        totals[t] = (totals[t] || 0) + 1;
      }
    }
    mem.status.structures = mem.status.structures || {};
    for (const t in totals) {
      const builtCount = room.find(FIND_STRUCTURES, { filter: s => s.structureType === t }).length;
      mem.status.structures[t] = mem.status.structures[t] || { built: 0, total: 0 };
      mem.status.structures[t].total = totals[t];
      mem.status.structures[t].built = Math.min(builtCount, totals[t]);
    }

    mem.planVersion = 1;
    if (Memory.settings && Memory.settings.debugLayoutProgress && Game.time % 1000 === 0) {
      const matrixCount = Object.keys(mem.matrix).reduce((sum, x) => sum + Object.keys(mem.matrix[x]).length, 0);
      const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
      const parts = container && container.tasks ? container.tasks.filter(t => t.name === 'BUILD_LAYOUT_PART').length : 0;
      console.log(`[layoutPlanner] ${roomName}: ${matrixCount - parts}/${matrixCount} built`);
    }
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
    const phaseTo = normalizePhase(options.phaseTo, 10);
    const from = Math.min(phaseFrom, phaseTo);
    const to = Math.max(phaseFrom, phaseTo);
    const subPhaseRaw = options.subPhase ? String(options.subPhase).toLowerCase() : null;
    const subPhaseMap = {
      foundation: { from: 1, to: 3 },
      placement: { from: 4, to: 7 },
      evaluation: { from: 8, to: 9 },
      persist: { from: 10, to: 10 },
      all: { from: 1, to: 10 },
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

    pipeline.stopAtPhase = typeof options.stopAtPhase === 'number' ? options.stopAtPhase : 10;

    if (debugOptions.phaseFrom <= 7) {
      pipeline.results = {};
      pipeline.bestCandidateIndex = null;
      pipeline.activeCandidateIndex = null;
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
        { allowDuplicate: true },
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
          { parentTaskId: pipeline.runId, subOrder: candidate.index, allowDuplicate: true },
        );
      }
    }

    if (debugOptions.phaseFrom >= 8) {
      pipeline.status = 'running';
      pipeline.updatedAt = Game.time;
      delete pipeline.completedAt;
      if (debugOptions.phaseFrom >= 9) {
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
    const mode = String(
      options.mode ||
        (Memory.settings && Memory.settings.layoutPlanningMode) ||
        'standard',
    ).toLowerCase();

    if (mode !== 'theoretical') {
      this.resetRoomPlan(roomName, options);
      this.plan(roomName);
      return true;
    }

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
    layoutMem.mode = 'theoretical';
    layoutMem.baseAnchor = { x: generated.anchor.x, y: generated.anchor.y };

    for (const placement of generated.placements) {
      const { x, y, type, rcl, tag } = placement;
      if (type === ROAD_TYPE) {
        if (!layoutMem.roadMatrix[x]) layoutMem.roadMatrix[x] = {};
        layoutMem.roadMatrix[x][y] = {
          planned: true,
          rcl: rcl || 1,
          plannedBy: 'layoutPlanner',
          tag: tag || null,
          candidateIndex:
            typeof options.candidateIndex === 'number' ? options.candidateIndex : null,
        };
      }
      if (!layoutMem.matrix[x]) layoutMem.matrix[x] = {};
      if (layoutMem.matrix[x][y] && layoutMem.matrix[x][y].structureType !== ROAD_TYPE) {
        continue;
      }
      layoutMem.matrix[x][y] = {
        structureType: type,
        rcl: rcl || 1,
        planned: true,
        plannedBy: 'layoutPlanner',
        blockedUntil: Game.time + 10000,
        tag: tag || null,
        candidateIndex:
          typeof options.candidateIndex === 'number' ? options.candidateIndex : null,
      };
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

    const preferred =
      Memory &&
      Memory.settings &&
      typeof Memory.settings.layoutCandidateOverlayIndex === 'number'
        ? Memory.settings.layoutCandidateOverlayIndex
        : -1;

    if (preferred >= 0 && available.includes(preferred)) {
      return preferred;
    }

    const selected =
      mem.layout.theoretical &&
      typeof mem.layout.theoretical.selectedCandidateIndex === 'number'
        ? mem.layout.theoretical.selectedCandidateIndex
        : null;

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
        label: 'Core + Stations',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          total > 0 ? (done >= total ? 'Complete for all candidates' : `Working ${progress}`) : 'Awaiting candidates',
      },
      {
        number: 5,
        label: 'Flood Fill + Extensions',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          total > 0 ? (done >= total ? 'Complete for all candidates' : `Working ${progress}`) : 'Awaiting candidates',
      },
      {
        number: 6,
        label: 'Labs + Ramparts + Towers',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          total > 0 ? (done >= total ? 'Complete for all candidates' : `Working ${progress}`) : 'Awaiting candidates',
      },
      {
        number: 7,
        label: 'Road Networks',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          total > 0 ? (done >= total ? 'Complete for all candidates' : `Working ${progress}`) : 'Awaiting candidates',
      },
      {
        number: 8,
        label: 'End Evaluation (Weighted)',
        status: done >= total && total > 0 ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: total > 0 ? (done >= total ? '✔' : progress) : 'X',
        detail:
          total > 0 ? (done >= total ? 'Weighted scores finalized' : `Scoring ${progress}`) : 'Awaiting candidates',
      },
      {
        number: 9,
        label: 'Winner Selection',
        status: hasWinner ? 'done' : done > 0 ? 'in_progress' : 'pending',
        progress: hasWinner ? '✔' : done > 0 ? `${done}/${Math.max(total, 1)}` : 'X',
        detail: hasWinner ? `Winner: C${pipeline.bestCandidateIndex + 1}` : 'No winner selected',
      },
      {
        number: 10,
        label: 'Persist + Overlay',
        status: persisted ? 'done' : hasWinner ? 'in_progress' : 'pending',
        progress: persisted ? '✔' : hasWinner ? '9/10' : 'X',
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
    mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
    this._applyTheoreticalPlacements(mem.layout, generated, {
      candidateIndex: pipeline.bestCandidateIndex,
    });

    const spawnCandidate = generated.placements.find((p) => p.type === SPAWN_TYPE);
    const controllerContainer = generated.placements.find((p) => p.tag === 'controller.container');
    const sourceContainers = generated.placements.filter(
      (p) => p.tag && p.tag.startsWith('source.container.'),
    );
    const roadTiles = generated.placements
      .filter((p) => p.type === ROAD_TYPE)
      .map((p) => ({ x: p.x, y: p.y }));

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
        validation: result ? result.validation : [],
        defenseScore: result ? result.defenseScore : 0,
        completedAt: result ? result.completedAt : null,
        selected: result ? result.index === pipeline.bestCandidateIndex : false,
      };
    });

    const selectedCandidate = candidateRows.find((row) => row.selected) || null;
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
      weightedMetrics: selectedEvaluation.metrics || {},
      weightedContributions: selectedEvaluation.contributions || {},
      validation: generated.meta.validation || [],
      defenseScore: generated.meta.defenseScore || 0,
      completedAt: Game.time,
    };

    mem.layout.theoretical = {
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
      wallDistance: generated.analysis.dt || [],
      controllerDistance: toArrayMap(generated.analysis.controllerDistance || {}),
      floodScore: Array.isArray(generated.analysis.flood) ? generated.analysis.flood.length : 0,
      floodTiles: Array.isArray(generated.analysis.flood)
        ? generated.analysis.flood.map((tile) => ({ x: tile.x, y: tile.y, d: tile.d }))
        : [],
      mincutProxy: generated.placements.filter((p) => p.type === RAMPART_TYPE).length,
      roads: roadTiles,
      validation: generated.meta.validation || [],
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
    };
    mem.layout.theoretical.currentlyViewingCandidate =
      typeof mem.layout.currentDisplayCandidateIndex === 'number'
        ? mem.layout.currentDisplayCandidateIndex
        : pipeline.bestCandidateIndex;
    mem.layout.planVersion = 2;
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
    const candidateSet = buildCompendium.buildCandidateSet(roomName, { topN });
    if (!candidateSet || !Array.isArray(candidateSet.candidates) || !candidateSet.candidates.length) {
      return null;
    }

    const runId = `${roomName}:${Game.time}`;
    const manualRequest = mem.layout.manualPhaseRequest || null;
    const pipeline = {
      runId,
      status: 'running',
      startedAt: Game.time,
      updatedAt: Game.time,
      completedAt: null,
      bestCandidateIndex: null,
      activeCandidateIndex: null,
      candidateCount: candidateSet.candidates.length,
      stopAtPhase:
        manualRequest && typeof manualRequest.phaseTo === 'number'
          ? manualRequest.phaseTo
          : 10,
      candidateSet: {
        topN,
        dtThreshold: candidateSet.dtThreshold,
        totalCandidates: candidateSet.totalCandidates,
        filteredCandidates: candidateSet.filteredCandidates,
        swampRatio: candidateSet.swampRatio,
        fallbackUsed: candidateSet.fallbackUsed,
      },
      candidates: candidateSet.candidates.map((candidate) => ({
        index: candidate.index,
        anchor: candidate.anchor,
        initialScore: candidate.initialScore,
        initialMetrics: candidate.initialMetrics,
        initialContributions: candidate.initialContributions,
      })),
      results: {},
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
      { allowDuplicate: true },
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
        },
      );
    }

    return pipeline;
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

    let processed = 0;
    while (processed < plannedBatchSize) {
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
      pipeline.activeCandidateIndex = candidate.index;

      const generated = buildCompendium.generatePlanForAnchor(roomName, candidate.anchor, {
        candidateMeta: candidate,
      });
      if (generated) {
        mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
        mem.layout.theoreticalCandidatePlans[candidate.index] = {
          index: candidate.index,
          anchor: { x: generated.anchor.x, y: generated.anchor.y },
          placements: generated.placements,
          weightedScore:
            generated.evaluation && typeof generated.evaluation.weightedScore === 'number'
              ? generated.evaluation.weightedScore
              : 0,
          weightedMetrics: generated.evaluation ? generated.evaluation.metrics || {} : {},
          weightedContributions:
            generated.evaluation && generated.evaluation.contributions
              ? generated.evaluation.contributions
              : {},
          validation: generated.meta && generated.meta.validation ? generated.meta.validation : [],
          defenseScore:
            generated.meta && typeof generated.meta.defenseScore === 'number'
              ? generated.meta.defenseScore
              : 0,
          completedAt: Game.time,
        };
        pipeline.results[candidate.index] = {
          index: candidate.index,
          weightedScore:
            generated.evaluation && typeof generated.evaluation.weightedScore === 'number'
              ? generated.evaluation.weightedScore
              : 0,
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
      pipeline.activeCandidateIndex = null;
    }

    const completed = Object.keys(pipeline.results || {}).length;
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
      planningRunId: pipeline.runId,
      planningStatus: pipeline.status,
      generatedAt: Game.time,
    });
    this._refreshTheoreticalDisplay(roomName);
    if (completed < pipeline.candidateCount) return;

    const stopAtPhase = typeof pipeline.stopAtPhase === 'number' ? pipeline.stopAtPhase : 10;
    if (stopAtPhase <= 8) {
      pipeline.status = 'paused_phase_8';
      pipeline.completedAt = Game.time;
      this._refreshTheoreticalDisplay(roomName);
      return;
    }

    const ranked = Object.values(pipeline.results).sort(
      (a, b) => (b.weightedScore || 0) - (a.weightedScore || 0),
    );
    const best = ranked[0];
    if (!best) return;
    pipeline.bestCandidateIndex = best.index;
    pipeline.status = stopAtPhase <= 9 ? 'paused_phase_9' : 'completed';
    pipeline.completedAt = Game.time;

    const selectedCandidate = pipeline.candidates.find((c) => c.index === best.index);
    if (!selectedCandidate) return;
    if (stopAtPhase <= 9) {
      mem.layout.theoretical = Object.assign({}, mem.layout.theoretical || {}, {
        selectedCandidateIndex: best.index,
        selectedWeightedScore: best.weightedScore || 0,
        planningStatus: 'paused_phase_9',
        generatedAt: Game.time,
      });
      this._refreshTheoreticalDisplay(roomName);
      return;
    }
    const generated = buildCompendium.generatePlanForAnchor(roomName, selectedCandidate.anchor, {
      candidateMeta: selectedCandidate,
    });
    if (!generated) return;

    this._writeTheoreticalLayoutFromPlan(room, generated, pipeline);
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
        const generated = buildCompendium.generatePlan(roomName);
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
        statsConsole.run([['layoutPlanner.theoretical', Game.cpu.getUsed()]]);
        return;
      }
    }

    this._processTheoreticalPipeline(roomName);
  },
};

module.exports = layoutPlanner;
