const statsConsole = require('console.console');
const distanceTransform = require('./algorithm.distanceTransform');
const htm = require('./manager.htm');
const constructionBlocker = require('./constructionBlocker');

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
const SPAWN_TYPE = typeof STRUCTURE_SPAWN !== 'undefined' ? STRUCTURE_SPAWN : 'spawn';
const EXTENSION_TYPE = typeof STRUCTURE_EXTENSION !== 'undefined' ? STRUCTURE_EXTENSION : 'extension';
const TOWER_TYPE = typeof STRUCTURE_TOWER !== 'undefined' ? STRUCTURE_TOWER : 'tower';
const STORAGE_TYPE = typeof STRUCTURE_STORAGE !== 'undefined' ? STRUCTURE_STORAGE : 'storage';
const LINK_TYPE = typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link';
const CONTAINER_TYPE = typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container';
const TERRAIN_WALL_MASK =
  typeof TERRAIN_MASK_WALL !== 'undefined' ? TERRAIN_MASK_WALL : 1;

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
      if (
        !mem ||
        !mem.layout ||
        mem.layout.planVersion !== 2 ||
        mem.layout.mode !== 'theoretical'
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
      if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) return false;
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
          .lookForAt(LOOK_STRUCTURES, pos.x, pos.y)
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

  /**
   * Build a theoretical, spawn-independent room plan for overlays.
   * This mode avoids construction and is intended for visual evaluation only.
   * @param {string} roomName
   */
  buildTheoreticalLayout(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return;
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    const mem = Memory.rooms[roomName];
    if (!mem.layout) mem.layout = {};
    mem.layout.matrix = {};
    mem.layout.reserved = {};
    mem.layout.roadMatrix = {};
    mem.layout.status = mem.layout.status || { clusters: {}, structures: {} };
    mem.layout.mode = 'theoretical';

    if (!room.memory.distanceTransform) {
      distanceTransform.distanceTransform(room);
    }
    const wallDistance = room.memory.distanceTransform || distanceTransform.distanceTransform(room);
    const controllerPos = { x: room.controller.pos.x, y: room.controller.pos.y };
    const controllerDistances = computeControllerDistanceMap(room, controllerPos);
    const controllerDistanceMap = toArrayMap(controllerDistances);
    const sources = findRoomSources(room);

    const upgraderSlots = chooseUpgraderBlock(room, controllerPos, wallDistance);
    const spawnCandidate = chooseTheoreticalSpawn(
      room,
      controllerPos,
      sources,
      wallDistance,
      controllerDistances,
      upgraderSlots,
    );
    if (!spawnCandidate) return;
    const theoreticalSpawn = { x: spawnCandidate.x, y: spawnCandidate.y };
    const controllerContainer = chooseControllerContainer(
      room,
      controllerPos,
      upgraderSlots,
      theoreticalSpawn,
    );
    const sourceContainers = chooseSourceContainers(room, theoreticalSpawn, sources).slice(0, 2);

    const pointsToConnect = [];
    if (controllerContainer) pointsToConnect.push(controllerContainer);
    for (const slot of upgraderSlots) pointsToConnect.push(slot);
    for (const src of sourceContainers) pointsToConnect.push(src);

    const roadSet = new Set();
    for (const target of pointsToConnect) {
      for (const step of pathRoad(room, theoreticalSpawn, target)) {
        roadSet.add(key(step.x, step.y));
      }
    }
    const roadTiles = [...roadSet].map(parseKey);
    writeRoadMatrix(mem.layout, roadTiles);

    const reserveCell = (x, y, data = {}) => {
      if (!inBounds(x, y)) return;
      if (!mem.layout.reserved[x]) mem.layout.reserved[x] = {};
      mem.layout.reserved[x][y] = true;
      if (!mem.layout.matrix[x]) mem.layout.matrix[x] = {};
      mem.layout.matrix[x][y] = Object.assign(
        {
          planned: true,
          plannedBy: 'layoutPlanner',
          blockedUntil: Game.time + 10000,
          rcl: 1,
        },
        data,
      );
    };

    reserveCell(theoreticalSpawn.x, theoreticalSpawn.y, { structureType: SPAWN_TYPE, rcl: 1 });
    if (controllerContainer) {
      reserveCell(controllerContainer.x, controllerContainer.y, { structureType: CONTAINER_TYPE, rcl: 1 });
    }
    for (const src of sourceContainers) {
      reserveCell(src.x, src.y, { structureType: CONTAINER_TYPE, rcl: 1, sourceId: src.sourceId });
    }
    for (const p of [
      { dx: 1, dy: 0, type: EXTENSION_TYPE, rcl: 2 },
      { dx: -1, dy: 0, type: EXTENSION_TYPE, rcl: 2 },
      { dx: 0, dy: 1, type: EXTENSION_TYPE, rcl: 2 },
      { dx: 0, dy: -1, type: EXTENSION_TYPE, rcl: 2 },
      { dx: 1, dy: 1, type: TOWER_TYPE, rcl: 3 },
      { dx: -1, dy: -1, type: TOWER_TYPE, rcl: 3 },
      { dx: 1, dy: -1, type: STORAGE_TYPE, rcl: 4 },
      { dx: -1, dy: 1, type: LINK_TYPE, rcl: 5 },
    ]) {
      const x = theoreticalSpawn.x + p.dx;
      const y = theoreticalSpawn.y + p.dy;
      if (!inBounds(x, y) || !isWalkable(room, x, y)) continue;
      reserveCell(x, y, { structureType: p.type, rcl: p.rcl });
    }
    for (const rt of roadTiles) {
      if (!inBounds(rt.x, rt.y)) continue;
      if (!mem.layout.matrix[rt.x]) mem.layout.matrix[rt.x] = {};
      if (mem.layout.matrix[rt.x][rt.y]) continue;
      mem.layout.matrix[rt.x][rt.y] = {
        structureType: ROAD_TYPE,
        rcl: 1,
        planned: true,
        plannedBy: 'layoutPlanner',
        blockedUntil: Game.time + 10000,
      };
    }

    mem.layout.theoretical = {
      controllerPos,
      spawnCandidate,
      upgraderSlots,
      controllerContainer,
      sourceContainers,
      wallDistance,
      controllerDistance: controllerDistanceMap,
      floodScore: floodFillScore(room, theoreticalSpawn, 12),
      mincutProxy: mincutProxyScore(room, theoreticalSpawn, 8),
      roads: roadTiles,
      generatedAt: Game.time,
    };
    mem.layout.planVersion = 2;
    statsConsole.run([['layoutPlanner.theoretical', Game.cpu.getUsed()]]);
  },
};

module.exports = layoutPlanner;
