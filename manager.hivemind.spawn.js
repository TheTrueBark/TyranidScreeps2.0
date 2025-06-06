const htm = require('./manager.htm');
const logger = require('./logger');
const spawnQueue = require('./manager.spawnQueue');
const dna = require('./manager.dna');

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
    const count = spawnQueue.queue.filter((q) => q.room === room.name).length;
    return count === 0;
  },

  /** Analyse room state and queue spawn related tasks in HTM */
  run(room) {
    const roomName = room.name;

    // Defense task on hostiles
    const hostileCount = room.find(FIND_HOSTILE_CREEPS).length;
    if (hostileCount > 0 && !taskExists(roomName, 'defendRoom')) {
      htm.addColonyTask(roomName, 'defendRoom', { count: hostileCount }, 1, 20);
      logger.log('hivemind.spawn', `Queued defendRoom for ${roomName}`, 2);
    }

    // Panic: no creeps present
    const myCreeps = _.filter(Game.creeps, (c) => c.my && c.room.name === roomName);
    if (
      myCreeps.length === 0 &&
      !taskExists(roomName, 'spawnBootstrap', 'spawnManager')
    ) {
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

    // Determine miner demand based on mining positions and energy
    const sources = room.find(FIND_SOURCES);
    let minersNeeded = 0;
    const minerBody = dna.getBodyParts('miner', room);
    const workParts = minerBody.filter((p) => p === WORK).length;
    const harvestPerTick = workParts * HARVEST_POWER;

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
      const live = _.filter(
        Game.creeps,
        (c) => c.memory.role === 'miner' && c.memory.source === source.id,
      ).length;
      const queued = spawnQueue.queue.filter(
        (req) =>
          req.memory.role === 'miner' &&
          req.memory.source === source.id &&
          req.room === roomName,
      ).length;
      minersNeeded += Math.max(0, maxMiners - live - queued);
    }

    const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
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
