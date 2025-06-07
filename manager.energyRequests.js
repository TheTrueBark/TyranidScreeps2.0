const htm = require('./manager.htm');
const statsConsole = require('console.console');

function ensureTask(structure) {
  const needed = structure.store.getFreeCapacity(RESOURCE_ENERGY);
  const id = structure.id;
  if (!needed) {
    if (Memory.htm && Memory.htm.creeps && Memory.htm.creeps[id]) {
      delete Memory.htm.creeps[id];
    }
    return;
  }
  htm.init();
  if (!Memory.htm.creeps[id]) Memory.htm.creeps[id] = { tasks: [] };
  const container = Memory.htm.creeps[id];
  let task = container.tasks.find(t => t.name === 'deliverEnergy');
  if (!task) {
    htm.addCreepTask(
      id,
      'deliverEnergy',
      {
        pos: { x: structure.pos.x, y: structure.pos.y, roomName: structure.pos.roomName },
        amount: needed,
      },
      1,
      20,
      1,
      'hauler',
    );
    statsConsole.log(`Energy request for ${structure.structureType} ${id} (${needed})`, 3);
  } else {
    task.data.amount = needed;
  }
}

const energyRequests = {
  run(room) {
    const spawns = room.find(FIND_MY_SPAWNS);
    for (const spawn of spawns) {
      ensureTask(spawn);
    }
    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION,
    });
    for (const ext of extensions) {
      ensureTask(ext);
    }
  },
};

module.exports = energyRequests;
