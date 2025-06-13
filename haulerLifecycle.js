/** @codex-owner lifecyclePredictor */
const spawnQueue = require('./manager.spawnQueue');
const spawnManager = require('./manager.spawn');
const _ = require('lodash');

const BUFFER_TICKS = 12;

function recordSpawnTiming(creep) {
  if (
    creep.memory.spawnedBy === 'lifecyclePredictor' &&
    creep.memory.originDeathTick &&
    !creep.memory.spawnTimingEvaluated
  ) {
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.haulerSpawnTiming) {
      Memory.stats.haulerSpawnTiming = {
        late: 0,
        early: 0,
        perfect: 0,
        history: [],
      };
    }
    const stats = Memory.stats.haulerSpawnTiming;
    const delta = creep.memory.originDeathTick - Game.time;
    if (delta < -BUFFER_TICKS) stats.late++;
    else if (delta > BUFFER_TICKS) stats.early++;
    else stats.perfect++;
    stats.history.push(delta);
    if (stats.history.length > 10) stats.history.shift();
    creep.memory.spawnTimingEvaluated = true;
  }
}

const lifecycle = {
  /**
   * Evaluate haulers in a room and queue replacements when TTL is low.
   * @param {Room} room Owned room to monitor.
   */
  runRoom(room) {
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return;
    const spawn = spawns[0];

    const haulers = _.filter(
      Game.creeps,
      (c) => c.memory.role === 'hauler' && c.room.name === room.name,
    );
    for (const hauler of haulers) {
      recordSpawnTiming(hauler);
      if (!hauler.ticksToLive || !hauler.memory.assignment) continue;
      const routeId = hauler.memory.assignment.routeId;
      const routeMem = _.get(Memory, ['demand', 'routes', routeId]);
      if (!routeMem || routeMem.avgRoundTrip === undefined) continue;
      const demandAmount = _.get(routeMem, ['totals', 'demand'], 0);
      if (demandAmount <= 0) continue;
      const avgRoundTrip = routeMem.avgRoundTrip || 0;
      const spawnTime = hauler.body.length * CREEP_SPAWN_TIME;
      const leadTime = spawnTime + avgRoundTrip + BUFFER_TICKS;

      if (hauler.ticksToLive > leadTime) continue;

      const queued = spawnQueue.queue.some(
        (q) => q.category === 'hauler' && q.assignment && q.assignment.routeId === routeId,
      );
      if (queued) continue;

      const other = _.find(
        Game.creeps,
        (c) =>
          c.name !== hauler.name &&
          c.memory.role === 'hauler' &&
          c.memory.assignment &&
          c.memory.assignment.routeId === routeId,
      );
      if (other) continue;

      const memoryClone = JSON.parse(JSON.stringify(hauler.memory));
      memoryClone.spawnedBy = 'lifecyclePredictor';
      memoryClone.originCreep = hauler.name;
      memoryClone.originDeathTick = Game.time + hauler.ticksToLive;

      spawnQueue.addToQueue(
        'hauler',
        room.name,
        hauler.body.map((p) => (p.type ? p.type : p)),
        memoryClone,
        spawn.id,
        0,
        spawnManager.PRIORITY_HIGH,
      );
      const entry = spawnQueue.queue[spawnQueue.queue.length - 1];
      entry.origin = 'lifecyclePredictor';
      entry.assignment = memoryClone.assignment;
    }
  },

  /**
   * Iterate all owned rooms and process hauler lifecycle prediction.
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
