const htm = require('./manager.htm');
const statsConsole = require('console.console');
const demand = require('./manager.hivemind.demand');
const logger = require('./logger');

const HAULER_CAPACITY = 600;
const DELIVERY_MEMORY_KEY = 'energyDelivery';
const TASK_TTL = 20;
const TASK_MANAGER = 'hauler';

const ensureDeliveryMemory = () => {
  if (!Memory[DELIVERY_MEMORY_KEY]) Memory[DELIVERY_MEMORY_KEY] = {};
  return Memory[DELIVERY_MEMORY_KEY];
};

const ensureStructureState = (structure, fallback = {}) => {
  if (!structure || !structure.id) return null;
  const memory = ensureDeliveryMemory();
  if (!memory[structure.id]) {
    memory[structure.id] = {
      reserved: 0,
      requested: 0,
      outstanding: 0,
      roomName:
        (structure.pos && structure.pos.roomName) ||
        (structure.room && structure.room.name) ||
        fallback.roomName ||
        null,
      structureType: structure.structureType || fallback.structureType || 'structure',
      lastUpdate: Game.time,
    };
  }
  const state = memory[structure.id];
  if (structure.pos) {
    state.roomName = structure.pos.roomName;
  } else if (structure.room && structure.room.name) {
    state.roomName = structure.room.name;
  } else if (!state.roomName && fallback.roomName) {
    state.roomName = fallback.roomName;
  }
  if (structure.structureType) {
    state.structureType = structure.structureType;
  } else if (fallback.structureType && !state.structureType) {
    state.structureType = fallback.structureType;
  }
  state.lastUpdate = Game.time;
  return state;
};

const ensureStateById = (id, fallback = {}) => {
  if (!id) return null;
  const memory = ensureDeliveryMemory();
  if (!memory[id]) {
    memory[id] = {
      reserved: 0,
      requested: 0,
      outstanding: 0,
      roomName: fallback.roomName || null,
      structureType: fallback.structureType || 'structure',
      lastUpdate: Game.time,
    };
  }
  const state = memory[id];
  if (fallback.roomName && !state.roomName) state.roomName = fallback.roomName;
  if (fallback.structureType && !state.structureType) {
    state.structureType = fallback.structureType;
  }
  state.lastUpdate = Game.time;
  return state;
};

const removeDeliverTask = (structureId) => {
  if (!Memory.htm || !Memory.htm.creeps || !Memory.htm.creeps[structureId]) return;
  const container = Memory.htm.creeps[structureId];
  if (!Array.isArray(container.tasks)) return;
  const index = container.tasks.findIndex((t) => t.name === 'deliverEnergy');
  if (index !== -1) container.tasks.splice(index, 1);
  if (container.tasks.length === 0) {
    delete Memory.htm.creeps[structureId];
  }
};

const ensureCreepTaskContainer = (structureId) => {
  htm.init();
  if (!Memory.htm.creeps[structureId]) Memory.htm.creeps[structureId] = { tasks: [] };
  return Memory.htm.creeps[structureId];
};

const updateTaskData = (structure, priority, outstanding, state) => {
  const pos = {
    x: structure.pos.x,
    y: structure.pos.y,
    roomName: structure.pos.roomName,
  };

  const container = ensureCreepTaskContainer(structure.id);
  let task =
    container.tasks.find((t) => t.name === 'deliverEnergy' && t.manager === TASK_MANAGER) ||
    null;
  if (!task) {
    htm.addCreepTask(
      structure.id,
      'deliverEnergy',
      {
        pos,
        amount: outstanding,
        requested: state.requested,
        outstanding,
        reserved: state.reserved,
        structureType: structure.structureType,
      },
      priority,
      TASK_TTL,
      1,
      TASK_MANAGER,
    );
    statsConsole.log(
      `Energy request for ${structure.structureType} ${structure.id} (${outstanding})`,
      3,
    );
    demand.recordRequest(structure.id, outstanding, pos.roomName);
    return;
  }

  task.priority = priority;
  task.ttl = TASK_TTL;
  task.data.amount = outstanding;
  task.data.outstanding = outstanding;
  task.data.requested = state.requested;
  task.data.reserved = state.reserved;
  task.data.structureType = structure.structureType;
  task.data.pos = pos;
};

const clampReserved = (state) => {
  if (!state) return;
  const requested = state.requested || 0;
  if (state.reserved > requested) {
    state.reserved = requested;
  }
  state.outstanding = Math.max(0, requested - state.reserved);
};

