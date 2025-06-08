const scheduler = require('./scheduler');
const statsConsole = require('console.console');
const htm = require('./manager.htm');

const ENERGY_PER_TICK_THRESHOLD = 1; // Delivery rate below which more haulers are spawned

function initMemory() {
  if (!Memory.demand) Memory.demand = { requesters: {}, runNextTick: false };
  if (!Memory.demand.requesters) Memory.demand.requesters = {};
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
    initMemory();
    const data = Memory.demand.requesters[id] || {
      lastTickTime: 0,
      averageTickTime: 0,
      lastEnergy: 0,
      averageEnergy: 0,
      deliveries: 0,
      room,
    };
    data.room = room;
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
    Memory.demand.requesters[id] = data;
    Memory.demand.runNextTick = true;
    scheduler.requestTaskUpdate('energyDemand');
    statsConsole.log(`Recorded delivery for ${id}: ${amount} energy in ${ticks} ticks`, 3);
  },

  /** Check flag and evaluate demand once */
  shouldRun() {
    initMemory();
    return Memory.demand.runNextTick;
  },

  run() {
    if (!this.shouldRun()) return;
    const requesters = Memory.demand.requesters;
    const roomsNeedingHaulers = new Set();
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
      if (rate < ENERGY_PER_TICK_THRESHOLD && data.room) {
        roomsNeedingHaulers.add(data.room);
      }
    }

    for (const roomName of roomsNeedingHaulers) {
      htm.init();
      if (
        !htm.hasTask(htm.LEVELS.COLONY, roomName, 'spawnHauler', 'spawnManager')
      ) {
        htm.addColonyTask(
          roomName,
          'spawnHauler',
          { role: 'hauler' },
          2,
          20,
          1,
          'spawnManager',
        );
        statsConsole.log(
          `Energy demand high in ${roomName}: queued extra hauler`,
          2,
        );
      }
    }

    Memory.demand.runNextTick = false;
  },
};

module.exports = demandModule;
