// role.hauler.js

const htm = require('manager.htm');
const logger = require('./logger');
const movementUtils = require('./utils.movement');
const demand = require("./manager.hivemind.demand");
const _ = require('lodash');

function isRestricted(room, pos) {
  const area =
    Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].restrictedArea;
  return area ? area.some(p => p.x === pos.x && p.y === pos.y) : false;
}

function moveToIdle(creep) {
  const idle = movementUtils.findIdlePosition(creep.room);
  if (idle && !creep.pos.isEqualTo(idle)) creep.travelTo(idle, { range: 0 });
}

// Remember the last container a hauler deposited into so it doesn't
// immediately withdraw the energy again. The block persists until
// a different container is used.
/**
 * Determine the optimal nearby energy source for the hauler.
 * Considers dropped resources, ruins, tombstones, containers and storage
 * then selects the closest option by range.
 *
 * @param {Creep} creep - The hauler seeking energy.
 * @returns {{type: string, target: any}|null} Pickup/withdraw instruction.
 */
function findEnergySource(creep) {
  const needed = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  if (needed === 0) return null;

  const candidates = [];
  const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
  });
  if (dropped) candidates.push({ type: 'pickup', target: dropped });

  const ruin = creep.pos.findClosestByPath(FIND_RUINS, {
    filter: r => r.store && r.store[RESOURCE_ENERGY] > 0,
  });
  if (ruin) candidates.push({ type: 'withdraw', target: ruin });

  const tomb = creep.pos.findClosestByPath(FIND_TOMBSTONES, {
    filter: t => t.store && t.store[RESOURCE_ENERGY] > 0,
  });
  if (tomb) candidates.push({ type: 'withdraw', target: tomb });

  const avoid = creep.memory.blockedContainerId;
  const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store[RESOURCE_ENERGY] > 0 &&
      s.id !== avoid,
  });
  if (container) candidates.push({ type: 'withdraw', target: container });

  if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
    candidates.push({ type: 'withdraw', target: creep.room.storage });
  }

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) => creep.pos.getRangeTo(a.target) - creep.pos.getRangeTo(b.target),
  );
  return candidates[0];
}