const scheduleDelivery = (structure, priority, options = {}) => {
  if (!structure || !structure.store || typeof structure.store.getFreeCapacity !== 'function') {
    return;
  }

  const { minimumOutstanding = 0 } = options;
  const state = ensureStructureState(structure, options);
  if (!state) return;

  const needed = structure.store.getFreeCapacity(RESOURCE_ENERGY);
  state.requested = needed;
  clampReserved(state);

  if (needed <= 0) {
    removeDeliverTask(structure.id);
    state.requested = 0;
    if (state.reserved === 0) {
      delete ensureDeliveryMemory()[structure.id];
    }
    return;
  }

  if (state.outstanding <= 0) {
    removeDeliverTask(structure.id);
    return;
  }

  if (state.outstanding < minimumOutstanding) {
    removeDeliverTask(structure.id);
    return;
  }

  updateTaskData(structure, priority, state.outstanding, state);
};

const cleanupRoomStates = (roomName, activeIds) => {
  const memory = ensureDeliveryMemory();
  for (const id of Object.keys(memory)) {
    const state = memory[id];
    if (state.roomName !== roomName) continue;
    if (activeIds.has(id)) continue;
    if ((state.requested || 0) === 0 && (state.reserved || 0) === 0) {
      delete memory[id];
      removeDeliverTask(id);
    }
  }
};

const energyRequests = {
  run(room) {
    if (!room) return;

    const activeIds = new Set();

    const spawns =
      typeof room.find === 'function'
        ? room.find(FIND_MY_SPAWNS, {
            filter: (spawn) =>
              spawn &&
              spawn.store &&
              typeof spawn.store.getFreeCapacity === 'function' &&
              spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
          })
        : [];

    for (const spawn of spawns || []) {
      scheduleDelivery(spawn, 0, { structureType: 'spawn', roomName: room.name });
      activeIds.add(spawn.id);
    }

    const extensions =
      typeof room.find === 'function'
        ? room.find(FIND_MY_STRUCTURES, {
            filter: (structure) =>
              structure &&
              structure.structureType === STRUCTURE_EXTENSION &&
              structure.store &&
              typeof structure.store.getFreeCapacity === 'function' &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
          })
        : [];

    for (const extension of extensions || []) {
      scheduleDelivery(extension, 1, {
        structureType: 'extension',
        roomName: room.name,
      });
      activeIds.add(extension.id);
    }

    let controllerContainers = room.find
      ? room.find(FIND_STRUCTURES, {
          filter: (structure) =>
            structure &&
            structure.structureType === STRUCTURE_CONTAINER &&
            structure.store &&
            structure.store[RESOURCE_ENERGY] !== undefined &&
            structure.store.getCapacity(RESOURCE_ENERGY) &&
            room.controller &&
            typeof structure.pos.inRangeTo === 'function' &&
            structure.pos.inRangeTo(room.controller.pos, 3),
        })
      : [];

    if (
      (!controllerContainers || controllerContainers.length === 0) &&
      room.controller &&
      room.controller.pos &&
      typeof room.controller.pos.findInRange === 'function'
    ) {
      controllerContainers = room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (structure) =>
          structure &&
          structure.structureType === STRUCTURE_CONTAINER &&
          structure.store &&
          structure.store[RESOURCE_ENERGY] !== undefined &&
          structure.store.getCapacity(RESOURCE_ENERGY),
      });
    }

    for (const container of controllerContainers || []) {
      const capacity =
        typeof container.store.getCapacity === 'function'
          ? container.store.getCapacity(RESOURCE_ENERGY)
          : container.storeCapacity || HAULER_CAPACITY;
      const minimumOutstanding = Math.min(capacity, HAULER_CAPACITY);
      scheduleDelivery(container, 2, {
        structureType: 'container',
        roomName: room.name,
        minimumOutstanding,
      });
      activeIds.add(container.id);
    }

    cleanupRoomStates(room.name, activeIds);
  },

  reserveDelivery(structureId, amount, context = {}) {
    if (!structureId || !amount || amount <= 0) return 0;
    const state = ensureStateById(structureId, context);
    state.reserved += amount;
    clampReserved(state);
    return state.reserved;
  },

  releaseDelivery(structureId, amount) {
    if (!structureId || !amount || amount <= 0) return 0;
    const state = ensureStateById(structureId);
    state.reserved = Math.max(0, (state.reserved || 0) - amount);
    clampReserved(state);
    if (state.reserved === 0 && state.requested === 0) {
      const memory = ensureDeliveryMemory();
      delete memory[structureId];
    }
    return state.reserved;
  },

  getDeliveryState(structureId) {
    const memory = ensureDeliveryMemory();
    if (!structureId || !memory[structureId]) return null;
    return Object.assign({ id: structureId }, memory[structureId]);
  },

  getRoomDeliverySummary(roomName) {
    const memory = ensureDeliveryMemory();
    if (!roomName) return [];
    return Object.entries(memory)
      .filter(([, state]) => state.roomName === roomName)
      .map(([id, state]) => ({
        id,
        requested: state.requested || 0,
        reserved: state.reserved || 0,
        outstanding: state.outstanding || 0,
        structureType: state.structureType || 'structure',
      }))
      .sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0));
  },
};

module.exports = energyRequests;
