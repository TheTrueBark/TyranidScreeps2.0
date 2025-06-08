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
    if (myCreeps.length === 0) {
      // Emergency: purge existing queue and force a bootstrap creep
      const removed = spawnQueue.clearRoom(roomName);
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
    }

    // Initial spawn sequence at RCL1
  const initialOrder = [
    { task: 'spawnBootstrap', data: { role: 'allPurpose' }, priority: 0 },
    { task: 'spawnMiner', data: { role: 'miner' }, priority: 1 },
    { task: 'spawnMiner', data: { role: 'miner' }, priority: 1 },
    { task: 'spawnHauler', data: { role: 'hauler' }, priority: 2 },
    { task: 'spawnHauler', data: { role: 'hauler' }, priority: 2 },
    { task: 'spawnUpgrader', data: { role: 'upgrader' }, priority: 3 },
  ];

  const initialRoles = [
    'allPurpose',
    'miner',
    'miner',
    'hauler',
    'hauler',
    'upgrader',
  ];

  const queuedInitial = spawnQueue.queue.filter(
    (q) => q.room === roomName && initialRoles.includes(q.memory.role),
  ).length;
  const tasksInitial =
    container && container.tasks
      ? container.tasks
          .filter(
            (t) =>
              t.manager === 'spawnManager' &&
              initialOrder.some((o) => o.task === t.name),
          )
          .reduce((sum, t) => sum + (t.amount || 1), 0)
      : 0;

    const aliveInitial = myCreeps.filter((c) => initialRoles.includes(c.memory.role)).length;
    const totalPlanned = aliveInitial + queuedInitial + tasksInitial;

    if (room.controller.level === 1 && totalPlanned < initialOrder.length) {
      const nextEntry = initialOrder[totalPlanned];
      const existing =
        container && container.tasks
          ? container.tasks.find(
              t => t.name === nextEntry.task && t.manager === 'spawnManager',
            )
          : null;
      if (existing) {
        existing.amount += 1;
        logger.log(
          'hivemind.spawn',
          `Increased initial ${nextEntry.data.role} amount for ${roomName}`,
          2,
        );
      } else {
        htm.addColonyTask(
          roomName,
          nextEntry.task,
          nextEntry.data,
          nextEntry.priority,
          20,
          1,
          'spawnManager',
        );
        logger.log(
          'hivemind.spawn',
          `Queued initial ${nextEntry.data.role} for ${roomName}`,
          2,
        );
      }
      // Do not queue other roles until initial order is complete
      return;
    }

    // Determine miner demand based on mining positions and energy
    const sources = room.find(FIND_SOURCES);
    let minersNeeded = 0;
    const minerBody = dna.getBodyParts('miner', room);
    const workParts = minerBody.filter((p) => p === WORK).length;
    const harvestPerTick = workParts * HARVEST_POWER;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const spawnTime = minerBody.length * CREEP_SPAWN_TIME;

    for (const source of sources) {
      let positions = null;
      if (
        Memory.rooms[roomName] &&
        Memory.rooms[roomName].miningPositions &&
        Memory.rooms[roomName].miningPositions[source.id]
      ) {
        positions = Memory.rooms[roomName].miningPositions[source.id].positions;
      }
      if (!positions) continue;
      const maxMiners = Math.min(
        Object.keys(positions).length,
        Math.ceil(10 / harvestPerTick),
      );
      const travel = spawn ? spawn.pos.getRangeTo(source.pos) : 0;
      const replaceThreshold = spawnTime + travel;
      const miners = _.filter(
        Game.creeps,
        (c) => c.memory.role === 'miner' && c.memory.source === source.id,
      );
      let live = 0;
      for (const miner of miners) {
        if (miner.ticksToLive && miner.ticksToLive <= replaceThreshold) {
          // Free the position in memory so a replacement can claim it
          memoryManager.freeMiningPosition(miner.memory.miningPosition);
        } else {
          live++;
        }
      }
      const queued = spawnQueue.queue.filter(
        (req) =>
          req.memory.role === 'miner' &&
          req.memory.source === source.id &&
          req.room === roomName,
      ).length;
      minersNeeded += Math.max(0, maxMiners - live - queued);
    }

    const existing = container && container.tasks
      ? container.tasks.find(
        (t) => t.name === 'spawnMiner' && t.manager === 'spawnManager',
      )
      : null;
    if (minersNeeded > 0) {
      if (existing) {
        if (existing.amount < minersNeeded) {
          existing.amount = minersNeeded;
          logger.log('hivemind.spawn', `Updated miner task amount to ${minersNeeded} for ${roomName}`, 2);
        }
      } else {
        // Priority 1 so the first replacement after a bootstrap is always a miner
        htm.addColonyTask(
          roomName,
          'spawnMiner',
          { role: 'miner' },
          1,
          30,
          minersNeeded,
          'spawnManager',
        );
        logger.log('hivemind.spawn', `Queued ${minersNeeded} miner spawn(s) for ${roomName}`, 2);
      }
    }
    const liveHaulers = _.filter(
      Game.creeps,
      c => c.memory.role === 'hauler' && c.room.name === roomName,
    ).length;
    const queuedHaulers = spawnQueue.queue.filter(
      req => req.memory.role === 'hauler' && req.room === roomName,
    ).length;

    const nonHaulerLive = myCreeps.filter(c => c.memory.role !== 'hauler').length;
    const nonHaulerQueued = spawnQueue.queue.filter(
      req => req.room === roomName && req.memory.role !== 'hauler',
    ).length;
    const nonHaulerTasks = container && container.tasks
      ? container.tasks
          .filter(t => t.manager === 'spawnManager' && t.name !== 'spawnHauler')
          .reduce((sum, t) => sum + (t.amount || 1), 0)
      : 0;
    const totalNonHaulers = nonHaulerLive + nonHaulerQueued + nonHaulerTasks;

    let desiredHaulers;
    if (room.controller.level < 3) {
      desiredHaulers = totalNonHaulers; // initial 1:1 ratio
    } else {
      desiredHaulers = Math.ceil(totalNonHaulers / 2); // late 1:2 ratio
    }

    const currentHaulers = liveHaulers + queuedHaulers;
    const haulerTask = container && container.tasks
      ? container.tasks.find(t => t.name === 'spawnHauler' && t.manager === 'spawnManager')
      : null;
    const taskAmount = haulerTask ? haulerTask.amount || 0 : 0;
    const haulersNeeded = Math.max(0, desiredHaulers - currentHaulers - taskAmount);

    if (haulersNeeded > 0) {
      if (haulerTask) {
        haulerTask.amount += haulersNeeded;
      } else {
        htm.addColonyTask(
          roomName,
          'spawnHauler',
          { role: 'hauler' },
          2,
          20,
          haulersNeeded,
          'spawnManager',
        );
      }
      logger.log(
        'hivemind.spawn',
        `Queued ${haulersNeeded} hauler spawn(s) for ${roomName}`,
        2,
      );
    }

    const liveUpgraders = _.filter(Game.creeps, c => c.memory.role === 'upgrader' && c.room.name === roomName).length;
    const queuedUpgraders = spawnQueue.queue.filter(req => req.memory.role === 'upgrader' && req.room === roomName).length;
    const desiredUpgraders = Math.min(
      8,
      Math.max(1, Math.ceil(room.controller.level / 2)),
    );
    const upgradersNeeded = Math.max(0, desiredUpgraders - liveUpgraders - queuedUpgraders);
    const upgraderTask = container && container.tasks ? container.tasks.find(t => t.name === 'spawnUpgrader' && t.manager === 'spawnManager') : null;
    if (upgradersNeeded > 0) {
      if (upgraderTask) {
        upgraderTask.amount = upgradersNeeded;
      } else {
        // Upgraders are lower priority than miners and haulers during bootstrap
        htm.addColonyTask(roomName, 'spawnUpgrader', { role: 'upgrader' }, 3, 20, upgradersNeeded, 'spawnManager');
        logger.log('hivemind.spawn', `Queued ${upgradersNeeded} upgrader spawn(s) for ${roomName}`, 2);
      }
    }

    const liveBuilders = _.filter(
      Game.creeps,
      c => c.memory.role === 'builder' && c.room.name === roomName,
    ).length;
    const queuedBuilders = spawnQueue.queue.filter(
      req => req.memory.role === 'builder' && req.room === roomName,
    ).length;
    const buildQueue = room.memory.buildingQueue || [];

    const builderCap = Math.min(12, buildQueue.length * 4);
    let desiredBuilders = Math.max(1, builderCap);
    const builderTask = container && container.tasks
      ? container.tasks.find(
          t => t.name === 'spawnBuilder' && t.manager === 'spawnManager',
        )
      : null;
    const taskAmountBuilder = builderTask ? builderTask.amount || 0 : 0;
    const buildersNeeded = Math.max(
      0,
      desiredBuilders - liveBuilders - queuedBuilders - taskAmountBuilder,
    );
    if (buildersNeeded > 0) {
      if (builderTask) {
        builderTask.amount = buildersNeeded;
      } else {
        htm.addColonyTask(
          roomName,
          'spawnBuilder',
          { role: 'builder' },
          4,
          20,
          buildersNeeded,
          'spawnManager',
        );
        logger.log(
          'hivemind.spawn',
          `Queued ${buildersNeeded} builder spawn(s) for ${roomName}`,
          2,
        );
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
