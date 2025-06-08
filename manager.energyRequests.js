const htm = require('./manager.htm');
const statsConsole = require('console.console');
const demand = require('./manager.hivemind.demand');

const HAULER_CAPACITY = 600;

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
    const roomName = (structure.room && structure.room.name) || structure.pos.roomName;
    demand.recordRequest(id, needed, roomName);
  } else {
    task.data.amount = needed;
  }
}

function ensureContainerTask(structure) {
  const capacity = structure.store.getCapacity(RESOURCE_ENERGY);
  const needed = capacity - structure.store[RESOURCE_ENERGY];
  const id = structure.id;
  if (needed < HAULER_CAPACITY) {
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
    statsConsole.log(`Energy request for container ${id} (${needed})`, 3);
    const roomName = (structure.room && structure.room.name) || structure.pos.roomName;
    demand.recordRequest(id, needed, roomName);
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
    const containers = room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        room.controller &&
        s.pos.inRangeTo(room.controller.pos, 3),
    });
    for (const c of containers) {
      ensureContainerTask(c);
    }
  },
};

module.exports = energyRequests;
