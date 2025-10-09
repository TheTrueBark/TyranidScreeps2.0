// role.hauler.js

const htm = require('manager.htm');
const logger = require('./logger');
const movementUtils = require('./utils.movement');
const demand = require("./manager.hivemind.demand");
const energyRequests = require('./manager.energyRequests');
const Traveler = require('./manager.hiveTravel');
const _ = require('lodash');

const MAX_PICKUP_CANDIDATES = 6;
const PICKUP_PLAN_VERSION = 2;
const PICKUP_PLAN_EXPIRY = 10;
const DROP_DECAY_PER_TICK = 1;
const FORECAST_WAIT_EXTRA = 2;
const FORECAST_WAIT_MAX = 10;
const FORECAST_WAIT_MIN = 1;
const ENERGY_RESOURCE =
  typeof RESOURCE_ENERGY !== 'undefined' ? RESOURCE_ENERGY : 'energy';

const WORK_CONSTANT = typeof WORK !== 'undefined' ? WORK : 'work';
const SOURCE_REGEN_TIME =
  typeof SOURCE_ENERGY_REGEN_TIME !== 'undefined'
    ? SOURCE_ENERGY_REGEN_TIME
    : 300;

const sourceRateCache = { tick: -1, rates: {} };
const roomSourceCache = { tick: -1, rooms: {} };

if (!Memory.energyReserves) Memory.energyReserves = {};

function chebyshevDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs((a.x || 0) - (b.x || 0)), Math.abs((a.y || 0) - (b.y || 0)));
}

function getRoomSources(roomName) {
  if (!roomName) return [];
  const currentTick =
    typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0;
  if (roomSourceCache.tick !== currentTick) {
    roomSourceCache.tick = currentTick;
    roomSourceCache.rooms = {};
  }
  if (roomSourceCache.rooms[roomName]) {
    return roomSourceCache.rooms[roomName];
  }
  let sources = [];
  const room =
    typeof Game !== 'undefined' &&
    Game.rooms &&
    Game.rooms[roomName] &&
    typeof Game.rooms[roomName].find === 'function'
      ? Game.rooms[roomName]
      : null;
  if (room && typeof FIND_SOURCES !== 'undefined') {
    sources = room.find(FIND_SOURCES) || [];
  }
  roomSourceCache.rooms[roomName] = sources;
  return sources;
}

function getSourceMaxRate(source) {
  if (!source) return 10;
  const capacity =
    typeof source.energyCapacity === 'number' && source.energyCapacity > 0
      ? source.energyCapacity
      : 3000;
  return capacity / Math.max(1, SOURCE_REGEN_TIME);
}

function getCreepWorkParts(creep) {
  if (!creep) return 0;
  if (typeof creep.getActiveBodyparts === 'function') {
    return creep.getActiveBodyparts(WORK_CONSTANT);
  }
  if (Array.isArray(creep.body)) {
    return creep.body.filter(
      (part) =>
        part &&
        part.type === WORK_CONSTANT &&
        (part.hits === undefined || part.hits > 0),
    ).length;
  }
  return 0;
}

function recomputeSourceRates() {
  const currentTick =
    typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0;
  sourceRateCache.tick = currentTick;
  sourceRateCache.rates = {};
  if (!Game || !Game.creeps) return;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (!creep || !creep.memory || creep.memory.role !== 'miner') continue;
    const sourceId = creep.memory.sourceId;
    if (!sourceId) continue;
    const workParts = getCreepWorkParts(creep);
    if (workParts <= 0) continue;
    sourceRateCache.rates[sourceId] =
      (sourceRateCache.rates[sourceId] || 0) + workParts * 2;
  }
  if (typeof Game !== 'undefined' && typeof Game.getObjectById === 'function') {
    for (const sourceId in sourceRateCache.rates) {
      const source = Game.getObjectById(sourceId);
      const capped = getSourceMaxRate(source);
      sourceRateCache.rates[sourceId] = Math.min(
        sourceRateCache.rates[sourceId],
        capped,
      );
    }
  }
}

function getSourceProductionRate(sourceId) {
  if (!sourceId) return 0;
  const currentTick =
    typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0;
  if (sourceRateCache.tick !== currentTick) {
    recomputeSourceRates();
  }
  return sourceRateCache.rates[sourceId] || 0;
}

