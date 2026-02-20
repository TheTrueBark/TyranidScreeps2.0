const htm = require('./manager.htm');
const hiveGaze = require('./manager.hiveGaze');
const movementUtils = require('./utils.movement');
const _ = require('lodash');
const statsConsole = require('console.console');
const terrainMemory = require('./memory.terrain');

const SCOUT_MAX_DEPTH = 2;
const SCOUT_REVISIT_TICKS = 5000;
const SCOUT_IDLE_WINDOW = 5;
const ROOM_CENTER_COORD = 25;

const ROOM_NAME_REGEX = /^([WE])(\d+)([NS])(\d+)$/;

const toRoomCoordinates = (roomName) => {
  const match = ROOM_NAME_REGEX.exec(roomName);
  if (!match) return null;
  const [, horizontalDir, horizontalValue, verticalDir, verticalValue] = match;
  let x = parseInt(horizontalValue, 10);
  if (horizontalDir === 'W') x = -x - 1;
  let y = parseInt(verticalValue, 10);
  if (verticalDir === 'S') y = -y - 1;
  return { x, y };
};

const compareRoomsByTop = (left, right) => {
  const leftCoords = toRoomCoordinates(left);
  const rightCoords = toRoomCoordinates(right);
  if (!leftCoords || !rightCoords) return left.localeCompare(right);
  if (rightCoords.y !== leftCoords.y) {
    return rightCoords.y - leftCoords.y;
  }
  return leftCoords.x - rightCoords.x;
};

const getExitRooms = (roomName) => {
  if (!Game.map || typeof Game.map.describeExits !== 'function') return [];
  const exits = Game.map.describeExits(roomName);
  if (!exits) return [];
  return Object.values(exits).filter(Boolean);
};

const gatherNearbyRooms = (origin, maxDepth) => {
  const queue = [{ room: origin, depth: 0 }];
  const seen = new Set([origin]);
  const result = [];
  while (queue.length) {
    const { room, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    const exits = getExitRooms(room);
    for (const next of exits) {
      if (!next || seen.has(next)) continue;
      seen.add(next);
      result.push({ room: next, depth: depth + 1 });
      queue.push({ room: next, depth: depth + 1 });
    }
  }
  return result;
};

const getRoomIntel = (roomName) => {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  return Memory.rooms[roomName];
};

const roomNeedsScout = (roomIntel) => {
  if (!roomIntel) return false;
  if (roomIntel.scoutCooldownUntil && roomIntel.scoutCooldownUntil > Game.time) return false;
  if (!roomIntel.scouted) return true;
  const last = roomIntel.lastScouted;
  if (last === undefined) return true;
  return Game.time - last >= SCOUT_REVISIT_TICKS;
};

const pickMemoryScoutTarget = (creep) => {
  if (!Memory.rooms) return null;
  const visitedRecently = new Set((creep.memory.recentTargets || []).slice(-6));
  const rooms = Object.keys(Memory.rooms).sort(compareRoomsByTop);
  for (const roomName of rooms) {
    if (visitedRecently.has(roomName)) continue;
    const intel = Memory.rooms[roomName];
    if (roomNeedsScout(intel)) {
      return {
        roomName,
        pos: { x: ROOM_CENTER_COORD, y: ROOM_CENTER_COORD, roomName },
      };
    }
  }
  return null;
};

const pickAutoScoutTarget = (creep) => {
  if (!Memory.settings || Memory.settings.enableAutoScout !== true) {
    return null;
  }

  const home = creep.memory.homeRoom || creep.room.name;
  const visitedRecently = (creep.memory.recentTargets || []).slice(-6);
  const neighbors = gatherNearbyRooms(home, SCOUT_MAX_DEPTH);
  let best = null;

  for (const entry of neighbors) {
    const intel = Memory.rooms && Memory.rooms[entry.room];
    if (intel && intel.scoutCooldownUntil && intel.scoutCooldownUntil > Game.time) {
      continue;
    }
    if (visitedRecently.includes(entry.room)) continue;
    const last = intel && intel.lastScouted;
    const age = last === undefined ? Number.POSITIVE_INFINITY : Game.time - last;
    const candidate = {
      room: entry.room,
      age,
      depth: entry.depth,
    };
    if (
      !best ||
      candidate.age > best.age ||
      (candidate.age === best.age && candidate.depth < best.depth)
    ) {
      best = candidate;
    }
  }

  if (!best) return null;
  if (best.age < SCOUT_REVISIT_TICKS) {
    // All nearby rooms are fresh; skip auto scouting.
    return null;
  }
  return best.room;
};

const recordRoomIntel = (creep) => {
  const room = creep.room;
  if (!room) return;
  const intel = getRoomIntel(room.name);

  terrainMemory.captureRoomTerrain(room.name, { force: true });

  const sources = typeof FIND_SOURCES !== 'undefined' && typeof room.find === 'function'
    ? room.find(FIND_SOURCES) || []
    : [];
  intel.sources = {};
  for (const s of sources) {
    intel.sources[s.id] = { pos: { x: s.pos.x, y: s.pos.y } };
  }
  const mineral =
    typeof FIND_MINERALS !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_MINERALS) || []
      : [];
  if (mineral.length > 0) {
    intel.mineral = {
      type: mineral[0].mineralType,
      pos: { x: mineral[0].pos.x, y: mineral[0].pos.y },
    };
  }

  const structures =
    typeof FIND_STRUCTURES !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_STRUCTURES) || []
      : [];
  const structureCounts = {};
  for (const structure of structures) {
    const type = structure.structureType;
    structureCounts[type] = (structureCounts[type] || 0) + 1;
  }

  const hostiles =
    typeof FIND_HOSTILE_CREEPS !== 'undefined' && typeof room.find === 'function'
      ? room.find(FIND_HOSTILE_CREEPS) || []
      : [];
  const hostileSummary = {
    count: hostiles.length,
    owners: _.uniq(hostiles.map((c) => c.owner && c.owner.username).filter(Boolean)),
  };

  if (hostileSummary.count > 0) {
    hiveGaze.requestScoutRescan();
  }

  Object.assign(intel, {
    lastScouted: Game.time,
    scouted: true,
    sourceCount: sources.length,
    structures: structureCounts,
    homeColony: creep.memory.homeRoom,
    controller: room.controller
      ? {
          exists: true,
          owner: room.controller.owner ? room.controller.owner.username : null,
          reservationTicks: room.controller.reservation
            ? room.controller.reservation.ticksToEnd
            : 0,
          level: room.controller.level,
        }
      : { exists: false },
    hostilePresent: hostiles.length > 0,
    hostileSummary,
    terrainScore: hiveGaze.scoreTerrain(room.name),
    exits: getExitRooms(room.name),
    energyAvailable: room.energyAvailable,
  });
};

