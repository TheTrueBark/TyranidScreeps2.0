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
    if (!Memory.rooms[room.name].miningPositions) {
      Memory.rooms[room.name].miningPositions = {};
    }

    sources.forEach((source) => {
      const spawn = room.find(FIND_MY_SPAWNS)[0];
      const sourcePos = source.pos;
      const potential = [
        { x: sourcePos.x + 1, y: sourcePos.y },
        { x: sourcePos.x - 1, y: sourcePos.y },
        { x: sourcePos.x, y: sourcePos.y + 1 },
        { x: sourcePos.x, y: sourcePos.y - 1 },
        { x: sourcePos.x + 1, y: sourcePos.y + 1 },
        { x: sourcePos.x + 1, y: sourcePos.y - 1 },
        { x: sourcePos.x - 1, y: sourcePos.y + 1 },
        { x: sourcePos.x - 1, y: sourcePos.y - 1 },
      ].filter(p => room.getTerrain().get(p.x, p.y) !== TERRAIN_MASK_WALL);

      // Determine container spot along the path to the spawn
      let pathPosition = null;
      let distanceFromSpawn = 0;
      if (spawn) {
        const result = PathFinder.search(
          spawn.pos,
          { pos: sourcePos, range: 1 },
          { swampCost: 2, plainCost: 2, ignoreCreeps: true },
        );
        if (result.path && result.path.length > 0) {
          const step = result.path[result.path.length - 1];
          pathPosition = { x: step.x, y: step.y };
        }
        distanceFromSpawn = result.path ? result.path.length : 0;
      }

      potential.sort((a, b) =>
        spawn.pos.getRangeTo(a.x, a.y) - spawn.pos.getRangeTo(b.x, b.y),
      );

      const containers = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.pos.inRangeTo(source, 1),
      });

      let bestPositions = potential.slice(0, 3);
      if (containers.length > 0) {
        const cPos = containers[0].pos;
        bestPositions = [{ x: cPos.x, y: cPos.y }, ...potential.filter(p => p.x !== cPos.x || p.y !== cPos.y).slice(0, 2)];
      } else if (pathPosition) {
        bestPositions = [pathPosition, ...potential.filter(p => p.x !== pathPosition.x || p.y !== pathPosition.y).slice(0, 2)];
      }

      const mem = Memory.rooms[room.name].miningPositions[source.id] || { positions: {} };
      const old = mem.positions || {};
      const positions = {};
      ['best1', 'best2', 'best3'].forEach((key, i) => {
        const p = bestPositions[i];
        if (p) {
          const existing = Object.values(old).find(o => o && o.x === p.x && o.y === p.y);
          positions[key] = {
            x: p.x,
            y: p.y,
            roomName: room.name,
            reserved: existing ? existing.reserved : false,
          };
        } else {
          positions[key] = null;
        }
      });
      Memory.rooms[room.name].miningPositions[source.id] = {
        x: sourcePos.x,
        y: sourcePos.y,
        distanceFromSpawn,
        positions,
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

    // Determine upgrade spots around the controller
    if (room.controller) {
      const terrain = room.getTerrain();
      let count = 0;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const x = room.controller.pos.x + dx;
          const y = room.controller.pos.y + dy;
          if (x < 0 || x > 49 || y < 0 || y > 49) continue;
          if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
          const structs = room.lookForAt(LOOK_STRUCTURES, x, y);
          if (structs.some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType))) continue;
          count++;
        }
      }
      Memory.rooms[room.name].controllerUpgradeSpots = count;
    }
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
