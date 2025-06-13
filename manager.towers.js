/**
 * Operates room towers for defense and maintenance.
 * @codex-owner towers
 * @codex-scheduler-task runTowers
 */
const statsConsole = require('console.console');

const towers = {
  run() {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      const towers = room.find(FIND_MY_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_TOWER,
      });
      if (!towers.length) continue;

      const hostiles = room.find(FIND_HOSTILE_CREEPS);
      for (const tower of towers) {
        this.runTower(tower, hostiles);
      }
    }
  },

  runTower(tower, hostiles) {
    const room = tower.room;
    const debug = Memory.settings && Memory.settings.debugVisuals;
    const vis = debug ? new RoomVisual(room.name) : null;

    if (hostiles.length) {
      const target = tower.pos.findClosestByRange(hostiles);
      const res = tower.attack(target);
      if (vis && res === OK) vis.text('⚔️', tower.pos.x, tower.pos.y - 1, { color: 'red', font: 0.8 });
      return;
    }

    const injured = room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax });
    if (injured.length) {
      const target = tower.pos.findClosestByRange(injured);
      const res = tower.heal(target);
      if (vis && res === OK) vis.text('💊', tower.pos.x, tower.pos.y - 1, { color: 'green', font: 0.8 });
      return;
    }

    if (!Memory.settings.enableTowerRepairs || Game.cpu.bucket < 8000) return;

    const repairTargets = room.find(FIND_STRUCTURES, {
      filter: s => {
        if (s.hits >= s.hitsMax) return false;
        if (s.structureType === STRUCTURE_ROAD) {
          return s.hits / s.hitsMax < 0.8;
        }
        if (s.structureType === STRUCTURE_CONTAINER) {
          return s.hits / s.hitsMax < 0.5;
        }
        if (s.structureType === STRUCTURE_RAMPART) {
          if (hostiles.length) return false;
          return s.hits < 5000;
        }
        return false;
      },
    });

    if (repairTargets.length) {
      const target = tower.pos.findClosestByRange(repairTargets);
      const res = tower.repair(target);
      if (vis && res === OK) vis.text('🔧', tower.pos.x, tower.pos.y - 1, { color: 'yellow', font: 0.8 });
    }
  },
};

module.exports = towers;