function getTargetEnergy(target, type) {
  if (!target) return 0;
  if (type === 'pickup') {
    return target.amount || 0;
  }
  if (target.store) {
    if (typeof target.store.getUsedCapacity === 'function') {
      const used = target.store.getUsedCapacity(ENERGY_RESOURCE);
      if (typeof used === 'number') return used;
    }
    return target.store[ENERGY_RESOURCE] || 0;
  }
  if (typeof target.energy === 'number') {
    return target.energy;
  }
  return 0;
}

function identifySourceForTarget(target, type, assignment = null) {
  if (!target) {
    return assignment && assignment.sourceId ? assignment.sourceId : null;
  }
  const pos = extractPos(target);
  const roomName =
    (pos && pos.roomName) ||
    (target.room && target.room.name) ||
    (assignment && assignment.room) ||
    null;
  if (!pos || !roomName) {
    return assignment && assignment.sourceId ? assignment.sourceId : null;
  }
  const sources = getRoomSources(roomName);
  let selected = null;
  let bestRange = Infinity;
  const containerType =
    typeof STRUCTURE_CONTAINER !== 'undefined'
      ? STRUCTURE_CONTAINER
      : 'container';
  const linkType =
    typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link';
  for (const source of sources) {
    if (!source || !source.pos) continue;
    const range = chebyshevDistance(source.pos, pos);
    let allowed =
      type === 'pickup'
        ? 1
        : target.structureType === containerType
          ? 1
          : target.structureType === linkType
            ? 2
            : 1;
    if (range <= allowed && range < bestRange) {
      selected = source;
      bestRange = range;
    }
  }
  if (selected) return selected.id;
  if (assignment && assignment.sourceId) return assignment.sourceId;
  return null;
}

function forecastCandidateAmount(candidate, travelTicks) {
  if (!candidate) return 0;
  const reserved = candidate.reserved || 0;
  const current = candidate.current !== undefined
    ? candidate.current
    : getTargetEnergy(candidate.target, candidate.type);
  const productionRate =
    candidate.productionRate !== undefined
      ? candidate.productionRate
      : getSourceProductionRate(candidate.sourceId);
  let projected = Math.max(0, current - reserved);
  if (productionRate > 0) {
    projected += productionRate * Math.max(0, travelTicks);
  }
  if (candidate.type === 'pickup') {
    projected = Math.max(0, projected - DROP_DECAY_PER_TICK * Math.max(0, travelTicks));
  }
  if (
    candidate.type === 'withdraw' &&
    candidate.target &&
    candidate.target.store &&
    typeof candidate.target.store.getCapacity === 'function'
  ) {
    const total = candidate.target.store.getCapacity(ENERGY_RESOURCE);
    if (typeof total === 'number') {
      projected = Math.min(projected, Math.max(0, total - reserved));
    }
  }
  if (candidate.available !== undefined) {
    projected = Math.max(projected, candidate.available);
  }
  return projected;
}

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

