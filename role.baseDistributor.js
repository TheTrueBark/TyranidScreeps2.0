/**
 * Lightweight hauler operating within the base.
 * @codex-owner role.baseDistributor
 * @codex-trigger onStorageBuilt
 * @codex-task DELIVER_BASE_ENERGY
 */
const movementUtils = require('./utils.movement');
const htm = require('./manager.htm');

const roleBaseDistributor = {
  run(creep) {
    if (!creep.room.storage) return;

    if (creep.store[RESOURCE_ENERGY] === 0) {
      const res = creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
      if (res === ERR_NOT_IN_RANGE) creep.travelTo(creep.room.storage);
      return;
    }

    let target = null;
    const container = htm._getContainer(htm.LEVELS.CREEP, creep.name);
    if (container && container.tasks) {
      const task = container.tasks.find(t => t.name === 'DELIVER_BASE_ENERGY');
      if (task) {
        target = Game.getObjectById(task.data.id);
        if (!target) {
          container.tasks.splice(container.tasks.indexOf(task), 1);
        } else if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(target);
          return;
        } else {
          container.tasks.splice(container.tasks.indexOf(task), 1);
          return;
        }
      }
    }

    if (!target) {
      target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: s =>
          ((s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
          (s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > s.store.getCapacity(RESOURCE_ENERGY) / 2),
      });
      if (target) {
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(target);
        }
        if (Memory.settings && Memory.settings.debugVisuals) {
          new RoomVisual(creep.room.name).text('⚡', creep.pos.x, creep.pos.y - 0.5, { color: 'yellow', font: 0.8 });
        }
        return;
      }
    }

    const idle = movementUtils.findIdlePosition(creep.room, 'baseDistributor', creep.name);
    if (idle && !creep.pos.isEqualTo(idle)) creep.travelTo(idle, { range: 0 });
  },
};

module.exports = roleBaseDistributor;
