const logger = require("./logger");

const pathCache = {};

const managerPathfinder = {
  calculateNextPosition(creep, targetPos, costs) {
    if (!targetPos || targetPos.x === undefined || targetPos.y === undefined) {
      logger.log(
        "pathfinder",
        `Invalid targetPos for creep ${creep.name}: ${JSON.stringify(targetPos)}`,
        3,
      );
      return null;
    }

    logger.log(
      "pathfinder",
      `Creep ${creep.name} pathfinding from (${creep.pos.x}, ${creep.pos.y}) in room ${creep.room.name} to (${targetPos.x}, ${targetPos.y}) in room ${targetPos.roomName}`,
      2,
    );

    // Validate room name
    if (!Game.rooms[targetPos.roomName]) {
      logger.log("pathfinder", `Invalid room name: ${targetPos.roomName}`, 3);
      return null;
    }

    const rangeToTarget = creep.pos.getRangeTo(targetPos);
    if (rangeToTarget === 1) {
      logger.log(
        "pathfinder",
        `Creep ${creep.name} is already within range 1 of the target position (${targetPos.x}, ${targetPos.y})`,
        2,
      );
      return { x: targetPos.x, y: targetPos.y };
    }

    const cacheKey = `${creep.pos.x},${creep.pos.y}-${targetPos.x},${targetPos.y}`;
    if (pathCache[cacheKey]) {
      const nextPos = pathCache[cacheKey].shift();
      if (pathCache[cacheKey].length === 0) delete pathCache[cacheKey];
      return nextPos;
    }

    const path = PathFinder.search(
      creep.pos,
      { pos: targetPos, range: 1 },
      {
        roomCallback: (roomName) => {
          let costMatrix = new PathFinder.CostMatrix();
          const room = Game.rooms[roomName];

          if (!room) return costMatrix;

          // Set costs for non-walkable construction sites
          room.find(FIND_CONSTRUCTION_SITES).forEach((site) => {
            if (
              site.structureType !== STRUCTURE_ROAD &&
              site.structureType !== STRUCTURE_CONTAINER &&
              site.structureType !== STRUCTURE_RAMPART
            ) {
              costMatrix.set(site.pos.x, site.pos.y, 255);
            }
          });

          // Set costs for non-walkable structures
          room.find(FIND_STRUCTURES).forEach((structure) => {
            if (
              structure.structureType !== STRUCTURE_ROAD &&
              structure.structureType !== STRUCTURE_CONTAINER &&
              (structure.structureType !== STRUCTURE_RAMPART || !structure.my)
            ) {
              costMatrix.set(structure.pos.x, structure.pos.y, 255);
            }
          });

          if (costs) {
            for (let i = 0; i < 50; i++) {
              for (let j = 0; j < 50; j++) {
                costMatrix.set(i, j, costs.get(i, j));
              }
            }
          }
          return costMatrix;
        },
        plainCost: 2,
        swampCost: 10,
        maxOps: 5000,
        maxRooms: 1,
        heuristicWeight: 1.0,
      },
    );

    if (path.incomplete) {
      logger.log(
        "pathfinder",
        `Path incomplete for creep ${creep.name}, path: ${JSON.stringify(path.path)}`,
        3,
      );
      return null;
    } else {
      pathCache[cacheKey] = path.path;
      const nextPos = path.path.shift();
      return nextPos;
    }
  },

  updateCache(room) {
    // Invalidate and recalculate paths for the room
    for (const key in pathCache) {
      const [start, end] = key.split("-");
      const [startX, startY] = start.split(",").map(Number);
      const [endX, endY] = end.split(",").map(Number);
      const startPos = new RoomPosition(startX, startY, room.name);
      const endPos = new RoomPosition(endX, endY, room.name);

      const path = PathFinder.search(startPos, { pos: endPos, range: 1 });
      pathCache[key] = path.path;
    }
  },
};

module.exports = managerPathfinder;