function resolvePlanTarget(step, creep) {
  if (!step || !step.id) return null;
  let target =
    typeof Game.getObjectById === 'function' ? Game.getObjectById(step.id) : null;
  if (target) return target;

  const roomName =
    (step.pos && step.pos.roomName) || (creep.room && creep.room.name) || null;
  const room =
    (roomName && Game.rooms && Game.rooms[roomName]) || creep.room || null;
  if (!room || typeof room.find !== 'function') return null;

  if (step.type === 'pickup') {
    const drops =
      typeof FIND_DROPPED_RESOURCES !== 'undefined'
        ? room.find(FIND_DROPPED_RESOURCES) || []
        : [];
    const foundDrop = drops.find(
      (drop) =>
        drop &&
        ((drop.id && drop.id === step.id) ||
          (drop.pos && step.pos && positionsMatch(drop.pos, step.pos))),
    );
    if (foundDrop) return foundDrop;
    return null;
  }

  const searchConstants = [];
  if (typeof FIND_STRUCTURES !== 'undefined') searchConstants.push(FIND_STRUCTURES);
  if (typeof FIND_TOMBSTONES !== 'undefined')
    searchConstants.push(FIND_TOMBSTONES);
  if (typeof FIND_RUINS !== 'undefined') searchConstants.push(FIND_RUINS);
  if (typeof FIND_MY_SPAWNS !== 'undefined') searchConstants.push(FIND_MY_SPAWNS);

  for (const constant of searchConstants) {
    const list = room.find(constant) || [];
    const match = list.find(
      (obj) =>
        obj &&
        ((obj.id && obj.id === step.id) ||
          (obj.pos && step.pos && positionsMatch(obj.pos, step.pos))),
    );
    if (match) return match;
  }

  return null;
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
    if (
      !room.find ||
      typeof room.find !== 'function' ||
      typeof FIND_SOURCES === 'undefined'
    ) {
      return;
    }
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
    const netAvailable = amount - reserved;
    const pos = extractPos(target);
    if (!pos) return;
    const preferred = isPreferredTarget(assignment, target);
    const sourceId = identifySourceForTarget(target, type, assignment);
    const productionRate = getSourceProductionRate(sourceId);
    if (amount <= 0 && productionRate <= 0 && netAvailable <= 0) return;
    const available = Math.max(0, netAvailable);
    seen.add(target.id);
    results.push({
      id: target.id,
      type,
      target,
      available,
      reserved,
      current: amount,
      netAvailable,
      productionRate,
      sourceId,
      preferred,
      pos: new RoomPosition(pos.x, pos.y, pos.roomName || (target.room && target.room.name) || room.name),
      range: type === 'pickup' ? 1 : 1,
    });
  };

  const spawns =
    typeof FIND_MY_SPAWNS !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_MY_SPAWNS, {
          filter: (s) =>
            s &&
            s.store &&
            typeof s.store.getFreeCapacity === 'function' &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) < s.store.getCapacity(RESOURCE_ENERGY),
        }) || []
      : [];
  for (const spawn of spawns) {
    const stored = spawn.store[RESOURCE_ENERGY] || 0;
    if (stored > 0) pushCandidate('withdraw', spawn, stored);
  }

  const dropped =
    typeof FIND_DROPPED_RESOURCES !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_DROPPED_RESOURCES, {
          filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
        }) || []
      : [];
  for (const res of dropped) {
    pushCandidate('pickup', res, res.amount);
  }

  const ruins =
    typeof FIND_RUINS !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_RUINS, {
          filter: (r) => r.store && r.store[RESOURCE_ENERGY] > 0,
        }) || []
      : [];
  for (const structure of ruins) {
    pushCandidate('withdraw', structure, structure.store[RESOURCE_ENERGY]);
  }

  const tombstones =
    typeof FIND_TOMBSTONES !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_TOMBSTONES, {
          filter: (t) => t.store && t.store[RESOURCE_ENERGY] > 0,
        }) || []
      : [];
  for (const tomb of tombstones) {
    pushCandidate('withdraw', tomb, tomb.store[RESOURCE_ENERGY]);
  }

  const containers =
    typeof FIND_STRUCTURES !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_STRUCTURES, {
          filter: (s) =>
            s.structureType === STRUCTURE_CONTAINER &&
            s.store &&
            s.store[RESOURCE_ENERGY] > 0 &&
            s.id !== avoid,
        }) || []
      : [];
  for (const container of containers) {
    pushCandidate('withdraw', container, container.store[RESOURCE_ENERGY]);
  }

  const links =
    typeof FIND_STRUCTURES !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_STRUCTURES, {
          filter: (s) =>
            s.structureType === STRUCTURE_LINK &&
            s.store &&
            s.store[RESOURCE_ENERGY] > 0,
        }) || []
      : [];
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
  const options = movementUtils.preparePlannerOptions(creep, candidate.target, {
    range: candidate.range,
    ignoreCreeps: true,
    maxOps: 4000,
    ensurePath: true,
  });
  let distance = null;
  try {
    const result = Traveler.findTravelPath(startPos, candidate.pos, options);
    if (result && Array.isArray(result.path) && result.path.length > 0) {
      distance = result.path.length;
    }
  } catch (error) {
    // Fallback handled below.
  }
  if (distance === null) {
    if (startPos && typeof startPos.getRangeTo === 'function') {
      distance = startPos.getRangeTo(candidate.pos);
    } else if (candidate.pos && startPos) {
      const dx = Math.abs((candidate.pos.x || 0) - (startPos.x || 0));
      const dy = Math.abs((candidate.pos.y || 0) - (startPos.y || 0));
      distance = Math.max(dx, dy);
    } else {
      return null;
    }
  }
  const travelTicks = Math.max(0, Math.ceil(distance));
  const projected = forecastCandidateAmount(candidate, travelTicks);
  if (projected <= 0) return null;
  const amount = Math.min(projected, remaining);
  if (amount <= 0) return null;
  const travelCost = distance + 1; // include pickup tick
  const efficiency = travelCost / Math.max(1, amount);
  return {
    candidate,
    amount,
    distance,
    travelCost,
    travelTicks,
    efficiency,
    projected,
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
        if (a.efficiency !== b.efficiency) return a.efficiency - b.efficiency;
        if (a.candidate.preferred !== b.candidate.preferred) {
          return a.candidate.preferred ? -1 : 1;
        }
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
      forecast: best.projected,
      travelTicks: best.travelTicks,
      sourceId: best.candidate.sourceId || null,
      productionRate:
        best.candidate.productionRate !== undefined
          ? best.candidate.productionRate
          : getSourceProductionRate(best.candidate.sourceId),
      reserved: 0,
    });
    remaining -= best.amount;
    currentPos = best.candidate.pos;
  }

  if (!plan.steps.length) return null;
  updatePickupPlanTotals(plan);
  return plan;
}

