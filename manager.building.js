const roomPlanner = require("planner.room");
const statsConsole = require("console.console");

// Configurable weights for different structures
const constructionWeights = {
  spawn: 1000,
  extension: 900,
  tower: 80,
  storage: 70,
  container: 60,
  road: 10,
  default: 50,
};

function getOpenSpots(pos, range) {
  const spots = [];
  const room = Game.rooms[pos.roomName];
  const terrain = room.getTerrain();
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (x < 1 || x > 48 || y < 1 || y > 48) continue;
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
      const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
      if (structures.length === 0 && sites.length === 0) {
        spots.push({ x, y });
      }
    }
  }
  return spots;
}

const buildingManager = {
  cacheBuildableAreas: function (room) {
    const sources = room.find(FIND_SOURCES);
    const buildableAreas = {};

    for (const source of sources) {
      const sourceMem =
        Memory.rooms[room.name] && Memory.rooms[room.name].miningPositions
          ? Memory.rooms[room.name].miningPositions[source.id]
          : null;
      if (sourceMem && sourceMem.positions) {
        const { best1, best2, best3 } = sourceMem.positions;
        buildableAreas[source.id] = [best1, best2, best3].filter(Boolean);
      } else {
        const positions = roomPlanner.findMiningPositions(room)[source.id];
        buildableAreas[source.id] = positions;
      }
    }

    room.memory.buildableAreas = buildableAreas;
    room.memory.lastCacheUpdate = Game.time;
  },

  shouldUpdateCache: function (room) {
    if (!room.memory.buildableAreas) {
      return true; // Initial cache creation
    }

    const lastCacheUpdate = room.memory.lastCacheUpdate || 0;
    const ticksSinceLastUpdate = Game.time - lastCacheUpdate;
    const controllerLevel = room.controller.level;
    const lastControllerLevel = room.memory.lastControllerLevel || 0;

    // Update if controller level changed or if it's been more than 1000 ticks
    if (
      controllerLevel !== lastControllerLevel ||
      ticksSinceLastUpdate > 1000
    ) {
      room.memory.lastControllerLevel = controllerLevel;
      return true;
    }

    return false;
  },

  buildInfrastructure: function (room) {
    if (this.shouldUpdateCache(room)) {
      this.cacheBuildableAreas(room);
      statsConsole.log(`Recalculated buildable areas for room ${room.name}`, 6);
    }

    this.manageBuildingQueue(room);

    if (room.controller.level >= 2) {
      this.buildContainers(room);
      this.buildExtensions(room);
    }
  },

  manageBuildingQueue: function (room) {
    const buildingQueue = [];

    const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
    for (const site of constructionSites) {
      const priority = this.calculatePriority(site);

      buildingQueue.push({
        id: site.id,
        pos: site.pos,
        priority: priority,
        type: site.structureType,
      });
    }

    buildingQueue.sort((a, b) => b.priority - a.priority);
    room.memory.buildingQueue = buildingQueue;
  },

  calculatePriority: function (site) {
    let weight =
      constructionWeights[site.structureType] || constructionWeights.default;
    // Additional logic to adjust weight based on distance or other factors can be added here
    return weight;
  },

  buildContainers: function (room) {
    const sources = room.find(FIND_SOURCES);
    for (const source of sources) {
      const sourceMem =
        Memory.rooms[room.name] && Memory.rooms[room.name].miningPositions
          ? Memory.rooms[room.name].miningPositions[source.id]
          : null;
      const best = sourceMem && sourceMem.positions && sourceMem.positions.best1;
      const posData = best || (room.memory.buildableAreas[source.id] || [])[0];
      if (posData) {
        const containerPos = new RoomPosition(posData.x, posData.y, room.name);
        const containerSite = containerPos
          .lookFor(LOOK_CONSTRUCTION_SITES)
          .filter((site) => site.structureType === STRUCTURE_CONTAINER);
        const containerStructure = containerPos
          .lookFor(LOOK_STRUCTURES)
          .filter((struct) => struct.structureType === STRUCTURE_CONTAINER);
        if (containerSite.length === 0 && containerStructure.length === 0) {
          room.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
          statsConsole.log(
            `Queued container construction at ${containerPos}`,
            6,
          );
        }
      }
    }

    // Controller containers
    if (room.controller) {
      const controllerContainers = room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: s => s.structureType === STRUCTURE_CONTAINER,
      });
      const controllerSites = room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
        filter: s => s.structureType === STRUCTURE_CONTAINER,
      });
      if (controllerContainers.length + controllerSites.length < 2) {
        // Prefer placing containers at the maximum upgrade range
        const spots = getOpenSpots(room.controller.pos, 3).filter(p =>
          new RoomPosition(p.x, p.y, room.name).getRangeTo(room.controller) === 3,
        );
        for (const spot of spots) {
          if (controllerContainers.length + controllerSites.length >= 2) break;
          const pos = new RoomPosition(spot.x, spot.y, room.name);
          const site = pos.lookFor(LOOK_CONSTRUCTION_SITES).filter(s => s.structureType === STRUCTURE_CONTAINER);
          const struct = pos.lookFor(LOOK_STRUCTURES).filter(s => s.structureType === STRUCTURE_CONTAINER);
          if (site.length === 0 && struct.length === 0) {
            room.createConstructionSite(pos, STRUCTURE_CONTAINER);
            controllerSites.push({});
            statsConsole.log(`Queued controller container at ${pos}`, 6);
          }
        }
      }
    }

    // Spawn buffer container
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (spawn) {
      const nearbyContainers = spawn.pos.findInRange(FIND_STRUCTURES, 2, {
        filter: s => s.structureType === STRUCTURE_CONTAINER,
      });
      const nearbySites = spawn.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
        filter: s => s.structureType === STRUCTURE_CONTAINER,
      });
      if (nearbyContainers.length + nearbySites.length === 0) {
        const spots = getOpenSpots(spawn.pos, 2);
        if (spots.length > 0) {
          const pos = new RoomPosition(spots[0].x, spots[0].y, room.name);
          room.createConstructionSite(pos, STRUCTURE_CONTAINER);
          statsConsole.log(`Queued spawn buffer container at ${pos}`, 6);
        }
      }
    }
  },

  buildExtensions: function (room) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (spawn) {
      const extensionSites = room.find(FIND_CONSTRUCTION_SITES, {
        filter: (site) => site.structureType === STRUCTURE_EXTENSION,
      });

      const extensions = room.find(FIND_MY_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_EXTENSION,
      });

      // Determine how many extensions this RCL allows
      const maxExtensions =
        CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
      if (extensions.length + extensionSites.length < maxExtensions) {
        const positions = [
          { x: -2, y: -2 },
          { x: -2, y: 2 },
          { x: 2, y: -2 },
          { x: 2, y: 2 },
          { x: -3, y: 0 },
          { x: 3, y: 0 },
          { x: 0, y: -3 },
          { x: 0, y: 3 },
        ];

        for (let i = 0; i < positions.length; i++) {
          const pos = new RoomPosition(
            spawn.pos.x + positions[i].x,
            spawn.pos.y + positions[i].y,
            room.name,
          );
          const structuresAtPos = pos.lookFor(LOOK_STRUCTURES);
          const constructionSitesAtPos = pos.lookFor(LOOK_CONSTRUCTION_SITES);

          if (
            structuresAtPos.length === 0 &&
            constructionSitesAtPos.length === 0
          ) {
            const result = pos.createConstructionSite(STRUCTURE_EXTENSION);
            if (result === OK) {
              statsConsole.log(`Queued extension construction at ${pos}`, 6);
              break;
            } else {
              statsConsole.log(
                `Failed to queue extension construction at ${pos} with error ${result}`,
                6,
              );
            }
          }
        }
      }
    }
  },

  setConstructionWeight: function (structureType, weight) {
    constructionWeights[structureType] = weight;
  },
};

module.exports = buildingManager;
