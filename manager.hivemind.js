const htm = require('./manager.htm');
const logger = require('./logger');
const spawnQueue = require('./manager.spawnQueue');
const dna = require('./manager.dna');

const hivemind = {
  /**
   * Check if a task already exists in the specified HTM container.
   * @param {string} level - HTM level to search.
   * @param {string} id - Identifier for the container.
   * @param {string} name - Task name.
   * @returns {boolean} True if the task is present.
   */
  _taskExists(level, id, name, manager = null) {
    const container = htm._getContainer(level, id);
    if (!container || !container.tasks) return false;
    return container.tasks.some(
      (t) => t.name === name && (!manager || t.manager === manager),
    );
  },

  /**
   * Evaluate the hive each tick and queue tasks into the HTM.
   * Decisions here remain simple but can be expanded later.
   */
  run() {
    htm.init();
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;

      // Request defense if hostiles are detected
      const hostileCount = room.find(FIND_HOSTILE_CREEPS).length;
      if (
        hostileCount > 0 &&
        !this._taskExists(htm.LEVELS.COLONY, roomName, 'defendRoom')
      ) {
        htm.addColonyTask(
          roomName,
          'defendRoom',
          { count: hostileCount },
          1,
          20,
        );
        logger.log('hivemind', `Queued defendRoom for ${roomName}`, 2);
      }

      // Panic evaluation: if no creeps remain, request a bootstrap worker
      const myCreeps = _.filter(Game.creeps, (c) => c.my && c.room.name === roomName);
      if (
        myCreeps.length === 0 &&
        !this._taskExists(htm.LEVELS.COLONY, roomName, 'spawnBootstrap', 'spawnManager')
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
        logger.log('hivemind', `Queued bootstrap spawn for ${roomName}`, 2);
      }

      // Request miners based on available energy and mining spots
      const sources = room.find(FIND_SOURCES);
      let minersNeeded = 0;
      const minerBody = dna.getBodyParts('miner', room);
      const workParts = minerBody.filter((p) => p === WORK).length;
      const harvestPerTick = workParts * HARVEST_POWER;

      for (const source of sources) {
        const positions =
          Memory.rooms[roomName]?.miningPositions?.[source.id]?.positions;
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

      const existing = htm._getContainer(htm.LEVELS.COLONY, roomName)?.tasks.find(
        (t) => t.name === 'spawnMiner' && t.manager === 'spawnManager',
      );
      if (minersNeeded > 0) {
        if (existing) {
          if (existing.amount < minersNeeded) {
            existing.amount = minersNeeded;
            logger.log('hivemind', `Updated miner task amount to ${minersNeeded} for ${roomName}`, 2);
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
          logger.log('hivemind', `Queued ${minersNeeded} miner spawn(s) for ${roomName}`, 2);
        }
      }

      // Encourage upgrading when energy is abundant
      if (
        room.energyAvailable > room.energyCapacityAvailable * 0.8 &&
        !this._taskExists(htm.LEVELS.COLONY, roomName, 'upgradeController')
      ) {
        htm.addColonyTask(roomName, 'upgradeController', {}, 3, 50);
        logger.log('hivemind', `Queued upgradeController for ${roomName}`, 2);
      }
    }
  },
};

module.exports = hivemind;
