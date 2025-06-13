const statsConsole = require('console.console');
/**
 * Draw ghost overlays for planned structures using matrix layout.
 * Toggle via Memory.settings.showLayoutOverlay.
 */
/** @codex-owner layoutVisualizer */
function getGlyph(type) {
  const map = {
    [STRUCTURE_EXTENSION]: 'E',
    [STRUCTURE_STORAGE]: 'S',
    [STRUCTURE_TOWER]: 'T',
    [STRUCTURE_LINK]: 'K',
    [STRUCTURE_SPAWN]: 'P',
    [STRUCTURE_ROAD]: 'R',
    [STRUCTURE_CONTAINER]: 'C',
  };
  return map[type] || '?';
}

const layoutVisualizer = {
  drawLayout(roomName) {
    if (!Memory.settings || !Memory.settings.showLayoutOverlay) return;
    const room = Game.rooms[roomName];
    if (!room || !room.memory.layout) return;
    const start = Game.cpu.getUsed();
    const rcl = room.controller ? room.controller.level : 0;
    const vis = new RoomVisual(roomName);

    const matrix = room.memory.layout.matrix || {};
    for (const x in matrix) {
      for (const y in matrix[x]) {
        const cell = matrix[x][y];
        vis.text(getGlyph(cell.structureType), parseInt(x), parseInt(y), {
          color: 'white',
          font: 0.8,
        });
        if (cell.rcl) {
          vis.text(String(cell.rcl), parseInt(x) + 0.3, parseInt(y) + 0.3, {
            color: '#888888',
            font: 0.5,
          });
        }
      }
    }

    const reserved = room.memory.layout.reserved || {};
    for (const x in reserved) {
      for (const y in reserved[x]) {
        vis.rect(parseInt(x) - 0.5, parseInt(y) - 0.5, 1, 1, {
          fill: 'red',
          opacity: 0.1,
          stroke: 'red',
        });
      }
    }
    statsConsole.run([["layoutVisualizer", Game.cpu.getUsed() - start]]);
  },
};

module.exports = layoutVisualizer;
