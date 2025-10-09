const scheduler = require('./scheduler');
const statsConsole = require('console.console');
const htm = require('./manager.htm');
const spawnQueue = require('./manager.spawnQueue');
const logger = require('./logger');
const hiveRoles = require('./hive.roles');
const _ = require('lodash');

const ENERGY_PER_TICK_THRESHOLD = 1; // Delivery rate below which more haulers are spawned
const DEFAULT_HAULER_RATE = 5; // Fallback energy/tick value when no haulers exist
const HAULER_SPAWN_COOLDOWN = 50; // Minimum ticks between hauler spawn attempts

function countRoomCreeps(roomName) {
  const creeps = Object.values(Game.creeps || {});
  let miners = 0;
  let haulers = 0;
  let others = 0;
  for (const creep of creeps) {
    if (!creep || !creep.memory || !creep.room || creep.room.name !== roomName) continue;
    const role = creep.memory.role;
    if (role === 'miner') miners += 1;
    else if (role === 'hauler') haulers += 1;
    else others += 1;
  }
  return { miners, haulers, others };
}

function computeHaulerCap(roomName) {
  const { miners } = countRoomCreeps(roomName);
  return Math.max(miners, 0);
}

function initMemory() {
  if (!Memory.demand || !Memory.demand.rooms) {
    Memory.demand = {
      rooms: {},
      globalTotals: { demand: 0, supply: 0, demandRate: 0, supplyRate: 0 },
    };
  } else if (!Memory.demand.globalTotals) {
    Memory.demand.globalTotals = { demand: 0, supply: 0, demandRate: 0, supplyRate: 0 };
  }
}

function getRoomMem(roomName) {
  initMemory();
  if (!Memory.demand.rooms[roomName]) {
    Memory.demand.rooms[roomName] = {
      requesters: {},
      deliverers: {},
      totals: { demand: 0, supply: 0, demandRate: 0, supplyRate: 0 },
      runNextTick: false,
    };
  }
  return Memory.demand.rooms[roomName];
}

function updateAverage(oldAvg, count, value) {
  return (oldAvg * (count - 1) + value) / count;
}

