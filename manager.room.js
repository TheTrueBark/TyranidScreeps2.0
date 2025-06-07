const roomManager = {
  /**
   * Scans the room to gather information about sources and other room-specific data.
   * @param {Room} room - The room object to scan.
   */
  scanRoom: function (room) {
    if (!Memory.rooms) {
      Memory.rooms = {};
    }
    if (!Memory.rooms[room.name]) {
      Memory.rooms[room.name] = {};
    }

    const sources = room.find(FIND_SOURCES);
    Memory.rooms[room.name].miningPositions = {};

    sources.forEach((source) => {
      const spawn = room.find(FIND_MY_SPAWNS)[0]; // Assuming there's at least one spawn
      const sourcePos = source.pos;
      const potentialMiningSpots = [
        { x: sourcePos.x + 1, y: sourcePos.y },
        { x: sourcePos.x - 1, y: sourcePos.y },
        { x: sourcePos.x, y: sourcePos.y + 1 },
        { x: sourcePos.x, y: sourcePos.y - 1 },
        { x: sourcePos.x + 1, y: sourcePos.y + 1 },
        { x: sourcePos.x + 1, y: sourcePos.y - 1 },
        { x: sourcePos.x - 1, y: sourcePos.y + 1 },
        { x: sourcePos.x - 1, y: sourcePos.y - 1 },
      ];

      // Filter out positions that are walls
      const miningSpots = potentialMiningSpots.filter(
        (spot) => room.getTerrain().get(spot.x, spot.y) !== TERRAIN_MASK_WALL,
      );

      // Sort mining spots by distance to spawn
      miningSpots.sort(
        (a, b) =>
          spawn.pos.getRangeTo(a.x, a.y) - spawn.pos.getRangeTo(b.x, b.y),
      );

      // Limit to a maximum of 3 positions
      const bestPositions = miningSpots.slice(0, 3);

      // Structure the memory as an object without ES6 spread
      Memory.rooms[room.name].miningPositions[source.id] = {
        x: sourcePos.x,
        y: sourcePos.y,
        positions: {
          best1: bestPositions[0]
            ? {
                x: bestPositions[0].x,
                y: bestPositions[0].y,
                roomName: room.name,
                reserved: false,
              }
            : null,
          best2: bestPositions[1]
            ? {
                x: bestPositions[1].x,
                y: bestPositions[1].y,
                roomName: room.name,
                reserved: false,
              }
            : null,
          best3: bestPositions[2]
            ? {
                x: bestPositions[2].x,
                y: bestPositions[2].y,
                roomName: room.name,
                reserved: false,
              }
            : null,
        },
      };
    });

    // Additional room-specific data can be gathered here
    const structures = room.find(FIND_STRUCTURES);
    Memory.rooms[room.name].structures = structures.map((structure) => ({
      id: structure.id,
      structureType: structure.structureType,
      pos: { x: structure.pos.x, y: structure.pos.y },
    }));

    const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
    Memory.rooms[room.name].constructionSites = constructionSites.map(
      (site) => ({
        id: site.id,
        structureType: site.structureType,
        pos: { x: site.pos.x, y: site.pos.y },
      }),
    );
  },

  // Other update functions remain unchanged

  /**
   * Updates the room memory with the latest information about creeps.
   * @param {Room} room - The room object to update.
   */
  updateCreeps: function (room) {
    const creeps = room.find(FIND_CREEPS);
    Memory.rooms[room.name].creeps = creeps.map((creep) => ({
      id: creep.id,
      name: creep.name,
      role: creep.memory.role,
      pos: { x: creep.pos.x, y: creep.pos.y },
    }));
  },

  /**
   * Updates the room memory with the latest information about towers.
   * @param {Room} room - The room object to update.
   */
  updateTowers: function (room) {
    const towers = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_TOWER },
    });
    Memory.rooms[room.name].towers = towers.map((tower) => ({
      id: tower.id,
      pos: { x: tower.pos.x, y: tower.pos.y },
    }));
  },

  /**
   * Updates the room memory with the latest information about spawns.
   * @param {Room} room - The room object to update.
   */
  updateSpawns: function (room) {
    const spawns = room.find(FIND_MY_SPAWNS);
    Memory.rooms[room.name].spawns = spawns.map((spawn) => ({
      id: spawn.id,
      pos: { x: spawn.pos.x, y: spawn.pos.y },
    }));
  },
};

module.exports = roomManager;
