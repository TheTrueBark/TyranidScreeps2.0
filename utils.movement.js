const Traveler = require('./manager.hiveTravel');

const MAX_IDLE_SLOTS = 8;
const MIN_IDLE_RANGE = 3;
const OBSTACLE_COST = 0xff;
const SOFT_RESTRICTED_COST = 25;

const isHardRestrictedTile = (pos) =>
  Boolean(pos && (pos.hard === true || pos.mode === 'blocked'));

const createCostMatrix = () => {
  const CostMatrix = global.PathFinder && global.PathFinder.CostMatrix;
  if (typeof CostMatrix === 'function') {
    try {
      return new CostMatrix();
    } catch (err) {
      try {
        return CostMatrix();
      } catch (innerErr) {
        // Fall through to shim below.
      }
    }
  }
  const data = {};
  return {
    get(x, y) {
      return data[`${x}:${y}`] || 0;
    },
    set(x, y, value) {
      data[`${x}:${y}`] = value;
    },
    clone() {
      const cloned = createCostMatrix();
      for (const key in data) {
        const [sx, sy] = key.split(':');
        cloned.set(Number(sx), Number(sy), data[key]);
      }
      return cloned;
    },
  };
};

const createRoomPosition = (x, y, roomName) => {
  if (typeof RoomPosition === 'function') {
    try {
      return new RoomPosition(x, y, roomName);
    } catch (err) {
      return { x, y, roomName };
    }
  }
  return { x, y, roomName };
};

const ensureRoomMemory = (roomName) => {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  return Memory.rooms[roomName];
};

const getPos = (target) => {
  if (!target) return null;
  if (target.pos) return target.pos;
  if (typeof target.x === 'number' && typeof target.y === 'number') {
    return new RoomPosition(target.x, target.y, target.roomName);
  }
  return null;
};

const positionsEqual = (a, b) => {
  if (!a || !b) return false;
  if (typeof a.isEqualTo === 'function') return a.isEqualTo(b);
  return a.x === b.x && a.y === b.y && (a.roomName || null) === (b.roomName || null);
};

const createAvoidanceCallback = (creep, destination, flags = {}) => {
  const allowRestricted = Boolean(flags.allowRestricted);
  const allowMining = Boolean(flags.allowMining);

  return (roomName, matrix) => {
    const result = matrix ? matrix.clone() : createCostMatrix();
    const roomMemory = Memory.rooms && Memory.rooms[roomName];
    if (!roomMemory) return result;

    if (Array.isArray(roomMemory.restrictedArea)) {
      for (const pos of roomMemory.restrictedArea) {
        if (!pos) continue;
        if (pos.roomName && pos.roomName !== roomName) continue;
        // Soft restricted tiles ("noIdle") are high-cost for transit when
        // allowRestricted is true. Hard restricted tiles remain blocked.
        if (!allowRestricted || isHardRestrictedTile(pos)) {
          result.set(pos.x, pos.y, OBSTACLE_COST);
        } else {
          result.set(pos.x, pos.y, Math.max(result.get(pos.x, pos.y), SOFT_RESTRICTED_COST));
        }
      }
    }

    if (!allowMining && roomMemory.miningPositions) {
      for (const sourceId in roomMemory.miningPositions) {
        const data = roomMemory.miningPositions[sourceId];
        if (!data || !data.positions) continue;
        for (const key in data.positions) {
          const pos = data.positions[key];
          if (!pos) continue;
          if (pos.roomName && pos.roomName !== roomName) continue;
          result.set(pos.x, pos.y, OBSTACLE_COST);
        }
      }
    }

    // Reserve builder cluster slots for their assigned builders so traffic
    // does not displace quad formations.
    if (roomMemory.builderClusterReservations) {
      const ownSlot =
        creep &&
        creep.memory &&
        creep.memory.builderClusterSlot &&
        (creep.memory.builderClusterSlot.roomName || roomName) === roomName
          ? creep.memory.builderClusterSlot
          : null;
      for (const key in roomMemory.builderClusterReservations) {
        const slot = roomMemory.builderClusterReservations[key];
        if (!slot) continue;
        const slotRoom = slot.roomName || roomName;
        if (slotRoom !== roomName) continue;
        if (
          ownSlot &&
          ownSlot.x === slot.x &&
          ownSlot.y === slot.y &&
          ownSlot.taskId === slot.taskId
        ) {
          continue;
        }
        result.set(slot.x, slot.y, OBSTACLE_COST);
      }
    }

    return result;
  };
};

const shouldAllowRestricted = (creep, destination, explicit) => {
  if (explicit !== undefined) return explicit;
  if (creep && creep.memory && creep.memory.role === 'hauler') {
    // Haulers are allowed to pass through soft restricted tiles. Idling is
    // still prevented by avoidSpawnArea and idle-slot selection.
    return true;
  }
  if (!destination) return false;
  if (
    typeof STRUCTURE_SPAWN !== 'undefined' &&
    destination.structureType === STRUCTURE_SPAWN
  ) {
    return true;
  }
  const pos = getPos(destination);
  if (!pos) return false;
  const roomMemory =
    Memory.rooms && Memory.rooms[pos.roomName];
  if (!roomMemory || !Array.isArray(roomMemory.restrictedArea)) return false;
  return roomMemory.restrictedArea.some(
    (p) => p.x === pos.x && p.y === pos.y && (p.roomName || pos.roomName) === pos.roomName,
  );
};