function deliverEnergy(creep, target = null) {
  const structure =
    target ||
    creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_EXTENSION &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    }) ||
    creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_SPAWN &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
  if (structure) {
    const result = creep.transfer(structure, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) {
      creep.travelTo(structure, { visualizePathStyle: { stroke: '#ffffff' } });
    } else if (result === OK) {
      if (creep.memory.roundTripStartTick !== undefined && creep.memory.assignment && creep.memory.assignment.routeId) {
        const duration = Game.time - creep.memory.roundTripStartTick;
        const routeId = creep.memory.assignment.routeId;
        const route = _.get(Memory, ['demand', 'routes', routeId], {});
        const count = route.roundTripCount || 0;
        route.avgRoundTrip = ((route.avgRoundTrip || 0) * count + duration) / (count + 1);
        route.roundTripCount = count + 1;
        route.activeHaulers = route.activeHaulers || [];
        if (!route.activeHaulers.includes(creep.name)) route.activeHaulers.push(creep.name);
        route.assignmentInfo = route.assignmentInfo || creep.memory.assignment;
        _.set(Memory, ['demand', 'routes', routeId], route);
      }
      creep.memory.lastDeliveryTick = Game.time;
      creep.memory.roundTripStartTick = Game.time;
      if (structure.structureType === STRUCTURE_CONTAINER) {
        creep.memory.blockedContainerId = structure.id;
      }
      if (isRestricted(creep.room, creep.pos)) moveToIdle(creep);
    }
    return true;
  }

  const ctrlContainer =
    creep.room.controller &&
    creep.room.controller.pos
      .findInRange(FIND_STRUCTURES, 3, {
        filter: s =>
          s.structureType === STRUCTURE_CONTAINER &&
          s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
      })[0];
  if (ctrlContainer) {
    const result = creep.transfer(ctrlContainer, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) {
      creep.travelTo(ctrlContainer, { visualizePathStyle: { stroke: '#ffffff' } });
    } else if (result === OK) {
      if (creep.memory.roundTripStartTick !== undefined && creep.memory.assignment && creep.memory.assignment.routeId) {
        const duration = Game.time - creep.memory.roundTripStartTick;
        const routeId = creep.memory.assignment.routeId;
        const route = _.get(Memory, ['demand', 'routes', routeId], {});
        const count = route.roundTripCount || 0;
        route.avgRoundTrip = ((route.avgRoundTrip || 0) * count + duration) / (count + 1);
        route.roundTripCount = count + 1;
        route.activeHaulers = route.activeHaulers || [];
        if (!route.activeHaulers.includes(creep.name)) route.activeHaulers.push(creep.name);
        route.assignmentInfo = route.assignmentInfo || creep.memory.assignment;
        _.set(Memory, ['demand', 'routes', routeId], route);
      }
      creep.memory.lastDeliveryTick = Game.time;
      creep.memory.roundTripStartTick = Game.time;
      creep.memory.blockedContainerId = ctrlContainer.id;
      if (isRestricted(creep.room, creep.pos)) moveToIdle(creep);
    }
    return true;
  }

  if (creep.room.storage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const result = creep.transfer(creep.room.storage, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) {
      creep.travelTo(creep.room.storage, { visualizePathStyle: { stroke: '#ffffff' } });
    } else if (result === OK) {
      if (creep.memory.roundTripStartTick !== undefined && creep.memory.assignment && creep.memory.assignment.routeId) {
        const duration = Game.time - creep.memory.roundTripStartTick;
        const routeId = creep.memory.assignment.routeId;
        const route = _.get(Memory, ['demand', 'routes', routeId], {});
        const count = route.roundTripCount || 0;
        route.avgRoundTrip = ((route.avgRoundTrip || 0) * count + duration) / (count + 1);
        route.roundTripCount = count + 1;
        route.activeHaulers = route.activeHaulers || [];
        if (!route.activeHaulers.includes(creep.name)) route.activeHaulers.push(creep.name);
        route.assignmentInfo = route.assignmentInfo || creep.memory.assignment;
        _.set(Memory, ['demand', 'routes', routeId], route);
      }
      creep.memory.lastDeliveryTick = Game.time;
      creep.memory.roundTripStartTick = Game.time;
      if (creep.room.storage.structureType === STRUCTURE_CONTAINER) {
        creep.memory.blockedContainerId = creep.room.storage.id;
      }
      if (isRestricted(creep.room, creep.pos)) moveToIdle(creep);
    }
    return true;
  }
  return false;
}

