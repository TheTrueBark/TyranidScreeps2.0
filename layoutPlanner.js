const statsConsole = require('console.console');

/**
 * Layout planner using simple stamps anchored near the spawn.
 * @codex-owner layoutPlanner
 */

// Compact plus shaped extension pattern
const extensionStamp = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

function placeStamp(anchor, stamp, rcl, type, origin = 'starterStamp') {
  const placed = [];
  const terrain = Game.map.getRoomTerrain(anchor.roomName);
  for (const off of stamp) {
    const x = anchor.x + off.x;
    const y = anchor.y + off.y;
    if (terrain.get(x, y) !== 'wall') {
      placed.push({ x, y, rcl, structureType: type, origin });
    }
  }

  if (!Memory.rooms[anchor.roomName].baseLayout) {
    Memory.rooms[anchor.roomName].baseLayout = {
      anchor: { x: anchor.x, y: anchor.y },
      stamps: {},
      layoutUpgraded: false,
    };
  }

  if (!Memory.rooms[anchor.roomName].baseLayout.stamps[type]) {
    Memory.rooms[anchor.roomName].baseLayout.stamps[type] = [];
  }

  Memory.rooms[anchor.roomName].baseLayout.stamps[type].push(...placed);
}

const layoutPlanner = {
  /**
   * Generate a base layout if missing or restructuring.
   * @param {Room} room
   */
  planBaseLayout(room) {
    const start = Game.cpu.getUsed();
    if (!room.controller || !room.controller.my) return;
    if (room.memory.baseLayout && !room.memory.restructureAtRCL) return;

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    const anchor = { x: spawn.pos.x, y: spawn.pos.y, roomName: room.name };
    placeStamp(anchor, extensionStamp, 2, STRUCTURE_EXTENSION);
    if (room.memory.restructureAtRCL) delete room.memory.restructureAtRCL;

    statsConsole.run([["layoutPlanner", Game.cpu.getUsed() - start]]);
  },
};

module.exports = layoutPlanner;