const shouldAllowMiningTiles = (creep, explicit) => {
  if (explicit !== undefined) return explicit;
  return creep.memory && creep.memory.role === 'miner';
};

const shouldUseLocalCreepAwarePathing = (creep) => {
  if (!creep || !creep.memory || creep.memory.role !== 'hauler') return false;
  if (!creep.room || typeof creep.room.find !== 'function') return false;
  const spawns = creep.room.find(FIND_MY_SPAWNS) || [];
  if (!spawns.length || !creep.pos || typeof creep.pos.getRangeTo !== 'function') return false;
  return spawns.some((spawn) => spawn && spawn.pos && creep.pos.getRangeTo(spawn.pos) <= 4);
};

const buildIdleSlots = (room) => {
  const spawn =
    room.find && typeof room.find === 'function'
      ? room.find(FIND_MY_SPAWNS)[0]
      : null;
  if (!spawn || !spawn.pos) return [];

  const terrain = typeof room.getTerrain === 'function' ? room.getTerrain() : null;
  const restricted =
    (Memory.rooms &&
      Memory.rooms[room.name] &&
      Array.isArray(Memory.rooms[room.name].restrictedArea)
      ? Memory.rooms[room.name].restrictedArea
      : []
    ).reduce((set, pos) => {
      set.add(`${pos.x}:${pos.y}`);
      return set;
    }, new Set());

  const slots = [];
  const isBlocked = (x, y) => {
    if (x < 1 || x > 48 || y < 1 || y > 48) return true;
    if (terrain && terrain.get(x, y) === TERRAIN_MASK_WALL) return true;
    if (restricted.has(`${x}:${y}`)) return true;
    if (typeof room.lookForAt === 'function' && typeof LOOK_STRUCTURES !== 'undefined') {
      const structures = room.lookForAt(LOOK_STRUCTURES, x, y) || [];
      if (
        typeof OBSTACLE_OBJECT_TYPES !== 'undefined' &&
        structures.some((s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType))
      ) {
        return true;
      }
    }
    return false;
  };

  for (let radius = MIN_IDLE_RANGE; radius <= MIN_IDLE_RANGE + 2; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = spawn.pos.x + dx;
        const y = spawn.pos.y + dy;
        if (isBlocked(x, y)) continue;
        slots.push({ x, y });
        if (slots.length >= MAX_IDLE_SLOTS) return slots;
      }
    }
    if (slots.length >= MAX_IDLE_SLOTS) break;
  }

  if (slots.length === 0) {
    slots.push({ x: spawn.pos.x, y: spawn.pos.y });
  }
  return slots;
};

const getIdleSlot = (room, role, occupant) => {
  const roomMem = ensureRoomMemory(room.name);
  if (!roomMem.idleSlots) roomMem.idleSlots = {};
  if (!Array.isArray(roomMem.idleSlots[role])) {
    roomMem.idleSlots[role] = buildIdleSlots(room).map((slot) => ({
      x: slot.x,
      y: slot.y,
    }));
  }
  const slots = roomMem.idleSlots[role];
  for (const slot of slots) {
    if (slot.occupant && (!Game.creeps || !Game.creeps[slot.occupant])) {
      delete slot.occupant;
    }
  }
  let chosen =
    occupant && slots.find((slot) => slot.occupant === occupant)
      ? slots.find((slot) => slot.occupant === occupant)
      : null;
  if (!chosen) {
    chosen = slots.find((slot) => !slot.occupant);
    if (chosen && occupant) chosen.occupant = occupant;
  }
  return chosen
    ? createRoomPosition(chosen.x, chosen.y, room.name)
    : (slots[0]
        ? createRoomPosition(slots[0].x, slots[0].y, room.name)
        : null);
};

