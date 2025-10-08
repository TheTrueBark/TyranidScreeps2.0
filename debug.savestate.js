/**
 * Savestate capture and restoration utilities.
 *
 * Generates reproducible, compressed snapshots of the bot's internal state for
 * debugging and Codex-assisted recovery workflows.
 *
 * @codex-owner debugSavestate
 */
const statsConsole = require('console.console');
const LZString = require('./vendor.lz-string');

const SAVESTATE_VERSION = 1;

const isNil = (value) => value === undefined || value === null;
const coerceNull = (value) => (isNil(value) ? null : value);
const coerceObject = (value) => (isNil(value) ? {} : value);

const ensureSavestateContainer = () => {
  if (!Memory.debug) Memory.debug = {};
  if (!Memory.debug.savestates) Memory.debug.savestates = {};
};

const safeJsonClone = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    statsConsole.log(
      `[savestate] Failed to clone value: ${error.message}`,
      5,
    );
    return null;
  }
};

const captureMemoryTree = () => {
  if (typeof RawMemory !== 'undefined' && RawMemory.get) {
    try {
      const raw = RawMemory.get();
      return { raw, tree: JSON.parse(raw) };
    } catch (error) {
      statsConsole.log(
        `[savestate] RawMemory capture failed: ${error.message}`,
        5,
      );
    }
  }

  const tree = safeJsonClone(Memory) || {};
  return { raw: JSON.stringify(tree), tree };
};

const captureMetadata = () => ({
  time: Game && typeof Game.time === 'number' ? Game.time : null,
  shard: Game && Game.shard ? Game.shard.name : null,
  cpu: {
    bucket: Game && Game.cpu ? Game.cpu.bucket : null,
    limit: Game && Game.cpu ? Game.cpu.limit : null,
    tickLimit: Game && Game.cpu ? Game.cpu.tickLimit : null,
    used: Game && Game.cpu && Game.cpu.getUsed ? Game.cpu.getUsed() : null,
  },
  gcl: Game && Game.gcl
    ? {
      level: Game.gcl.level,
      progress: Game.gcl.progress,
      progressTotal: Game.gcl.progressTotal,
    }
    : null,
  gpl: Game && Game.gpl
    ? {
      level: Game.gpl.level,
      progress: Game.gpl.progress,
      progressTotal: Game.gpl.progressTotal,
    }
    : null,
});

const captureSpawnQueue = (tree) => {
  const queue = Array.isArray(tree.spawnQueue) ? tree.spawnQueue : [];
  const summary = queue.map((entry) => ({
    requestId: entry.requestId,
    category: entry.category,
    room: entry.room,
    priority: entry.priority,
    ticksToSpawn: entry.ticksToSpawn,
    parentTaskId: coerceNull(entry.parentTaskId),
    parentTick: coerceNull(entry.parentTick),
    subOrder: coerceNull(entry.subOrder),
    enqueuedTick: !isNil(entry.enqueuedTick)
      ? entry.enqueuedTick
      : coerceNull(entry.parentTick),
  }));
  return {
    queue,
    summary,
    nextRequestId: typeof tree.nextSpawnRequestId === 'number'
      ? tree.nextSpawnRequestId
      : null,
  };
};

const captureTasksForContainer = (container) =>
  (container && Array.isArray(container.tasks)) ? container.tasks : [];

const captureHTMState = (tree) => {
  const htm = tree && tree.htm ? tree.htm : {};
  const hive = captureTasksForContainer(htm.hive);
  const clusters = {};
  if (htm.clusters) {
    for (const [clusterId, container] of Object.entries(htm.clusters)) {
      clusters[clusterId] = captureTasksForContainer(container);
    }
  }

  const colonies = {};
  if (htm.colonies) {
    for (const [colonyId, container] of Object.entries(htm.colonies)) {
      colonies[colonyId] = captureTasksForContainer(container);
    }
  }

  const creeps = {};
  if (htm.creeps) {
    for (const [creepName, container] of Object.entries(htm.creeps)) {
      creeps[creepName] = captureTasksForContainer(container);
    }
  }

  return { hive, clusters, colonies, creeps };
};

const captureCreepSummaries = (tree) => {
  const creeps = tree && tree.creeps ? tree.creeps : {};
  const summary = {};
  for (const [name, memory] of Object.entries(creeps)) {
    summary[name] = {
      role: coerceNull(memory.role),
      taskId: coerceNull(memory.taskId),
      task: memory.task
        ? {
          name: coerceNull(memory.task.name),
          target: coerceNull(memory.task.target),
        }
        : null,
      colony: coerceNull(memory.colony),
    };
  }
  return { memory: creeps, summary };
};

