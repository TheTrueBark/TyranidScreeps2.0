/**
 * Shared helpers for reserving energy on objects so multiple creeps don't
 * attempt to withdraw the same energy chunk simultaneously. Entries now store
 * metadata about who may interact with the energy source and how much energy
 * is currently observed.
 */

const ENERGY = typeof RESOURCE_ENERGY !== 'undefined' ? RESOURCE_ENERGY : 'energy';
const CONTAINER_TYPE =
  typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container';
const LINK_TYPE = typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link';
const STORAGE_TYPE = typeof STRUCTURE_STORAGE !== 'undefined' ? STRUCTURE_STORAGE : 'storage';
const TERMINAL_TYPE =
  typeof STRUCTURE_TERMINAL !== 'undefined' ? STRUCTURE_TERMINAL : 'terminal';
const FACTORY_TYPE = typeof STRUCTURE_FACTORY !== 'undefined' ? STRUCTURE_FACTORY : 'factory';
const LAB_TYPE = typeof STRUCTURE_LAB !== 'undefined' ? STRUCTURE_LAB : 'lab';
const POWER_SPAWN_TYPE =
  typeof STRUCTURE_POWER_SPAWN !== 'undefined' ? STRUCTURE_POWER_SPAWN : 'powerSpawn';
const SPAWN_TYPE = typeof STRUCTURE_SPAWN !== 'undefined' ? STRUCTURE_SPAWN : 'spawn';
const EXTENSION_TYPE =
  typeof STRUCTURE_EXTENSION !== 'undefined' ? STRUCTURE_EXTENSION : 'extension';
const TOMBSTONE_TYPE =
  typeof STRUCTURE_TOMBSTONE !== 'undefined' ? STRUCTURE_TOMBSTONE : 'tombstone';
const RUIN_TYPE = typeof STRUCTURE_RUIN !== 'undefined' ? STRUCTURE_RUIN : 'ruin';

function getGameTime() {
  return typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0;
}

function ensureMemory() {
  if (typeof Memory === 'undefined') return {};
  if (!Memory.energyReserves) Memory.energyReserves = {};
  return Memory.energyReserves;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return {
      reserved: typeof entry === 'number' ? Math.max(0, entry) : 0,
      available: 0,
      haulersMayWithdraw: false,
      haulersMayDeposit: false,
      buildersMayWithdraw: false,
      buildersMayDeposit: false,
      type: 'unknown',
      lastUpdated: getGameTime(),
    };
  }
  const normalized = Object.assign(
    {
      reserved: 0,
      available: 0,
      haulersMayWithdraw: false,
      haulersMayDeposit: false,
      buildersMayWithdraw: false,
      buildersMayDeposit: false,
      type: 'unknown',
    },
    entry,
  );
  normalized.reserved = Math.max(0, normalized.reserved || 0);
  normalized.available = Math.max(0, normalized.available || 0);
  normalized.lastUpdated = getGameTime();
  return normalized;
}

function ensureEntry(id) {
  if (!id) return null;
  const reserves = ensureMemory();
  const existing = reserves[id];
  if (typeof existing === 'number' || !existing) {
    const normalized = normalizeEntry(existing);
    reserves[id] = normalized;
    return normalized;
  }
  if (typeof existing.lastUpdated !== 'number') {
    existing.lastUpdated = getGameTime();
  } else {
    existing.lastUpdated = getGameTime();
  }
  if (typeof existing.reserved !== 'number') existing.reserved = 0;
  if (typeof existing.available !== 'number') existing.available = 0;
  return existing;
}

function updateReserveInfo(id, data = {}) {
  if (!id) return null;
  const entry = ensureEntry(id);
  if (!entry) return null;
  if (data.available !== undefined) {
    entry.available = Math.max(0, data.available || 0);
  }
  if (data.type !== undefined) {
    entry.type = data.type;
  }
  if (data.haulersMayWithdraw !== undefined) {
    entry.haulersMayWithdraw = Boolean(data.haulersMayWithdraw);
  }
  if (data.haulersMayDeposit !== undefined) {
    entry.haulersMayDeposit = Boolean(data.haulersMayDeposit);
  }
  if (data.buildersMayWithdraw !== undefined) {
    entry.buildersMayWithdraw = Boolean(data.buildersMayWithdraw);
  }
  if (data.buildersMayDeposit !== undefined) {
    entry.buildersMayDeposit = Boolean(data.buildersMayDeposit);
  }
  if (data.extra && typeof data.extra === 'object') {
    entry.extra = Object.assign({}, entry.extra || {}, data.extra);
  }
  entry.lastUpdated = getGameTime();
  return entry;
}

