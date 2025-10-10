const htm = require('./manager.htm');
const hiveGaze = require('./manager.hiveGaze');
const movementUtils = require('./utils.movement');
const _ = require('lodash');
const statsConsole = require('console.console');
const terrainMemory = require('./memory.terrain');

const SCOUT_MAX_DEPTH = 2;
const SCOUT_REVISIT_TICKS = 5000;
const SCOUT_IDLE_WINDOW = 5;

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
  htm.claimTask(htm.LEVELS.COLONY, creep.memory.homeRoom, 'SCOUT_ROOM', 'hiveGaze');
  if (Memory.settings && Memory.settings.debugHiveGaze) {
    statsConsole.log(`[HiveGaze] Scout ${creep.name} scouting ${task.data.roomName}`, 3);
  }
  return true;
};

const roleScout = {
  run(creep) {
    if (!creep.memory.homeRoom) creep.memory.homeRoom = creep.room.name;

    // Clear idle flag when expired
    if (creep.memory.idle && Game.time >= creep.memory.idleUntil) {
      delete creep.memory.idle;
      delete creep.memory.idleUntil;
    }

    if (creep.memory.idle) {
      const basePos = _.get(
        Memory,
        ['hive', 'clusters', creep.memory.homeRoom, 'colonies', creep.memory.homeRoom, 'meta', 'basePos'],
      );
      if (basePos) creep.travelTo(new RoomPosition(basePos.x, basePos.y, creep.memory.homeRoom));
      return;
    }

    if (creep.ticksToLive && creep.ticksToLive < 50 && creep.memory.targetRoom) {
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
      return;
    }

    if (!creep.memory.targetRoom) {
      if (!assignTaskTarget(creep)) {
        const autoTarget = pickAutoScoutTarget(creep);
        if (autoTarget) {
          creep.memory.targetRoom = autoTarget;
          creep.memory.targetSource = 'auto';
          if (Memory.settings && Memory.settings.debugHiveGaze) {
            statsConsole.log(`[HiveGaze] Scout ${creep.name} auto-target ${autoTarget}`, 3);
          }
        }
      }
    }

    if (creep.memory.targetRoom) {
      if (creep.room.name !== creep.memory.targetRoom) {
        const targetPos = new RoomPosition(25, 25, creep.memory.targetRoom);
        creep.travelTo(
          targetPos,
          movementUtils.preparePlannerOptions(creep, targetPos, {
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
        statsConsole.log(
          `[HiveGaze] Scouted ${roomName}, sources: ${roomIntel.sourceCount}`,
          3,
        );
      }
      roomIntel.scoutFailLog = [];

      if (creep.memory.targetSource !== 'auto') {
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
    } else {
      const autoTarget = pickAutoScoutTarget(creep);
      if (autoTarget) {
        creep.memory.targetRoom = autoTarget;
        creep.memory.targetSource = 'auto';
        if (Memory.settings && Memory.settings.debugHiveGaze) {
          statsConsole.log(`[HiveGaze] Scout ${creep.name} auto-target ${autoTarget}`, 3);
        }
        return;
      }

      creep.memory.idle = true;
      creep.memory.idleUntil = Game.time + SCOUT_IDLE_WINDOW;
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
    }
  },
};

module.exports = roleScout;
