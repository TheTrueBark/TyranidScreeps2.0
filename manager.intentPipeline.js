const htm = require('./manager.htm');
const roomManager = require('./manager.room');
const layoutPlanner = require('./layoutPlanner');
const buildingManager = require('./manager.building');
const hudManager = require('./manager.hud');
const statsConsole = require('./console.console');

const INTENTS = {
  SCAN_ROOM: 'INTENT_SCAN_ROOM',
  EVALUATE_ROOM_VALUE: 'INTENT_EVALUATE_ROOM_VALUE',
  PLAN_PHASE_1: 'INTENT_PLAN_PHASE_1',
  PLAN_PHASE_2: 'INTENT_PLAN_PHASE_2',
  PLAN_PHASE_3: 'INTENT_PLAN_PHASE_3',
  PLAN_PHASE_4: 'INTENT_PLAN_PHASE_4',
  PLAN_PHASE_5: 'INTENT_PLAN_PHASE_5',
  PLAN_PHASE_6: 'INTENT_PLAN_PHASE_6',
  PLAN_PHASE_7: 'INTENT_PLAN_PHASE_7',
  PLAN_PHASE_8: 'INTENT_PLAN_PHASE_8',
  PLAN_PHASE_9: 'INTENT_PLAN_PHASE_9',
  PLAN_PHASE_10: 'INTENT_PLAN_PHASE_10',
  SYNC_OVERLAY: 'INTENT_SYNC_OVERLAY',
  RENDER_HUD: 'INTENT_RENDER_HUD',
};

const PHASE_INTENTS = [
  INTENTS.PLAN_PHASE_1,
  INTENTS.PLAN_PHASE_2,
  INTENTS.PLAN_PHASE_3,
  INTENTS.PLAN_PHASE_4,
  INTENTS.PLAN_PHASE_5,
  INTENTS.PLAN_PHASE_6,
  INTENTS.PLAN_PHASE_7,
  INTENTS.PLAN_PHASE_8,
  INTENTS.PLAN_PHASE_9,
  INTENTS.PLAN_PHASE_10,
];

const PHASE_BY_INTENT = PHASE_INTENTS.reduce((acc, name, index) => {
  acc[name] = index + 1;
  return acc;
}, {});

const PHASE_MIN_BUCKET = {
  1: 2000,
  2: 2000,
  3: 2000,
  4: 3500,
  5: 3500,
  6: 3500,
  7: 3500,
  8: 3500,
  9: 1000,
  10: 1000,
};

const SOFT_CPU = 18;
const MAX_BACKOFF = 25;

function ensureRoomMemory(roomName) {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  const roomMem = Memory.rooms[roomName];
  roomMem.intentState = roomMem.intentState || {
    activeRunId: null,
    pendingIntents: {},
    fingerprints: {},
    lastCompletedPhase: 0,
    lastValueEvalTick: null,
    lastIntentReason: null,
  };
  if (!roomMem.layout) roomMem.layout = {};
  roomMem.layout.pipelineRuns = roomMem.layout.pipelineRuns || {};
  return roomMem;
}

function getContainer(roomName) {
  htm.init();
  return htm._getContainer(htm.LEVELS.COLONY, roomName);
}

function nextBackoff(task) {
  const data = task && task.data ? task.data : {};
  const retries = Number(data.retryCount) || 0;
  const wait = Math.min(MAX_BACKOFF, Math.max(1, Math.pow(2, retries)));
  data.retryCount = retries + 1;
  data.retryAtTick = Game.time + wait;
  task.data = data;
  return wait;
}

function checkBudget(task, minBucket = 0, softCpuLimit = SOFT_CPU) {
  const data = task && task.data ? task.data : {};
  if (data.retryAtTick && Game.time < data.retryAtTick) {
    return { defer: data.retryAtTick - Game.time };
  }
  if (typeof Game.cpu.bucket === 'number' && Game.cpu.bucket < minBucket) {
    return { defer: nextBackoff(task), reason: 'bucket' };
  }
  if (softCpuLimit > 0 && typeof Game.cpu.getUsed === 'function' && Game.cpu.getUsed() > softCpuLimit) {
    return { defer: nextBackoff(task), reason: 'cpu' };
  }
  if (data.retryAtTick) {
    delete data.retryAtTick;
    data.retryCount = 0;
  }
  return null;
}

