/** Utility to check if a tile is reserved by the layout plan. */
const blocker = {
  isTileBlocked(roomName, x, y) {
    const mem = Memory.rooms[roomName];
    return !!(
      mem &&
      mem.layout &&
      mem.layout.reserved &&
      mem.layout.reserved[x] &&
      mem.layout.reserved[x][y]
    );
  },
};

module.exports = blocker;
