const htm = require('./manager.htm');
const logger = require('./logger');
const spawnQueue = require('./manager.spawnQueue');
const dna = require('./manager.dna');
const memoryManager = require('./manager.memory');

const taskExists = (roomName, name, manager = null) => {
  const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
  if (!container || !container.tasks) return false;
  return container.tasks.some(
    (t) => t.name === name && (!manager || t.manager === manager),
  );
};

const spawnModule = {
  /** Check if this module should run this tick for the given room */
  shouldRun(room) {
    // Always evaluate spawn state each tick to maintain the correct
    // initial sequence and adapt quickly to changes. The previous
    // behaviour skipped analysis while the queue had entries which
    // delayed follow-up spawns.
    return true;
  },

  /** Analyse room state and queue spawn related tasks in HTM */
  run(room) {
    const roomName = room.name;
    if (!room.memory.lastRCL) room.memory.lastRCL = room.controller.level;
    if (room.memory.lastRCL !== room.controller.level) {
      room.memory.lastRCL = room.controller.level;
      const scheduler = require('./scheduler');
      scheduler.triggerEvent('roleUpdate', { room: roomName });
    }

    const spawnStruct = room.find(FIND_MY_SPAWNS)[0];
    if (spawnStruct) {
      const area = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = spawnStruct.pos.x + dx;
          const y = spawnStruct.pos.y + dy;
          if (x < 0 || x > 49 || y < 0 || y > 49) continue;
          area.push({ x, y });
        }
      }

      const mining =
        Memory.rooms &&
        Memory.rooms[roomName] &&
        Memory.rooms[roomName].miningPositions
          ? Memory.rooms[roomName].miningPositions
          : null;
      if (mining) {
        for (const id in mining) {
          const posObj = mining[id].positions || {};
          for (const key in posObj) {
            const p = posObj[key];
            if (p && p.x !== undefined && p.y !== undefined) {
              area.push({ x: p.x, y: p.y });
            }
          }
        }
      }

      if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
      Memory.rooms[roomName].restrictedArea = area;
    }

    // Defense task on hostiles
    const hostileCount = room.find(FIND_HOSTILE_CREEPS).length;
    if (hostileCount > 0 && !taskExists(roomName, 'defendRoom')) {
      htm.addColonyTask(roomName, 'defendRoom', { count: hostileCount }, 1, 20);
      logger.log('hivemind.spawn', `Queued defendRoom for ${roomName}`, 2);
    }

    // Panic: no creeps present
    const myCreeps = _.filter(Game.creeps, (c) => c.my && c.room.name === roomName);
    const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
    const spawning = room
      .find(FIND_MY_SPAWNS)
      .some((s) => s.memory && s.memory.currentSpawnRole);
    if (myCreeps.length === 0 && !spawning) {
      // Emergency: purge existing queue and force a bootstrap creep
      const removed = spawnQueue.clearRoom(roomName);
      if (container && container.tasks) {
        _.remove(container.tasks, t => t.manager === 'spawnManager');
      }
      if (!taskExists(roomName, 'spawnBootstrap', 'spawnManager')) {
        htm.addColonyTask(
          roomName,
          'spawnBootstrap',
          { role: 'allPurpose', panic: true },
          0,
          20,
          1,
          'spawnManager',
        );
        logger.log('hivemind.spawn', `Queued bootstrap spawn for ${roomName}`, 2);
      }
      if (removed > 0) {
        logger.log('hivemind.spawn', `Cleared ${removed} queued spawns due to panic in ${roomName}` , 3);
      }
      return;
    }

  // Initial spawn sequence at RCL1 using strict role counts
  const initialSteps = [
    { task: 'spawnBootstrap', role: 'allPurpose', priority: 0, count: 1 },
    { task: 'spawnMiner', role: 'miner', priority: 1, count: 1 },
    { task: 'spawnMiner', role: 'miner', priority: 1, count: 2 },
    { task: 'spawnHauler', role: 'hauler', priority: 2, count: 1 },
    { task: 'spawnHauler', role: 'hauler', priority: 2, count: 2 },
    { task: 'spawnUpgrader', role: 'upgrader', priority: 3, count: 1 },
  ];

  if (room.controller.level === 1) {
    for (const step of initialSteps) {
      const alive = myCreeps.filter(c => c.memory.role === step.role).length;
      const spawningCount = room
        .find(FIND_MY_SPAWNS)
        .filter(s => s.memory && s.memory.currentSpawnRole === step.role).length;
      const queued = spawnQueue.queue.filter(
        q => q.room === roomName && q.memory.role === step.role,
      ).length;
      const task =
        container && container.tasks
          ? container.tasks.find(
              t => t.name === step.task && t.manager === 'spawnManager',
            )
          : null;
      const taskAmount = task ? task.amount || 0 : 0;
      const total = alive + spawningCount + queued + taskAmount;
      if (total < step.count) {
        if (task) task.amount += 1;
        else
          htm.addColonyTask(
            roomName,
            step.task,
            { role: step.role },
            step.priority,
            20,
            1,
            'spawnManager',
          );
        logger.log(
          'hivemind.spawn',
          `Queued initial ${step.role} for ${roomName}`,
          2,
        );
        return; // queue one step per tick
      }
    }
  }

    // Delegate role evaluation to hive.roles module
    const roles = require('./hive.roles');
    roles.evaluateRoom(room);

    // Fallback: ensure at least two haulers exist before spawning extras
    const haulerTask =
      container && container.tasks
        ? container.tasks.find(
            t => t.name === 'spawnHauler' && t.manager === 'spawnManager',
          )
        : null;
    const haulersAlive = _.filter(
      Game.creeps,
      c => c.memory.role === 'hauler' && c.room.name === roomName,
    ).length;
    const queuedHaulers = spawnQueue.queue.filter(
      q => q.room === roomName && q.memory.role === 'hauler',
    ).length;
    const totalHaulers =
      haulersAlive + queuedHaulers + (haulerTask ? haulerTask.amount || 0 : 0);

    if (totalHaulers < 2) {
      const minerTask =
        container && container.tasks
          ? container.tasks.find(
              t => t.name === 'spawnMiner' && t.manager === 'spawnManager',
            )
          : null;
      const minersAlive = _.filter(
        Game.creeps,
        c => c.memory.role === 'miner' && c.room.name === roomName,
      ).length;
      const queuedMiners = spawnQueue.queue.filter(
        q => q.room === roomName && q.memory.role === 'miner',
      ).length;
      const totalMiners =
        minersAlive + queuedMiners + (minerTask ? minerTask.amount || 0 : 0);

      if (totalMiners === 0) {
        if (!taskExists(roomName, 'spawnBootstrap', 'spawnManager')) {
          htm.addColonyTask(
            roomName,
            'spawnBootstrap',
            { role: 'allPurpose' },
            0,
            20,
            1,
            'spawnManager',
          );
        }
      }

      const missing = 2 - totalHaulers;
      if (missing > 0) {
        if (haulerTask) haulerTask.amount += missing;
        else
          htm.addColonyTask(
            roomName,
            'spawnHauler',
            { role: 'hauler' },
            1,
            20,
            missing,
            'spawnManager',
          );
      }

      if (
        haulersAlive === 0 &&
        room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY }).length > 0
      ) {
        const spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length > 0) {
          const spawnManager = require('./manager.spawn');
          spawnManager.spawnEmergencyCollector(spawns[0], room);
        }
      }
    }


    // Encourage upgrades when energy is abundant
    if (
      room.energyAvailable > room.energyCapacityAvailable * 0.8 &&
      !taskExists(roomName, 'upgradeController')
    ) {
      htm.addColonyTask(roomName, 'upgradeController', {}, 3, 50);
      logger.log('hivemind.spawn', `Queued upgradeController for ${roomName}`, 2);
    }
  },
};

module.exports = spawnModule;
