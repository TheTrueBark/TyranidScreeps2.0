const scheduler = require('./scheduler');
const statsConsole = require('console.console');
const htm = require('./manager.htm');
const spawnQueue = require('./manager.spawnQueue');
const _ = require('lodash');

const ENERGY_PER_TICK_THRESHOLD = 1; // Delivery rate below which more haulers are spawned

function initMemory() {
  if (!Memory.demand) Memory.demand = { rooms: {} };
}

function getRoomMem(roomName) {
  initMemory();
  if (!Memory.demand.rooms[roomName]) {
    Memory.demand.rooms[roomName] = { requesters: {}, runNextTick: false };
  }
  return Memory.demand.rooms[roomName];
}

function updateAverage(oldAvg, count, value) {
  return (oldAvg * (count - 1) + value) / count;
}

const demandModule = {
  /**
   * Record delivery metrics for a requester and flag evaluation
   * @param {string} id - Target structure id
   * @param {number} ticks - Ticks spent delivering
   * @param {number} amount - Energy delivered
   * @param {string} room - Room where the requester resides
   */
  recordDelivery(id, ticks, amount, room) {
    const roomMem = getRoomMem(room);
    const data = roomMem.requesters[id] || {
      lastTickTime: 0,
      averageTickTime: 0,
      lastEnergy: 0,
      averageEnergy: 0,
      deliveries: 0,
    };
    data.deliveries += 1;
    data.lastTickTime = ticks;
    data.lastEnergy = amount;
    data.averageTickTime = updateAverage(
      data.averageTickTime,
      data.deliveries,
      ticks,
    );
    data.averageEnergy = updateAverage(
      data.averageEnergy,
      data.deliveries,
      amount,
    );
    roomMem.requesters[id] = data;
    roomMem.runNextTick = true;
    scheduler.requestTaskUpdate('energyDemand');
    statsConsole.log(`Recorded delivery for ${id}: ${amount} energy in ${ticks} ticks`, 3);
  },

  /** Check if demand evaluation should run */
  shouldRun() {
    initMemory();
    for (const roomName in Memory.demand.rooms) {
      if (Memory.demand.rooms[roomName].runNextTick) return true;
    }
    // Fallback: no haulers but miners present
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      const miners = _.filter(
        Game.creeps,
        c => c.memory.role === 'miner' && c.room.name === roomName,
      ).length;
      const haulers = _.filter(
        Game.creeps,
        c => c.memory.role === 'hauler' && c.room.name === roomName,
      ).length;
      if (miners > 0 && haulers === 0) return true;
    }
    return false;
  },

  run() {
    if (!this.shouldRun()) return;

    const roomsNeedingHaulers = new Set();

    for (const roomName in Memory.demand.rooms) {
      const roomMem = Memory.demand.rooms[roomName];
      const requesters = roomMem.requesters;
      for (const id in requesters) {
        const data = requesters[id];
        const rate =
          data.averageTickTime > 0
            ? data.averageEnergy / data.averageTickTime
            : 0;
        statsConsole.log(
          `Demand ${id}: avg ${data.averageEnergy.toFixed(1)} energy / ${data.averageTickTime.toFixed(1)} ticks`,
          2,
        );
        if (rate < ENERGY_PER_TICK_THRESHOLD) {
          roomsNeedingHaulers.add(roomName);
        }
      }
      roomMem.runNextTick = false;
    }

    // Evaluate rooms without delivery data but with miners present
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      const minersAlive = _.filter(
        Game.creeps,
        c => c.memory.role === 'miner' && c.room.name === roomName,
      ).length;
      const queuedMiners = spawnQueue.queue.filter(
        q => q.room === roomName && q.memory.role === 'miner',
      ).length;
      const haulersAlive = _.filter(
        Game.creeps,
        c => c.memory.role === 'hauler' && c.room.name === roomName,
      ).length;
      const queuedHaulers = spawnQueue.queue.filter(
        q => q.room === roomName && q.memory.role === 'hauler',
      ).length;
      const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
      const task = container && container.tasks
        ? container.tasks.find(t => t.name === 'spawnHauler' && t.manager === 'spawnManager')
        : null;
      const totalMiners = minersAlive + queuedMiners;
      const totalHaulers = haulersAlive + queuedHaulers + (task ? task.amount || 0 : 0);
      if (totalMiners >= 2 && totalHaulers < 2) {
        roomsNeedingHaulers.add(roomName);
      } else if (totalMiners > 0 && totalHaulers === 0) {
        roomsNeedingHaulers.add(roomName);
      }
    }

    for (const roomName of roomsNeedingHaulers) {
      htm.init();
      const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
      const existing = container.tasks.find(
        t => t.name === 'spawnHauler' && t.manager === 'spawnManager',
      );
      const haulersAlive = _.filter(
        Game.creeps,
        c => c.memory.role === 'hauler' && c.room.name === roomName,
      ).length;
      const queuedHaulers = spawnQueue.queue.filter(
        q => q.room === roomName && q.memory.role === 'hauler',
      ).length;
      const currentAmount =
        haulersAlive + queuedHaulers + (existing ? existing.amount || 0 : 0);
      let required = 1;
      const minersAlive = _.filter(
        Game.creeps,
        c => c.memory.role === 'miner' && c.room.name === roomName,
      ).length;
      const queuedMiners = spawnQueue.queue.filter(
        q => q.room === roomName && q.memory.role === 'miner',
      ).length;
      if (minersAlive + queuedMiners >= 2) required = 2;
      const toQueue = Math.max(0, required - currentAmount);
      if (toQueue > 0) {
        if (existing) existing.amount += toQueue;
        else
          htm.addColonyTask(
            roomName,
            'spawnHauler',
            { role: 'hauler' },
            2,
            20,
            toQueue,
            'spawnManager',
          );
        statsConsole.log(`Energy demand high in ${roomName}: queued hauler`, 2);
      }
      const room = Game.rooms[roomName];
      if (room) {
        const roles = require('./hive.roles');
        roles.evaluateRoom(room);
      }
    }
  },
};

module.exports = demandModule;