module.exports = {
  run: function (creep) {
    movementUtils.avoidSpawnArea(creep);

    const last = creep.memory._lastPos;
    if (
      last &&
      last.x === creep.pos.x &&
      last.y === creep.pos.y &&
      (last.task || null) === (creep.memory.task ? creep.memory.task.name : null)
    ) {
      if (Game.time - last.tick >= 10) {
        moveToIdle(creep);
        creep.memory._lastPos.tick = Game.time;
      }
    } else {
      creep.memory._lastPos = {
        x: creep.pos.x,
        y: creep.pos.y,
        tick: Game.time,
        task: creep.memory.task ? creep.memory.task.name : null,
      };
    }
    // Active delivery task takes priority
    if (creep.memory.task && creep.memory.task.name === 'deliverEnergy') {
      const target = Game.creeps[creep.memory.task.target] ||
        Game.getObjectById(creep.memory.task.target);
      if (!target) {
        htm.addCreepTask(
          creep.memory.task.target,
          'deliverEnergy',
          { pos: creep.memory.task.pos, amount: creep.memory.task.reserved },
          1,
          20,
          1,
          'hauler',
        );
        delete creep.memory.task;
      } else if (creep.store[RESOURCE_ENERGY] > 0) {
        const before = creep.store[RESOURCE_ENERGY];
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(target, { visualizePathStyle: { stroke: "#ffffff" } });
        } else {
          const delivered = before - creep.store[RESOURCE_ENERGY];
          creep.memory.task.reserved = Math.max(0, creep.memory.task.reserved - delivered);
          const isStructure = target.structureType !== undefined;
          if (
            creep.memory.task.reserved === 0 ||
            (isStructure &&
              target.store &&
              target.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
          ) {
            demand.recordDelivery(
              creep.memory.task.target,
              Game.time - creep.memory.task.startTime,
              creep.memory.task.initial,
              target.room.name,
              creep.name,
              'hauler',
            );
            delete creep.memory.task;
          }
        }
        return;
      } else {
        const source = findEnergySource(creep);
        if (source) {
          if (source.type === 'pickup') {
            const res = creep.pickup(source.target);
            if (res === ERR_NOT_IN_RANGE) {
              creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
            } else if (res === OK) {
              creep.memory.roundTripStartTick = Game.time;
            }
          } else {
            const res = creep.withdraw(source.target, RESOURCE_ENERGY);
            if (res === ERR_NOT_IN_RANGE) {
              creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
            } else if (res === OK) {
              creep.memory.roundTripStartTick = Game.time;
            }
          }
        }
        return;
      }
    }

    // Look for delivery tasks
    const creepTasks = Memory.htm && Memory.htm.creeps ? Memory.htm.creeps : {};
    const available = [];
    for (const name in creepTasks) {
      const container = creepTasks[name];
      if (!container.tasks) continue;
      const task = container.tasks.find(
        (t) => t.name === 'deliverEnergy' && Game.time >= t.claimedUntil,
      );
      if (task) available.push({ name, task });
    }

    available.sort(
      (a, b) => (a.task.data.ticksNeeded || 0) - (b.task.data.ticksNeeded || 0),
    );

    for (const entry of available) {
      const { name, task } = entry;
      const estimate = task.data.ticksNeeded || 0;
      const pos = new RoomPosition(
        task.data.pos.x,
        task.data.pos.y,
        task.data.pos.roomName,
      );
      const travel = creep.pos.getRangeTo(pos) * 2;
      const required = Math.max(estimate, travel);
      if (creep.ticksToLive && creep.ticksToLive <= required) continue;
      htm.claimTask(
        htm.LEVELS.CREEP,
        name,
        'deliverEnergy',
        'hauler',
        htm.DEFAULT_CLAIM_COOLDOWN,
        estimate,
      );
      let deliver = creep.store.getCapacity ? creep.store.getCapacity() : 0;
      if (task.data.amount !== undefined) {
        deliver = Math.min(deliver, task.data.amount);
        task.data.amount -= deliver;
        if (task.data.amount <= 0) {
          const idx = creepTasks[name].tasks.indexOf(task);
          if (idx !== -1) creepTasks[name].tasks.splice(idx, 1);
        }
      }
      creep.memory.task = {
        name: "deliverEnergy",
        target: name,
        pos: task.data.pos,
        reserved: deliver,
        startTime: Game.time,
        initial: deliver,
      };
      break;
    }

    if (creep.store[RESOURCE_ENERGY] > 0) {
      if (deliverEnergy(creep)) return;
    }

    const source = findEnergySource(creep);
    if (source) {
      if (source.type === 'pickup') {
        const res = creep.pickup(source.target);
        if (res === ERR_NOT_IN_RANGE) {
          creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
        } else if (res === OK) {
          creep.memory.roundTripStartTick = Game.time;
        }
      } else {
        const res = creep.withdraw(source.target, RESOURCE_ENERGY);
        if (res === ERR_NOT_IN_RANGE) {
          creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
        } else if (res === OK) {
          creep.memory.roundTripStartTick = Game.time;
        }
      }
      return;
    }

    const spawn = creep.room.find ? creep.room.find(FIND_MY_SPAWNS)[0] : null;
    if (creep.store[RESOURCE_ENERGY] === 0) {
      const miners = Object.values(Game.creeps).filter(
        c => c.memory && c.memory.role === 'miner' && c.room.name === creep.room.name,
      );
      if (miners.length > 0) {
        const target = creep.pos.findClosestByRange(miners);
        if (target) {
          creep.travelTo(target, { range: 2 });
          return;
        }
      }
    } else if (spawn) {
      creep.travelTo(spawn, { range: 2 });
      return;
    }
  },
  onDeath: function (creep) {
    if (creep.memory.task && creep.memory.task.name === 'deliverEnergy') {
      htm.addCreepTask(
        creep.memory.task.target,
        'deliverEnergy',
        { pos: creep.memory.task.pos },
        1,
        20,
        1,
        'hauler',
      );
    }
  },
};