function reserveEnergy(id, amount) {
  if (!id || typeof amount !== 'number' || amount <= 0) return 0;
  const entry = ensureEntry(id);
  entry.reserved = Math.max(0, (entry.reserved || 0) + amount);
  entry.lastUpdated = getGameTime();
  return entry.reserved;
}

function releaseEnergy(id, amount = 0) {
  if (!id) return 0;
  const entry = ensureEntry(id);
  if (!entry) return 0;
  if (!amount || amount <= 0) {
    entry.reserved = 0;
  } else {
    entry.reserved = Math.max(0, (entry.reserved || 0) - amount);
  }
  entry.lastUpdated = getGameTime();
  return entry.reserved;
}

function getReserved(id) {
  if (!id) return 0;
  const entry = ensureEntry(id);
  return entry ? entry.reserved || 0 : 0;
}

function extractPos(value) {
  if (!value) return null;
  if (value.pos) return extractPos(value.pos);
  const { x, y } = value;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  const roomName = value.roomName || (value.room && value.room.name) || null;
  return { x, y, roomName };
}

function chebyshevDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs((a.x || 0) - (b.x || 0)), Math.abs((a.y || 0) - (b.y || 0)));
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

function getRoomByName(roomName, fallbackRoom) {
  if (fallbackRoom && (!roomName || fallbackRoom.name === roomName)) return fallbackRoom;
  if (!roomName) return fallbackRoom || null;
  if (typeof Game === 'undefined' || !Game.rooms) return fallbackRoom || null;
  return Game.rooms[roomName] || fallbackRoom || null;
}

function getRoomSources(roomName, fallbackRoom) {
  const room = getRoomByName(roomName, fallbackRoom);
  if (!room || typeof room.find !== 'function' || typeof FIND_SOURCES === 'undefined') {
    return [];
  }
  try {
    const sources = room.find(FIND_SOURCES);
    return Array.isArray(sources) ? sources : [];
  } catch (error) {
    return [];
  }
}

function isControllerContainer(target, pos, context = {}) {
  if (!target || target.structureType !== CONTAINER_TYPE || !pos) return false;
  const room = context.room || getRoomByName(pos.roomName, null);
  if (!room || !room.controller) return false;
  const controllerPos = extractPos(room.controller);
  if (!controllerPos) return false;
  return chebyshevDistance(controllerPos, pos) <= 3;
}

function isHarvestContainer(target, pos, context = {}) {
  if (!target || target.structureType !== CONTAINER_TYPE || !pos) return false;
  const assignment = context.assignment || null;
  if (assignment) {
    if (assignment.pickupId && assignment.pickupId === target.id) return true;
    if (assignment.pickupPos && positionsMatch(assignment.pickupPos, pos)) return true;
    if (assignment.sourceId && typeof Game !== 'undefined' && typeof Game.getObjectById === 'function') {
      const source = Game.getObjectById(assignment.sourceId);
      const sourcePos = extractPos(source);
      if (sourcePos && chebyshevDistance(sourcePos, pos) <= 1) return true;
    }
  }
  const roomName = pos.roomName || (context.room && context.room.name) || null;
  if (
    roomName &&
    typeof Memory !== 'undefined' &&
    Memory.rooms &&
    Memory.rooms[roomName] &&
    Memory.rooms[roomName].miningPositions
  ) {
    const mining = Memory.rooms[roomName].miningPositions;
    for (const sourceId in mining) {
      const data = mining[sourceId];
      if (!data || !data.positions) continue;
      for (const key in data.positions) {
        const entry = data.positions[key];
        if (!entry) continue;
        const entryRoom = entry.roomName || roomName;
        if (entry.x === pos.x && entry.y === pos.y && entryRoom === (pos.roomName || roomName)) {
          return true;
        }
      }
    }
  }
  return false;
}

