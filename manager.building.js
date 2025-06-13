/** @codex-owner buildingManager */
const roomPlanner = require("planner.room");
const statsConsole = require("console.console");
const scheduler = require('./scheduler');
const layoutVisualizer = require('./layoutVisualizer');
const htm = require('./manager.htm');
const constructionBlocker = require('./constructionBlocker');

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
    this.processHTMTasks(room);
    if (this.shouldUpdateCache(room)) {
      this.cacheBuildableAreas(room);
      statsConsole.log(`Recalculated buildable areas for room ${room.name}`, 6);
    }

    this.manageBuildingQueue(room);

    if (room.controller.level >= 1) {
      this.buildSourceContainers(room);
    }

    if (room.controller.level >= 1) {
      this.buildControllerContainers(room);
      // Buffer container near the spawn is no longer required
      // this.buildBufferContainer(room);
    }

    this.executeLayout(room);
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

  /**
   * Execute pending BUILD_LAYOUT_PART tasks by placing construction sites.
   */
  processHTMTasks: function(room) {
    const container = htm._getContainer(htm.LEVELS.COLONY, room.name);
    if (!container || !container.tasks) return;
    for (const task of container.tasks) {
      if (task.manager !== 'buildingManager' || task.name !== 'BUILD_LAYOUT_PART') continue;
      if (Game.time < task.claimedUntil) continue;
      const { x, y, structureType } = task.data;
      const hasStruct = room.lookForAt(LOOK_STRUCTURES, x, y).some(s => s.structureType === structureType);
      const hasSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).some(s => s.structureType === structureType);
      if (!hasStruct && !hasSite) {
        const res = room.createConstructionSite(x, y, structureType);
        if (res === OK) {
          htm.claimTask(htm.LEVELS.COLONY, room.name, task.name, 'buildingManager');
        }
      } else {
        htm.claimTask(htm.LEVELS.COLONY, room.name, task.name, 'buildingManager');
      }
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
        if (constructionBlocker.isTileBlocked(room.name, containerPos.x, containerPos.y)) {
          continue;
        }
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
        if (constructionBlocker.isTileBlocked(room.name, pos.x, pos.y)) {
          return;
        }
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
        if (!constructionBlocker.isTileBlocked(room.name, pos.x, pos.y)) {
          room.createConstructionSite(pos, STRUCTURE_CONTAINER);
          statsConsole.log(`Queued spawn buffer container at ${pos}`, 6);
        }
      }
    }
  },


  executeLayout: function (room) {
    if (!room.memory.layout) return;
    const priority = [
      STRUCTURE_SPAWN,
      STRUCTURE_EXTENSION,
      STRUCTURE_TOWER,
      STRUCTURE_STORAGE,
      STRUCTURE_LINK,
      STRUCTURE_ROAD,
    ];
    const matrix = room.memory.layout.matrix || {};
    for (const type of priority) {
      for (const x in matrix) {
        for (const y in matrix[x]) {
          const cell = matrix[x][y];
          if (cell.structureType !== type) continue;
          if (cell.rcl > room.controller.level) continue;
          const hasStruct = room
            .lookForAt(LOOK_STRUCTURES, x, y)
            .some((s) => s.structureType === type);
          const hasSite = room
            .lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
            .some((s) => s.structureType === type);
          const queued = htm.taskExistsAt(htm.LEVELS.COLONY, room.name, 'BUILD_LAYOUT_PART', {
            x: Number(x),
            y: Number(y),
            structureType: type,
          });
          if (!hasStruct && !hasSite && !queued) {
            htm.addColonyTask(
              room.name,
              'BUILD_LAYOUT_PART',
              { x: Number(x), y: Number(y), structureType: type, rcl: cell.rcl },
              3,
              200,
              1,
              'buildingManager',
              { module: 'layoutPlanner' },
            );
            return;
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
