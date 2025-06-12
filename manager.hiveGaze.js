const htm = require('./manager.htm');
const spawnQueue = require('./manager.spawnQueue');
const spawnManager = require('./manager.spawn');
const _ = require('lodash');
const statsConsole = require('console.console');
const { getRandomTyranidQuote } = require('./utils.quotes');

/**
 * HiveGaze explores exits and queues scout tasks.
 * @codex-owner hiveGaze
 */
function scoreTerrain(roomName) {
  const terrain = Game.map.getRoomTerrain(roomName);
  let open = 0;
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (terrain.get(x, y) !== TERRAIN_MASK_WALL) open++;
    }
  }
  return open;
}

function cacheMiningRoutes(room) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  if (!Memory.rooms[room.name].miningRoutes)
    Memory.rooms[room.name].miningRoutes = {};
  const sources = room.find(FIND_SOURCES);
  for (const source of sources) {
    const result = PathFinder.search(spawn.pos, { pos: source.pos, range: 1 }, {
      swampCost: 2,
      plainCost: 2,
      ignoreCreeps: true,
    });
    Memory.rooms[room.name].miningRoutes[source.id] = {
      pathLength: result.path.length,
      lastCalculated: Game.time,
    };
  }
}

const hiveGaze = {
  scoreTerrain,

  /** Evaluate exits and queue scouting tasks
   *  @codex-owner hiveGaze
   */
  evaluateExpansionVision() {
    htm.init();
    if (!Memory.hive) Memory.hive = { clusters: {} };
    if (!Memory.rooms) Memory.rooms = {};
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      cacheMiningRoutes(room);
      const exits = Game.map.describeExits(roomName) || {};
      for (const dir in exits) {
        const target = exits[dir];
        const mem = Memory.rooms[target];
        if (mem && mem.scoutCooldownUntil && mem.scoutCooldownUntil > Game.time) {
          continue; // skip rooms on cooldown
        }
        const last = mem && mem.lastScouted ? mem.lastScouted : 0;
        if (!mem || Game.time - last > 15000) {
          htm.addColonyTask(
            roomName,
            'SCOUT_ROOM',
            { roomName: target },
            5,
            500,
            1,
            'hiveGaze',
            { module: 'hiveGaze', createdBy: 'evaluateExpansionVision', tickCreated: Game.time },
          );
        }
      }
    }
    Memory.hive.expansionVisionLastCheck = Game.time;
  },

  /** Ensure a scout exists when tasks remain unclaimed
   *  @codex-owner hiveGaze
   */
  manageScouts() {
    const scouts = _.filter(Game.creeps, c => c.memory.role === 'scout');
    const tasks = [];
    if (Memory.htm && Memory.htm.colonies) {
      for (const col in Memory.htm.colonies) {
        const container = Memory.htm.colonies[col];
        if (!container.tasks) continue;
        for (const t of container.tasks) {
          if (t.name === 'SCOUT_ROOM') tasks.push({ colony: col, task: t });
        }
      }
    }
    const queued = spawnQueue.queue.some(q => q.category === 'scout');
    if (tasks.length && scouts.length === 0 && !queued) {
      // spawn a new scout in the first colony with tasks
      const colony = tasks[0].colony;
      const room = Game.rooms[colony];
      if (!room) return;
      const spawn = room.find(FIND_MY_SPAWNS)[0];
      if (!spawn) return;
      spawnQueue.addToQueue(
        'scout',
        colony,
        [MOVE],
        { role: 'scout', assignment: 'hiveGaze', homeRoom: colony },
        spawn.id,
        0,
        spawnManager.ROLE_PRIORITY.scout || 0,
      );
      if (Memory.settings && Memory.settings.debugHiveGaze) {
        statsConsole.log('[HiveGaze] Scout missing, spawning new', 3);
      }
    }
  },

  remoteScoreRoom({ roomName, colony }) {
    const mem = Memory.rooms[roomName];
    if (!mem || !mem.sources) return;
    if (!Game.rooms[roomName]) {
      if (Memory.settings && Memory.settings.debugHiveGaze) {
        statsConsole.log(`[HiveGaze] Remote score skipped for ${roomName}, not visible`, 3);
      }
      htm.addColonyTask(
        colony || mem.homeColony,
        'REMOTE_SCORE_ROOM',
        { roomName, colony: colony || mem.homeColony },
        4,
        50,
        1,
        'hiveGaze',
        { module: 'hiveGaze', createdBy: 'remoteScoreRetry', tickCreated: Game.time },
      );
      return;
    }
    const colonyId = colony || mem.homeColony;
    const room = Game.rooms[colonyId];
    if (!room) return;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;
    let total = 0;
    for (const id in mem.sources) {
      const data = mem.sources[id];
      const result = PathFinder.search(spawn.pos, { pos: new RoomPosition(data.pos.x, data.pos.y, roomName), range: 1 }, { swampCost: 2, plainCost: 2, ignoreCreeps: true });
      const len = result.path.length;
      const score = Math.max(0, 100 - len * 2);
      mem.sources[id].pathLengthToSpawn = len;
      mem.sources[id].score = score;
      total += score;
    }
    mem.remoteScore = total;
    if (Memory.settings && Memory.settings.debugHiveGaze) {
      statsConsole.log(`[HiveGaze] Scored remote room ${roomName}: ${total}`, 3);
    }
  },

  initRemoteMiner({ room, sourceId }) {
    const mem = Memory.rooms[room];
    if (!mem || !mem.sources || !mem.sources[sourceId]) return;
    const colony = mem.homeColony;
    const base = Game.rooms[colony];
    if (!base) return;
    const spawn = base.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;
    const pos = mem.sources[sourceId].pos;
    const terrain = Game.map.getRoomTerrain(room);
    const offsets = [-1, 0, 1];
    let best = null;
    let bestLen = Infinity;
    for (const dx of offsets) {
      for (const dy of offsets) {
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;
        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          const res = PathFinder.search(
            spawn.pos,
            { pos: new RoomPosition(x, y, room), range: 1 },
            { swampCost: 2, plainCost: 2, ignoreCreeps: true },
          );
          if (res.path.length < bestLen) {
            bestLen = res.path.length;
            best = { x, y };
          }
        }
      }
    }
    if (!best) {
      if (Memory.settings && Memory.settings.debugHiveGaze) {
        statsConsole.log(`[HiveGaze] No walkable tile near ${sourceId} in ${room}`, 2);
      }
      return;
    }
    mem.sources[sourceId].assignedPosition = best;
    mem.sources[sourceId].reservedBy = 'remoteMiner';
    spawnQueue.addToQueue(
      'remoteMiner',
      colony,
      [MOVE, WORK, WORK, WORK, WORK, WORK],
      { role: 'remoteMiner', targetSourceId: sourceId, targetRoom: room, assignedPos: best, homeRoom: colony },
      spawn.id,
      0,
      spawnManager.PRIORITY_REMOTE_MINER,
    );
    if (Memory.settings && Memory.settings.debugHiveGaze) {
      statsConsole.log(`[HiveGaze] Queued remote miner for ${room}`, 3);
    }
  },

  reserveRemoteRoom({ room }) {
    const mem = Memory.rooms[room];
    if (!mem) return;
    const colony = mem.homeColony;
    const base = Game.rooms[colony];
    if (!base) return;
    const spawn = base.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;
    spawnQueue.addToQueue(
      'reservist',
      colony,
      [MOVE, WORK],
      { role: 'reservist', targetRoom: room, homeRoom: colony },
      spawn.id,
      0,
      spawnManager.PRIORITY_RESERVIST,
    );
    if (Memory.settings && Memory.settings.debugHiveGaze) {
      statsConsole.log(`[HiveGaze] Queued reservist for ${room}`, 3);
    }
  },

  selectExpansionTarget() {
    let best = null;
    let bestScore = 0;
    for (const r in Memory.rooms) {
      const mem = Memory.rooms[r];
      if (typeof mem.remoteScore === 'number' && mem.remoteScore > bestScore) {
        best = r;
        bestScore = mem.remoteScore;
      }
    }
    if (best) {
      Memory.hive.expansionTarget = best;
      const sources = Memory.rooms[best].sources || {};
      const bestSrc = _.maxBy(Object.keys(sources), id => sources[id].score);
      if (bestSrc) {
        if (!htm.hasTask(htm.LEVELS.COLONY, Memory.rooms[best].homeColony, 'REMOTE_MINER_INIT')) {
          htm.addColonyTask(Memory.rooms[best].homeColony, 'REMOTE_MINER_INIT', { room: best, sourceId: bestSrc }, 2, 500, 1, 'hiveGaze', { module: 'hiveGaze', createdBy: 'selectExpansionTarget', tickCreated: Game.time });
          htm.addColonyTask(Memory.rooms[best].homeColony, 'RESERVE_REMOTE_ROOM', { room: best }, 3, 500, 1, 'hiveGaze', { module: 'hiveGaze', createdBy: 'selectExpansionTarget', tickCreated: Game.time });
        }
      }
    }
  },

  /** Track active remote rooms in Memory.hive.claimedRemotes
   *  @codex-owner hiveGaze
   */
  updateClaimedRemotes() {
    if (!Memory.hive) Memory.hive = {};
    if (!Memory.hive.claimedRemotes) Memory.hive.claimedRemotes = [];
    const active = new Set();
    // remote miners keep rooms active
    for (const name in Game.creeps) {
      const c = Game.creeps[name];
      if (c.memory.role === 'remoteMiner') {
        active.add(c.memory.targetRoom);
      } else if (c.memory.role === 'reservist' && c.room.controller && c.room.controller.reservation && c.room.controller.reservation.username === (Memory.username || '')) {
        active.add(c.room.name);
      }
    }
    // check existing reservations in memory
    for (const roomName in Memory.rooms) {
      const mem = Memory.rooms[roomName];
      const reserved = _.get(mem, ['controller', 'owner']) === (Memory.username || '') && _.get(mem, ['controller', 'reservationTicks'], 0) >= 1000;
      const hasMiner = _.some(Game.creeps, c => c.memory.role === 'remoteMiner' && c.memory.targetRoom === roomName);
      if (hasMiner || reserved) active.add(roomName);
    }
    Memory.hive.claimedRemotes = Array.from(active);
  },
};

module.exports = hiveGaze;

htm.registerHandler(htm.LEVELS.COLONY, 'REMOTE_SCORE_ROOM', hiveGaze.remoteScoreRoom);
htm.registerHandler(htm.LEVELS.COLONY, 'REMOTE_MINER_INIT', hiveGaze.initRemoteMiner);
htm.registerHandler(htm.LEVELS.COLONY, 'RESERVE_REMOTE_ROOM', hiveGaze.reserveRemoteRoom);