const assignTaskTarget = (creep) => {
  if (!creep.memory.homeRoom) return false;
  const container = _.get(Memory, ['htm', 'colonies', creep.memory.homeRoom]);
  if (!container || !container.tasks) return false;
  const tasks = container.tasks.filter((t) => t.name === 'SCOUT_ROOM');
  if (!tasks.length) return false;
  const task = _.minBy(tasks, (t) => {
    if (typeof Game.map.getRoomLinearDistance === 'function') {
      return Game.map.getRoomLinearDistance(creep.room.name, t.data.roomName);
    }
    return 0;
  });
  if (!task) return false;
  creep.memory.targetRoom = task.data.roomName;
  creep.memory.taskId = task.id;
  creep.memory.targetSource = 'task';
  htm.claimTask(
    htm.LEVELS.COLONY,
    creep.memory.homeRoom,
    'SCOUT_ROOM',
    'hiveGaze',
    htm.DEFAULT_CLAIM_COOLDOWN,
    0,
    { taskId: task.id },
  );
  if (Memory.settings && Memory.settings.debugHiveGaze) {
    statsConsole.log(`[HiveGaze] Scout ${creep.name} scouting ${task.data.roomName}`, 3);
  }
  return true;
};

const assignNextScoutTarget = (creep) => {
  if (assignTaskTarget(creep)) {
    return true;
  }

  const memoryTarget = pickMemoryScoutTarget(creep);
  if (memoryTarget) {
    creep.memory.targetRoom = memoryTarget.roomName;
    creep.memory.targetSource = 'memory';
    creep.memory.targetPos = memoryTarget.pos;
    if (Memory.settings && Memory.settings.debugHiveGaze) {
      statsConsole.log(
        `[HiveGaze] Scout ${creep.name} memory-target ${memoryTarget.roomName}`,
        3,
      );
    }
    return true;
  }

  const autoTarget = pickAutoScoutTarget(creep);
  if (autoTarget) {
    creep.memory.targetRoom = autoTarget;
    creep.memory.targetSource = 'auto';
    creep.memory.targetPos = {
      x: ROOM_CENTER_COORD,
      y: ROOM_CENTER_COORD,
      roomName: autoTarget,
    };
    if (Memory.settings && Memory.settings.debugHiveGaze) {
      statsConsole.log(`[HiveGaze] Scout ${creep.name} auto-target ${autoTarget}`, 3);
    }
    return true;
  }

  return false;
};

const getTargetPosition = (creep) => {
  const stored = creep.memory.targetPos;
  if (stored && typeof stored.x === 'number' && typeof stored.y === 'number') {
    const roomName = stored.roomName || creep.memory.targetRoom;
    return new RoomPosition(stored.x, stored.y, roomName);
  }
  return new RoomPosition(ROOM_CENTER_COORD, ROOM_CENTER_COORD, creep.memory.targetRoom);
};

