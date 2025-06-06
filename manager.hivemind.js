const htm = require('./manager.htm');
const logger = require('./logger');

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

      // Request miners equal to the number of sources
      const sources = room.find(FIND_SOURCES);
      const miners = _.filter(
        Game.creeps,
        (c) => c.memory.role === 'miner' && c.room.name === roomName,
      ).length;
      const minersNeeded = sources.length - miners;
      if (
        minersNeeded > 0 &&
        !this._taskExists(htm.LEVELS.COLONY, roomName, 'spawnMiner', 'spawnManager')
      ) {
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
