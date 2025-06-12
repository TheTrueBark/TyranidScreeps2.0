const htm = require('./manager.htm');
const hiveGaze = require('./manager.hiveGaze');
const _ = require('lodash');
const statsConsole = require('console.console');

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
      const container = _.get(Memory, ['htm', 'colonies', creep.memory.homeRoom]);
      if (container && container.tasks) {
        const tasks = container.tasks.filter(t => t.name === 'SCOUT_ROOM');
        const task = _.minBy(tasks, t => {
          return Game.map.getRoomLinearDistance
            ? Game.map.getRoomLinearDistance(creep.room.name, t.data.roomName)
            : 0;
        });
        if (task) {
          creep.memory.targetRoom = task.data.roomName;
          creep.memory.taskId = task.id;
          htm.claimTask(htm.LEVELS.COLONY, creep.memory.homeRoom, 'SCOUT_ROOM', 'hiveGaze');
          if (Memory.settings && Memory.settings.debugHiveGaze) {
            statsConsole.log(`[HiveGaze] Scout ${creep.name} scouting ${task.data.roomName}`, 3);
          }
        }
      }
    }

    if (creep.memory.targetRoom) {
      if (creep.room.name !== creep.memory.targetRoom) {
        creep.travelTo(new RoomPosition(25, 25, creep.memory.targetRoom), { range: 20 });
        return;
      }
      const roomName = creep.room.name;
      if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
      const sources = creep.room.find(FIND_SOURCES);
      Memory.rooms[roomName].sources = {};
      for (const s of sources) {
        Memory.rooms[roomName].sources[s.id] = { pos: { x: s.pos.x, y: s.pos.y } };
      }
      Object.assign(Memory.rooms[roomName], {
        lastScouted: Game.time,
        sourceCount: sources.length,
        homeColony: creep.memory.homeRoom,
        controller: {
          exists: !!creep.room.controller,
          owner: creep.room.controller && creep.room.controller.owner
            ? creep.room.controller.owner.username
            : null,
          reservationTicks: creep.room.controller && creep.room.controller.reservation
            ? creep.room.controller.reservation.ticksToEnd
            : 0,
        },
        hostilePresent: creep.room.find(FIND_HOSTILE_CREEPS).length > 0,
        terrainScore: hiveGaze.scoreTerrain(roomName),
        exits: Object.values(Game.map.describeExits(roomName) || {}),
        remoteScore: null,
      });
      if (Memory.settings && Memory.settings.debugHiveGaze) {
        statsConsole.log(
          `[HiveGaze] Scouted ${roomName}, sources: ${Memory.rooms[roomName].sourceCount}`,
          3,
        );
      }
      Memory.rooms[roomName].scoutFailLog = [];
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
      delete creep.memory.targetRoom;
      delete creep.memory.taskId;
    } else {
      const container = _.get(Memory, ['htm', 'colonies', creep.memory.homeRoom]);
      const tasks = container && container.tasks ? container.tasks.filter(t => t.name === 'SCOUT_ROOM') : [];
      if (!tasks.length) {
        creep.memory.idle = true;
        creep.memory.idleUntil = Game.time + 5;
        const basePos = _.get(
          Memory,
          ['hive', 'clusters', creep.memory.homeRoom, 'colonies', creep.memory.homeRoom, 'meta', 'basePos'],
        );
        if (basePos) {
          creep.travelTo(new RoomPosition(basePos.x, basePos.y, creep.memory.homeRoom));
          if (Memory.settings && Memory.settings.debugHiveGaze) {
            statsConsole.log(`[HiveGaze] ${creep.name} returning to base`, 3);
          }
        }
        else if (Memory.settings && Memory.settings.debugHiveGaze) {
          statsConsole.log(`[HiveGaze] Warning: no basePos for ${creep.memory.homeRoom}`, 3);
        }
      } else if (!creep.memory.idle) {
        const next = _.minBy(tasks, t => {
          return Game.map.getRoomLinearDistance
            ? Game.map.getRoomLinearDistance(creep.room.name, t.data.roomName)
            : 0;
        });
        if (next) {
          creep.memory.targetRoom = next.data.roomName;
          creep.memory.taskId = next.id;
          htm.claimTask(htm.LEVELS.COLONY, creep.memory.homeRoom, 'SCOUT_ROOM', 'hiveGaze');
          if (Memory.settings && Memory.settings.debugHiveGaze) {
            statsConsole.log(`[HiveGaze] Scout ${creep.name} scouting ${next.data.roomName}`, 3);
          }
        }
      }
    }
  },
};

module.exports = roleScout;
