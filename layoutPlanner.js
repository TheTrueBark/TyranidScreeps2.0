const statsConsole = require('console.console');

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
  },
};

module.exports = layoutPlanner;
