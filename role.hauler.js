// role.hauler.js

const htm = require('manager.htm');
const logger = require('./logger');
const movementUtils = require('./utils.movement');
const demand = require("./manager.hivemind.demand");
const energyRequests = require('./manager.energyRequests');
const Traveler = require('./manager.hiveTravel');
const _ = require('lodash');

const MAX_PICKUP_CANDIDATES = 6;
const PICKUP_PLAN_VERSION = 1;
const PICKUP_PLAN_EXPIRY = 10;

if (!Memory.energyReserves) Memory.energyReserves = {};

function reserveEnergy(id, amount) {
  if (!id || amount <= 0) return;
  if (!Memory.energyReserves[id]) Memory.energyReserves[id] = 0;
  Memory.energyReserves[id] += amount;
}

function releaseEnergy(id, amount = 0) {
  if (!id || !Memory.energyReserves[id]) return;
  if (amount <= 0) {
    delete Memory.energyReserves[id];
    return;
  }
  Memory.energyReserves[id] = Math.max(0, Memory.energyReserves[id] - amount);
  if (Memory.energyReserves[id] === 0) delete Memory.energyReserves[id];
}

function isRestricted(room, pos) {
  const area =
    Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].restrictedArea;
  return area ? area.some(p => p.x === pos.x && p.y === pos.y) : false;
}

function moveToIdle(creep) {
  const idle = movementUtils.findIdlePosition(creep.room, 'hauler', creep.name);
  if (idle && !creep.pos.isEqualTo(idle)) creep.travelTo(idle, { range: 0 });
}

function extractPos(value) {
  if (!value) return null;
  if (value.pos) return extractPos(value.pos);
  const { x, y } = value;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  const roomName = value.roomName || (value.room && value.room.name) || null;
  return { x, y, roomName };
}

function positionsMatch(a, b) {
  const posA = extractPos(a);
  const posB = extractPos(b);
  if (!posA || !posB) return false;
  const roomA = posA.roomName;
  const roomB = posB.roomName;
  return (
    posA.x === posB.x &&
    posA.y === posB.y &&
    (roomA === roomB || roomA === undefined || roomB === undefined)
  );
}

function createRoomPosition(pos) {
  if (!pos) return null;
  const roomName = pos.roomName || (pos.room && pos.room.name) || undefined;
  if (typeof RoomPosition === 'function') {
    try {
      return new RoomPosition(pos.x, pos.y, roomName);
    } catch (e) {
      return { x: pos.x, y: pos.y, roomName };
    }
  }
  return { x: pos.x, y: pos.y, roomName };
}

function ensureDemandRoute(routeId, assignment) {
  if (!routeId || !assignment) return;
  if (!Memory.demand) Memory.demand = {};
  if (!Memory.demand.routes) Memory.demand.routes = {};
  const route = Memory.demand.routes[routeId] || {};
  if (!route.totals) route.totals = route.totals || { demand: 0 };
  route.assignmentInfo = Object.assign({}, route.assignmentInfo, {
    sourceId: assignment.sourceId || (route.assignmentInfo && route.assignmentInfo.sourceId) || null,
    pickupId: assignment.pickupId || (route.assignmentInfo && route.assignmentInfo.pickupId) || null,
    pickupPos: assignment.pickupPos || (route.assignmentInfo && route.assignmentInfo.pickupPos) || null,
    destId: assignment.destId || (route.assignmentInfo && route.assignmentInfo.destId) || null,
    room: assignment.room || (route.assignmentInfo && route.assignmentInfo.room) || null,
    type: assignment.type || (route.assignmentInfo && route.assignmentInfo.type) || 'local',
  });
  Memory.demand.routes[routeId] = route;
}

