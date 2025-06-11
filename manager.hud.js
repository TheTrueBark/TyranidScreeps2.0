// hudManager.js
const visualizer = require("manager.visualizer");
const layoutVisualizer = require('./layoutVisualizer');

module.exports = {
  createHUD: function (room) {
    if (!visualizer.enabled) return;

    // Controller level near controller
    if (room.controller) {
      visualizer.showInfo([`RCL: ${room.controller.level}`], {
        room: room,
        pos: room.controller.pos,
      });
    }

    // Mark energy sources
    const sources = room.find(FIND_SOURCES);
    for (const source of sources) {
      visualizer.circle(source.pos, "yellow");
    }

    // Task summary for this colony
    const tasks =
      (Memory.htm &&
        Memory.htm.colonies &&
        Memory.htm.colonies[room.name] &&
        Memory.htm.colonies[room.name].tasks) || [];
    const taskLines = tasks.map((t) => `${t.name} (${t.amount})`);
    if (taskLines.length > 0) {
      visualizer.showInfo(
        taskLines,
        { room: room, pos: new RoomPosition(48, 1, room.name) },
        { align: 'right' },
      );
    }

    layoutVisualizer.draw(room);
  },
};
