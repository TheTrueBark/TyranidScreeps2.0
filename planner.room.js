const roomPlanner = {
  findMiningPositions: function (room) {
    const sources = room.find(FIND_SOURCES);
    const miningPositions = {};

    for (const source of sources) {
      const terrain = room.getTerrain();
      const positions = [];
      for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
          if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
            positions.push(new RoomPosition(x, y, room.name));
          }
        }
      }
      miningPositions[source.id] = positions;
    }

    return miningPositions;
  },
};

module.exports = roomPlanner;