function determinePickupPoint(room, source, existingAssignment = {}) {
  if (!room || !source) {
    return {
      pickupId: existingAssignment.pickupId || null,
      pickupPos: existingAssignment.pickupPos || null,
    };
  }

  if (existingAssignment.pickupId) {
    const obj =
      typeof Game.getObjectById === 'function'
        ? Game.getObjectById(existingAssignment.pickupId)
        : null;
    if (obj && obj.pos) {
      return {
        pickupId: existingAssignment.pickupId,
        pickupPos:
          existingAssignment.pickupPos || {
            x: obj.pos.x,
            y: obj.pos.y,
            roomName: obj.pos.roomName,
          },
      };
    }
  }

  const container =
    source.pos &&
    typeof source.pos.findInRange === 'function'
      ? source.pos.findInRange(FIND_STRUCTURES, 1, {
          filter: s => s.structureType === STRUCTURE_CONTAINER,
        })[0]
      : null;
  if (container && container.pos) {
    return {
      pickupId: container.id,
      pickupPos: {
        x: container.pos.x,
        y: container.pos.y,
        roomName: container.pos.roomName,
      },
    };
  }

  const positionsMem = _.get(
    Memory,
    ['rooms', room.name, 'miningPositions', source.id, 'positions'],
    null,
  );
  if (positionsMem) {
    const values = Object.values(positionsMem).filter(Boolean);
    const slot =
      values.find(p => p && p.reserved) ||
      values[0];
    if (slot) {
      return {
        pickupId: existingAssignment.pickupId || null,
        pickupPos: {
          x: slot.x,
          y: slot.y,
          roomName: slot.roomName || room.name,
        },
      };
    }
  }

  if (existingAssignment.pickupPos) {
    return {
      pickupId: existingAssignment.pickupId || null,
      pickupPos: existingAssignment.pickupPos,
    };
  }

  return {
    pickupId: null,
    pickupPos: {
      x: source.pos.x,
      y: source.pos.y,
      roomName: source.pos.roomName,
    },
  };
}

function pickLeastClaimedSource(sources, counts) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  let selected = null;
  let bestCount = Infinity;
  for (const src of sources) {
    if (!src) continue;
    const id = src.id || '';
    const count = counts[id] || 0;
    if (
      selected === null ||
      count < bestCount ||
      (count === bestCount && String(id).localeCompare(String(selected.id || '')) < 0)
    ) {
      selected = src;
      bestCount = count;
    }
  }
  return selected;
}

function ensureAssignment(creep) {
  if (!creep || !creep.room) return;
  if (!creep.memory.assignment) creep.memory.assignment = {};
  const assignment = creep.memory.assignment;
  const room = creep.room;
  let source =
    assignment.sourceId && typeof Game.getObjectById === 'function'
      ? Game.getObjectById(assignment.sourceId)
      : null;

  if (!source) {
    if (!room.find || typeof room.find !== 'function') return;
    const sources = room.find(FIND_SOURCES) || [];
    if (sources.length === 0) return;
    const counts = {};
    for (const name in Game.creeps) {
      const other = Game.creeps[name];
      if (!other || other.name === creep.name) continue;
      if (other.memory && other.memory.role === 'hauler' && other.room && other.room.name === room.name) {
        const otherAssign = other.memory.assignment;
        if (otherAssign && otherAssign.sourceId) {
          counts[otherAssign.sourceId] = (counts[otherAssign.sourceId] || 0) + 1;
        }
      }
    }
    source = pickLeastClaimedSource(sources, counts) || sources[0];
    assignment.sourceId = source.id;
  }

  assignment.room = assignment.room || room.name;
  assignment.routeId =
    assignment.routeId || `hauler:${room.name}:${assignment.sourceId}`;
  if (!assignment.destId && room.storage) assignment.destId = room.storage.id;

  const pickup = determinePickupPoint(room, source, assignment);
  if (pickup.pickupId) assignment.pickupId = pickup.pickupId;
  if (pickup.pickupPos) assignment.pickupPos = pickup.pickupPos;

  ensureDemandRoute(assignment.routeId, assignment);
}

