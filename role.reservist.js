const { getRandomTyranidQuote } = require('./utils.quotes');
const _ = require('lodash');

const roleReservist = {
  run(creep) {
    const roomName = creep.memory.targetRoom;
    if (!roomName) {
      if (Memory.settings && Memory.settings.debugHiveGaze) {
        const statsConsole = require('console.console');
        statsConsole.log(`[HiveGaze] Reservist ${creep.name} missing targetRoom`, 2);
      }
      creep.suicide();
      return;
    }
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
      stats.reservistSpawns++;
      creep.memory.countedSpawn = true;
    }
    if (creep.room.name !== roomName) {
      creep.travelTo(new RoomPosition(25, 25, roomName));
      return;
    }
    const controller = creep.room.controller;
    if (!controller) {
      if (Memory.settings && Memory.settings.debugHiveGaze) {
        const statsConsole = require('console.console');
        statsConsole.log(`[HiveGaze] Reservist ${creep.name} no controller in ${creep.room.name}`, 2);
      }
      stats.reservistFails++;
      creep.suicide();
      return;
    }
    if (
      controller.reservation &&
      controller.reservation.username &&
      !controller.my &&
      controller.reservation.username !== (Memory.username || '')
    ) {
      const attempts = _.get(Memory, ['rooms', roomName, 'reserveAttempts'], 0);
      if (attempts < 3) {
        _.set(Memory, ['rooms', roomName, 'reserveAttempts'], attempts + 1);
        const delay = 1000 + Math.floor(Math.random() * 500);
        const colony = creep.memory.homeRoom || _.get(Memory, ['rooms', roomName, 'homeColony']);
        const htm = require('./manager.htm');
        htm.addColonyTask(
          colony,
          'RESERVE_REMOTE_ROOM',
          { room: roomName },
          4,
          delay,
          1,
          'autoRetry',
          { module: 'role.reservist', createdBy: 'reserveRetry', tickCreated: Game.time },
        );
      }
      if (Memory.settings && Memory.settings.debugHiveGaze) {
        const statsConsole = require('console.console');
        statsConsole.log(`[HiveGaze] Reservist failed to claim ${roomName}`, 3);
      }
      stats.reservistFails++;
      creep.suicide();
      return;
    }
    const res = creep.reserveController(controller);
    if (res === ERR_NOT_IN_RANGE) {
      creep.travelTo(controller);
      return;
    }
    if (res === OK) {
      const quote = getRandomTyranidQuote();
      if (typeof creep.signController === 'function') {
        const currentSign = controller.sign;
        const username = Memory.username || '';
        if (
          !currentSign ||
          currentSign.username !== username ||
          currentSign.text !== quote
        ) {
          creep.signController(controller, quote);
        }
      }
      _.set(Memory, ['rooms', roomName, 'reserveAttempts'], 0);
      if (!creep.memory.countedSuccess) {
        stats.reservistSuccesses++;
        creep.memory.countedSuccess = true;
      }
      return;
    }

    stats.reservistFails++;
    creep.suicide();
  },
};

module.exports = roleReservist;
