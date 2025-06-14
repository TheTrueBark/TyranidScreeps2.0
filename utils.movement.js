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
    if (
      creep.memory.role !== 'miner' &&
      roomMemory &&
      roomMemory.restrictedArea
    ) {
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
   * Locate a nearby tile around the spawn to use as an idle position.
   * The spot will not be inside `Memory.rooms[room].restrictedArea`.
   *
   * @param {Room} room - The room to search within.
   * @returns {RoomPosition|null} Safe idle tile or null if none found.
   */
  findIdlePosition(room) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn || !room.getTerrain) return null;
    const terrain = room.getTerrain();
    const area =
      (Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].restrictedArea) || [];
    const deltas = [
      { x: 2, y: 0 },
      { x: -2, y: 0 },
      { x: 0, y: 2 },
      { x: 0, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
      { x: 2, y: -2 },
      { x: -2, y: -2 },
    ];
    for (const d of deltas) {
      const x = spawn.pos.x + d.x;
      const y = spawn.pos.y + d.y;
      if (x < 0 || x > 49 || y < 0 || y > 49) continue;
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      if (area.some(p => p.x === x && p.y === y)) continue;
      return new RoomPosition(x, y, room.name);
    }
    return spawn.pos;
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
