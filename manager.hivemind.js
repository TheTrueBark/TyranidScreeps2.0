const htm = require('./manager.htm');
const spawnModule = require('./manager.hivemind.spawn');
const scheduler = require('./scheduler');
const memoryManager = require('./manager.memory');
const roomManager = require('./manager.room');
const statsConsole = require('console.console');

const modules = [spawnModule];

const hivemind = {

  /**
   * Evaluate the hive each tick and queue tasks into the HTM.
   * Decisions here remain simple but can be expanded later.
   */
  run() {
    htm.init();
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;

      // Verify essential memory exists, otherwise schedule emergency init
      const missing = [];
      if (!Memory.rooms || !Memory.rooms[roomName]) missing.push('room');
      else if (!Memory.rooms[roomName].miningPositions) missing.push('mining');
      if (!Memory.hive || !Memory.hive.clusters || !Memory.hive.clusters[roomName]) missing.push('hive');
      if (!Memory.spawnQueue) missing.push('spawnQueue');
      if (!Memory.stats) missing.push('stats');

      if (missing.length > 0) {
        statsConsole.log(`HiveMind missing memory for ${roomName}: ${missing.join(', ')}`, 5);
        scheduler.addTask(
          `emergencyInit_${roomName}`,
          0,
          () => {
            const r = Game.rooms[roomName];
            if (r) {
              memoryManager.initializeRoomMemory(r);
              memoryManager.initializeHiveMemory(r.name, r.name);
              roomManager.scanRoom(r);
            }
          },
          { highPriority: true, once: true },
        );
        // Skip normal modules this tick so memory can be prepared
        continue;
      }

      for (const mod of modules) {
        if (!mod.shouldRun || mod.shouldRun(room)) {
          mod.run(room);
        }
      }
    }
  },
};

module.exports = hivemind;
