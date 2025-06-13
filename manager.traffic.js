const logger = require("./logger");

let movementMap;
let visitedCreeps;

const trafficManager = {
  init() {
    Creep.prototype.registerMove = function (target) {
      let targetPosition;

      if (Number.isInteger(target)) {
        const deltaCoords = directionDelta[target];
        targetPosition = {
          x: Math.max(0, Math.min(49, this.pos.x + deltaCoords.x)),
          y: Math.max(0, Math.min(49, this.pos.y + deltaCoords.y)),
        };
      } else {
        targetPosition = target;
      }

      const packedCoord = packCoordinates(targetPosition);
      this._intendedPackedCoord = packedCoord;

      logger.log(
        "trafficManager",
        `Creep ${this.name} registered move to (${targetPosition.x}, ${targetPosition.y}) with packedCoord ${packedCoord}`,
        2,
      );
    };

    Creep.prototype.setWorkingArea = function (pos, range) {
      this._workingPos = pos;
      this._workingRange = range;
    };
  },

  run(room, costs, threshold) {
    movementMap = new Map();
    const creepsInRoom = room.find(FIND_MY_CREEPS);
    const creepsWithMovementIntent = [];

    for (const creep of creepsInRoom) {
      assignCreepToCoordinate(creep, creep.pos);
      if (creep._intendedPackedCoord) {
        creepsWithMovementIntent.push(creep);
      }
    }

    for (const creep of creepsWithMovementIntent) {
      if (creep._matchedPackedCoord === creep._intendedPackedCoord) {
        logger.log(
          "trafficManager",
          `Creep ${creep.name} already at intended position (${unpackCoordinates(creep._matchedPackedCoord).x}, ${unpackCoordinates(creep._matchedPackedCoord).y})`,
          2,
        );
        continue;
      }

      visitedCreeps = {};

      movementMap.delete(creep._matchedPackedCoord);
      creep._matchedPackedCoord = undefined;

      if (depthFirstSearch(creep, 0, costs, threshold) > 0) {
        logger.log("trafficManager", `Creep ${creep.name} successfully found a path`, 2);
        continue;
      }

      assignCreepToCoordinate(creep, creep.pos);
    }

    for (const creep of creepsInRoom) {
      const matchedPosition = unpackCoordinates(creep._matchedPackedCoord);

      if (creep.pos.isEqualTo(matchedPosition.x, matchedPosition.y)) {
        logger.log(
          "trafficManager",
          `Creep ${creep.name} is already at position (${matchedPosition.x}, ${matchedPosition.y})`,
          2,
        );
        continue;
      }

      const direction = creep.pos.getDirectionTo(
        matchedPosition.x,
        matchedPosition.y,
      );

      logger.log(
        "trafficManager",
        `Creep ${creep.name} moving from (${creep.pos.x}, ${creep.pos.y}) to (${matchedPosition.x}, ${matchedPosition.y}) in direction ${direction}`,
        2,
      );

      const moveResult = creep.move(direction);

      logger.log(
        "trafficManager",
        `Creep ${creep.name} move result: ${moveResult}`,
        2,
      );

      if (moveResult !== OK) {
        logger.log(
          "trafficManager",
          `Creep ${creep.name} failed to move in direction ${direction} with error ${moveResult}`,
          3,
        );
      } else {
        logger.log(
          "trafficManager",
          `Creep ${creep.name} successfully moved to direction ${direction}`,
          2,
        );
      }
    }
  },
};

function depthFirstSearch(creep, currentScore = 0, costs, threshold) {
  visitedCreeps[creep.name] = true;

  const possibleMoves = getPossibleMoves(creep, costs, threshold);

  const emptyTiles = [];

  const occupiedTiles = [];

  for (const coord of possibleMoves) {
    const packedCoord = packCoordinates(coord);
    if (movementMap.get(packedCoord)) {
      occupiedTiles.push(coord);
    } else {
      emptyTiles.push(coord);
    }
  }

  for (const coord of [...emptyTiles, ...occupiedTiles]) {
    let score = currentScore;
    const packedCoord = packCoordinates(coord);

    if (creep._intendedPackedCoord === packedCoord) {
      score++;
    }

    const occupyingCreep = movementMap.get(packedCoord);

    if (!occupyingCreep) {
      if (score > 0) {
        assignCreepToCoordinate(creep, coord);
        logger.log(
          "trafficManager",
          `Creep ${creep.name} assigned to new position (${coord.x}, ${coord.y})`,
          2,
        );
      }
      return score;
    }

    if (!visitedCreeps[occupyingCreep.name]) {
      if (occupyingCreep._intendedPackedCoord === packedCoord) {
        score--;
      }

      const result = depthFirstSearch(occupyingCreep, score, costs, threshold);

      if (result > 0) {
        assignCreepToCoordinate(creep, coord);
        logger.log(
          "trafficManager",
          `Creep ${creep.name} re-assigned to position (${coord.x}, ${coord.y}) after DFS`,
          2,
        );
        return result;
      }
    }
  }

  return -Infinity;
}

function getPossibleMoves(creep, costs, threshold = 255) {
  if (creep.fatigue > 0) {
    logger.log(
      "trafficManager",
      `Creep ${creep.name} cannot move due to fatigue`,
      3,
    );
    return [];
  }

  const possibleMoves = [];

  if (creep._intendedPackedCoord) {
    possibleMoves.unshift(unpackCoordinates(creep._intendedPackedCoord));
    return possibleMoves;
  }

  const adjacentCoords = Object.values(directionDelta).map((delta) => {
    return { x: creep.pos.x + delta.x, y: creep.pos.y + delta.y };
  });

  const roomTerrain = Game.map.getRoomTerrain(creep.room.name);

  for (const adjacentCoord of _.shuffle(adjacentCoords)) {
    if (
      roomTerrain.get(adjacentCoord.x, adjacentCoord.y) === TERRAIN_MASK_WALL
    ) {
      continue;
    }

    if (
      adjacentCoord.x === 0 ||
      adjacentCoord.x === 49 ||
      adjacentCoord.y === 0 ||
      adjacentCoord.y === 49
    ) {
      continue;
    }

    if (costs && costs.get(adjacentCoord.x, adjacentCoord.y) >= threshold) {
      continue;
    }

    possibleMoves.push(adjacentCoord);
  }

  return possibleMoves;
}

const directionDelta = {
  [TOP]: { x: 0, y: -1 },
  [TOP_RIGHT]: { x: 1, y: -1 },
  [RIGHT]: { x: 1, y: 0 },
  [BOTTOM_RIGHT]: { x: 1, y: 1 },
  [BOTTOM]: { x: 0, y: 1 },
  [BOTTOM_LEFT]: { x: -1, y: 1 },
  [LEFT]: { x: -1, y: 0 },
  [TOP_LEFT]: { x: -1, y: -1 },
};

function assignCreepToCoordinate(creep, coord) {
  const packedCoord = packCoordinates(coord);
  creep._matchedPackedCoord = packedCoord;
  movementMap.set(packedCoord, creep);
}

function packCoordinates(coord) {
  return 50 * coord.y + coord.x;
}

function unpackCoordinates(packedCoord) {
  const x = packedCoord % 50;
  const y = (packedCoord - x) / 50;
  return { x, y };
}

module.exports = trafficManager;