function isPreferredTarget(assignment, target) {
  if (!assignment || !target) return false;
  if (assignment.pickupId && target.id === assignment.pickupId) return true;
  const targetPos = extractPos(target);
  if (!targetPos) return false;
  if (assignment.pickupPos && positionsMatch(assignment.pickupPos, targetPos)) return true;
  if (assignment.sourceId) {
    const source =
      typeof Game.getObjectById === 'function'
        ? Game.getObjectById(assignment.sourceId)
        : null;
    if (source) {
      const sourcePos = extractPos(source);
      if (sourcePos && sourcePos.roomName === targetPos.roomName) {
        const dx = Math.abs(sourcePos.x - targetPos.x);
        const dy = Math.abs(sourcePos.y - targetPos.y);
        if (dx <= 1 && dy <= 1) return true;
      }
    } else if (assignment.pickupPos) {
      const dx = Math.abs(assignment.pickupPos.x - targetPos.x);
      const dy = Math.abs(assignment.pickupPos.y - targetPos.y);
      if (dx <= 1 && dy <= 1) return true;
    }
  }
  return false;
}

const gatherEnergyCandidates = (creep) => {
  const room = creep.room;
  if (!room || typeof room.find !== 'function') return [];

  const assignment = creep.memory.assignment || null;
  const avoid = creep.memory.blockedContainerId;
  const results = [];
  const seen = new Set();

  const pushCandidate = (type, target, amount) => {
    if (!target || !target.id || seen.has(target.id)) return;
    const reserved = Memory.energyReserves[target.id] || 0;
    const available = amount - reserved;
    if (available <= 0) return;
    const pos = extractPos(target);
    if (!pos) return;
    const preferred = isPreferredTarget(assignment, target);
    seen.add(target.id);
    results.push({
      id: target.id,
      type,
      target,
      available,
      preferred,
      pos: new RoomPosition(pos.x, pos.y, pos.roomName || (target.room && target.room.name) || room.name),
      range: type === 'pickup' ? 1 : 1,
    });
  };

  const spawns = room.find(FIND_MY_SPAWNS, {
    filter: (s) =>
      s &&
      s.store &&
      typeof s.store.getFreeCapacity === 'function' &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) < s.store.getCapacity(RESOURCE_ENERGY),
  }) || [];
  for (const spawn of spawns) {
    const stored = spawn.store[RESOURCE_ENERGY] || 0;
    if (stored > 0) pushCandidate('withdraw', spawn, stored);
  }

  const dropped = room.find(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
  }) || [];
  for (const res of dropped) {
    pushCandidate('pickup', res, res.amount);
  }

  const ruins = room.find(FIND_RUINS, {
    filter: (r) => r.store && r.store[RESOURCE_ENERGY] > 0,
  }) || [];
  for (const structure of ruins) {
    pushCandidate('withdraw', structure, structure.store[RESOURCE_ENERGY]);
  }

  const tombstones = room.find(FIND_TOMBSTONES, {
    filter: (t) => t.store && t.store[RESOURCE_ENERGY] > 0,
  }) || [];
  for (const tomb of tombstones) {
    pushCandidate('withdraw', tomb, tomb.store[RESOURCE_ENERGY]);
  }

  const containers = room.find(FIND_STRUCTURES, {
    filter: (s) =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store &&
      s.store[RESOURCE_ENERGY] > 0 &&
      s.id !== avoid,
  }) || [];
  for (const container of containers) {
    pushCandidate('withdraw', container, container.store[RESOURCE_ENERGY]);
  }

  const links = room.find(FIND_STRUCTURES, {
    filter: (s) =>
      s.structureType === STRUCTURE_LINK &&
      s.store &&
      s.store[RESOURCE_ENERGY] > 0,
  }) || [];
  for (const link of links) {
    pushCandidate('withdraw', link, link.store[RESOURCE_ENERGY]);
  }

  const terminal = room.terminal && room.terminal.store
    ? room.terminal
    : null;
  if (terminal && terminal.store[RESOURCE_ENERGY] > 0) {
    pushCandidate('withdraw', terminal, terminal.store[RESOURCE_ENERGY]);
  }

  if (room.storage && room.storage.store[RESOURCE_ENERGY] > 0) {
    pushCandidate('withdraw', room.storage, room.storage.store[RESOURCE_ENERGY]);
  }

  return results;
};