function signature(intentName, data = {}) {
  return [
    intentName,
    data.roomName || '',
    data.runId || '',
    data.phase || '',
    data.reason || '',
    data.key || '',
  ].join('|');
}

function dedupeIntent(roomName, intentName, sig) {
  const container = getContainer(roomName);
  if (!container || !Array.isArray(container.tasks)) return false;
  return container.tasks.some(
    (task) =>
      task &&
      task.amount > 0 &&
      task.name === intentName &&
      task.data &&
      task.data.signature === sig,
  );
}

function setRunPhase(roomName, runId, phase, status) {
  const roomMem = ensureRoomMemory(roomName);
  const runs = roomMem.layout.pipelineRuns;
  runs[runId] = runs[runId] || {
    runId,
    createdAt: Game.time,
    status: 'running',
    phases: {},
  };
  runs[runId].phases[phase] = {
    phase,
    status,
    tick: Game.time,
  };
  if (status === 'done') {
    roomMem.intentState.lastCompletedPhase = Math.max(roomMem.intentState.lastCompletedPhase || 0, phase);
  }
}

function enqueueIntent(roomName, intentName, data = {}, options = {}) {
  if (!roomName) return false;
  const roomMem = ensureRoomMemory(roomName);
  const payload = Object.assign({}, data, { roomName });
  payload.signature = payload.signature || signature(intentName, payload);
  if (dedupeIntent(roomName, intentName, payload.signature)) return false;
  const priority = typeof options.priority === 'number' ? options.priority : 1;
  const ttl = typeof options.ttl === 'number' ? options.ttl : 200;
  htm.addColonyTask(
    roomName,
    intentName,
    payload,
    priority,
    ttl,
    1,
    'intentPipeline',
    { module: 'intentPipeline' },
    { allowDuplicate: true },
  );
  roomMem.intentState.pendingIntents[payload.signature] = {
    intent: intentName,
    tick: Game.time,
    runId: payload.runId || null,
  };
  roomMem.intentState.lastIntentReason = payload.reason || roomMem.intentState.lastIntentReason;
  return true;
}

function removePendingSignature(roomName, data) {
  if (!roomName || !data || !data.signature) return;
  const roomMem = ensureRoomMemory(roomName);
  if (roomMem.intentState.pendingIntents[data.signature]) {
    delete roomMem.intentState.pendingIntents[data.signature];
  }
}

function queuePhase(roomName, runId, phase, reason = 'follow-up') {
  const intentName = PHASE_INTENTS[phase - 1];
  if (!intentName) return false;
  return enqueueIntent(
    roomName,
    intentName,
    { runId, phase, reason, key: `${runId}:${phase}` },
    { priority: 1, ttl: 400 },
  );
}

function queuePlanningRun(roomName, reason = 'manual') {
  const roomMem = ensureRoomMemory(roomName);
  const runId = `${roomName}:${Game.time}:${Math.floor(Math.random() * 1000)}`;
  roomMem.intentState.activeRunId = runId;
  setRunPhase(roomName, runId, 0, 'started');
  queuePhase(roomName, runId, 1, reason);
  return runId;
}

function calculateRoomValue(roomName) {
  const room = Game.rooms[roomName];
  if (!room) return null;
  const mem = ensureRoomMemory(roomName);
  const srcCount = room.find(FIND_SOURCES).length;
  const feasible = Number(mem.feasibleMiningPositions || 0);
  const controllerLevel = room.controller ? Number(room.controller.level || 0) : 0;
  const structures = Array.isArray(mem.structures) ? mem.structures.length : 0;
  const score =
    Math.min(1, srcCount / 3) * 0.35 +
    Math.min(1, feasible / 8) * 0.35 +
    Math.min(1, controllerLevel / 8) * 0.2 +
    Math.min(1, structures / 80) * 0.1;
  const prev = mem.valueEvaluation && typeof mem.valueEvaluation.score === 'number'
    ? mem.valueEvaluation.score
    : null;
  const delta = prev === null ? 0 : score - prev;
  mem.valueEvaluation = {
    score,
    delta,
    sources: srcCount,
    feasibleMiningPositions: feasible,
    controllerLevel,
    structures,
    tick: Game.time,
  };
  mem.intentState.lastValueEvalTick = Game.time;
  return mem.valueEvaluation;
}

