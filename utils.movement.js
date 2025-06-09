const movementUtils = {
  /**
   * Move the creep away from the spawn if it is adjacent and has no immediate spawn interaction.
   * @param {Creep} creep - The creep to adjust.
   */
  avoidSpawnArea(creep) {
    if (!creep.pos || !creep.pos.findClosestByRange) return;
    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) return;

    // Miners must remain on their reserved positions even if they are within
    // the restricted area around the spawn. Skip the restricted tile check for
    // that role so they don't get pushed away from containers.
    const roomMemory = Memory.rooms && Memory.rooms[creep.room.name];
    if (creep.memory.role !== 'miner' && roomMemory && roomMemory.restrictedArea) {
      for (const p of roomMemory.restrictedArea) {
        if (creep.pos.x === p.x && creep.pos.y === p.y) {
          creep.travelTo(spawn, { range: 2 });
          return;
        }
      }
    }
    if (creep.pos.isNearTo(spawn)) {
      const demandNearby = spawn.pos
        .findInRange(FIND_STRUCTURES, 1, {
          filter: s =>
            (s.structureType === STRUCTURE_EXTENSION ||
              s.structureType === STRUCTURE_SPAWN) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        })
        .length;
      if (demandNearby === 0) {
        creep.travelTo(spawn, { range: 2 });
      }
    }
  },

  /**
   * Step off the current tile if standing on an invalid position such as a construction site.
   * Attempts to move to the first open adjacent tile.
   * @param {Creep} creep - The creep to reposition.
   * @returns {boolean} True if a move command was issued.
   */
  stepOff(creep) {
    if (!creep.room || !creep.room.getTerrain) return false;
    const terrain = creep.room.getTerrain();
    const deltas = {
      [TOP]: { x: 0, y: -1 },
      [TOP_RIGHT]: { x: 1, y: -1 },
      [RIGHT]: { x: 1, y: 0 },
      [BOTTOM_RIGHT]: { x: 1, y: 1 },
      [BOTTOM]: { x: 0, y: 1 },
      [BOTTOM_LEFT]: { x: -1, y: 1 },
      [LEFT]: { x: -1, y: 0 },
      [TOP_LEFT]: { x: -1, y: -1 },
    };
    for (const dir of Object.keys(deltas)) {
      const d = deltas[dir];
      const x = creep.pos.x + d.x;
      const y = creep.pos.y + d.y;
      if (x < 0 || x > 49 || y < 0 || y > 49) continue;
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      if (creep.room.lookForAt(LOOK_CREEPS, x, y).length > 0) continue;
      creep.move(Number(dir));
      return true;
    }
    return false;
  },
};

module.exports = movementUtils;