const evaluateCandidate = (creep, startPos, candidate, remaining) => {
  const amount = Math.min(candidate.available, remaining);
  if (amount <= 0) return null;

  const options = movementUtils.preparePlannerOptions(creep, candidate.target, {
    range: candidate.range,
    ignoreCreeps: true,
    maxOps: 4000,
    ensurePath: true,
  });
  const result = Traveler.findTravelPath(startPos, candidate.pos, options);
  if (!result || !Array.isArray(result.path) || result.path.length === 0) return null;
  const distance = result.path.length;
  const travelCost = distance + 1; // include pickup tick
  const efficiency = travelCost / Math.max(1, amount);
  return {
    candidate,
    amount,
    distance,
    travelCost,
    efficiency,
  };
};

const updatePickupPlanTotals = (plan) => {
  if (!plan) return;
  if (!Array.isArray(plan.steps)) {
    plan.remaining = 0;
    return;
  }
  plan.remaining = plan.steps.reduce(
    (sum, step) =>
      sum +
      Math.max(
        0,
        step.remaining !== undefined
          ? step.remaining
          : step.amount !== undefined
            ? step.amount
            : 0,
      ),
    0,
  );
};

function buildPickupPlan(creep) {
  const capacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  if (capacity <= 0) return null;
  const candidates = gatherEnergyCandidates(creep);
  if (!candidates.length) return null;

  const plan = {
    version: PICKUP_PLAN_VERSION,
    tick: Game.time,
    steps: [],
    remaining: capacity,
  };

  let remaining = capacity;
  let currentPos = creep.pos;
  const used = new Set();

  while (remaining > 0 && plan.steps.length < MAX_PICKUP_CANDIDATES) {
    const scored = candidates
      .filter((c) => !used.has(c.id))
      .map((c) => evaluateCandidate(creep, currentPos, c, remaining))
      .filter(Boolean)
      .sort((a, b) => {
        if (a.candidate.preferred !== b.candidate.preferred) {
          return a.candidate.preferred ? -1 : 1;
        }
        if (a.efficiency !== b.efficiency) return a.efficiency - b.efficiency;
        return a.distance - b.distance;
      });

    const best = scored[0];
    if (!best) break;

    used.add(best.candidate.id);
    plan.steps.push({
      id: best.candidate.id,
      type: best.candidate.type,
      amount: best.amount,
      remaining: best.amount,
      preferred: Boolean(best.candidate.preferred),
      pos: {
        x: best.candidate.pos.x,
        y: best.candidate.pos.y,
        roomName: best.candidate.pos.roomName,
      },
    });
    remaining -= best.amount;
    currentPos = best.candidate.pos;
  }

  if (!plan.steps.length) return null;
  updatePickupPlanTotals(plan);
  return plan;
}

function clearPickupPlan(creep) {
  if (creep.memory && creep.memory.pickupPlan) {
    delete creep.memory.pickupPlan;
  }
}

function ensurePickupPlan(creep, force = false) {
  const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  if (freeCapacity <= 0) {
    clearPickupPlan(creep);
    return null;
  }

  if (force) clearPickupPlan(creep);

  let plan = creep.memory.pickupPlan;
  const needsFresh =
    !plan ||
    plan.version !== PICKUP_PLAN_VERSION ||
    !Array.isArray(plan.steps) ||
    plan.steps.length === 0 ||
    Game.time - (plan.tick || 0) > PICKUP_PLAN_EXPIRY;

  if (needsFresh) {
    plan = buildPickupPlan(creep);
    if (!plan) {
      clearPickupPlan(creep);
      return null;
    }
    plan.version = PICKUP_PLAN_VERSION;
  }

  plan.tick = Game.time;
  updatePickupPlanTotals(plan);
  creep.memory.pickupPlan = plan;
  return plan;
}

