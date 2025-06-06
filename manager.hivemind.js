const htm = require('./manager.htm');
const spawnModule = require('./manager.hivemind.spawn');

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

      for (const mod of modules) {
        if (!mod.shouldRun || mod.shouldRun(room)) {
          mod.run(room);
        }
      }
    }
  },
};

module.exports = hivemind;