const movementUtils = {
  /**
   * Move the creep away from the spawn if it is adjacent and has no immediate spawn interaction.
   * @param {Creep} creep - The creep to adjust.
   */
  avoidSpawnArea(creep) {
    if (!creep.pos || !creep.pos.findClosestByRange) return;
    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) return;
    if (!creep.memory) creep.memory = {};

    // Miners must remain on their reserved positions even if they are within
    // the restricted area around the spawn. Skip the restricted tile check for
    // that role so they don't get pushed away from containers.
    const roomMemory = Memory.rooms && Memory.rooms[creep.room.name];
    const isMiner = creep.memory && creep.memory.role === 'miner';
    const targetPos =
      isMiner && creep.memory.miningPosition
        ? creep.memory.miningPosition
        : null;

    const matchesMiningTile =
      targetPos &&
      (targetPos.roomName || creep.room.name) === creep.room.name &&
      targetPos.x === creep.pos.x &&
      targetPos.y === creep.pos.y;

    const targetInsideRestricted =
      isMiner &&
      targetPos &&
      roomMemory &&
      Array.isArray(roomMemory.restrictedArea) &&
      roomMemory.restrictedArea.some(
        (p) =>
          p.x === targetPos.x &&
          p.y === targetPos.y &&
          (targetPos.roomName || creep.room.name) === creep.room.name,
      );

    if (
      roomMemory &&
      roomMemory.restrictedArea &&
      !(isMiner && (matchesMiningTile || targetInsideRestricted))
    ) {
      const restrictedTile = roomMemory.restrictedArea.find(
        (p) => p && creep.pos.x === p.x && creep.pos.y === p.y,
      );
      if (restrictedTile) {
        if (
          isMiner &&
          targetPos &&
          (targetPos.roomName || creep.room.name) === creep.room.name &&
          targetPos.x === restrictedTile.x &&
          targetPos.y === restrictedTile.y
        ) {
          return;
        }

        const hardRestricted = isHardRestrictedTile(restrictedTile);
        if (!hardRestricted && creep.memory.role === 'hauler') {
          const state = creep.memory._restrictedTransitState || {};
          const sameTile =
            state.x === creep.pos.x &&
            state.y === creep.pos.y &&
            state.roomName === creep.room.name;
          const lingerTicks = sameTile ? (state.ticks || 0) + 1 : 1;
          creep.memory._restrictedTransitState = {
            x: creep.pos.x,
            y: creep.pos.y,
            roomName: creep.room.name,
            ticks: lingerTicks,
            tick: Game.time,
          };
          // Let haulers pass through soft restricted tiles; only kick them
          // once they linger and behave as if idling on those tiles.
          if (lingerTicks < 3) return;
        }

        const idle = this.findIdlePosition(
          creep.room,
          creep.memory && creep.memory.role,
          creep.name,
        );
        if (idle && !positionsEqual(creep.pos, idle)) {
          creep.travelTo(idle, { range: 0 });
          return;
        }
        creep.travelTo(spawn, { range: 3 });
        return;
      }
    }
    delete creep.memory._restrictedTransitState;
  },

  /**
   * Locate a nearby tile around the spawn to use as an idle position.
   * The spot will not be inside `Memory.rooms[room].restrictedArea`.
   *
   * @param {Room} room - The room to search within.
   * @returns {RoomPosition|null} Safe idle tile or null if none found.
   */
  findIdlePosition(room, role = 'default', occupant = null) {
    if (!room) return null;
    if (!role) role = 'default';
    if (!occupant) {
      const slots = buildIdleSlots(room);
      if (slots.length === 0) return null;
      const slot = slots[0];
      return createRoomPosition(slot.x, slot.y, room.name);
    }
    return getIdleSlot(room, role, occupant);
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

  /**
   * Enhance Traveler options with avoidance defaults (restricted spawn area, mining tiles, etc.).
   * @param {Creep} creep
   * @param {RoomPosition|Structure|{pos:RoomPosition}} destination
  * @param {object} options
   * @returns {object} cloned options with defaults applied
   */
  applyTravelDefaults(creep, destination, options = {}) {
    const cloned = Object.assign({}, options);
    const allowRestricted = shouldAllowRestricted(
      creep,
      destination,
      cloned.allowRestricted,
    );
    const allowMining = shouldAllowMiningTiles(
      creep,
      cloned.allowMining,
    );

    if (cloned.ignoreCreeps === undefined) {
      // Haulers in the spawn apron should consider creep collisions to reduce
      // local gridlock; elsewhere keep cheaper long-range routing defaults.
      cloned.ignoreCreeps = shouldUseLocalCreepAwarePathing(creep) ? false : true;
    }

    if (!cloned.bypassAvoidance) {
      const avoidanceFlags = {
        allowRestricted,
        allowMining,
      };
      const avoidCallback = createAvoidanceCallback(creep, destination, avoidanceFlags);
      if (typeof cloned.roomCallback === 'function') {
        const existing = cloned.roomCallback;
        cloned.roomCallback = (roomName, matrix) => {
          const outcome = existing(roomName, matrix);
          if (outcome !== undefined) {
            return outcome;
          }
          return avoidCallback(roomName, matrix);
        };
      } else {
        cloned.roomCallback = avoidCallback;
      }
    }

    return cloned;
  },

  /**
   * Prepare options for path planning calls (Traveler.findTravelPath).
   * @param {Creep} creep
   * @param {*} destination
   * @param {object} options
   * @returns {object}
   */
  preparePlannerOptions(creep, destination, options = {}) {
    const prepared = this.applyTravelDefaults(creep, destination, options);
    if (prepared.ignoreCreeps === undefined) prepared.ignoreCreeps = true;
    if (prepared.maxOps === undefined) prepared.maxOps = 5000;
    return prepared;
  },
};

module.exports = movementUtils;

if (typeof Creep !== 'undefined' && !global.__movementTravelWrapped) {
  global.__movementTravelWrapped = true;
  Creep.prototype.travelTo = function (destination, options = {}) {
    const enhanced = movementUtils.applyTravelDefaults(this, destination, options);
    return Traveler.travelTo(this, destination, enhanced);
  };
}