const sendScoutIdle = (creep) => {
  if (!creep.memory.idle) {
    creep.memory.idle = true;
    creep.memory.idleUntil = Game.time + SCOUT_IDLE_WINDOW;
  }
  const basePos = _.get(
    Memory,
    ['hive', 'clusters', creep.memory.homeRoom, 'colonies', creep.memory.homeRoom, 'meta', 'basePos'],
  );
  if (basePos) {
    creep.travelTo(new RoomPosition(basePos.x, basePos.y, creep.memory.homeRoom));
    if (Memory.settings && Memory.settings.debugHiveGaze) {
      statsConsole.log(`[HiveGaze] ${creep.name} returning to base`, 3);
    }
  } else if (Memory.settings && Memory.settings.debugHiveGaze) {
    statsConsole.log(`[HiveGaze] Warning: no basePos for ${creep.memory.homeRoom}`, 3);
  }
};

const roleScout = {
  run(creep) {
    if (!creep.memory.homeRoom) creep.memory.homeRoom = creep.room.name;
    if (!Memory.rooms) Memory.rooms = {};

    // Clear idle flag when expired
    if (creep.memory.idle && Game.time >= creep.memory.idleUntil) {
      delete creep.memory.idle;
      delete creep.memory.idleUntil;
    }

    if (creep.memory.idle) {
      sendScoutIdle(creep);
      return;
    }

    if (
      creep.ticksToLive &&
      creep.ticksToLive < 50 &&
      creep.memory.targetRoom &&
      creep.memory.targetSource !== 'memory'
    ) {
      const targetMem = Memory.rooms[creep.memory.targetRoom] || (Memory.rooms[creep.memory.targetRoom] = {});
      targetMem.scoutFailLog = (targetMem.scoutFailLog || []).filter(t => Game.time - t <= 1000);
      targetMem.scoutFailLog.push(Game.time);
      if (targetMem.scoutFailLog.length >= 3) {
        targetMem.scoutCooldownUntil = Game.time + 1000;
        targetMem.scoutFailLog = [];
      }
      if (!targetMem.scoutCooldownUntil || targetMem.scoutCooldownUntil <= Game.time) {
        htm.addColonyTask(
          creep.memory.homeRoom,
          'SCOUT_ROOM',
          { roomName: creep.memory.targetRoom },
          5,
          500,
          1,
          'hiveGaze',
          { module: 'role.scout', createdBy: 'ttlRequeue', tickCreated: Game.time },
        );
        if (Memory.settings && Memory.settings.debugHiveGaze) {
          statsConsole.log(
            `[HiveGaze] Scout retiring mid-task, re-queued ${creep.memory.targetRoom}`,
            3,
          );
        }
      } else if (Memory.settings && Memory.settings.debugHiveGaze) {
        statsConsole.log(
          `[HiveGaze] Scout ${creep.name} giving up on ${creep.memory.targetRoom} due to cooldown`,
          3,
        );
      }
      creep.memory.retiring = true;
      delete creep.memory.targetRoom;
      delete creep.memory.taskId;
      delete creep.memory.targetSource;
      delete creep.memory.targetPos;
      return;
    }

    if (!creep.memory.targetRoom) {
      if (!assignNextScoutTarget(creep)) {
        sendScoutIdle(creep);
        return;
      }
    }

    if (creep.room.name !== creep.memory.targetRoom) {
      const destination = getTargetPosition(creep);
      creep.travelTo(
        destination,
        movementUtils.preparePlannerOptions(creep, destination, {
          range: 20,
          ignoreCreeps: true,
        }),
      );
      return;
    }

    const roomName = creep.room.name;
    recordRoomIntel(creep);
    const roomIntel = Memory.rooms[roomName];
    if (Memory.settings && Memory.settings.debugHiveGaze) {
      statsConsole.log(`[HiveGaze] Scouted ${roomName}, sources: ${roomIntel.sourceCount}`, 3);
    }
    roomIntel.scoutFailLog = [];

    if (creep.memory.targetSource === 'task') {
      htm.addColonyTask(
        creep.memory.homeRoom,
        'REMOTE_SCORE_ROOM',
        { roomName, colony: creep.memory.homeRoom },
        4,
        500,
        1,
        'hiveGaze',
        { module: 'role.scout', createdBy: 'scoutComplete', tickCreated: Game.time },
      );
      const container = _.get(Memory, ['htm', 'colonies', creep.memory.homeRoom]);
      if (container && container.tasks) {
        const idx = container.tasks.findIndex(t => t.id === creep.memory.taskId);
        if (idx !== -1) container.tasks.splice(idx, 1);
      }
    }

    if (!creep.memory.recentTargets) creep.memory.recentTargets = [];
    creep.memory.recentTargets.push(roomName);
    if (creep.memory.recentTargets.length > 12) {
      creep.memory.recentTargets = creep.memory.recentTargets.slice(-12);
    }

    delete creep.memory.targetRoom;
    delete creep.memory.taskId;
    delete creep.memory.targetSource;
    delete creep.memory.targetPos;

    if (!assignNextScoutTarget(creep)) {
      sendScoutIdle(creep);
      return;
    }

    if (creep.room.name !== creep.memory.targetRoom) {
      const nextDestination = getTargetPosition(creep);
      creep.travelTo(
        nextDestination,
        movementUtils.preparePlannerOptions(creep, nextDestination, {
          range: 20,
          ignoreCreeps: true,
        }),
      );
    }
  },
};

module.exports = roleScout;
