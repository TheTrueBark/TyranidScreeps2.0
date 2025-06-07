const movementUtils = {
  /**
   * Move the creep away from the spawn if it is adjacent and has no immediate spawn interaction.
   * @param {Creep} creep - The creep to adjust.
   */
  avoidSpawnArea(creep) {
    if (!creep.pos || !creep.pos.findClosestByRange) return;
    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) return;

    const roomMemory = Memory.rooms && Memory.rooms[creep.room.name];
    if (roomMemory && roomMemory.restrictedArea) {
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
};

module.exports = movementUtils;
