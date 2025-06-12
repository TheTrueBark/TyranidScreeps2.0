const roleRemoteMiner = {
  run(creep) {
    const roomName = creep.memory.targetRoom;
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.remoteRooms) Memory.stats.remoteRooms = {};
    if (!Memory.stats.remoteRooms[roomName]) {
      Memory.stats.remoteRooms[roomName] = {
        minerSpawns: 0,
        minerDeaths: 0,
        minerFails: 0,
        reservistSpawns: 0,
        reservistSuccesses: 0,
        reservistFails: 0,
      };
    }
    const stats = Memory.stats.remoteRooms[roomName];
    if (!creep.memory.countedSpawn) {
      stats.minerSpawns++;
      creep.memory.countedSpawn = true;
    }
    if (!creep.memory.assignedPos) {
      stats.minerFails++;
      stats.minerDeaths++;
      creep.suicide();
      return;
    }
    const pos = new RoomPosition(
      creep.memory.assignedPos.x,
      creep.memory.assignedPos.y,
      creep.memory.targetRoom,
    );
    if (!creep.pos.isEqualTo(pos)) {
      creep.travelTo(pos);
      if (creep.memory.lastPos && creep.pos.x === creep.memory.lastPos.x && creep.pos.y === creep.memory.lastPos.y && creep.pos.roomName === creep.memory.lastPos.roomName) {
        creep.memory.stuckTicks = (creep.memory.stuckTicks || 0) + 1;
      } else {
        creep.memory.stuckTicks = 0;
        creep.memory.lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName };
      }
      if (creep.memory.stuckTicks >= 5) {
        if (Memory.settings && Memory.settings.debugHiveGaze) {
          const statsConsole = require('console.console');
          statsConsole.log(`[HiveGaze] RemoteMiner ${creep.name} stuck, terminating`, 2);
        }
        stats.minerFails++;
        stats.minerDeaths++;
        creep.suicide();
      }
      return;
    }
    const source = Game.getObjectById(creep.memory.targetSourceId);
    if (!source) {
      if (Memory.settings && Memory.settings.debugHiveGaze) {
        const statsConsole = require('console.console');
        statsConsole.log(`[HiveGaze] RemoteMiner ${creep.name} missing source`, 2);
      }
      stats.minerFails++;
      stats.minerDeaths++;
      creep.suicide();
      return;
    }
    creep.harvest(source);
  },
};

module.exports = roleRemoteMiner;