function completePickupStep(creep, targetId, amount) {
  if (!creep.memory || !creep.memory.pickupPlan || !targetId || amount <= 0) return;
  const plan = creep.memory.pickupPlan;
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) return;
  const step = plan.steps[0];
  if (!step || step.id !== targetId) return;
  const base = step.remaining !== undefined ? step.remaining : step.amount || 0;
  step.remaining = Math.max(0, base - amount);
  plan.tick = Game.time;
  if (step.remaining <= 0) {
    plan.steps.shift();
  }
  updatePickupPlanTotals(plan);
  if (!plan.steps.length || plan.remaining <= 0) {
    clearPickupPlan(creep);
  } else {
    creep.memory.pickupPlan = plan;
  }
}

function finalizePickupSuccess(creep, targetId, reservedAmount, gainedAmount) {
  if (!targetId) return;
  releaseEnergy(targetId, reservedAmount);
  if (gainedAmount > 0) {
    completePickupStep(creep, targetId, gainedAmount);
  } else {
    clearPickupPlan(creep);
  }
}

// Determine the optimal energy source following the cached pickup plan.
function findEnergySource(creep) {
  let plan = ensurePickupPlan(creep);
  if (!plan) return null;

  while (plan && Array.isArray(plan.steps) && plan.steps.length) {
    const step = plan.steps[0];
    const target = Game.getObjectById(step.id);
    if (!target) {
      plan.steps.shift();
      updatePickupPlanTotals(plan);
      plan = ensurePickupPlan(creep, true);
      if (!plan) return null;
      continue;
    }

    const reserved = Memory.energyReserves[step.id] || 0;
    const available =
      step.type === 'pickup'
        ? (target.amount || 0) - reserved
        : target.store
          ? (target.store[RESOURCE_ENERGY] || 0) - reserved
          : 0;

    if (available <= 0) {
      plan.steps.shift();
      updatePickupPlanTotals(plan);
      plan = ensurePickupPlan(creep, true);
      if (!plan) return null;
      continue;
    }

    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    const requested = Math.min(available, freeCapacity);
    if (requested <= 0) {
      plan.steps.shift();
      updatePickupPlanTotals(plan);
      plan = ensurePickupPlan(creep, true);
      if (!plan) return null;
      continue;
    }

    step.remaining = requested;
    step.amount = requested;
    plan.tick = Game.time;
    creep.memory.pickupPlan = plan;
    return {
      type: step.type,
      target,
      available: requested,
      planStepId: step.id,
    };
  }

  clearPickupPlan(creep);
  return null;
}