function clearPickupPlan(creep) {
  if (!creep || !creep.memory || !creep.memory.pickupPlan) return;
  const plan = creep.memory.pickupPlan;
  if (plan && Array.isArray(plan.steps)) {
    for (const step of plan.steps) {
      if (step && step.id && step.reserved) {
        releaseEnergy(step.id, step.reserved);
        step.reserved = 0;
      }
    }
  }
  delete creep.memory.pickupPlan;
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
  if (step.reserved !== undefined) {
    step.reserved = Math.max(0, step.reserved - amount);
  }
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
  const releaseAmount =
    gainedAmount > 0 ? Math.min(reservedAmount, gainedAmount) : reservedAmount;
  if (releaseAmount > 0) {
    releaseEnergy(targetId, releaseAmount);
  }
  if (gainedAmount > 0) {
    completePickupStep(creep, targetId, gainedAmount);
  } else {
    clearPickupPlan(creep);
  }
}

// Determine the optimal energy source following the cached pickup plan.
function findEnergySource(creep) {
  const assignment = creep.memory && creep.memory.assignment;

  let plan = ensurePickupPlan(creep);
  if (!plan) return null;

  while (plan && Array.isArray(plan.steps) && plan.steps.length) {
    const step = plan.steps[0];
    const target = resolvePlanTarget(step, creep);
    if (!target) {
      plan.steps.shift();
      updatePickupPlanTotals(plan);
      plan = ensurePickupPlan(creep, true);
      if (!plan) return null;
      continue;
    }

    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    if (freeCapacity <= 0) {
      clearPickupPlan(creep);
      return null;
    }

    const currentEnergy = getTargetEnergy(target, step.type);
    const basePlanned =
      step.remaining !== undefined && step.remaining > 0
        ? step.remaining
        : step.amount !== undefined && step.amount > 0
          ? step.amount
          : step.forecast !== undefined && step.forecast > 0
            ? step.forecast
            : freeCapacity;
    const desired = Math.min(freeCapacity, Math.max(0, basePlanned));

    if (desired <= 0) {
      plan.steps.shift();
      updatePickupPlanTotals(plan);
      plan = ensurePickupPlan(creep, true);
      if (!plan) return null;
      continue;
    }

    const totalReserved = Memory.energyReserves[step.id] || 0;
    const alreadyReserved = step.reserved || 0;
    const otherReserved = Math.max(0, totalReserved - alreadyReserved);
    const effectiveAvailable = Math.max(0, currentEnergy - otherReserved);

    step.sourceId =
      step.sourceId ||
      identifySourceForTarget(target, step.type, assignment);
    const productionRate =
      step.productionRate !== undefined
        ? step.productionRate
        : getSourceProductionRate(step.sourceId);
    step.productionRate = productionRate;

    if (desired > alreadyReserved) {
      reserveEnergy(step.id, desired - alreadyReserved);
    } else if (desired < alreadyReserved) {
      releaseEnergy(step.id, alreadyReserved - desired);
    }
    step.reserved = desired;

    const shortage = Math.max(0, desired - Math.min(desired, effectiveAvailable));
    if (shortage > 0 && productionRate <= 0) {
      plan.steps.shift();
      updatePickupPlanTotals(plan);
      plan = ensurePickupPlan(creep, true);
      if (!plan) return null;
      continue;
    }

    const travelTicks =
      step.travelTicks !== undefined
        ? step.travelTicks
        : Math.max(
            0,
            Math.ceil(
              typeof creep.pos.getRangeTo === 'function'
                ? creep.pos.getRangeTo(target)
                : chebyshevDistance(creep.pos, target.pos || step.pos),
            ),
          );
    step.travelTicks = travelTicks;

    const waitAllowance =
      shortage > 0 && productionRate > 0
        ? Math.min(
            FORECAST_WAIT_MAX,
            Math.max(
              FORECAST_WAIT_MIN,
              Math.ceil(shortage / productionRate) + FORECAST_WAIT_EXTRA,
            ),
          )
        : FORECAST_WAIT_MIN;

    step.remaining = desired;
    plan.tick = Game.time;
    updatePickupPlanTotals(plan);
    creep.memory.pickupPlan = plan;
    return {
      type: step.type,
      target,
      available: desired,
      planStepId: step.id,
      expectedAt: Game.time + Math.max(1, travelTicks),
      maxWait: waitAllowance,
      productionRate,
      currentEnergy: effectiveAvailable,
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
    typeof FIND_STRUCTURES !== 'undefined' &&
    creep.room.controller.pos &&
    typeof creep.room.controller.pos.findInRange === 'function'
      ? creep.room.controller.pos
          .findInRange(FIND_STRUCTURES, 3, {
            filter: s =>
              s.structureType === STRUCTURE_CONTAINER &&
              s.store &&
              typeof s.store.getFreeCapacity === 'function' &&
              s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
          })[0]
      : null;
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
        let createdReservation = false;
        if (source) {
          const capacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
          const desired = Math.min(
            capacity,
            source.available !== undefined ? source.available : capacity,
          );
          if (desired > 0) {
            if (!source.planStepId) {
              reserveEnergy(source.target.id, desired);
            }
            creep.memory.reserving = {
              id: source.target.id,
              amount: desired,
              type: source.type,
              planStepId: source.planStepId || null,
              expectedAt: source.expectedAt || (Game.time + 1),
              maxWait: source.maxWait || FORECAST_WAIT_MIN,
              productionRate: source.productionRate || 0,
              waitTicks: 0,
            };
            createdReservation = true;
          }
        }

        if (!createdReservation && !creep.memory.reserving) {
          const outstanding =
            creep.memory.task && creep.memory.task.reserved
              ? creep.memory.task.reserved
              : 0;
          if (outstanding > 0) {
            energyRequests.releaseDelivery(
              creep.memory.task.target,
              outstanding,
            );
          }
          delete creep.memory.task;
          clearPickupPlan(creep);
          moveToIdle(creep);
          return;
        }
      }

      // Fall through so the reservation handler below can move us toward the source.
    }

    if (creep.memory.reserving) {
      const reservation = creep.memory.reserving;
      const target = Game.getObjectById(reservation.id);
      const now = Game.time;
      const plan = creep.memory.pickupPlan;
      const planStep =
        reservation.planStepId &&
        plan &&
        Array.isArray(plan.steps) &&
        plan.steps.length &&
        plan.steps[0].id === reservation.id
          ? plan.steps[0]
          : null;
      const releaseReservation = (amount) => {
        const qty = Math.max(0, amount || 0);
        if (qty > 0) {
          releaseEnergy(reservation.id, qty);
          if (planStep && planStep.reserved !== undefined) {
            planStep.reserved = Math.max(0, planStep.reserved - qty);
          }
        }
      };
      if (!target) {
        releaseReservation(reservation.amount);
        if (planStep) {
          plan.steps.shift();
          updatePickupPlanTotals(plan);
          if (plan.steps.length > 0) {
            creep.memory.pickupPlan = plan;
          } else {
            delete creep.memory.pickupPlan;
          }
        }
        delete creep.memory.reserving;
        return;
      }
      const totalReserved = Memory.energyReserves[reservation.id] || 0;
      const stepReserved =
        planStep && planStep.reserved !== undefined
          ? planStep.reserved
          : reservation.amount;
      const otherReserved = Math.max(0, totalReserved - stepReserved);
      const currentEnergy = getTargetEnergy(target, reservation.type);
      const availableForUs = Math.max(0, currentEnergy - otherReserved);
      const limitTick =
        (reservation.expectedAt || now) +
        (reservation.maxWait !== undefined
          ? reservation.maxWait
          : FORECAST_WAIT_MIN);
      if (availableForUs < reservation.amount) {
        if (now <= limitTick) {
          reservation.waitTicks = (reservation.waitTicks || 0) + 1;
          creep.memory.reserving = reservation;
          if (
            typeof creep.pos.getRangeTo === 'function' &&
            creep.pos.getRangeTo(target) > 1
          ) {
            creep.travelTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
          }
          return;
        }
        releaseReservation(reservation.amount);
        if (planStep) {
          plan.steps.shift();
          updatePickupPlanTotals(plan);
          if (plan.steps.length > 0) {
            creep.memory.pickupPlan = plan;
          } else {
            delete creep.memory.pickupPlan;
          }
        }
        delete creep.memory.reserving;
        return;
      }
      const beforeEnergy = creep.store[RESOURCE_ENERGY] || 0;
      const action =
        reservation.type === 'pickup'
          ? creep.pickup(target)
          : creep.withdraw(target, RESOURCE_ENERGY);
      if (action === ERR_NOT_IN_RANGE) {
        creep.travelTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
        return;
      }
      if (action === ERR_NOT_ENOUGH_RESOURCES) {
        reservation.waitTicks = (reservation.waitTicks || 0) + 1;
        if (now < limitTick) {
          creep.memory.reserving = reservation;
          return;
        }
        releaseReservation(reservation.amount);
        if (planStep) {
          plan.steps.shift();
          updatePickupPlanTotals(plan);
          if (plan.steps.length > 0) {
            creep.memory.pickupPlan = plan;
          } else {
            delete creep.memory.pickupPlan;
          }
        }
        delete creep.memory.reserving;
        return;
      }
      if (action === OK) {
        const gained = (creep.store[RESOURCE_ENERGY] || 0) - beforeEnergy;
        finalizePickupSuccess(creep, reservation.id, reservation.amount, gained);
        delete creep.memory.reserving;
        creep.memory.roundTripStartTick = Game.time;
        return;
      }
      if (action !== ERR_TIRED) {
        releaseReservation(reservation.amount);
        if (planStep) {
          plan.steps.shift();
          updatePickupPlanTotals(plan);
          if (plan.steps.length > 0) {
            creep.memory.pickupPlan = plan;
          } else {
            delete creep.memory.pickupPlan;
          }
        }
        delete creep.memory.reserving;
      }
      return;
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
      if (creep.store) {
        if (typeof creep.store.getCapacity === 'function') {
          const total = creep.store.getCapacity(RESOURCE_ENERGY);
          if (typeof total === 'number' && total > 0) capacity = total;
        } else if (typeof creep.store.getFreeCapacity === 'function') {
          const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);
          if (typeof free === 'number') {
            capacity = Math.max(0, free) + (creep.store[RESOURCE_ENERGY] || 0);
          }
        }
        if (!capacity && typeof creep.store[RESOURCE_ENERGY] === 'number') {
          capacity = (creep.store[RESOURCE_ENERGY] || 0) +
            (typeof creep.store.getFreeCapacity === 'function'
              ? Math.max(0, creep.store.getFreeCapacity(RESOURCE_ENERGY))
              : 0);
        }
      }
      if (!capacity && creep.carryCapacity) {
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
      const capacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
      const desired = Math.min(
        capacity,
        source.available !== undefined ? source.available : capacity,
      );
      if (desired > 0) {
        if (!source.planStepId) {
          reserveEnergy(source.target.id, desired);
        }
        creep.memory.reserving = {
          id: source.target.id,
          amount: desired,
          type: source.type,
          planStepId: source.planStepId || null,
          expectedAt: source.expectedAt || (Game.time + 1),
          maxWait: source.maxWait || FORECAST_WAIT_MIN,
          productionRate: source.productionRate || 0,
          waitTicks: 0,
        };
        return;
      }
    }


    const spawn =
      creep.room &&
      typeof creep.room.find === 'function' &&
      typeof FIND_MY_SPAWNS !== 'undefined'
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
