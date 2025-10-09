/** @codex-owner buildingManager */
const roomPlanner = require("planner.room");
const statsConsole = require("console.console");
const scheduler = require('./scheduler');
const layoutVisualizer = require('./layoutVisualizer');
const htm = require('./manager.htm');
const constructionBlocker = require('./constructionBlocker');

const REBUILD_RETRY_TICKS = 25;
const OK_CODE = typeof OK !== 'undefined' ? OK : 0;
const ERR_FULL_CODE = typeof ERR_FULL !== 'undefined' ? ERR_FULL : -8;
const ERR_RCL_NOT_ENOUGH_CODE =
  typeof ERR_RCL_NOT_ENOUGH !== 'undefined' ? ERR_RCL_NOT_ENOUGH : -14;
const ERR_INVALID_TARGET_CODE =
  typeof ERR_INVALID_TARGET !== 'undefined' ? ERR_INVALID_TARGET : -7;

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
  /**
   * Store potential container spots around each source for quick reference.
   * @param {Room} room Room to analyze.
   */
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

  /**
   * Determine if the buildable area cache should be refreshed.
   * @param {Room} room Target room.
   * @returns {boolean} True when cache needs update.
   */
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

  /**
   * Execute construction related logic for an owned room.
   * Places sites, processes HTM tasks and manages cache.
   * @param {Room} room Room being processed.
   */
  buildInfrastructure: function (room) {
    this.processHTMTasks(room);
    this.monitorClusterTasks(room);
    this.processRebuildQueue(room);
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

  processRebuildQueue: function (room) {
    if (!room || !room.memory) return;
    const queue = Array.isArray(room.memory.rebuildQueue)
      ? room.memory.rebuildQueue
      : [];
    if (queue.length === 0) return;

    const nextQueue = [];
    for (const entry of queue) {
      if (!entry || !entry.structureType || !entry.pos) continue;
      const targetRoom = entry.pos.roomName || room.name;
      if (targetRoom !== room.name) {
        nextQueue.push(entry);
        continue;
      }

      const { x, y } = entry.pos;
      if (typeof x !== 'number' || typeof y !== 'number') continue;

      if (entry.retryAt && typeof entry.retryAt === 'number' && entry.retryAt > Game.time) {
        nextQueue.push(entry);
        continue;
      }

      const structures = room.lookForAt
        ? room.lookForAt(LOOK_STRUCTURES, x, y)
        : [];
      const sites = room.lookForAt
        ? room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
        : [];

      const hasStructure = structures.some((s) => s.structureType === entry.structureType);
      if (hasStructure) {
        continue;
      }

      const hasSite = sites.some((s) => s.structureType === entry.structureType);
      if (hasSite) {
        continue;
      }

      if (constructionBlocker.isTileBlocked(room.name, x, y)) {
        nextQueue.push(entry);
        continue;
      }

      const result = room.createConstructionSite
        ? room.createConstructionSite(x, y, entry.structureType)
        : ERR_INVALID_TARGET_CODE;

      if (result === OK_CODE) {
        statsConsole.log(
          `Requeued construction for missing ${entry.structureType} at ${room.name} (${x}, ${y})`,
          6,
        );
        continue;
      }

      if (result === ERR_FULL_CODE || result === ERR_RCL_NOT_ENOUGH_CODE) {
        entry.retryAt = Game.time + REBUILD_RETRY_TICKS;
        entry.lastError = result;
        nextQueue.push(entry);
      }
    }

    room.memory.rebuildQueue = nextQueue;
  },

  /**
   * Generate and sort the building queue based on construction sites present.
   * @param {Room} room Room being processed.
   */
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
    const counts = {};
    const showDebug = Memory.settings && Memory.settings.debugBuilding;
    const vis = showDebug ? new RoomVisual(room.name) : null;
    const terrain = room.getTerrain();
    for (const type in CONTROLLER_STRUCTURES) {
      const allowed = CONTROLLER_STRUCTURES[type][room.controller.level] || 0;
      const built = room.find(FIND_STRUCTURES, { filter: s => s.structureType === type }).length;
      const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === type }).length;
      counts[type] = { allowed, built, sites };
    }
    for (let i = container.tasks.length - 1; i >= 0; i--) {
      const task = container.tasks[i];
      if (task.name !== 'BUILD_LAYOUT_PART') continue;
      const { x, y, structureType } = task.data;
      if (terrain.get(x, y) === TERRAIN_MASK_WALL || terrain.get(x, y) === 'wall') {
        if (showDebug) {
          console.log(`[BUILD] Cannot place ${structureType} at (${x}, ${y}) in ${room.name} — unwalkable terrain`);
        }
        if (vis) vis.text('❌', x, y, { color: 'red', font: 0.8 });
        const cell = room.memory.layout && room.memory.layout.matrix[x] && room.memory.layout.matrix[x][y];
        if (cell) cell.invalid = true;
        container.tasks.splice(i, 1);
        continue;
      }
      const hasStruct = room.lookForAt(LOOK_STRUCTURES, x, y).some(s => s.structureType === structureType);
      const hasSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).some(s => s.structureType === structureType);
      const cell =
        room.memory.layout && room.memory.layout.matrix[x] && room.memory.layout.matrix[x][y];
      if (cell && cell.rcl > room.controller.level) continue;

      if (hasStruct) {
        container.tasks.splice(i, 1);
        if (
          room.memory.layout &&
          room.memory.layout.status &&
          room.memory.layout.status.structures &&
          room.memory.layout.status.structures[structureType]
        ) {
          room.memory.layout.status.structures[structureType].built = Math.min(
            room.memory.layout.status.structures[structureType].built + 1,
            room.memory.layout.status.structures[structureType].total,
          );
        }
        if (showDebug) {
          console.log(`[build] ${room.name} ${structureType} built @${x},${y}`);
        }
        if (vis) vis.text('✅', x, y, { color: 'white', font: 0.8 });
        counts[structureType].built += 1;
        continue;
      }

      if (
        counts[structureType] &&
        counts[structureType].built + counts[structureType].sites >= counts[structureType].allowed
      ) {
        if (showDebug) {
          console.log(`[build] Skipped ${structureType} at (${x}, ${y}): RCL limit reached`);
        }
        if (vis) vis.text('❌', x, y, { color: 'red', font: 0.8 });
        continue;
      }

      if (!hasSite) {
        if (!task.started || Game.time - task.started > 300) {
          const res = room.createConstructionSite(x, y, structureType);
          task.started = Game.time;
          if (showDebug) {
            if (res === OK) {
              console.log(`[build] Placed ${structureType} at (${x}, ${y}) in ${room.name}`);
            } else {
              console.log(`[build] failed placing ${structureType} @${x},${y}: ${res}`);
            }
          }
          if (res === OK) {
            counts[structureType].sites += 1;
            if (vis) vis.text('✅', x, y, { color: 'white', font: 0.8 });
          } else if (vis) {
            vis.text('❌', x, y, { color: 'red', font: 0.8 });
          }
          if (res !== OK) {
            continue;
          }
        }
      } else if (hasSite && showDebug) {
        console.log(`[build] site already exists for ${structureType} @${x},${y}`);
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

  /**
   * Track BUILD_CLUSTER parent tasks and mark them complete when all
   * BUILD_LAYOUT_PART subtasks finish.
   */
  monitorClusterTasks: function(room) {
    if (!room.memory.layout) return;
    const container = htm._getContainer(htm.LEVELS.COLONY, room.name);
    if (!container || !container.tasks) return;
    const clusters = container.tasks.filter(t => t.name === 'BUILD_CLUSTER');
    for (let i = clusters.length - 1; i >= 0; i--) {
      const t = clusters[i];
      const cid = t.data.clusterId;
      const subtasks = container.tasks.filter(st => st.parentTaskId === cid && st.name === 'BUILD_LAYOUT_PART');
      const total = t.data.total || subtasks.length;
      const built = total - subtasks.length;
      room.memory.layout.status = room.memory.layout.status || { clusters: {} };
      room.memory.layout.status.clusters[cid] = {
        built,
        total,
        complete: subtasks.length === 0,
      };
      t.progress = `${built}/${total}`;
      if (subtasks.length === 0) {
        t.complete = true;
        container.tasks.splice(container.tasks.indexOf(t), 1);
      }
      if (Memory.settings && Memory.settings.debugLayoutProgress && Game.time % 1000 === 0) {
        console.log(`[cluster] ${room.name}:${cid} ${built}/${total}`);
      }
    }
  },

  setConstructionWeight: function (structureType, weight) {
    constructionWeights[structureType] = weight;
  },
};

module.exports = buildingManager;