function describeReserveTarget(target, intent = 'withdraw', context = {}) {
  const descriptor = {
    type: 'unknown',
    haulersMayWithdraw: false,
    haulersMayDeposit: false,
    buildersMayWithdraw: false,
    buildersMayDeposit: false,
  };

  if (!target) return descriptor;

  const pos = extractPos(target);

  if (intent === 'pickup' && target.resourceType === ENERGY) {
    descriptor.type = 'droppedEnergy';
    descriptor.haulersMayWithdraw = true;
    descriptor.buildersMayWithdraw = true;
    return descriptor;
  }

  const structureType = target.structureType;
  if (!structureType) {
    descriptor.type = intent === 'pickup' ? 'pickup' : 'unknown';
    return descriptor;
  }

  switch (structureType) {
    case TOMBSTONE_TYPE:
      descriptor.type = 'tombstone';
      descriptor.haulersMayWithdraw = true;
      descriptor.buildersMayWithdraw = true;
      break;
    case RUIN_TYPE:
      descriptor.type = 'ruin';
      descriptor.haulersMayWithdraw = true;
      descriptor.buildersMayWithdraw = true;
      break;
    case CONTAINER_TYPE: {
      const isController = isControllerContainer(target, pos, context);
      const isHarvest = !isController && isHarvestContainer(target, pos, context);
      if (isController) {
        descriptor.type = 'controllerContainer';
        descriptor.haulersMayDeposit = true;
        descriptor.buildersMayWithdraw = true;
        descriptor.haulersMayWithdraw = false;
      } else if (isHarvest) {
        descriptor.type = 'harvestContainer';
        descriptor.haulersMayWithdraw = true;
        descriptor.buildersMayWithdraw = true;
        descriptor.haulersMayDeposit = false;
      } else {
        descriptor.type = 'container';
        descriptor.haulersMayWithdraw = intent !== 'deposit';
        descriptor.buildersMayWithdraw = true;
        descriptor.haulersMayDeposit = true;
      }
      break;
    }
    case LINK_TYPE:
      descriptor.type = 'link';
      descriptor.haulersMayWithdraw = intent !== 'deposit';
      descriptor.buildersMayWithdraw = false;
      descriptor.haulersMayDeposit = false;
      break;
    case STORAGE_TYPE:
      descriptor.type = 'storage';
      descriptor.haulersMayWithdraw = true;
      descriptor.haulersMayDeposit = true;
      descriptor.buildersMayWithdraw = true;
      break;
    case TERMINAL_TYPE:
      descriptor.type = 'terminal';
      descriptor.haulersMayWithdraw = true;
      descriptor.haulersMayDeposit = true;
      descriptor.buildersMayWithdraw = false;
      break;
    case FACTORY_TYPE:
      descriptor.type = 'factory';
      descriptor.haulersMayWithdraw = true;
      descriptor.haulersMayDeposit = true;
      descriptor.buildersMayWithdraw = false;
      break;
    case LAB_TYPE:
      descriptor.type = 'lab';
      descriptor.haulersMayWithdraw = true;
      descriptor.haulersMayDeposit = false;
      descriptor.buildersMayWithdraw = false;
      break;
    case POWER_SPAWN_TYPE:
      descriptor.type = 'powerSpawn';
      descriptor.haulersMayWithdraw = true;
      descriptor.haulersMayDeposit = true;
      descriptor.buildersMayWithdraw = false;
      break;
    case SPAWN_TYPE:
      descriptor.type = 'spawn';
      descriptor.haulersMayDeposit = true;
      descriptor.buildersMayWithdraw = true;
      descriptor.haulersMayWithdraw = false;
      break;
    case EXTENSION_TYPE:
      descriptor.type = 'extension';
      descriptor.haulersMayDeposit = true;
      descriptor.buildersMayWithdraw = false;
      descriptor.haulersMayWithdraw = false;
      break;
    default:
      descriptor.type = structureType;
      descriptor.haulersMayWithdraw = intent !== 'deposit';
      descriptor.buildersMayWithdraw = intent !== 'deposit';
      descriptor.haulersMayDeposit = intent === 'deposit';
      break;
  }

  return descriptor;
}

module.exports = {
  reserveEnergy,
  releaseEnergy,
  getReserved,
  updateReserveInfo,
  describeReserveTarget,
};

