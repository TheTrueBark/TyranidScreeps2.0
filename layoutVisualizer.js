const statsConsole = require('console.console');
const htm = require('./manager.htm');

/**
 * Draw ghost overlays for planned structures.
 * Toggle via Memory.settings.showLayoutOverlay.
 */
/** @codex-owner layoutVisualizer */
const layoutVisualizer = {
  draw(room) {
    if (!Memory.settings || !Memory.settings.showLayoutOverlay) return;
    if (!room.memory.baseLayout) return;
    const start = Game.cpu.getUsed();
    const rcl = room.controller ? room.controller.level : 0;
    const vis = new RoomVisual(room.name);

    for (const type in room.memory.baseLayout.stamps) {
      room.memory.baseLayout.stamps[type].forEach((pos) => {
        const struct = pos.structureType || type;
        const built = room
          .lookForAt(LOOK_STRUCTURES, pos.x, pos.y)
          .some((s) => s.structureType === struct);
        const queued =
          room
            .lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y)
            .some((s) => s.structureType === struct) ||
          htm.taskExistsAt(htm.LEVELS.COLONY, room.name, 'BUILD_LAYOUT_PART', {
            x: pos.x,
            y: pos.y,
            structureType: struct,
          });
        let color = 'white';
        if (built) color = '#00ff00';
        else if (queued) color = '#ffff00';
        else if (pos.rcl > rcl) color = '#555555';

        vis.structure(pos.x, pos.y, struct, { opacity: 0.3, stroke: color });
      });
    }
    statsConsole.run([["layoutVisualizer", Game.cpu.getUsed() - start]]);
  },
};

module.exports = layoutVisualizer;
