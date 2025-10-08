const htm = require('./manager.htm');
const spawnQueue = require('./manager.spawnQueue');
const spawnManager = require('./manager.spawn');
const _ = require('lodash');
const statsConsole = require('console.console');
const { getRandomTyranidQuote } = require('./utils.quotes');

const SCOUT_REVISIT_TICKS = 5000;
const SCOUT_SEED_DEPTH = 3;

/**
 * HiveGaze explores exits and queues scout tasks.
 * @codex-owner hiveGaze
 */
// Cache result for the current tick to avoid repeated terrain scans
function scoreTerrain(roomName) {
  const mem = Memory.rooms[roomName] || {};
  if (mem.terrainScore && mem.terrainScore.tick === Game.time) {
    return mem.terrainScore.score;
  }
  const terrain = Game.map.getRoomTerrain(roomName);
  let open = 0;
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (terrain.get(x, y) !== TERRAIN_MASK_WALL) open++;
    }
  }
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  Memory.rooms[roomName].terrainScore = { score: open, tick: Game.time };
  return open;
}

function cacheMiningRoutes(room) {
  if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
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

function seedReachableRoomMemory(origin, depth = SCOUT_SEED_DEPTH) {
  if (!Game.map || typeof Game.map.describeExits !== 'function') return;
  if (!Memory.rooms) Memory.rooms = {};
  const queue = [{ room: origin, depth: 0 }];
  const seen = new Set([origin]);

  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= depth) continue;
    const exits = Game.map.describeExits(current.room) || {};
    for (const dir in exits) {
      const target = exits[dir];
      if (!target || seen.has(target)) continue;
      seen.add(target);
      queue.push({ room: target, depth: current.depth + 1 });
      if (!Memory.rooms[target]) Memory.rooms[target] = {};
      const mem = Memory.rooms[target];
      if (mem.lastScouted === undefined) mem.lastScouted = 0;
      if (!mem.homeColony) mem.homeColony = origin;
      if (!Array.isArray(mem.scoutFailLog)) mem.scoutFailLog = [];
    }
  }
}

const hiveGaze = {
  scoreTerrain,
  seedReachableRoomMemory,

  /** Evaluate exits and queue scouting tasks
   *  @codex-owner hiveGaze
   */
  evaluateExpansionVision() {
    htm.init();
    if (!Memory.hive) Memory.hive = {};
    if (!Memory.hive.clusters) Memory.hive.clusters = {};
    if (Memory.hive.scoutRescanRequested === undefined) {
      Memory.hive.scoutRescanRequested = true;
    }
    if (!Memory.rooms) Memory.rooms = {};
    let tasksQueued = false;
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      seedReachableRoomMemory(roomName);
      cacheMiningRoutes(room);
      const exits = Game.map.describeExits(roomName) || {};
      for (const dir in exits) {
        const target = exits[dir];
        const mem = Memory.rooms[target];
        if (mem && mem.scoutCooldownUntil && mem.scoutCooldownUntil > Game.time) {
          continue; // skip rooms on cooldown
        }
        const last =
          mem && typeof mem.lastScouted === 'number' ? mem.lastScouted : null;
        const stale =
          !mem ||
          last === null ||
          last === 0 ||
          Game.time - last >= SCOUT_REVISIT_TICKS;
        const force = Boolean(Memory.hive.scoutRescanRequested);
        if (
          (stale || force) &&
          !htm.hasTask(htm.LEVELS.COLONY, roomName, 'SCOUT_ROOM', 'hiveGaze')
        ) {
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
          tasksQueued = true;
        }
      }
    }
    if (tasksQueued && Memory.hive.scoutRescanRequested) {
      Memory.hive.scoutRescanRequested = false;
    }
    Memory.hive.expansionVisionLastCheck = Game.time;
  },

  /** Ensure a scout exists when tasks remain unclaimed
   *  @codex-owner hiveGaze
   */
  manageScouts() {
    const scouts = _.filter(Game.creeps, c => c.memory.role === 'scout');
    const tasksByColony = new Map();
    if (Memory.htm && Memory.htm.colonies) {
      for (const col in Memory.htm.colonies) {
        const container = Memory.htm.colonies[col];
        if (!container.tasks) continue;
        for (const t of container.tasks) {
          if (t.name === 'SCOUT_ROOM') {
            if (!tasksByColony.has(col)) tasksByColony.set(col, []);
            tasksByColony.get(col).push(t);
          }
        }
      }
    }
    if (!tasksByColony.size) return;

    for (const [colony] of tasksByColony.entries()) {
      const existing = scouts.filter(
        (c) => c.memory && c.memory.homeRoom === colony,
      );
      const queuedForColony = spawnQueue.queue.some(
        (q) => q.category === 'scout' && q.room === colony,
      );
      if (existing.length > 0 || queuedForColony) continue;

      const room = Game.rooms[colony];
      if (!room) continue;
      const spawn = room.find(FIND_MY_SPAWNS)[0];
      if (!spawn) continue;

      const hasMiner = _.some(
        Game.creeps,
        (c) => c.memory.role === 'miner' && c.room && c.room.name === colony,
      );
      const hasHauler = _.some(
        Game.creeps,
        (c) => c.memory.role === 'hauler' && c.room && c.room.name === colony,
      );
      if (!hasMiner || !hasHauler) continue;

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
        statsConsole.log(`[HiveGaze] Scout queued for ${colony}`, 3);
      }
      break;
    }
  },

  requestScoutRescan() {
    if (!Memory.hive) Memory.hive = {};
    Memory.hive.scoutRescanRequested = true;
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
