const Visualizer = {
  get enabled() {
    return Memory.settings && Memory.settings.enableVisuals;
  },

  circle(pos, color = 'red', opts = {}) {
    if (!this.enabled) return;
    _.defaults(opts, { fill: color, radius: 0.35, opacity: 0.5 });
    new RoomVisual(pos.roomName).circle(pos.x, pos.y, opts);
  },

  drawLayout(layout, anchor, opts = {}) {
    if (!this.enabled) return;
    _.defaults(opts, { opacity: 0.5 });
    const vis = new RoomVisual(anchor.roomName);
    for (const type in layout) {
      for (const pos of layout[type]) {
        vis.structure(anchor.x + pos.x, anchor.y + pos.y, type, opts);
      }
    }
    vis.connectRoads(opts);
  },

  drawRoads(positions) {
    if (!this.enabled) return;
    const byRoom = _.groupBy(positions, (p) => p.roomName);
    for (const roomName in byRoom) {
      const vis = new RoomVisual(roomName);
      for (const pos of byRoom[roomName]) {
        vis.structure(pos.x, pos.y, STRUCTURE_ROAD);
      }
      vis.connectRoads();
    }
  },

  showInfo(lines, origin, opts = {}) {
    if (!this.enabled) return;
    const pos = origin.pos || origin;
    const roomName = pos.roomName || (origin.room && origin.room.name);
    const vis = new RoomVisual(roomName);
    if (!Array.isArray(lines)) lines = [String(lines)];
    lines.forEach((line, i) => vis.text(line, pos.x, pos.y + i, opts));
  },

  barGraph(progress, pos, width = 7, scale = 1) {
    if (!this.enabled) return;
    const vis = new RoomVisual(pos.roomName);
    let percent;
    if (Array.isArray(progress)) {
      percent = progress[0] / progress[1];
    } else {
      percent = progress;
    }
    const height = 0.8 * scale;
    vis.rect(pos.x, pos.y - height, width, height, { stroke: '#ffffff', opacity: 0.3 });
    vis.rect(pos.x, pos.y - height, width * percent, height, { fill: '#ffffff', opacity: 0.6, strokeWidth: 0 });
    const text = Array.isArray(progress)
      ? `${progress[0]}/${progress[1]}`
      : `${Math.round(percent * 100)}%`;
    vis.text(text, pos.x + width / 2, pos.y - height / 2, {
      color: '#ffffff',
      align: 'center',
      font: `${0.8 * scale} Trebuchet MS`,
    });
  },
};

module.exports = Visualizer;