function deliverEnergy(creep, target = null) {
  const spawnTarget =
    target ||
    (typeof FIND_MY_SPAWNS !== 'undefined' && typeof creep.pos.findClosestByPath === 'function'
      ? creep.pos.findClosestByPath(FIND_MY_SPAWNS, {
          filter: (s) =>
            s &&
            s.store &&
            typeof s.store.getFreeCapacity === 'function' &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        })
      : null);
  const extensionTarget =
    !spawnTarget && typeof creep.pos.findClosestByPath === 'function'
      ? creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: (s) =>
            s &&
            s.structureType === STRUCTURE_EXTENSION &&
            s.store &&
            typeof s.store.getFreeCapacity === 'function' &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        })
      : null;
  const structure = spawnTarget || extensionTarget;
  if (structure) {
    const result = creep.transfer(structure, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) {
      creep.travelTo(structure, {
        visualizePathStyle: { stroke: '#ffffff' },
        allowRestricted: structure.structureType === STRUCTURE_SPAWN,
      });
    } else if (result === OK) {
      clearPickupPlan(creep);
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
    ensureAssignment(creep);

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
        if (creep.memory.task.reserved) {
          energyRequests.releaseDelivery(
            creep.memory.task.target,
            creep.memory.task.reserved,
          );
        }
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
        clearPickupPlan(creep);
        const carrying = creep.store[RESOURCE_ENERGY] || 0;
        const reserved = creep.memory.task.reserved || 0;
        if (carrying < reserved) {
          const diff = reserved - carrying;
          if (diff > 0) {
            energyRequests.releaseDelivery(creep.memory.task.target, diff);
            creep.memory.task.reserved = reserved - diff;
          }
        }
        const before = creep.store[RESOURCE_ENERGY];
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(target, { visualizePathStyle: { stroke: "#ffffff" } });
        } else {
          const delivered = before - creep.store[RESOURCE_ENERGY];
          if (delivered > 0) {
            energyRequests.releaseDelivery(creep.memory.task.target, delivered);
          }
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
          const amount = Math.min(
            creep.store.getFreeCapacity(RESOURCE_ENERGY),
            source.available || creep.store.getFreeCapacity(RESOURCE_ENERGY),
          );
          if (amount <= 0) return;
          reserveEnergy(source.target.id, amount);
          creep.memory.reserving = { id: source.target.id, amount, type: source.type };
          const beforeEnergy = creep.store[RESOURCE_ENERGY] || 0;
          const action =
            source.type === 'pickup'
              ? creep.pickup(source.target)
              : creep.withdraw(source.target, RESOURCE_ENERGY);
          if (action === ERR_NOT_IN_RANGE) {
            creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
          } else if (action === OK) {
            const gained = (creep.store[RESOURCE_ENERGY] || 0) - beforeEnergy;
            finalizePickupSuccess(creep, source.target.id, amount, gained);
            delete creep.memory.reserving;
            creep.memory.roundTripStartTick = Game.time;
          } else if (action !== ERR_TIRED) {
            releaseEnergy(source.target.id, amount);
            delete creep.memory.reserving;
            clearPickupPlan(creep);
          }
        }
        return;
      }
      const outstanding = creep.memory.task && creep.memory.task.reserved
        ? creep.memory.task.reserved
        : 0;
  if (outstanding > 0) {
    energyRequests.releaseDelivery(creep.memory.task.target, outstanding);
  }
  delete creep.memory.task;
  clearPickupPlan(creep);
  moveToIdle(creep);
  return;
}

    if (creep.memory.reserving) {
      const reservation = creep.memory.reserving;
      const target = Game.getObjectById(reservation.id);
      const available =
        target && reservation.type === 'pickup'
          ? target.amount || 0
          : target && target.store
            ? target.store[RESOURCE_ENERGY] || 0
            : 0;
  if (!target || available <= 0) {
        releaseEnergy(reservation.id, reservation.amount);
        delete creep.memory.reserving;
        clearPickupPlan(creep);
      } else {
        const beforeEnergy = creep.store[RESOURCE_ENERGY] || 0;
        const action =
          reservation.type === 'pickup'
            ? creep.pickup(target)
            : creep.withdraw(target, RESOURCE_ENERGY);
        if (action === ERR_NOT_IN_RANGE) {
          creep.travelTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
        } else if (action === OK) {
          const gained = (creep.store[RESOURCE_ENERGY] || 0) - beforeEnergy;
          finalizePickupSuccess(creep, reservation.id, reservation.amount, gained);
          delete creep.memory.reserving;
          creep.memory.roundTripStartTick = Game.time;
        } else if (action !== ERR_TIRED) {
          releaseEnergy(reservation.id, reservation.amount);
          delete creep.memory.reserving;
          clearPickupPlan(creep);
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

    available.sort((a, b) => {
      const priorityA = a.task.priority !== undefined ? a.task.priority : 99;
      const priorityB = b.task.priority !== undefined ? b.task.priority : 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const outstandingA = a.task.data && a.task.data.amount !== undefined ? a.task.data.amount : 0;
      const outstandingB = b.task.data && b.task.data.amount !== undefined ? b.task.data.amount : 0;
      if (outstandingA !== outstandingB) return outstandingB - outstandingA;
      return (a.task.data.ticksNeeded || 0) - (b.task.data.ticksNeeded || 0);
    });

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
      let capacity = 0;
      if (creep.store && typeof creep.store.getCapacity === 'function') {
        capacity = creep.store.getCapacity(RESOURCE_ENERGY);
      } else if (creep.carryCapacity) {
        capacity = creep.carryCapacity;
      }
      const outstanding =
        task.data.amount !== undefined ? task.data.amount : capacity;
      let deliver = Math.min(capacity, outstanding);
      if (deliver <= 0) continue;
      if (task.data.amount !== undefined) {
        task.data.amount -= deliver;
        if (task.data.amount <= 0) {
          const idx = creepTasks[name].tasks.indexOf(task);
          if (idx !== -1) creepTasks[name].tasks.splice(idx, 1);
        }
      }
      energyRequests.reserveDelivery(name, deliver, {
        roomName: task.data.pos.roomName,
        structureType: task.data.structureType || null,
      });
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
      clearPickupPlan(creep);
      if (deliverEnergy(creep)) return;
    }

    const source = findEnergySource(creep);
    if (source) {
      const amount = Math.min(
        creep.store.getFreeCapacity(RESOURCE_ENERGY),
        source.available || creep.store.getFreeCapacity(RESOURCE_ENERGY),
      );
      if (amount <= 0) return;
      reserveEnergy(source.target.id, amount);
      creep.memory.reserving = { id: source.target.id, amount, type: source.type };
      const beforeEnergy = creep.store[RESOURCE_ENERGY] || 0;
      const action =
        source.type === 'pickup'
          ? creep.pickup(source.target)
          : creep.withdraw(source.target, RESOURCE_ENERGY);
      if (action === ERR_NOT_IN_RANGE) {
        creep.travelTo(source.target, { visualizePathStyle: { stroke: '#ffaa00' } });
      } else if (action === OK) {
        const gained = (creep.store[RESOURCE_ENERGY] || 0) - beforeEnergy;
        finalizePickupSuccess(creep, source.target.id, amount, gained);
        delete creep.memory.reserving;
        creep.memory.roundTripStartTick = Game.time;
      } else if (action !== ERR_TIRED) {
        releaseEnergy(source.target.id, amount);
        delete creep.memory.reserving;
        clearPickupPlan(creep);
      }
      return;
    }


    const spawn = creep.room && typeof creep.room.find === 'function'
      ? creep.room.find(FIND_MY_SPAWNS)[0]
      : null;
    const assignment = creep.memory.assignment;
    if (creep.store[RESOURCE_ENERGY] === 0) {
      if (assignment && assignment.pickupPos) {
        const targetPos = assignment.pickupPos;
        if (!positionsMatch(creep.pos, targetPos)) {
          const goal = createRoomPosition({
            x: targetPos.x,
            y: targetPos.y,
            roomName: targetPos.roomName || creep.room.name,
          });
          if (goal) {
            const pickupRange = assignment.pickupId ? 1 : 0;
            creep.travelTo(goal, { range: pickupRange });
            return;
          }
        }
      }
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
      creep.travelTo(spawn, { range: 2, allowRestricted: true });
      return;
    }
  },
  onDeath: function (creep) {
    if (creep.memory.task && creep.memory.task.name === 'deliverEnergy') {
      if (creep.memory.task.reserved) {
        energyRequests.releaseDelivery(
          creep.memory.task.target,
          creep.memory.task.reserved,
        );
      }
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
    clearPickupPlan(creep);
  },
};