const demandModule = {
  /**
   * Record an energy request so totals and averages remain accurate.
   * @param {string} id - Requesting creep or structure id
   * @param {number} amount - Energy requested
   * @param {string} room - Room where the requester resides
   */
  recordRequest(id, amount, room) {
    const roomMem = getRoomMem(room);
    const data = roomMem.requesters[id] || {
      requests: 0,
      lastRequestTick: 0,
      averageRequested: 0,
    };
    data.requests += 1;
    data.lastRequestTick = Game.time;
    data.lastEnergyRequested = amount;
    data.averageRequested = updateAverage(
      data.averageRequested || 0,
      data.requests,
      amount,
    );
    roomMem.requesters[id] = data;
    roomMem.runNextTick = true;
    scheduler.requestTaskUpdate('energyDemand');
  },
  /**
   * Record delivery metrics for a requester and flag evaluation
   * @param {string} id - Target structure id
   * @param {number} ticks - Ticks spent delivering
   * @param {number} amount - Energy delivered
   * @param {string} room - Room where the requester resides
   */
  recordDelivery(id, ticks, amount, room, deliverer = null, role = 'hauler') {
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
    roomMem.totals.supply += amount;

    if (deliverer) {
      const hauler = roomMem.deliverers[deliverer] || {
        role,
        lastTickTime: 0,
        averageTickTime: 0,
        lastEnergy: 0,
        averageEnergy: 0,
        deliveries: 0,
      };
      hauler.role = role;
      hauler.deliveries += 1;
      hauler.lastTickTime = ticks;
      hauler.lastEnergy = amount;
      hauler.averageTickTime = updateAverage(
        hauler.averageTickTime,
        hauler.deliveries,
        ticks,
      );
      hauler.averageEnergy = updateAverage(
        hauler.averageEnergy,
        hauler.deliveries,
        amount,
      );
      roomMem.deliverers[deliverer] = hauler;
    }
    roomMem.runNextTick = true;
    scheduler.requestTaskUpdate('energyDemand');
    logger.log(
      'demandManager',
      `Recorded delivery for ${id}: ${amount} energy in ${ticks} ticks`,
      3,
    );
  },

  /**
   * Record a supply event such as miners depositing energy.
   * Only updates deliverer statistics without touching requester data.
   * @param {string} deliverer - creep name responsible for the supply
   * @param {number} ticks - Ticks spent since last supply
   * @param {number} amount - Energy supplied
   * @param {string} room - Room of the deliverer
   */
  recordSupply(deliverer, ticks, amount, room, role = 'miner') {
    const roomMem = getRoomMem(room);
    const hauler = roomMem.deliverers[deliverer] || {
      role,
      lastTickTime: 0,
      averageTickTime: 0,
      lastEnergy: 0,
      averageEnergy: 0,
      deliveries: 0,
    };
    hauler.role = role;
    hauler.deliveries += 1;
    hauler.lastTickTime = ticks;
    hauler.lastEnergy = amount;
    hauler.averageTickTime = updateAverage(
      hauler.averageTickTime,
      hauler.deliveries,
      ticks,
    );
    hauler.averageEnergy = updateAverage(
      hauler.averageEnergy,
      hauler.deliveries,
      amount,
    );
    roomMem.deliverers[deliverer] = hauler;
    roomMem.totals.supply += amount;
    roomMem.runNextTick = true;
    scheduler.requestTaskUpdate('energyDemand');
  },

  /**
   * Remove stale requester or deliverer entries when a creep dies.
   * @param {string} name - The creep name to purge from memory
   */
  cleanupCreep(name) {
    if (!name) return;
    this.cleanupDeliverer(name);
    this.cleanupRequester(name);
  },

  cleanupRequester(id) {
    if (!id) return;
    initMemory();
    for (const roomName in Memory.demand.rooms) {
      const mem = Memory.demand.rooms[roomName];
      if (mem.requesters && mem.requesters[id]) delete mem.requesters[id];
    }
  },

  cleanupDeliverer(name) {
    if (!name) return;
    initMemory();
    for (const roomName in Memory.demand.rooms) {
      const mem = Memory.demand.rooms[roomName];
      if (mem.deliverers && mem.deliverers[name]) delete mem.deliverers[name];
    }
  },

  /** Check if demand evaluation should run */
  shouldRun() {
    initMemory();
    for (const roomName in Memory.demand.rooms) {
      if (Memory.demand.rooms[roomName].runNextTick) return true;
    }
    // Fallback: ensure baseline haulers exist
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      const haulers = _.filter(
        Game.creeps,
        c => c.memory.role === 'hauler' && c.room.name === roomName,
      ).length;
      if (haulers < 2) return true;
    }
    return false;
  },

  run() {
    initMemory();

    // Remove entries for creeps that no longer exist so rates remain accurate
    for (const roomName in Memory.demand.rooms) {
      const mem = Memory.demand.rooms[roomName];
      for (const name in mem.deliverers) {
        if (!Memory.creeps || !Memory.creeps[name]) delete mem.deliverers[name];
      }
      for (const id in mem.requesters) {
        const obj = typeof Game.getObjectById === 'function'
          ? Game.getObjectById(id)
          : null;
        if ((!Memory.creeps || !Memory.creeps[id]) && !obj) {
          delete mem.requesters[id];
        }
      }
    }

    Memory.demand.globalTotals.demand = 0;
    Memory.demand.globalTotals.supply = 0;
    Memory.demand.globalTotals.demandRate = 0;
    Memory.demand.globalTotals.supplyRate = 0;

    for (const roomName in Memory.demand.rooms) {
      const room = Game.rooms[roomName];
      const roomMem = getRoomMem(roomName);
      if (room && (!room.controller || !room.controller.my)) continue;

      let demandAmount = 0;
      if (Memory.htm && Memory.htm.creeps) {
        for (const id in Memory.htm.creeps) {
          const container = Memory.htm.creeps[id];
          if (!container.tasks) continue;
          for (const task of container.tasks) {
            if (
              task.name === 'deliverEnergy' &&
              task.manager === 'hauler' &&
              task.data &&
              task.data.pos &&
              task.data.pos.roomName === roomName
            ) {
              if (task.data.amount !== undefined) {
                demandAmount += task.data.amount;
              }
            }
          }
        }
      }
      for (const id in roomMem.requesters) {
        const req = roomMem.requesters[id];
        if (req.lastEnergyRequested) demandAmount += req.lastEnergyRequested;
        else if (req.averageRequested) demandAmount += req.averageRequested;
      }
      roomMem.totals.demand = demandAmount;
      Memory.demand.globalTotals.demand += demandAmount;

      const delivererRoles = ['hauler', 'miner'];
      const deliverers = _.filter(
        Game.creeps,
        c => delivererRoles.includes(c.memory.role) && c.room.name === roomName,
      );
      const supply = deliverers.reduce(
        (sum, d) =>
          sum + (d.store && d.store[RESOURCE_ENERGY] ? d.store[RESOURCE_ENERGY] : 0),
        0,
      );
      roomMem.totals.supply = supply;
      Memory.demand.globalTotals.supply += supply;

      let demandRate = 0;
      for (const id in roomMem.requesters) {
        const d = roomMem.requesters[id];
        if (d.averageTickTime > 0) demandRate += d.averageEnergy / d.averageTickTime;
      }
      let supplyRate = 0;
      for (const name in roomMem.deliverers) {
        const d = roomMem.deliverers[name];
        if (d.role === 'hauler' && d.averageTickTime > 0) {
          supplyRate += d.averageEnergy / d.averageTickTime;
        }
      }
      roomMem.totals.demandRate = demandRate;
      roomMem.totals.supplyRate = supplyRate;
      Memory.demand.globalTotals.demandRate += demandRate;
      Memory.demand.globalTotals.supplyRate += supplyRate;
    }

    if (!this.shouldRun()) return;

    const roomsNeedingHaulers = new Set();

    for (const roomName in Memory.demand.rooms) {
      const roomMem = Memory.demand.rooms[roomName];
      const requesters = roomMem.requesters;
      let demandRate = 0;
      for (const id in requesters) {
        const data = requesters[id];
        const tickTime = data.averageTickTime || 0;
        const energy = data.averageEnergy || 0;
        const rate = tickTime > 0 ? energy / tickTime : 0;
        demandRate += rate;
        logger.log(
          'demandManager',
          `Demand ${id}: avg ${energy.toFixed(1)} energy / ${tickTime.toFixed(1)} ticks`,
          2,
        );
        if (rate < ENERGY_PER_TICK_THRESHOLD) {
          roomsNeedingHaulers.add(roomName);
        }
      }
      let supplyRate = 0;
      for (const name in roomMem.deliverers) {
        const data = roomMem.deliverers[name];
        if (data.role === 'hauler' && data.averageTickTime > 0) {
          supplyRate += data.averageEnergy / data.averageTickTime;
        }
      }
      if (demandRate > supplyRate) {
        roomsNeedingHaulers.add(roomName);
      }
      roomMem.runNextTick = false;
    }

    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;

      htm.init();
      const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
      const existing =
        container && container.tasks
          ? container.tasks.find(
              (t) => t.name === 'spawnHauler' && t.manager === 'spawnManager',
            )
          : null;

      const { haulers: haulersAlive, miners: minersAlive } = countRoomCreeps(roomName);
      const queuedHaulers = spawnQueue.queue.filter(
        (q) =>
          q.room === roomName &&
          (q.category === 'hauler' || (q.memory && q.memory.role === 'hauler')),
      ).length;
      const currentAmount =
        haulersAlive + queuedHaulers + (existing ? existing.amount || 0 : 0);

      const roomMem = getRoomMem(roomName);
      const demandRate = roomMem.totals.demandRate;
      const supplyRate = roomMem.totals.supplyRate;
      const perHauler =
        haulersAlive > 0 ? supplyRate / haulersAlive : DEFAULT_HAULER_RATE;
      const demandBasedTarget = Math.ceil(
        demandRate / Math.max(perHauler, ENERGY_PER_TICK_THRESHOLD),
      );
      const dynamicCap = computeHaulerCap(roomName);

      let target = dynamicCap;
      let cap = dynamicCap;

      const manual =
        Memory.rooms &&
        Memory.rooms[roomName] &&
        Memory.rooms[roomName].manualSpawnLimits &&
        Memory.rooms[roomName].manualSpawnLimits.haulers;
      if (manual !== undefined && manual !== 'auto') {
        target = manual;
        cap = manual;
      }

      const demandTarget = Math.max(
        demandBasedTarget,
        roomsNeedingHaulers.has(roomName) ? 1 : 0,
      );
      const isAuto = manual === undefined || manual === 'auto';
      let desiredTotal = target;
      if (isAuto) {
        desiredTotal = Math.max(
          target,
          Math.min(demandTarget, target + 1),
        );
      }

      let toQueue = 0;
      if (roomsNeedingHaulers.has(roomName) || desiredTotal > currentAmount) {
        toQueue = Math.max(0, Math.ceil(desiredTotal - currentAmount));
      }

      if (isAuto && toQueue > 0) {
        target = desiredTotal;
        cap = Math.max(cap, Math.max(desiredTotal, currentAmount + toQueue));
      } else {
        target = Math.max(target, desiredTotal);
      }

      if (!Memory.rooms) Memory.rooms = {};
      if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
      if (!Memory.rooms[roomName].spawnLimits)
        Memory.rooms[roomName].spawnLimits = {};
      Memory.rooms[roomName].spawnLimits.haulers = target;
      Memory.rooms[roomName].spawnLimits.maxHaulers = cap;

      if (cap >= 0) {
        spawnQueue.pruneRole(roomName, 'hauler', cap, {
          liveCount: haulersAlive,
        });
      }

      const needsHaulers =
        roomsNeedingHaulers.has(roomName) || toQueue > 0;

      if (
        toQueue > 0 &&
        (roomMem.lastSpawnTick === undefined ||
          Game.time - roomMem.lastSpawnTick >= HAULER_SPAWN_COOLDOWN)
      ) {
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
        roomMem.lastSpawnTick = Game.time;
        logger.log(
          'demandManager',
          `Energy demand high in ${roomName}: queued ${toQueue} hauler(s)`,
          2,
        );
      }

      hiveRoles.evaluateRoom(room);
    }
  },
};

module.exports = demandModule;