function runPlanningPhase(roomName, runId, phase) {
  const room = Game.rooms[roomName];
  if (!room || !room.controller || !room.controller.my) {
    setRunPhase(roomName, runId, phase, 'skipped');
    return { done: true };
  }
  if (!Memory.settings) Memory.settings = {};
  Memory.settings.layoutPlanningMode = 'theoretical';
  Memory.settings.showLayoutOverlay = true;
  Memory.settings.enableBaseBuilderPlanning = true;

  if (phase === 3) {
    layoutPlanner.buildTheoreticalLayout(roomName);
    setRunPhase(roomName, runId, phase, 'done');
    return { done: true };
  }

  if (phase >= 4 && phase <= 8) {
    layoutPlanner.buildTheoreticalLayout(roomName);
    const layout = Memory.rooms[roomName] && Memory.rooms[roomName].layout;
    const pipeline = layout && layout.theoreticalPipeline;
    if (pipeline && pipeline.status === 'running') {
      setRunPhase(roomName, runId, phase, 'running');
      return { done: false };
    }
    setRunPhase(roomName, runId, phase, 'done');
    return { done: true };
  }

  if (phase === 9) {
    layoutPlanner.buildTheoreticalLayout(roomName);
    const layout = Memory.rooms[roomName] && Memory.rooms[roomName].layout;
    const pipeline = layout && layout.theoreticalPipeline;
    const status = pipeline && pipeline.status ? String(pipeline.status) : '';
    if (status === 'running') {
      setRunPhase(roomName, runId, phase, 'running');
      return { done: false };
    }
    setRunPhase(roomName, runId, phase, 'done');
    return { done: true };
  }

  if (phase === 10) {
    setRunPhase(roomName, runId, phase, 'done');
    const roomMem = ensureRoomMemory(roomName);
    const run = roomMem.layout.pipelineRuns[runId];
    if (run) {
      run.status = 'completed';
      run.completedAt = Game.time;
    }
    return { done: true };
  }

  setRunPhase(roomName, runId, phase, 'done');
  return { done: true };
}

