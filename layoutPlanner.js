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
};

module.exports = layoutPlanner;