const captureEmpire = (tree) => {
  const hive = tree && tree.hive ? tree.hive : {};
  const clusters = {};
  if (hive.clusters) {
    for (const [clusterId, cluster] of Object.entries(hive.clusters)) {
      clusters[clusterId] = {
        meta: coerceObject(cluster.meta),
        colonies: cluster.colonies
          ? Object.keys(cluster.colonies)
          : [],
      };
    }
  }

  const colonies = {};
  if (hive.clusters) {
    for (const [clusterId, cluster] of Object.entries(hive.clusters)) {
      if (!cluster.colonies) continue;
      for (const [colonyId, colony] of Object.entries(cluster.colonies)) {
        colonies[colonyId] = {
          clusterId,
          meta: coerceObject(colony.meta),
          creeps: colony.creeps ? Object.keys(colony.creeps) : [],
          structures: colony.structures ? Object.keys(colony.structures) : [],
        };
      }
    }
  }

  let expansionTargets = null;
  if (!isNil(hive.expansionTargets)) {
    expansionTargets = hive.expansionTargets;
  } else if (tree && tree.empire && !isNil(tree.empire.expansionTargets)) {
    expansionTargets = tree.empire.expansionTargets;
  }

  const roomOwnership = {};
  if (tree && tree.rooms) {
    for (const [roomName, roomMemory] of Object.entries(tree.rooms)) {
      roomOwnership[roomName] = {
        owner: !isNil(roomMemory.owner)
          ? roomMemory.owner
          : (roomMemory.meta && !isNil(roomMemory.meta.owner)
            ? roomMemory.meta.owner
            : null),
        colony: !isNil(roomMemory.colony)
          ? roomMemory.colony
          : (roomMemory.meta && !isNil(roomMemory.meta.colony)
            ? roomMemory.meta.colony
            : null),
        cluster: coerceNull(roomMemory.cluster),
      };
    }
  }

  return {
    hive: {
      version: coerceNull(hive.version),
      clusters,
      colonies,
      meta: coerceObject(hive.meta),
    },
    roomOwnership,
    expansionTargets,
  };
};

const captureRoomLayouts = (tree) => {
  if (!(tree && tree.rooms)) return {};
  const layouts = {};
  for (const [roomName, roomMemory] of Object.entries(tree.rooms)) {
    const data = {};
    if (roomMemory.layout) data.layout = roomMemory.layout;
    if (roomMemory.structures) data.structures = roomMemory.structures;
    if (Object.keys(data).length > 0) {
      layouts[roomName] = data;
    }
  }
  return layouts;
};

const captureDebugIndex = (tree) => ({
  savestates: tree && tree.debug && tree.debug.savestates
    ? tree.debug.savestates
    : {},
});

const buildSnapshot = (note) => {
  const { raw, tree } = captureMemoryTree();
  return {
    version: SAVESTATE_VERSION,
    note: note || null,
    metadata: captureMetadata(),
    memory: { raw },
    spawnQueue: captureSpawnQueue(tree),
    htm: captureHTMState(tree),
    creeps: captureCreepSummaries(tree),
    empire: captureEmpire(tree),
    rooms: captureRoomLayouts(tree),
    debug: captureDebugIndex(tree),
  };
};

const decodeSavestate = (entry) => {
  if (!entry || !entry.compressed) return null;
  const json = LZString.decompressFromBase64(entry.compressed);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (error) {
    statsConsole.log(
      `[savestate] Failed to parse snapshot: ${error.message}`,
      5,
    );
    return null;
  }
};

const applyMemory = (snapshot) => {
  if (!(snapshot && snapshot.memory)) return;
  const raw = snapshot.memory.raw;
  if (!raw) return;

  if (typeof RawMemory !== 'undefined' && RawMemory.set) {
    RawMemory.set(raw);
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof Memory === 'object' && Memory !== null) {
      for (const key of Object.keys(Memory)) {
        delete Memory[key];
      }
      Object.assign(Memory, parsed);
    } else {
      global.Memory = parsed;
    }
  } catch (error) {
    statsConsole.log(
      `[savestate] Failed to apply Memory: ${error.message}`,
      5,
    );
  }
};

const saveSavestate = (stateId, note = '') => {
  ensureSavestateContainer();
  if (typeof stateId !== 'string' || stateId.length === 0) {
    throw new Error('stateId must be a non-empty string');
  }

  const snapshot = buildSnapshot(note);
  const compressed = LZString.compressToBase64(JSON.stringify(snapshot));

  const entry = {
    tick: snapshot.metadata.time,
    created: Game && typeof Game.time === 'number' ? Game.time : null,
    version: SAVESTATE_VERSION,
    note: note || null,
    compressed,
  };
  Memory.debug.savestates[stateId] = entry;
  statsConsole.log(`Savestate ${stateId} captured for tick ${entry.tick}`, 2);
  return entry;
};

const restoreSavestate = (stateId, { force = false } = {}) => {
  ensureSavestateContainer();
  if (!force) {
    const enabled = Memory
      && Memory.settings
      && Memory.settings.allowSavestateRestore === true;
    if (!enabled) {
      statsConsole.log(
        'Savestate restore blocked. Set Memory.settings.allowSavestateRestore = true to proceed.',
        4,
      );
      return false;
    }
  }

  const entry = Memory.debug.savestates[stateId];
  if (!entry) {
    statsConsole.log(`Savestate ${stateId} not found`, 4);
    return false;
  }

  const snapshot = decodeSavestate(entry);
  if (!snapshot) {
    statsConsole.log(`Savestate ${stateId} failed to decode`, 5);
    return false;
  }

  applyMemory(snapshot);
  ensureSavestateContainer();
  Memory.debug.savestates[stateId] = entry;
  statsConsole.log(
    `Savestate ${stateId} restored (tick ${snapshot.metadata.time})`,
    2,
  );
  return true;
};

const listSavestates = () => {
  ensureSavestateContainer();
  return Object.entries(Memory.debug.savestates).map(([id, data]) => ({
    id,
    tick: coerceNull(data.tick),
    created: coerceNull(data.created),
    note: coerceNull(data.note),
    version: coerceNull(data.version),
  }));
};

const inspectSavestate = (stateId) => {
  ensureSavestateContainer();
  const entry = Memory.debug.savestates[stateId];
  if (!entry) return null;
  return decodeSavestate(entry);
};

module.exports = {
  saveSavestate,
  restoreSavestate,
  listSavestates,
  inspectSavestate,
  _capture: {
    buildSnapshot,
    captureMetadata,
  },
};