const intentPipeline = {
  INTENTS,
  PHASE_INTENTS,
  _handlersRegistered: false,

  registerHandlers() {
    if (this._handlersRegistered) return;
    this._handlersRegistered = true;

    const handle = (intentName, fn, minBucket = 0, softCpuLimit = SOFT_CPU) => {
      htm.registerHandler(htm.LEVELS.COLONY, intentName, (data, task) => {
        const roomName = data && data.roomName;
        if (!roomName) return { complete: true };
        const budget = checkBudget(task, minBucket, softCpuLimit);
        if (budget && budget.defer) {
          return { deferTicks: budget.defer };
        }
        try {
          const result = fn.call(this, roomName, data || {}, task || {});
          removePendingSignature(roomName, data);
          if (result && result.deferTicks) return result;
          return { complete: true };
        } catch (err) {
          statsConsole.log(`[intentPipeline] ${intentName} failed for ${roomName}: ${err}`, 4);
          return { deferTicks: nextBackoff(task) };
        }
      });
    };

    handle(INTENTS.SCAN_ROOM, (roomName) => {
      const room = Game.rooms[roomName];
      if (!room) return { complete: true };
      roomManager.scanRoom(room);
      return { complete: true };
    }, 1000);

    handle(INTENTS.EVALUATE_ROOM_VALUE, (roomName, data) => {
      const result = calculateRoomValue(roomName);
      if (!result) return { complete: true };
      const shouldPlan =
        data.forcePlan === true ||
        (typeof result.delta === 'number' && Math.abs(result.delta) >= 0.08);
      if (shouldPlan && Memory.settings && Memory.settings.enableBaseBuilderPlanning !== false) {
        const roomMem = ensureRoomMemory(roomName);
        if (!roomMem.intentState.activeRunId) {
          queuePlanningRun(roomName, 'value-change');
        }
      }
      return { complete: true };
    }, 1000);

    for (const intentName of PHASE_INTENTS) {
      const phase = PHASE_BY_INTENT[intentName];
      handle(intentName, (roomName, data) => {
        const runId = data.runId || queuePlanningRun(roomName, 'implicit-run');
        const out = runPlanningPhase(roomName, runId, phase);
        if (!out.done) {
          return { deferTicks: 1 };
        }
        if (phase < 10) {
          queuePhase(roomName, runId, phase + 1, 'phase-complete');
          if (phase === 9) {
            enqueueIntent(roomName, INTENTS.SYNC_OVERLAY, { runId, reason: 'phase9-complete' }, { ttl: 100 });
            enqueueIntent(roomName, INTENTS.RENDER_HUD, { runId, reason: 'phase9-complete' }, { ttl: 100 });
          }
        } else {
          enqueueIntent(roomName, INTENTS.SYNC_OVERLAY, { runId, reason: 'pipeline-complete' }, { ttl: 100 });
          enqueueIntent(roomName, INTENTS.RENDER_HUD, { runId, reason: 'pipeline-complete' }, { ttl: 100 });
          const roomMem = ensureRoomMemory(roomName);
          roomMem.intentState.activeRunId = null;
        }
        return { complete: true };
      }, PHASE_MIN_BUCKET[phase] || 1000);
    }

    handle(INTENTS.SYNC_OVERLAY, (roomName) => {
      const room = Game.rooms[roomName];
      if (!room) return { complete: true };
      layoutPlanner._refreshTheoreticalDisplay(roomName, true);
      layoutPlanner.populateDynamicLayout(roomName);
      return { complete: true };
    }, 0, 0);

    handle(INTENTS.RENDER_HUD, (roomName) => {
      const room = Game.rooms[roomName];
      if (!room) return { complete: true };
      hudManager.createHUD(room);
      return { complete: true };
    }, 0, 0);
  },

  queueOwnershipIntents(roomName) {
    enqueueIntent(roomName, INTENTS.SCAN_ROOM, { reason: 'ownership-established' });
    enqueueIntent(roomName, INTENTS.EVALUATE_ROOM_VALUE, { reason: 'ownership-established', forcePlan: true });
  },

  queuePlanStart(roomName, reason = 'manual') {
    const runId = queuePlanningRun(roomName, reason);
    enqueueIntent(roomName, INTENTS.SCAN_ROOM, { runId, reason: `${reason}:scan` });
    enqueueIntent(roomName, INTENTS.EVALUATE_ROOM_VALUE, { runId, reason: `${reason}:eval` });
    return runId;
  },

  queueOverlayRefresh(roomName, reason = 'overlay-change') {
    enqueueIntent(roomName, INTENTS.SYNC_OVERLAY, { reason });
    enqueueIntent(roomName, INTENTS.RENDER_HUD, { reason });
  },

  produceRoomIntents(room, options = {}) {
    if (!room || !room.name) return;
    const roomName = room.name;
    const roomMem = ensureRoomMemory(roomName);
    const state = roomMem.intentState;
    const fingerprints = state.fingerprints || (state.fingerprints = {});
    const hasSpawn =
      typeof FIND_MY_SPAWNS !== 'undefined' && typeof room.find === 'function'
        ? room.find(FIND_MY_SPAWNS).length > 0
        : false;

    if (!fingerprints.initialized) {
      fingerprints.initialized = true;
      fingerprints.hasSpawn = hasSpawn;
      enqueueIntent(roomName, INTENTS.SCAN_ROOM, { reason: 'initial' });
      if (hasSpawn) {
        enqueueIntent(roomName, INTENTS.EVALUATE_ROOM_VALUE, { reason: 'initial-spawn', forcePlan: true });
      }
      this.queueOverlayRefresh(roomName, 'initial');
    }

    if (fingerprints.hasSpawn !== hasSpawn) {
      fingerprints.hasSpawn = hasSpawn;
      enqueueIntent(roomName, INTENTS.SCAN_ROOM, { reason: 'spawn-change' });
      if (hasSpawn) {
        enqueueIntent(roomName, INTENTS.EVALUATE_ROOM_VALUE, { reason: 'spawn-change', forcePlan: true });
      }
    }

    const structureCount = room.find(FIND_STRUCTURES).length;
    const siteCount = room.find(FIND_CONSTRUCTION_SITES).length;
    if (fingerprints.structureCount !== structureCount || fingerprints.siteCount !== siteCount) {
      fingerprints.structureCount = structureCount;
      fingerprints.siteCount = siteCount;
      enqueueIntent(roomName, INTENTS.SCAN_ROOM, { reason: 'topology-change' });
      if (hasSpawn) {
        enqueueIntent(roomName, INTENTS.EVALUATE_ROOM_VALUE, { reason: 'topology-change' });
      }
    }

    const overlayIndex =
      Memory.settings && typeof Memory.settings.layoutCandidateOverlayIndex === 'number'
        ? Memory.settings.layoutCandidateOverlayIndex
        : -1;
    if (fingerprints.overlayIndex !== overlayIndex) {
      fingerprints.overlayIndex = overlayIndex;
      this.queueOverlayRefresh(roomName, 'candidate-overlay-change');
    }

    const layout = roomMem.layout || {};
    if (layout.rebuildLayout || layout.manualPhaseRequest) {
      this.queuePlanStart(roomName, layout.rebuildLayout ? 'rebuild-layout' : 'manual-phase');
    }

    if (options.previewOnly) {
      enqueueIntent(
        roomName,
        INTENTS.RENDER_HUD,
        { reason: 'preview-draw', key: String(Game.time) },
        { ttl: 20 },
      );
    }
  },

  consumeLayoutRecalcRequest() {
    if (!Memory.settings) return false;
    const pending = Memory.settings.layoutRecalculateRequested;
    if (!pending) return false;
    const ownedRooms = Object.values(Game.rooms || {}).filter(
      (room) => room && room.controller && room.controller.my,
    );
    if (pending === 'all') {
      for (const room of ownedRooms) {
        this.queuePlanStart(room.name, 'recalculate-all');
      }
    } else if (typeof pending === 'string' && Game.rooms[pending]) {
      this.queuePlanStart(pending, 'recalculate-room');
    }
    delete Memory.settings.layoutRecalculateRequested;
    delete Memory.settings.layoutRecalculateMode;
    return true;
  },

  listRoomIntents(roomName) {
    const roomMem = ensureRoomMemory(roomName);
    const container = getContainer(roomName);
    return {
      state: roomMem.intentState,
      queue: container && Array.isArray(container.tasks)
        ? container.tasks
            .filter((task) => task.manager === 'intentPipeline')
            .map((task) => ({
              id: task.id,
              name: task.name,
              claimedUntil: task.claimedUntil,
              ttl: task.ttl,
              age: task.age,
              data: task.data,
            }))
        : [],
    };
  },

  retryIntent(roomName, runId, intentType) {
    const intent = String(intentType || '').toUpperCase();
    const valid = Object.values(INTENTS).includes(intent);
    if (!valid) return false;
    return enqueueIntent(roomName, intent, {
      runId: runId || null,
      reason: 'manual-retry',
      key: `manual:${runId || 'none'}:${intent}`,
    });
  },

  cancelIntentRun(roomName, runId) {
    const container = getContainer(roomName);
    if (!container || !Array.isArray(container.tasks)) return 0;
    let removed = 0;
    for (let i = container.tasks.length - 1; i >= 0; i--) {
      const task = container.tasks[i];
      if (task.manager !== 'intentPipeline') continue;
      const taskRun = task.data && task.data.runId ? task.data.runId : null;
      if (runId && taskRun !== runId) continue;
      container.tasks.splice(i, 1);
      removed += 1;
    }
    const roomMem = ensureRoomMemory(roomName);
    if (!runId || roomMem.intentState.activeRunId === runId) {
      roomMem.intentState.activeRunId = null;
    }
    return removed;
  },
};

module.exports = intentPipeline;
