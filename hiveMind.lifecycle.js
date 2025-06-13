/** @codex-owner lifecyclePredictor */
const spawnQueue = require('./manager.spawnQueue');
const spawnManager = require('./manager.spawn');
const _ = require('lodash');

const BUFFER_TICKS = 10;

const lifecycle = {
  /**
   * Evaluate miner TTLs within a room and queue replacements when necessary.
   * @param {Room} room Owned room to monitor.
   */
  runRoom(room) {
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return;
    const spawn = spawns[0];

    const miners = _.filter(
      Game.creeps,
      (c) => c.memory.role === 'miner' && c.room.name === room.name,
    );
    for (const miner of miners) {
      if (!miner.ticksToLive || !miner.memory.miningPosition) continue;
      const sourceId = miner.memory.sourceId || miner.memory.source;
      const moveTime = _.get(
        Memory,
        ['rooms', room.name, 'miningPositions', sourceId, 'distanceFromSpawn'],
        miner.memory.distanceToSpawn || 0,
      );
      const spawnTime = miner.body.length * CREEP_SPAWN_TIME;
      const leadTime = spawnTime + moveTime + BUFFER_TICKS;

      if (miner.ticksToLive > leadTime) continue;

      const pos = miner.memory.miningPosition;
      if (!pos || pos.x === undefined || pos.y === undefined || !pos.roomName)
        continue;

      const queued = spawnQueue.queue.some(
        (q) =>
          q.category === 'miner' &&
          ((q.assignment &&
            q.assignment.pos &&
            q.assignment.pos.x === pos.x &&
            q.assignment.pos.y === pos.y &&
            q.assignment.pos.roomName === pos.roomName) ||
            (q.memory &&
              q.memory.miningPosition &&
              q.memory.miningPosition.x === pos.x &&
              q.memory.miningPosition.y === pos.y &&
              q.memory.miningPosition.roomName === pos.roomName)),
      );
      if (queued) continue;

      const other = _.find(
        Game.creeps,
        (c) =>
          c.name !== miner.name &&
          c.memory.role === 'miner' &&
          c.memory.miningPosition &&
          c.memory.miningPosition.x === pos.x &&
          c.memory.miningPosition.y === pos.y &&
          c.memory.miningPosition.roomName === pos.roomName &&
          c.ticksToLive &&
          c.ticksToLive > leadTime,
      );
      if (other) continue;

      const memoryClone = JSON.parse(JSON.stringify(miner.memory));
      memoryClone.spawnedBy = 'lifecyclePredictor';
      memoryClone.originCreep = miner.name;

      spawnQueue.addToQueue(
        'miner',
        room.name,
        miner.body.map((p) => (p.type ? p.type : p)),
        memoryClone,
        spawn.id,
        0,
        spawnManager.PRIORITY_HIGH,
      );
      const entry = spawnQueue.queue[spawnQueue.queue.length - 1];
      entry.origin = 'lifecyclePredictor';
      entry.assignment = { sourceId, pos };

      if (!Memory.stats) Memory.stats = {};
      if (!Memory.stats.lifecyclePrediction)
        Memory.stats.lifecyclePrediction = {};
      if (!Memory.stats.lifecyclePrediction.miner) {
        Memory.stats.lifecyclePrediction.miner = {
          replacedOnTime: 0,
          replacedLate: 0,
          energyMissedEstimate: 0,
        };
      }
      const stats = Memory.stats.lifecyclePrediction.miner;
      if (miner.ticksToLive <= moveTime + BUFFER_TICKS) stats.replacedLate++;
      else stats.replacedOnTime++;
    }
  },

  /**
   * Iterate all owned rooms and process miner lifecycle prediction.
   */
  run() {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (room.controller && room.controller.my) {
        this.runRoom(room);
      }
    }
  },
};

module.exports = lifecycle;
