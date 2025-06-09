const roomPlanner = require("planner.room");
const statsConsole = require("console.console");
const scheduler = require('./scheduler');

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

    if (room.controller.level >= 1) {
      this.buildSourceContainers(room);
    }

    if (room.controller.level >= 2) {
      this.buildExtensions(room);
    }

    if (room.controller.level >= 1) {
      this.buildControllerContainers(room);
      // Buffer container near the spawn is no longer required
      // this.buildBufferContainer(room);
    }
  },

  manageBuildingQueue: function (room) {
    const buildingQueue = [];
    const prevLength = (room.memory.buildingQueue || []).length;

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
    if (prevLength !== buildingQueue.length) {
      const scheduler = require('./scheduler');
      scheduler.triggerEvent('roleUpdate', { room: room.name });
    }
  },

  calculatePriority: function (site) {
    let weight =
      constructionWeights[site.structureType] || constructionWeights.default;
    // Additional logic to adjust weight based on distance or other factors can be added here
    return weight;
  },

  buildSourceContainers: function (room) {
    const sources = room.find(FIND_SOURCES);
    for (const source of sources) {
      // Skip if any container or site already exists around the source
      const existingContainers = source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: s => s.structureType === STRUCTURE_CONTAINER,
      });
      const existingSites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
        filter: s => s.structureType === STRUCTURE_CONTAINER,
      });
      if (existingContainers.length + existingSites.length > 0) {
        // Remove duplicate sites to keep only one
        for (let i = 1; i < existingSites.length; i++) {
          existingSites[i].remove();
        }
        continue;
      }

      const sourceMem =
        Memory.rooms[room.name] && Memory.rooms[room.name].miningPositions
          ? Memory.rooms[room.name].miningPositions[source.id]
          : null;
      const best = sourceMem && sourceMem.positions && sourceMem.positions.best1;
      const posData = best || (room.memory.buildableAreas[source.id] || [])[0];
      if (posData) {
        const containerPos = new RoomPosition(posData.x, posData.y, room.name);
        const site = containerPos
          .lookFor(LOOK_CONSTRUCTION_SITES)
          .find(s => s.structureType === STRUCTURE_CONTAINER);
        const struct = containerPos
          .lookFor(LOOK_STRUCTURES)
          .find(s => s.structureType === STRUCTURE_CONTAINER);
        if (!site && !struct) {
          room.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
          statsConsole.log(
            `Queued container construction at ${containerPos}`,
            6,
          );
        }
      }
    }
  },

  buildControllerContainers: function (room) {
    if (!room.controller) return;
    const controllerContainers = room.controller.pos.findInRange(FIND_STRUCTURES, 2, {
      filter: s => s.structureType === STRUCTURE_CONTAINER,
    });
    const controllerSites = room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
      filter: s => s.structureType === STRUCTURE_CONTAINER,
    });
    if (controllerContainers.length + controllerSites.length < 1) {
      const spawn = room.find(FIND_MY_SPAWNS)[0];
      let spots = getOpenSpots(room.controller.pos, 2).filter(p =>
        new RoomPosition(p.x, p.y, room.name).getRangeTo(room.controller) === 2,
      );
      if (spawn) {
        spots.sort((a, b) =>
          spawn.pos.getRangeTo(a.x, a.y) - spawn.pos.getRangeTo(b.x, b.y),
        );
      }
      if (spots.length > 0) {
        const pos = new RoomPosition(spots[0].x, spots[0].y, room.name);
        const site = pos
          .lookFor(LOOK_CONSTRUCTION_SITES)
          .find(s => s.structureType === STRUCTURE_CONTAINER);
        const struct = pos
          .lookFor(LOOK_STRUCTURES)
          .find(s => s.structureType === STRUCTURE_CONTAINER);
        if (!site && !struct) {
          room.createConstructionSite(pos, STRUCTURE_CONTAINER);
          statsConsole.log(`Queued controller container at ${pos}`, 6);
        }
      }
    }
  },

  buildBufferContainer: function (room) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;
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
  },

  buildExtensions: function (room) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    const extensionSites = room.find(FIND_CONSTRUCTION_SITES, {
      filter: (site) => site.structureType === STRUCTURE_EXTENSION,
    });

    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_EXTENSION,
    });

    const maxExtensions =
      CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    let remaining = maxExtensions - (extensions.length + extensionSites.length);
    if (remaining <= 0) return;

    if (!room.memory.extensionCenters) room.memory.extensionCenters = [];

    const centers = [
      { x: spawn.pos.x - 2, y: spawn.pos.y - 2 },
      { x: spawn.pos.x + 2, y: spawn.pos.y - 2 },
      { x: spawn.pos.x - 2, y: spawn.pos.y + 2 },
      { x: spawn.pos.x + 2, y: spawn.pos.y + 2 },
    ];

    const terrain = room.getTerrain();

    for (const center of centers) {
      if (remaining <= 0) break;
      const key = `${center.x},${center.y}`;
      if (room.memory.extensionCenters.indexOf(key) !== -1) continue;

      const stamp = [
        { x: center.x, y: center.y - 1 },
        { x: center.x - 1, y: center.y },
        { x: center.x, y: center.y },
        { x: center.x + 1, y: center.y },
        { x: center.x, y: center.y + 1 },
      ];

      let buildable = true;
      for (const p of stamp) {
        if (p.x < 1 || p.x > 48 || p.y < 1 || p.y > 48) {
          buildable = false;
          break;
        }
        if (terrain.get(p.x, p.y) === TERRAIN_MASK_WALL) {
          buildable = false;
          break;
        }
        if (room.lookForAt(LOOK_STRUCTURES, p.x, p.y).length > 0) {
          buildable = false;
          break;
        }
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, p.x, p.y).length > 0) {
          buildable = false;
          break;
        }
      }
      if (!buildable) continue;

      let created = false;
      for (const p of stamp) {
        if (remaining <= 0) break;
        const result = room.createConstructionSite(p.x, p.y, STRUCTURE_EXTENSION);
        if (result === OK) {
          statsConsole.log(`Queued extension construction at ${p.x},${p.y}`, 6);
          remaining--;
          created = true;
        }
      }
      if (created) {
        room.memory.extensionCenters.push(key);
      }
    }
  },

  setConstructionWeight: function (structureType, weight) {
    constructionWeights[structureType] = weight;
  },
};

module.exports = buildingManager;
