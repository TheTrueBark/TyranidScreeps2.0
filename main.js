const statsConsole = require("console.console");
require("./RoomVisual");
const roomManager = require("manager.room");
const spawnManager = require("manager.spawn");
const buildingManager = require("manager.building");
const layoutPlanner = require('./layoutPlanner');
const roomPlanner = require("planner.room");
const roleUpgrader = require("role.upgrader");
const roleMiner = require("role.miner");
const roleBuilder = require("role.builder");
const roleHauler = require("role.hauler");
const roleRemoteMiner = require('./role.remoteMiner');
const roleReservist = require('./role.reservist');
const roleBaseDistributor = require('./role.baseDistributor');
const maintenanceManager = require('./manager.maintenance');
const assimilation = require('./memory.assimilation');
const distanceTransform = require("algorithm.distanceTransform");
const hudManager = require("manager.hud");
const stampManager = require("manager.stamps");
const memoryManager = require("manager.memory");
const spawnQueue = require("manager.spawnQueue");
const hiveTravel = require("manager.hiveTravel");
const towerManager = require('./manager.towers');
const scheduler = require("scheduler");
const { ONCE } = require("scheduler");
const logger = require("./logger");
const introspect = require('./debug.introspection');
const savestate = require('./debug.savestate');
const incidentDebug = require('./debug.incident');
const layoutDumpDebug = require('./debug.layoutDump');
require('./taskDefinitions');
const htm = require("manager.htm");
const intentPipeline = require('./manager.intentPipeline');
const hivemind = require("manager.hivemind");
const hiveGaze = require('./manager.hiveGaze');
const lifecycle = require('./hiveMind.lifecycle');
const haulerLifecycle = require('./haulerLifecycle');
const movementUtils = require("./utils.movement");
const profilerRegistry = require('./profiler.registry');
const tickPipeline = require('./manager.tickPipeline');
const { DomainQueueScheduler } = require('./scheduler.domainQueues');

const energyDemand = require("./manager.hivemind.demand");
const hiveRoles = require('./hive.roles');
// HiveTravel installs travelTo on creeps
let screepsProfiler = null;
let screepsProfilerReady = false;
let profilerModuleRegistry = {};
let profilerRuntimeRegistry = {};
let profilerLastCacheSize = -1;
let profilerAdditionalRegistered = false;
let domainQueueScheduler = new DomainQueueScheduler();

global.spawnQueue = spawnQueue;

let myStats = [];
global.visualizeDT = false;

// Ensure persistent settings exist
if (!Memory.settings) Memory.settings = {};
if (Memory.settings.enableVisuals === undefined) {
  Memory.settings.enableVisuals = true;
}
if (Memory.settings.alwaysShowHud === undefined) {
  Memory.settings.alwaysShowHud = true;
}
if (Memory.settings.showTaskList === undefined) {
  Memory.settings.showTaskList = false;
}
if (Memory.settings.energyLogs === undefined) {
  Memory.settings.energyLogs = false;
}
if (Memory.settings.debugHiveGaze === undefined) {
  Memory.settings.debugHiveGaze = false;
}
if (Memory.settings.debugVisuals === undefined) {
  Memory.settings.debugVisuals = false;
}
if (Memory.settings.enableBaseBuilderPlanning === undefined) {
  Memory.settings.enableBaseBuilderPlanning = true;
}
if (Memory.settings.showSpawnQueueHud === undefined) {
  Memory.settings.showSpawnQueueHud = true;
}
if (Memory.settings.enableTowerRepairs === undefined) {
  Memory.settings.enableTowerRepairs = true;
}
if (Memory.settings.pauseBot === undefined) {
  Memory.settings.pauseBot = false;
}
if (Memory.settings.buildPreviewOnly === undefined) {
  Memory.settings.buildPreviewOnly = false;
}
if (Memory.settings.showLayoutLegend === undefined) {
  Memory.settings.showLayoutLegend = true;
}
if (Memory.settings.showHtmOverlay === undefined) {
  Memory.settings.showHtmOverlay = true;
}
if (Memory.settings.profilerOverlayLimit === undefined) {
  Memory.settings.profilerOverlayLimit = 20;
}
if (Memory.settings.profilerOverlayFilter === undefined) {
  Memory.settings.profilerOverlayFilter = '';
}
if (Memory.settings.profilerOverlayMode === undefined) {
  Memory.settings.profilerOverlayMode = 'global';
}
if (Memory.settings.profilerResetPending === undefined) {
  Memory.settings.profilerResetPending = false;
}
if (Memory.settings.profilerEnabledByOverlay === undefined) {
  Memory.settings.profilerEnabledByOverlay = false;
}
if (Memory.settings.showLayoutOverlayLabels === undefined) {
  Memory.settings.showLayoutOverlayLabels = false;
}
if (Memory.settings.showRoadRclLabels === undefined) {
  Memory.settings.showRoadRclLabels = false;
}
if (Memory.settings.enableScreepsProfiler === undefined) {
  Memory.settings.enableScreepsProfiler = false;
}
if (Memory.settings.enableTaskProfiling === undefined) {
  Memory.settings.enableTaskProfiling = false;
}
if (Memory.settings.enableLegacyHtmRun === undefined) {
  Memory.settings.enableLegacyHtmRun = false;
}
if (Memory.settings.runtimeMode === undefined) {
  Memory.settings.runtimeMode = 'live';
}
if (Memory.settings.overlayMode === undefined) {
  Memory.settings.overlayMode = 'normal';
}
if (Memory.settings.enableHudCalcCache === undefined) {
  Memory.settings.enableHudCalcCache = true;
}
if (Memory.settings.enableMemHack === undefined) {
  Memory.settings.enableMemHack = true;
}
if (Memory.settings.memHackDebug === undefined) {
  Memory.settings.memHackDebug = false;
}
if (Memory.settings.enableIdleGating === undefined) {
  Memory.settings.enableIdleGating = true;
}
if (Memory.settings.enablePlanningHeartbeat === undefined) {
  Memory.settings.enablePlanningHeartbeat = true;
}
if (Memory.settings.planningHeartbeatTicks === undefined) {
  Memory.settings.planningHeartbeatTicks = 50;
}
if (!Memory.settings.cpu || typeof Memory.settings.cpu !== 'object') {
  Memory.settings.cpu = {};
}
if (!Memory.settings.cpu.stopAt || typeof Memory.settings.cpu.stopAt !== 'object') {
  Memory.settings.cpu.stopAt = {};
}
if (!Memory.settings.cpu.throttleAt || typeof Memory.settings.cpu.throttleAt !== 'object') {
  Memory.settings.cpu.throttleAt = {};
}
if (Memory.settings.cpu.stopAt.critical === undefined) Memory.settings.cpu.stopAt.critical = 500;
if (Memory.settings.cpu.stopAt.realtime === undefined) Memory.settings.cpu.stopAt.realtime = 2000;
if (Memory.settings.cpu.stopAt.background === undefined) Memory.settings.cpu.stopAt.background = 4000;
if (Memory.settings.cpu.stopAt.burstOnly === undefined) Memory.settings.cpu.stopAt.burstOnly = 8000;
if (Memory.settings.cpu.throttleAt.critical === undefined) Memory.settings.cpu.throttleAt.critical = 1000;
if (Memory.settings.cpu.throttleAt.realtime === undefined) Memory.settings.cpu.throttleAt.realtime = 4000;
if (Memory.settings.cpu.throttleAt.background === undefined) Memory.settings.cpu.throttleAt.background = 7000;
if (Memory.settings.cpu.throttleAt.burstOnly === undefined) Memory.settings.cpu.throttleAt.burstOnly = 9000;
if (Memory.settings.cpu.emergencyBrakeRatio === undefined) Memory.settings.cpu.emergencyBrakeRatio = 0.85;
if (Memory.settings.layoutPlanningMode === undefined) {
  Memory.settings.layoutPlanningMode = 'standard';
}
if (Memory.settings.layoutOverlayView === undefined) {
  Memory.settings.layoutOverlayView = 'plan';
}
if (Memory.settings.layoutCandidateOverlayIndex === undefined) {
  Memory.settings.layoutCandidateOverlayIndex = -1;
}
if (Memory.settings.layoutPlanningTopCandidates === undefined) {
  Memory.settings.layoutPlanningTopCandidates = 5;
}
if (Memory.settings.layoutPlanningCandidatesPerTick === undefined) {
  Memory.settings.layoutPlanningCandidatesPerTick = 1;
}
if (Memory.settings.layoutPlanningMaxCandidatesPerTick === undefined) {
  Memory.settings.layoutPlanningMaxCandidatesPerTick = 25;
}
if (Memory.settings.layoutPlanningDynamicBatching === undefined) {
  Memory.settings.layoutPlanningDynamicBatching = true;
}
if (Memory.settings.layoutPlanningReplanInterval === undefined) {
  Memory.settings.layoutPlanningReplanInterval = 1000;
}
if (Memory.settings.layoutRefinementEnabled === undefined) {
  Memory.settings.layoutRefinementEnabled = true;
}
if (Memory.settings.layoutRefinementTopSeeds === undefined) {
  Memory.settings.layoutRefinementTopSeeds = 2;
}
if (Memory.settings.layoutRefinementMaxGenerations === undefined) {
  Memory.settings.layoutRefinementMaxGenerations = 8;
}
if (Memory.settings.layoutRefinementVariantsPerGeneration === undefined) {
  Memory.settings.layoutRefinementVariantsPerGeneration = 4;
}
if (Memory.settings.layoutRefinementMinBucket === undefined) {
  Memory.settings.layoutRefinementMinBucket = 3500;
}
if (Memory.settings.allowSavestateRestore === undefined) {
  Memory.settings.allowSavestateRestore = false;
}
if (Memory.settings.maxSavestates === undefined) {
  Memory.settings.maxSavestates = 25;
}
if (Memory.settings.maxIncidents === undefined) {
  Memory.settings.maxIncidents = 25;
}
if (Memory.settings.incidentLogWindow === undefined) {
  Memory.settings.incidentLogWindow = 150;
}
if (Memory.settings.incidentMaxAge === undefined) {
  Memory.settings.incidentMaxAge = 20000;
}
if (Memory.settings.enableAutoIncidentCapture === undefined) {
  Memory.settings.enableAutoIncidentCapture = false;
}
if (Memory.settings.enableAssimilation === undefined) {
  Memory.settings.enableAssimilation = true;
}
if (Memory.settings.enableRebirth === undefined) {
  Memory.settings.enableRebirth = true;
}
if (Memory.settings.rebirthMaxTtl === undefined) {
  Memory.settings.rebirthMaxTtl = 180;
}
if (Memory.settings.enableRecycling === undefined) {
  Memory.settings.enableRecycling = true;
}
if (Memory.settings.renewOverheadTicks === undefined) {
  Memory.settings.renewOverheadTicks = 10;
}
if (Memory.settings.renewQueueBusyThreshold === undefined) {
  Memory.settings.renewQueueBusyThreshold = 1;
}
if (Memory.settings.recycleOverheadTicks === undefined) {
  Memory.settings.recycleOverheadTicks = 20;
}
if ((Memory.settings.overlayMode || 'normal') === 'normal' && Memory.settings.alwaysShowHud) {
  Memory.settings.enableVisuals = true;
  Memory.settings.showSpawnQueueHud = true;
}
if (Memory.settings.energyLogs) {
  logger.toggle('energyRequests', true);
  logger.toggle('demandManager', true);
} else {
  logger.toggle('energyRequests', false);
  logger.toggle('demandManager', false);
}

function syncOverlayModeSettings() {
  if (!Memory.settings) Memory.settings = {};
  const mode = String(Memory.settings.overlayMode || 'normal').toLowerCase();
  if (mode === 'off') {
    Memory.settings.enableVisuals = false;
    Memory.settings.alwaysShowHud = false;
    Memory.settings.showSpawnQueueHud = false;
    Memory.settings.showLayoutOverlay = false;
    Memory.settings.showLayoutLegend = false;
    Memory.settings.showHtmOverlay = false;
    Memory.settings.enableTaskProfiling = false;
    return mode;
  }
  if (mode === 'debug') {
    Memory.settings.enableVisuals = false;
    Memory.settings.alwaysShowHud = false;
    Memory.settings.showSpawnQueueHud = false;
    Memory.settings.showLayoutOverlay = false;
    Memory.settings.showLayoutLegend = false;
    Memory.settings.showHtmOverlay = true;
    Memory.settings.enableTaskProfiling = true;
    return mode;
  }
  return 'normal';
}

function applyRuntimeMode(mode, options = {}) {
  if (!Memory.settings) Memory.settings = {};
  Memory.settings.enableMemHack = true;
  if (Memory.settings.memHackDebug === undefined) Memory.settings.memHackDebug = false;
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'theoretical') {
    const suspend = options.suspend !== false;
    Memory.settings.runtimeMode = 'theoretical';
    Memory.settings.layoutPlanningMode = 'theoretical';
    if (!Memory.settings.layoutOverlayView) {
      Memory.settings.layoutOverlayView = 'plan';
    }
    if (Memory.settings.layoutCandidateOverlayIndex === undefined) {
      Memory.settings.layoutCandidateOverlayIndex = -1;
    }
    Memory.settings.enableBaseBuilderPlanning = true;
    Memory.settings.showLayoutOverlay = true;
    Memory.settings.showLayoutLegend = true;
    Memory.settings.enableVisuals = true;
    Memory.settings.alwaysShowHud = true;
    Memory.settings.buildPreviewOnly = true;
    Memory.settings.pauseBot = suspend;
    visualizeDT = false;
    const ownedRooms = Object.values(Game.rooms || {}).filter(
      (room) => room && room.controller && room.controller.my,
    );
    for (const room of ownedRooms) {
      intentPipeline.queuePlanStart(room.name, 'mode-switch-theoretical');
      intentPipeline.queueOverlayRefresh(room.name, 'mode-switch-theoretical');
    }
    return;
  }

  if (normalized === 'live') {
    Memory.settings.runtimeMode = 'live';
    Memory.settings.layoutPlanningMode = 'standard';
    Memory.settings.buildPreviewOnly = false;
    Memory.settings.pauseBot = false;
    if (options.keepLayoutOverlay !== true) {
      Memory.settings.showLayoutOverlay = false;
    }
    if (Memory.settings.alwaysShowHud) {
      Memory.settings.enableVisuals = true;
    }
    return;
  }

  if (normalized === 'maintenance') {
    Memory.settings.runtimeMode = 'maintenance';
    Memory.settings.pauseBot = false;
    Memory.settings.buildPreviewOnly = false;
    Memory.settings.enableBaseBuilderPlanning = false;
    Memory.settings.overlayMode = 'off';
    Memory.settings.enableVisuals = false;
    Memory.settings.showSpawnQueueHud = false;
    Memory.settings.showLayoutOverlay = false;
    Memory.settings.showLayoutLegend = false;
    Memory.settings.showHtmOverlay = false;
    Memory.settings.enableTaskProfiling = false;
    delete Memory.settings.layoutRecalculateRequested;
    delete Memory.settings.layoutRecalculateMode;
    if (Memory.settings.profilerEnabledByOverlay) {
      Memory.settings.profilerEnabledByOverlay = false;
      Memory.settings.enableScreepsProfiler = false;
      Memory.settings.profilerResetPending = true;
      delete Memory.settings.profilerControl;
    }
  }
}

function processPendingLayoutRecalculation() {
  if (intentPipeline.consumeLayoutRecalcRequest()) {
    statsConsole.log('Layout recalculation intents queued.', 2);
  }
}

function drawAsciiConsole() {
  const start = Game.cpu.getUsed();
  console.log(statsConsole.displayHistogram());
  console.log(statsConsole.displayStats());
  console.log(statsConsole.displayLogs());
  const drawTime = Game.cpu.getUsed() - start;
  if (!Memory.stats) Memory.stats = {};
  Memory.stats.consoleDrawTime = drawTime;
  return drawTime;
}

function compactTickSeries(store, keep = 100) {
  if (!store || !Array.isArray(store.ticks) || typeof store.byTick !== 'object' || !store.byTick) return;
  const limit = Math.max(1, Math.floor(Number(keep) || 100));
  if (store.ticks.length <= limit) return;
  const keepTicks = store.ticks.slice(-limit);
  const keepMap = {};
  for (const t of keepTicks) {
    keepMap[String(t)] = true;
  }
  for (const key in store.byTick) {
    if (!keepMap[key]) delete store.byTick[key];
  }
  store.ticks = keepTicks;
}

function performMemorySweep(mode = 'ownedOnly') {
  const normalized = String(mode || 'ownedOnly').toLowerCase();
  const summary = {
    mode: normalized,
    removedRooms: 0,
    keptRooms: 0,
    trimmedLogs: 0,
    trimmedTaskLogs: 0,
    trimmedTaskAverages: 0,
    trimmedTickPipeline: 0,
    trimmedProfilerBreakdown: 0,
    trimmedIncidents: 0,
    trimmedSavestates: 0,
    beforeRawBytes: typeof RawMemory !== 'undefined' && typeof RawMemory.get === 'function' ? (RawMemory.get() || '').length : 0,
    afterRawBytes: 0,
  };

  if (!Memory.rooms) Memory.rooms = {};
  const ownedSet = {};
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (room && room.controller && room.controller.my) ownedSet[roomName] = true;
  }

  if (normalized === 'ownedonly' || normalized === 'hard') {
    const names = Object.keys(Memory.rooms);
    for (const roomName of names) {
      if (!ownedSet[roomName]) {
        delete Memory.rooms[roomName];
        summary.removedRooms += 1;
      } else {
        summary.keptRooms += 1;
      }
    }
  } else {
    summary.keptRooms = Object.keys(Memory.rooms).length;
  }

  if (normalized !== 'statsonly') {
    for (const roomName in Memory.rooms) {
      layoutPlanner._pruneTheoreticalMemory(roomName, { reason: `memory-sweep:${normalized}` });
    }
  }

  if (!Memory.stats) Memory.stats = {};
  const stats = Memory.stats;
  if (Array.isArray(stats.logs) && stats.logs.length > 100) {
    summary.trimmedLogs = stats.logs.length - 100;
    stats.logs = stats.logs.slice(-100);
  }
  if (Array.isArray(stats.taskLogs) && stats.taskLogs.length > 100) {
    summary.trimmedTaskLogs = stats.taskLogs.length - 100;
    stats.taskLogs = stats.taskLogs.slice(-100);
  }
  if (stats.taskAverages && typeof stats.taskAverages === 'object') {
    const recentNames = {};
    for (const entry of stats.taskLogs || []) {
      if (entry && entry.name) recentNames[String(entry.name)] = true;
    }
    const before = Object.keys(stats.taskAverages).length;
    for (const name in stats.taskAverages) {
      if (!recentNames[name]) delete stats.taskAverages[name];
    }
    summary.trimmedTaskAverages = Math.max(0, before - Object.keys(stats.taskAverages).length);
  }
  if (stats.tickPipeline && Array.isArray(stats.tickPipeline.ticks)) {
    const before = stats.tickPipeline.ticks.length;
    compactTickSeries(stats.tickPipeline, 100);
    summary.trimmedTickPipeline = Math.max(0, before - stats.tickPipeline.ticks.length);
  }
  if (stats.profilerTickBreakdown && Array.isArray(stats.profilerTickBreakdown.ticks)) {
    const before = stats.profilerTickBreakdown.ticks.length;
    compactTickSeries(stats.profilerTickBreakdown, 50);
    summary.trimmedProfilerBreakdown = Math.max(0, before - stats.profilerTickBreakdown.ticks.length);
  }

  if (normalized === 'hard' && Memory.debug) {
    if (Memory.debug.incidents && typeof Memory.debug.incidents === 'object') {
      const ids = Object.keys(Memory.debug.incidents);
      if (ids.length > 3) {
        ids.sort((a, b) => {
          const ia = Memory.debug.incidents[a] || {};
          const ib = Memory.debug.incidents[b] || {};
          return Number((ib.created || 0)) - Number((ia.created || 0));
        });
        const keep = {};
        for (const id of ids.slice(0, 3)) keep[id] = true;
        for (const id of ids) {
          if (!keep[id]) {
            delete Memory.debug.incidents[id];
            summary.trimmedIncidents += 1;
          }
        }
      }
    }
    if (Memory.debug.savestates && typeof Memory.debug.savestates === 'object') {
      const ids = Object.keys(Memory.debug.savestates);
      if (ids.length > 3) {
        ids.sort((a, b) => {
          const sa = Memory.debug.savestates[a] || {};
          const sb = Memory.debug.savestates[b] || {};
          return Number((sb.created || 0)) - Number((sa.created || 0));
        });
        const keep = {};
        for (const id of ids.slice(0, 3)) keep[id] = true;
        for (const id of ids) {
          if (!keep[id]) {
            delete Memory.debug.savestates[id];
            summary.trimmedSavestates += 1;
          }
        }
      }
    }
  }

  summary.afterRawBytes = typeof RawMemory !== 'undefined' && typeof RawMemory.get === 'function' ? (RawMemory.get() || '').length : 0;
  return summary;
}

function recordTickPhase(ctx, phaseName, fn, extra = {}) {
  tickPipeline.markPhaseStart(ctx, phaseName);
  let out;
  try {
    out = fn();
  } finally {
    tickPipeline.markPhaseEnd(ctx, phaseName, extra);
  }
  return out;
}

function getCpuPolicySettings() {
  if (!Memory.settings) Memory.settings = {};
  if (!Memory.settings.cpu || typeof Memory.settings.cpu !== 'object') {
    Memory.settings.cpu = {};
  }
  const cpu = Memory.settings.cpu;
  cpu.stopAt = cpu.stopAt || {};
  cpu.throttleAt = cpu.throttleAt || {};
  if (cpu.stopAt.critical === undefined) cpu.stopAt.critical = 500;
  if (cpu.stopAt.realtime === undefined) cpu.stopAt.realtime = 2000;
  if (cpu.stopAt.background === undefined) cpu.stopAt.background = 4000;
  if (cpu.stopAt.burstOnly === undefined) cpu.stopAt.burstOnly = 8000;
  if (cpu.throttleAt.critical === undefined) cpu.throttleAt.critical = 1000;
  if (cpu.throttleAt.realtime === undefined) cpu.throttleAt.realtime = 4000;
  if (cpu.throttleAt.background === undefined) cpu.throttleAt.background = 7000;
  if (cpu.throttleAt.burstOnly === undefined) cpu.throttleAt.burstOnly = 9000;
  if (cpu.emergencyBrakeRatio === undefined) cpu.emergencyBrakeRatio = 0.85;
  return cpu;
}

function hasActivePlanningRun() {
  const runHasPendingTasks = function (roomName, runId) {
    if (!roomName || !runId || typeof htm._getContainer !== 'function') return false;
    const container = htm._getContainer(htm.LEVELS.COLONY, roomName);
    if (!container || !Array.isArray(container.tasks)) return false;
    for (const task of container.tasks) {
      if (!task || Number(task.amount || 0) <= 0) continue;
      const taskRunId = task.data && task.data.runId ? String(task.data.runId) : '';
      if (taskRunId && taskRunId === String(runId)) return true;
    }
    return false;
  };

  if (!Memory.rooms) return false;
  for (const roomName in Memory.rooms) {
    const roomMem = Memory.rooms[roomName];
    if (!roomMem) continue;
    const intentState = roomMem.intentState || null;
    if (intentState && intentState.activeRunId) {
      const runId = String(intentState.activeRunId);
      const runs = roomMem.layout && roomMem.layout.pipelineRuns ? roomMem.layout.pipelineRuns : null;
      const runState = runs && runs[runId] ? String(runs[runId].status || '') : '';
      const isActiveRunState = runState !== 'completed' && runState !== 'failed' && runState !== 'stale';
      if (isActiveRunState || runState === '') return true;
      intentState.activeRunId = null;
    }
    const pipeline = roomMem.layout && roomMem.layout.theoreticalPipeline;
    if (pipeline && String(pipeline.status || '') === 'running') {
      const runId = String(pipeline.runId || '');
      const activeCandidate =
        pipeline.activeCandidate !== undefined && pipeline.activeCandidate !== null
          ? pipeline.activeCandidate
          : pipeline.activeCandidateIndex;
      const lastProgressTick =
        typeof pipeline.lastProgressTick === 'number'
          ? pipeline.lastProgressTick
          : typeof pipeline.updatedAt === 'number'
            ? pipeline.updatedAt
            : 0;
      const staleAge = Math.max(0, Game.time - Number(lastProgressTick || 0));
      const hasPendingTasks = runHasPendingTasks(roomName, runId);
      const hasRunContext = Boolean(intentState && intentState.activeRunId);
      const staleNoProgress =
        !hasRunContext &&
        (activeCandidate === null || activeCandidate === undefined) &&
        staleAge > 50 &&
        !hasPendingTasks;
      if (staleNoProgress) {
        pipeline.status = 'stale';
        pipeline.staleReason = 'auto-heal:no-run-context-no-pending-tasks';
        pipeline.updatedAt = Game.time;
        continue;
      }
      return true;
    }
  }
  return false;
}

function hasManualPlanningTrigger() {
  if (Memory.settings && Memory.settings.layoutRecalculateRequested) return true;
  if (!Memory.rooms) return false;
  for (const roomName in Memory.rooms) {
    const roomMem = Memory.rooms[roomName];
    if (!roomMem || !roomMem.layout) continue;
    if (roomMem.layout.manualPhaseRequest || roomMem.layout.rebuildLayout) return true;
  }
  return false;
}

function refreshCriticalEventCache() {
  if (!Memory.stats) Memory.stats = {};
  Memory.stats.runtime = Memory.stats.runtime || {};
  const runtime = Memory.stats.runtime;
  const now = Game.time;
  const lastCheck = Number(runtime.lastCriticalCheckTick || 0);
  const checkInterval = Math.max(3, Math.floor(Number((Memory.settings && Memory.settings.criticalCheckIntervalTicks) || 10)));
  if (now - lastCheck < checkInterval) {
    return Boolean(runtime.hasCriticalEvent);
  }
  let found = false;
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) continue;
    if (typeof FIND_HOSTILE_CREEPS === 'undefined' || typeof room.find !== 'function') continue;
    if (room.find(FIND_HOSTILE_CREEPS).length > 0) {
      found = true;
      runtime.lastCriticalEventTick = now;
      break;
    }
  }
  runtime.lastCriticalCheckTick = now;
  runtime.hasCriticalEvent = found;
  if (!found && Number(runtime.lastCriticalEventTick || 0) + 10 < now) {
    runtime.lastCriticalEventTick = 0;
  }
  return found;
}

function shouldForcePlanningTick() {
  if (!Memory.settings) return false;
  if (Memory.settings.layoutRecalculateRequested) return true;
  if (hasManualPlanningTrigger()) return true;
  if (!Memory.settings.enablePlanningHeartbeat) return false;
  const ticks = Math.max(10, Math.floor(Number(Memory.settings.planningHeartbeatTicks || 50)));
  return Game.time % ticks === 0;
}

function buildRuntimeState(tickCtx) {
  const state = {
    runtimeState: 'active',
    runtimeReason: 'default-active',
    forcePlanningTick: shouldForcePlanningTick(),
    nextPlanningHeartbeatTick: 0,
    htmSummary: { totalActive: 0, totalRunnable: 0, runnableByPipeline: {} },
  };
  const hbTicks = Math.max(10, Math.floor(Number((Memory.settings && Memory.settings.planningHeartbeatTicks) || 50)));
  const mod = Game.time % hbTicks;
  state.nextPlanningHeartbeatTick = hbTicks > 0 ? (mod === 0 ? Game.time + hbTicks : Game.time + (hbTicks - mod)) : 0;
  if (!Memory.settings || String(Memory.settings.runtimeMode || 'live').toLowerCase() !== 'live') {
    state.runtimeReason = 'non-live-mode';
    return state;
  }
  if (Memory.settings.enableIdleGating === false) {
    state.runtimeReason = 'idle-gating-disabled';
    return state;
  }
  if (state.forcePlanningTick) {
    state.runtimeReason = 'planning-heartbeat';
    return state;
  }
  if (hasManualPlanningTrigger()) {
    state.runtimeReason = 'manual-trigger';
    return state;
  }
  if (hasActivePlanningRun()) {
    state.runtimeReason = 'active-planning-run';
    return state;
  }
  if (refreshCriticalEventCache()) {
    state.runtimeReason = 'critical-event-cache';
    return state;
  }
  const htmSummary = typeof htm.getRunnableSummary === 'function'
    ? htm.getRunnableSummary()
    : { totalActive: 0, totalRunnable: 0, runnableByPipeline: {} };
  state.htmSummary = htmSummary;
  if (Number(htmSummary.totalRunnable || 0) > 0) {
    state.runtimeReason = 'runnable-htm-tasks';
    return state;
  }
  if (Number(htmSummary.totalActive || 0) > 0) {
    state.runtimeReason = 'blocked-htm-tasks';
    return state;
  }
  state.runtimeState = 'idle';
  state.runtimeReason = 'no-work';
  return state;
}

function filterPipelinesByBucket(basePipelines) {
  const cpu = getCpuPolicySettings();
  const bucket = Number(Game.cpu.bucket || 0);
  const runtimeMode = String((Memory.settings && Memory.settings.runtimeMode) || 'live').toLowerCase();
  const burstStopAt =
    runtimeMode === 'theoretical'
      ? 2000
      : Number(cpu.stopAt.burstOnly || 8000);
  const list = [];
  for (const pipeline of basePipelines) {
    const stopAt = pipeline === 'burstOnly' ? burstStopAt : Number(cpu.stopAt[pipeline] || 0);
    if (bucket < stopAt) continue;
    list.push(pipeline);
  }
  return list;
}

function queueDomainEvents(ctx, options = {}) {
  if (!ctx || !ctx.snapshot) return;
  domainQueueScheduler.startTick(Game.time);
  const previewOnly = Boolean(Memory.settings && Memory.settings.buildPreviewOnly);
  const includeIntentProducer = Boolean(options.includeIntentProducer);
  if (includeIntentProducer) {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room || !room.controller || !room.controller.my) continue;
      domainQueueScheduler.enqueue({
        taskId: `intent:${roomName}:${Game.time}`,
        type: 'ROOM_INTENT_PRODUCER',
        domain: 'planner',
        pipeline: ctx && ctx.flags && ctx.flags.BURST ? 'background' : 'realtime',
        priorityBand: 1,
        priorityBase: 1,
        priorityDyn: 0,
        roomName,
        previewOnly,
        forceProducer: Boolean(options.forceProducer),
        roomSnapshot: ctx.snapshot && ctx.snapshot.rooms ? ctx.snapshot.rooms[roomName] || null : null,
        costEst: 'low',
        validUntil: Game.time + 1,
      });
    }
  }
  if (!Array.isArray(ctx.snapshot.events)) return;
  for (const event of ctx.snapshot.events) {
    if (!event || !event.type) continue;
    if (event.type === 'hostilesSeen') {
      domainQueueScheduler.enqueue({
        taskId: `combat:${event.roomName}:${Game.time}`,
        type: 'EVENT_HOSTILES_SEEN',
        domain: 'combat',
        pipeline: 'critical',
        priorityBand: 0,
        priorityBase: 0,
        priorityDyn: 0,
        roomName: event.roomName,
        deadlineTick: Game.time + 1,
        costEst: 'low',
        validUntil: Game.time + 1,
      });
    } else if (event.type === 'constructionSitesPresent') {
      domainQueueScheduler.enqueue({
        taskId: `build:${event.roomName}:${Game.time}`,
        type: 'EVENT_CONSTRUCTION_PRESENT',
        domain: 'build',
        pipeline: 'background',
        priorityBand: 2,
        priorityBase: 2,
        priorityDyn: 0,
        roomName: event.roomName,
        deadlineTick: Game.time + 10,
        costEst: 'low',
        validUntil: Game.time + 5,
      });
    }
  }
}

function runDomainPlanning(ctx) {
  const maxBudget = Math.max(0, Number(ctx && ctx.softBudget ? ctx.softBudget : Game.cpu.tickLimit) * 0.12);
  const basePipelines = ctx && ctx.flags && ctx.flags.LOW_BUCKET
    ? ['critical', 'realtime']
    : ctx && ctx.flags && ctx.flags.BURST
    ? ['critical', 'realtime', 'background', 'burstOnly']
    : ['critical', 'realtime', 'background'];
  const pipelines = filterPipelinesByBucket(basePipelines);
  if (!pipelines.length) return;
  const result = domainQueueScheduler.runPhase(
    'planning',
    maxBudget,
    (task) => {
      if (!task) return { invalidate: true };
      if (task.type === 'ROOM_INTENT_PRODUCER') {
        const room = Game.rooms[task.roomName];
        if (!room || !room.controller || !room.controller.my) return { invalidate: true };
        if (ctx && ctx.flags && ctx.flags.LOW_BUCKET) {
          const roomSnap = ctx.snapshot && ctx.snapshot.rooms ? ctx.snapshot.rooms[task.roomName] : null;
          const hostileCount = roomSnap ? Number(roomSnap.hostileCount || 0) : 0;
          const hasSpawnFast = roomSnap ? Boolean(roomSnap.hasSpawn) : false;
          if (!hasSpawnFast && hostileCount === 0) return { invalidate: true };
        }
        intentPipeline.produceRoomIntents(room, {
          previewOnly: Boolean(task.previewOnly),
          roomSnapshot: task.roomSnapshot || null,
          eventDriven: Boolean(task.eventDriven),
          force: Boolean(task.forceProducer),
        });
        const hasSpawns =
          typeof FIND_MY_SPAWNS !== 'undefined' && typeof room.find === 'function'
            ? room.find(FIND_MY_SPAWNS).length > 0
            : false;
        if (hasSpawns) {
          if (!Memory.rooms) Memory.rooms = {};
          if (!Memory.rooms[task.roomName]) Memory.rooms[task.roomName] = {};
          const scoutInit = Memory.rooms[task.roomName].scoutInit;
          const needsInit =
            !scoutInit ||
            scoutInit.version !== hiveGaze.SCOUT_INIT_VERSION ||
            !scoutInit.completed;
          if (needsInit && !(scoutInit && scoutInit.pending)) {
            const taskName = `initializeScoutMemory_${task.roomName}`;
            scheduler.addTask(taskName, 0, () => hiveGaze.initializeScoutMemory(task.roomName), {
              once: true,
            });
            Memory.rooms[task.roomName].scoutInit = {
              version: hiveGaze.SCOUT_INIT_VERSION,
              pending: true,
              queuedAt: Game.time,
            };
          }
        }
        return { invalidate: true };
      }
      if (task.type === 'EVENT_HOSTILES_SEEN' && task.roomName) {
        if (!Memory.stats) Memory.stats = {};
        Memory.stats.runtime = Memory.stats.runtime || {};
        Memory.stats.runtime.lastCriticalEventTick = Game.time;
        Memory.stats.runtime.hasCriticalEvent = true;
        intentPipeline.queueOverlayRefresh(task.roomName, 'hostiles-seen');
        return { invalidate: true };
      }
      if (task.type === 'EVENT_CONSTRUCTION_PRESENT' && task.roomName) {
        intentPipeline.queueOverlayRefresh(task.roomName, 'construction-sites-seen');
        return { invalidate: true };
      }
      return { invalidate: true };
    },
    { pipelines },
  );
  if (!Memory.stats) Memory.stats = {};
  Memory.stats.domainScheduler = Memory.stats.domainScheduler || {};
  const rawStats = domainQueueScheduler.getStats();
  const compactStats = {
    push: Number(rawStats.push || 0),
    pop: Number(rawStats.pop || 0),
    executed: Number(rawStats.executed || 0),
    staleDrops: Number(rawStats.staleDrops || 0),
    blockedSkips: Number(rawStats.blockedSkips || 0),
    avgCostEst: Number(rawStats.avgCostEst || 0),
    costEst: rawStats.costEst || { low: 0, medium: 0, high: 0, total: 0 },
  };
  if (Memory.settings && Memory.settings.debugDomainScheduler === true) {
    compactStats.queueSizes = rawStats.queueSizes || {};
  }
  Memory.stats.domainScheduler.lastPlanning = {
    tick: Game.time,
    executed: result.executed,
    cpu: Number(result.cpu.toFixed(4)),
    pipelines,
    mode: ctx && ctx.mode ? ctx.mode : 'NORMAL',
    stats: compactStats,
  };
}

function executeHtmPhase(tickCtx, reason) {
  const start = Game.cpu.getUsed();
  const preferPipeline = !(Memory.settings && Memory.settings.enableLegacyHtmRun === true);
  let result = null;
  const cpuPolicy = getCpuPolicySettings();
  const fallbackTickLimit =
    typeof Game.cpu.tickLimit === 'number' && Number.isFinite(Game.cpu.tickLimit)
      ? Game.cpu.tickLimit
      : Number(Game.cpu.limit || 0);
  const htmSummary =
    typeof htm.getRunnableSummary === 'function'
      ? htm.getRunnableSummary()
      : { totalRunnable: 0, runnableByPipeline: {} };
  if (Number(htmSummary.totalRunnable || 0) <= 0) {
    result = {
      executed: 0,
      cpu: 0,
      budget: 0,
      pipelines: [],
      schedulerStats: null,
      skipped: 'no-runnable',
    };
  }
  const bucket = Number(Game.cpu.bucket || 0);
  const runtimeMode = String((Memory.settings && Memory.settings.runtimeMode) || 'live').toLowerCase();
  const burstStopAt =
    runtimeMode === 'theoretical'
      ? 2000
      : Number(cpuPolicy.stopAt.burstOnly || 8000);
  const softBudget =
    tickCtx && typeof tickCtx.softBudget === 'number' ? tickCtx.softBudget : fallbackTickLimit;
  const emergencyRatio = Math.max(0.5, Math.min(0.98, Number(cpuPolicy.emergencyBrakeRatio || 0.85)));
  const emergencyUsed = Game.cpu.getUsed() > Number(softBudget) * emergencyRatio;
  const hasCriticalRunnable = Number((htmSummary.runnableByPipeline && htmSummary.runnableByPipeline.critical) || 0) > 0;
  const hasRealtimeRunnable = Number((htmSummary.runnableByPipeline && htmSummary.runnableByPipeline.realtime) || 0) > 0;
  if (!result && emergencyUsed && !hasCriticalRunnable) {
    result = {
      executed: 0,
      cpu: 0,
      budget: 0,
      pipelines: [],
      schedulerStats: null,
      skipped: 'emergency-brake',
    };
  }
  if (!result && !hasCriticalRunnable && !hasRealtimeRunnable && bucket < Number(cpuPolicy.stopAt.background || 4000)) {
    result = {
      executed: 0,
      cpu: 0,
      budget: 0,
      pipelines: [],
      schedulerStats: null,
      skipped: 'background-gated',
    };
  }
  if (!result && !hasCriticalRunnable && !hasRealtimeRunnable &&
      Number((htmSummary.runnableByPipeline && htmSummary.runnableByPipeline.background) || 0) <= 0 &&
      Number((htmSummary.runnableByPipeline && htmSummary.runnableByPipeline.burstOnly) || 0) > 0 &&
      bucket < burstStopAt) {
    result = {
      executed: 0,
      cpu: 0,
      budget: 0,
      pipelines: [],
      schedulerStats: null,
      skipped: 'burst-gated',
    };
  }

  if (!result && preferPipeline && typeof htm.runScheduled === 'function') {
    const mode = tickCtx && tickCtx.mode ? tickCtx.mode : 'NORMAL';
    const basePipelines =
      mode === 'LOW_BUCKET'
        ? ['critical', 'realtime']
        : mode === 'BURST'
          ? ['critical', 'realtime', 'background', 'burstOnly']
          : ['critical', 'realtime', 'background'];
    const allowedPipelines = filterPipelinesByBucket(basePipelines);
    if (!allowedPipelines.length) {
      result = {
        executed: 0,
        cpu: 0,
        budget: 0,
        pipelines: [],
        schedulerStats: null,
        skipped: 'pipeline-stopat',
      };
    } else {
      result = htm.runScheduled({
        mode,
        softBudget,
        reserveCpu: reason === 'preview' ? 1.2 : 2,
        includeQueueSizes: Boolean(Memory.settings && Memory.settings.debugDomainScheduler === true),
        allowedPipelines,
      });
    }
  } else if (!result) {
    htm.run();
    result = {
      executed: 0,
      cpu: Number((Game.cpu.getUsed() - start).toFixed(4)),
      budget: 0,
      pipelines: ['legacy'],
      schedulerStats: null,
    };
  }
  if (!Memory.stats) Memory.stats = {};
  Memory.stats.htmExecution = {
    tick: Game.time,
    reason: String(reason || 'live'),
    mode: tickCtx && tickCtx.mode ? tickCtx.mode : 'NORMAL',
    executed: Number(result && result.executed ? result.executed : 0),
    cpu: Number((result && result.cpu ? result.cpu : Game.cpu.getUsed() - start).toFixed(4)),
    budget: Number(result && result.budget ? result.budget : 0),
    pipelines: result && Array.isArray(result.pipelines) ? result.pipelines : [],
    queueStats: result && result.schedulerStats ? result.schedulerStats : null,
    skipped: result && result.skipped ? String(result.skipped) : '',
  };
  return result;
}

function gatherIntentCpuForTick(tick) {
  const logs = (Memory.stats && Array.isArray(Memory.stats.taskLogs)) ? Memory.stats.taskLogs : [];
  const lines = logs.filter((entry) => entry && entry.tick === tick && /^INTENT_/.test(String(entry.name || '')));
  const sums = {
    scan: 0,
    eval: 0,
    plan: 0,
    sync: 0,
    hud: 0,
    other: 0,
  };
  for (const entry of lines) {
    const cpu = typeof entry.cpu === 'number' ? entry.cpu : 0;
    const name = String(entry.name || '');
    if (name === 'INTENT_SCAN_ROOM') sums.scan += cpu;
    else if (name === 'INTENT_EVALUATE_ROOM_VALUE') sums.eval += cpu;
    else if (name.indexOf('INTENT_PLAN_PHASE_') === 0) sums.plan += cpu;
    else if (name === 'INTENT_SYNC_OVERLAY') sums.sync += cpu;
    else if (name === 'INTENT_RENDER_HUD') sums.hud += cpu;
    else sums.other += cpu;
  }
  return sums;
}

function logProfileEntry(name, cpu, context = {}) {
  if (!cpu || cpu <= 0) return;
  if (!Memory || !Memory.settings || Memory.settings.enableTaskProfiling === false) return;
  const rawName = String(name || 'Profile');
  let normalizedName = rawName;

  // Unified HTM root schema for overlay profiling.
  if (rawName.indexOf('HTM::') !== 0) {
    if (rawName === 'Main Loop::Tick Total') {
      normalizedName = 'HTM::Tick Total::Value';
    } else if (rawName.indexOf('Preview Pipeline::') === 0) {
      normalizedName = `HTM::Preview Pipeline::${rawName.replace('Preview Pipeline::', '')}::Calcs`;
    } else if (rawName.indexOf('Main Loop::') === 0) {
      normalizedName = `HTM::Main Loop::${rawName.replace('Main Loop::', '')}::Calcs`;
    } else if (rawName.indexOf('Creep Roles::') === 0) {
      normalizedName = `HTM::Creep Roles::${rawName.replace('Creep Roles::', '')}::Calcs`;
    } else if (rawName.indexOf('Profiler Functions::') === 0) {
      normalizedName = `HTM::Profiler Functions::${rawName.replace('Profiler Functions::', '')}::Calcs`;
    } else if (rawName.indexOf('Scheduler::') === 0) {
      normalizedName = `HTM::Scheduler::${rawName.replace('Scheduler::', '')}::Calcs`;
    } else {
      normalizedName = `HTM::Misc::${rawName}::Calcs`;
    }
  }

  htm.logSubtaskExecution(normalizedName, cpu, {
    level: context.level || 'main',
    id: context.id || 'main',
    result: context.result || 'ok',
    reason: context.reason || 'main',
    parent: 'HTM',
  });
}

function classifyProfilerFunction(fnName) {
  const name = String(fnName || '');
  const lower = name.toLowerCase();
  const result = {
    module: 'Unattributed Functions',
    metric: 'other',
    bucket: 'unattributed',
  };
  if (!name || name === '(tick)' || name === '(root)') {
    result.module = 'Profiler Overhead';
    result.bucket = 'overhead';
    return result;
  }
  if (lower.indexOf('screeps.profiler') !== -1) {
    result.module = 'Profiler Overhead';
    result.metric = 'calculating';
    result.bucket = 'overhead';
    return result;
  }
  if (lower.indexOf('runtime:manager.htm') === 0) {
    result.module = 'HTM Tasks (Middle)';
    if (lower.indexOf('.run') !== -1 || lower.indexOf('addcolonytask') !== -1) {
      result.metric = 'execution';
    } else {
      result.metric = 'calculating';
    }
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('runtime:manager.hud') === 0) {
    result.module = 'HUD';
    if (lower.indexOf('createhud') !== -1 || lower.indexOf('draw') !== -1) result.metric = 'rendering';
    else result.metric = 'calculating';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('runtime:layoutvisualizer') === 0) {
    result.module = 'Structure Overlay';
    result.metric = 'rendering';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('runtime:manager.room') === 0 || lower.indexOf('runtime:manager.spawn') === 0) {
    result.module = 'Main Loop';
    result.metric = 'execution';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('runtime:role.') === 0 || lower.indexOf('runtime:hive.roles') === 0) {
    result.module = 'Creep Roles';
    result.metric = 'execution';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('runtime:manager.hivemind') === 0 || lower.indexOf('runtime:manager.hivegaze') === 0) {
    result.module = 'Intent Pipeline';
    result.metric = 'execution';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('runtime:manager.intentpipeline') === 0) {
    result.module = 'Intent Pipeline';
    result.metric = 'execution';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('runtime:scheduler') === 0) {
    result.module = 'Scheduler';
    result.metric = 'execution';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('room.find') === 0 || lower.indexOf('roomposition.') === 0 || lower.indexOf('pathfinder.') === 0) {
    result.module = 'Main Loop';
    result.metric = 'calculating';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('manager.hud.js') !== -1) {
    if (lower.indexOf('buildhtmoverlayrows') !== -1 || lower.indexOf('buildtheoreticalstatusrows') !== -1) {
      result.metric = 'calculating';
    } else {
      result.metric = 'rendering';
    }
    if (lower.indexOf('drawtheoreticalstatushud') !== -1 || lower.indexOf('buildtheoreticalstatusrows') !== -1) {
      result.module = 'Status Overlay (Top Left)';
    } else if (lower.indexOf('drawhtmoverlay') !== -1 || lower.indexOf('buildhtmoverlayrows') !== -1) {
      result.module = 'HTM Tasks (Middle)';
    } else {
      result.module = 'HUD';
    }
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('layoutvisualizer.js') !== -1) {
    result.module = 'Structure Overlay';
    result.metric = lower.indexOf('drawlayout') !== -1 ? 'rendering' : 'calculating';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('manager.htm.js') !== -1 || lower.indexOf('manager.intentpipeline.js') !== -1 || lower.indexOf('taskdefinitions.js') !== -1) {
    result.module = 'HTM Tasks (Middle)';
    result.metric = 'execution';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('scheduler.js') !== -1) {
    result.module = 'Scheduler';
    result.metric = 'calculating';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('main.js') !== -1) {
    result.module = 'Main Loop';
    result.metric = 'calculating';
    result.bucket = 'normal';
    return result;
  }
  if (
    lower.indexOf('role.') !== -1 ||
    lower.indexOf('hive.roles.js') !== -1 ||
    lower.indexOf('creep.lifecycle.js') !== -1 ||
    lower.indexOf('haulerlifecycle.js') !== -1
  ) {
    result.module = 'Creep Roles';
    result.metric = 'execution';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('manager.hivemind') !== -1 || lower.indexOf('manager.hivegaze.js') !== -1 || lower.indexOf('manager.demand.js') !== -1) {
    result.module = 'Intent Pipeline';
    result.metric = 'calculating';
    result.bucket = 'normal';
    return result;
  }
  if (lower.indexOf('roomvisual') !== -1) {
    result.module = 'Rendering Runtime';
    result.metric = 'rendering';
    result.bucket = 'normal';
    return result;
  }
  return result;
}

function collectProfilerTickBreakdown() {
  if (!Memory || !Memory.settings || Memory.settings.enableTaskProfiling === false) return;
  if (!Memory.profiler || !Memory.profiler.map) return;
  if (!Memory.stats) Memory.stats = {};
  if (!Memory.stats.profilerTickBreakdown) {
    Memory.stats.profilerTickBreakdown = { ticks: [], byTick: {} };
  }
  const store = Memory.stats.profilerTickBreakdown;
  const map = Memory.profiler.map;
  const totalTimeNow = Number(Memory.profiler.totalTime || 0);
  const prevTotalTime = Number(Memory.stats.profilerDeltaBaseTotalTime || 0);
  const lastFns = Memory.stats.profilerDeltaBaseFns || {};
  const nextFns = {};
  const tickTotalCpu = Math.max(0, totalTimeNow - prevTotalTime);
  const fnDeltas = [];
  let fnDeltaTotalCpu = 0;
  for (const fn in map) {
    const current = map[fn] || {};
    const prev = lastFns[fn] || { calls: 0, time: 0 };
    const dCalls = Number(current.calls || 0) - Number(prev.calls || 0);
    const dTime = Number(current.time || 0) - Number(prev.time || 0);
    if (dCalls > 0 && dTime > 0) {
      fnDeltas.push({ fn, cpu: dTime, calls: dCalls });
      fnDeltaTotalCpu += dTime;
    }
  }

  for (const fn in map) {
    const current = map[fn] || {};
    const subs = current.subs || {};
    const nextSubs = {};
    for (const childFn in subs) {
      nextSubs[childFn] = {
        calls: Number((subs[childFn] && subs[childFn].calls) || 0),
        time: Number((subs[childFn] && subs[childFn].time) || 0),
      };
    }
    nextFns[fn] = {
      calls: Number(current.calls || 0),
      time: Number(current.time || 0),
      subs: nextSubs,
    };
  }
  Memory.stats.profilerDeltaBaseFns = nextFns;
  Memory.stats.profilerDeltaBaseTotalTime = totalTimeNow;

  const breakdown = {
    tick: Game.time,
    tickTotalCpu: Number(tickTotalCpu.toFixed(4)),
    modules: {},
    taskExecution: {},
    overheadCpu: 0,
    unattributedCpu: 0,
    topOverhead: [],
    topUnattributed: [],
    uninstrumentedCpu: 0,
    source: 'profiler',
  };
  const addModuleCpu = (moduleName, metricName, cpu) => {
    if (!breakdown.modules[moduleName]) {
      breakdown.modules[moduleName] = {
        calculating: 0,
        rendering: 0,
        execution: 0,
        other: 0,
        total: 0,
      };
    }
    const moduleEntry = breakdown.modules[moduleName];
    if (moduleEntry[metricName] === undefined) moduleEntry[metricName] = 0;
    moduleEntry[metricName] += cpu;
    moduleEntry.total += cpu;
  };

  const scaleToTick =
    tickTotalCpu > 0 && fnDeltaTotalCpu > 0 ? tickTotalCpu / fnDeltaTotalCpu : 1;
  for (const delta of fnDeltas) {
    const cls = classifyProfilerFunction(delta.fn);
    const cpu = Number((Number(delta.cpu || 0) * scaleToTick).toFixed(8));
    if (!(cpu > 0)) continue;
    if (cls.bucket === 'overhead') {
      breakdown.overheadCpu += cpu;
      addModuleCpu('Profiler Overhead', cls.metric || 'other', cpu);
      breakdown.topOverhead.push({ fn: delta.fn, cpu: Number(cpu.toFixed(4)) });
      continue;
    }
    if (cls.bucket === 'unattributed') {
      breakdown.unattributedCpu += cpu;
      addModuleCpu('Unattributed Functions', 'other', cpu);
      breakdown.topUnattributed.push({ fn: delta.fn, cpu: Number(cpu.toFixed(4)) });
      continue;
    }
    addModuleCpu(cls.module, cls.metric, cpu);
  }

  const taskLogs = Array.isArray(Memory.stats.taskLogs) ? Memory.stats.taskLogs : [];
  const taskRows = taskLogs.filter((entry) => {
    if (!entry || entry.tick !== Game.time) return false;
    const name = String(entry.name || '');
    return name.indexOf('HTM::HTM Tasks (Middle)::') === 0 && name.indexOf('::Rendering') === -1 && name.indexOf('::Calcs') === -1;
  });
  const rawTaskTotals = {};
  let rawTaskSum = 0;
  for (const row of taskRows) {
    const name = String(row.name || '').replace('HTM::HTM Tasks (Middle)::', '');
    const cpu = Number(row.cpu || 0);
    if (!(cpu > 0)) continue;
    if (!rawTaskTotals[name]) rawTaskTotals[name] = 0;
    rawTaskTotals[name] += cpu;
    rawTaskSum += cpu;
  }
  const executionBucket =
    breakdown.modules['HTM Tasks (Middle)'] &&
    typeof breakdown.modules['HTM Tasks (Middle)'].execution === 'number'
      ? breakdown.modules['HTM Tasks (Middle)'].execution
      : 0;
  if (rawTaskSum > 0 && executionBucket > 0) {
    const scale = executionBucket / rawTaskSum;
    for (const taskName in rawTaskTotals) {
      breakdown.taskExecution[taskName] = Number((rawTaskTotals[taskName] * scale).toFixed(4));
    }
  }

  // Normalize numeric precision and build top lists.
  for (const moduleName in breakdown.modules) {
    const m = breakdown.modules[moduleName];
    m.calculating = Number(m.calculating.toFixed(4));
    m.rendering = Number(m.rendering.toFixed(4));
    m.execution = Number(m.execution.toFixed(4));
    m.other = Number(m.other.toFixed(4));
    m.total = Number(m.total.toFixed(4));
  }
  breakdown.overheadCpu = Number(breakdown.overheadCpu.toFixed(4));
  breakdown.unattributedCpu = Number(breakdown.unattributedCpu.toFixed(4));

  // Account for any residual rounding drift after normalization.
  let classifiedTotal = 0;
  for (const moduleName in breakdown.modules) {
    classifiedTotal += Number((breakdown.modules[moduleName] && breakdown.modules[moduleName].total) || 0);
  }
  const uninstrumentedCpu = Math.max(0, tickTotalCpu - classifiedTotal);
  breakdown.uninstrumentedCpu = Number(uninstrumentedCpu.toFixed(4));
  if (uninstrumentedCpu > 0.0001) {
    addModuleCpu('Uninstrumented CPU', 'other', uninstrumentedCpu);
  }

  breakdown.topOverhead.sort((a, b) => b.cpu - a.cpu);
  breakdown.topUnattributed.sort((a, b) => b.cpu - a.cpu);
  breakdown.topOverhead = breakdown.topOverhead.slice(0, 50);
  breakdown.topUnattributed = breakdown.topUnattributed.slice(0, 50);

  const key = String(Game.time);
  store.byTick[key] = breakdown;
  store.ticks.push(Game.time);
  if (store.ticks.length > 100) {
    const removed = store.ticks.shift();
    delete store.byTick[String(removed)];
  }
}

function getProfilerBreakdownForTick(tick) {
  const store = Memory.stats && Memory.stats.profilerTickBreakdown;
  if (!store || !store.byTick) return null;
  if (store.byTick[String(tick)]) return store.byTick[String(tick)];
  const ticks = Array.isArray(store.ticks) ? store.ticks : [];
  if (!ticks.length) return null;
  let candidate = null;
  for (const t of ticks) {
    if (typeof t !== 'number') continue;
    if (t <= tick && (candidate === null || t > candidate)) candidate = t;
  }
  if (candidate === null) {
    candidate = ticks[ticks.length - 1];
  }
  return store.byTick[String(candidate)] || null;
}

function buildLegacyProfilingDumpForTick(tick) {
  const logs = (Memory.stats && Array.isArray(Memory.stats.taskLogs)) ? Memory.stats.taskLogs : [];
  const modules = {};
  const ensureModule = (name) => {
    if (!modules[name]) modules[name] = { metrics: {}, tasks: {} };
    return modules[name];
  };
  const addMetric = (moduleName, metricName, cpu) => {
    const moduleEntry = ensureModule(moduleName);
    if (!moduleEntry.metrics[metricName]) moduleEntry.metrics[metricName] = 0;
    moduleEntry.metrics[metricName] += cpu;
  };
  const addTask = (moduleName, taskName, cpu) => {
    const moduleEntry = ensureModule(moduleName);
    if (!moduleEntry.tasks[taskName]) moduleEntry.tasks[taskName] = 0;
    moduleEntry.tasks[taskName] += cpu;
  };
  let tickTotal = 0;
  for (const entry of logs) {
    if (!entry || entry.tick !== tick) continue;
    const name = String(entry.name || '');
    const cpu = Number(entry.cpu || 0);
    if (!(cpu > 0) || name.indexOf('HTM::') !== 0) continue;
    const parts = name.split('::');
    if (parts.length >= 3 && parts[1] === 'Tick Total') {
      tickTotal += cpu;
      continue;
    }
    if (parts.length >= 3 && parts[1] === 'HTM Tasks (Middle)' && parts[2] !== 'Rendering' && parts[2] !== 'Calcs') {
      const taskName = parts.slice(2).join('::');
      addMetric('HTM Tasks (Middle)', 'execution', cpu);
      addTask('HTM Tasks (Middle)', taskName, cpu);
      continue;
    }
    const metricToken = parts[parts.length - 1];
    if (metricToken === 'Calcs' || metricToken === 'Rendering') {
      const modulePath = parts.slice(1, parts.length - 1);
      const moduleName = modulePath.length ? modulePath.join(' -> ') : 'Unknown';
      addMetric(moduleName, metricToken === 'Calcs' ? 'calculating' : 'rendering', cpu);
      continue;
    }
    const fallbackModule = parts.slice(1).join(' -> ') || 'Unknown';
    addMetric(fallbackModule, 'other', cpu);
  }
  const lines = [`Profiling Dump Tick ${tick}`, 'Profiler data missing - degraded taskLog dump', ''];
  const moduleNames = Object.keys(modules);
  let accounted = 0;
  for (const moduleName of moduleNames) {
    const m = modules[moduleName];
    const total =
      Number(m.metrics.calculating || 0) +
      Number(m.metrics.rendering || 0) +
      Number(m.metrics.execution || 0) +
      Number(m.metrics.other || 0);
    accounted += total;
    lines.push(`${moduleName} - ${total.toFixed(2)} CPU`);
    if (m.metrics.calculating) lines.push(`|-> Calculating ${Number(m.metrics.calculating).toFixed(2)} CPU`);
    if (m.metrics.rendering) lines.push(`|-> Rendering ${Number(m.metrics.rendering).toFixed(2)} CPU`);
    if (m.metrics.execution) lines.push(`|-> Execution ${Number(m.metrics.execution).toFixed(2)} CPU`);
    if (m.metrics.other) lines.push(`|-> Other ${Number(m.metrics.other).toFixed(2)} CPU`);
    if (moduleName === 'HTM Tasks (Middle)') {
      Object.keys(m.tasks)
        .map((taskName) => ({ taskName, cpu: m.tasks[taskName] }))
        .sort((a, b) => b.cpu - a.cpu)
        .forEach((entry2) => lines.push(`|-> Task: ${entry2.taskName} - ${entry2.cpu.toFixed(2)} CPU`));
    }
    lines.push('');
  }
  lines.splice(1, 0, `HTM - ${accounted.toFixed(2)} CPU`);
  lines.splice(2, 0, `Unaccounted - ${(tickTotal > 0 ? tickTotal - accounted : 0).toFixed(2)} CPU`);
  if (!moduleNames.length) lines.push('No HTM data');
  return lines.join('\n');
}

function buildProfilingDumpForTick(tick) {
  const lines = [`Profiling Dump Tick ${tick}`];
  lines.push('Source: Game.profiler.output (raw truth)');
  if (!Memory.settings || Memory.settings.enableScreepsProfiler !== true) {
    lines.push('Profiler not active (enable via visual.profiler(\'on\') or visual.htmOverlay(1)).');
    return lines.join('\n');
  }
  if (!Game.profiler || typeof Game.profiler.output !== 'function') {
    lines.push('Profiler API unavailable in this tick.');
    return lines.join('\n');
  }
  const outputLimit = Math.max(
    500,
    Math.min(50000, Math.floor(Number((Memory.settings && Memory.settings.profilerDumpLimit) || 5000))),
  );
  let output = '';
  try {
    output = String(Game.profiler.output(outputLimit) || '');
  } catch (err) {
    lines.push(`Profiler output failed: ${err}`);
    return lines.join('\n');
  }
  if (!output || output === 'Profiler not active.') {
    lines.push('Profiler warming up or not collecting samples yet.');
    return lines.join('\n');
  }
  lines.push(output);
  return lines.join('\n');
}

function buildProfilingExplainForTick(tick) {
  const lines = [`Profiling Explain Tick ${tick}`];
  lines.push('Mode: raw output summary');
  if (!Memory.settings || Memory.settings.enableScreepsProfiler !== true) {
    lines.push('Profiler not active (enable via visual.profiler(\'on\') or visual.htmOverlay(1)).');
    return lines.join('\n');
  }
  if (!Memory.profiler || !Memory.profiler.map) {
    lines.push('Profiler map missing. Wait 1-3 ticks after activation.');
    return lines.join('\n');
  }
  const rows = Object.keys(Memory.profiler.map)
    .filter((fn) => fn && fn !== '(tick)' && fn !== '(root)')
    .map((fn) => {
      const entry = Memory.profiler.map[fn] || {};
      const total = Number(entry.time || 0);
      const calls = Number(entry.calls || 0);
      return {
        fn,
        total,
        calls,
        avg: calls > 0 ? total / calls : 0,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
  const totalCpu = Number(Memory.profiler.totalTime || 0);
  lines.push(`Profiler Total: ${totalCpu.toFixed(2)} CPU`);
  lines.push(`Functions tracked: ${rows.length}`);
  lines.push('');
  lines.push('Top Functions');
  if (!rows.length) {
    lines.push('  (none)');
  } else {
    rows.slice(0, 20).forEach((row, idx) => {
      lines.push(
        `  ${idx + 1}. ${row.fn} - total ${row.total.toFixed(4)} CPU, avg ${row.avg.toFixed(4)} CPU, calls ${row.calls}`,
      );
    });
  }
  return lines.join('\n');
}

function ensureScreepsProfilerEnabled() {
  if (screepsProfilerReady) return true;
  try {
    if (!screepsProfiler) {
      screepsProfiler = require('./screeps.profiler');
    }
    screepsProfiler.enable();
    screepsProfilerReady = true;
    statsConsole.log('screeps-profiler hooks enabled.', 2);
    return true;
  } catch (err) {
    statsConsole.log(`screeps-profiler init failed: ${err}`, 4);
    return false;
  }
}

function registerAdditionalProfilerCode() {
  if (!screepsProfilerReady || !screepsProfiler || profilerAdditionalRegistered) return;
  try {
    const result = profilerRegistry.registerAllProfilerModules(screepsProfiler);
    profilerAdditionalRegistered = true;
    if (!Memory.stats) Memory.stats = {};
    Memory.stats.profilerRegistry = {
      registered: result && result.registered ? result.registered : 0,
      failed: result && result.failed ? result.failed.length : 0,
      total: profilerRegistry.TOTAL_MODULES || 0,
      tick: Game.time,
    };
  } catch (err) {
    statsConsole.log(`Profiler additional registration failed: ${err}`, 4);
  }
}

function normalizeProfilerModuleLabel(rawKey) {
  let key = String(rawKey || 'unknown');
  if (typeof process !== 'undefined' && process && typeof process.cwd === 'function') {
    const cwd = process.cwd();
    if (cwd && key.indexOf(cwd + '/') === 0) {
      key = key.slice(cwd.length + 1);
    }
  }
  return key;
}

function shouldSkipProfilerRegistration(moduleKey) {
  const key = String(moduleKey || '');
  if (!key) return true;
  if (key.indexOf('node_modules') !== -1) return true;
  if (key.indexOf('screeps.profiler') !== -1) return true;
  return false;
}

function registerRuntimeObjectForProfiler(name, objectRef) {
  if (!screepsProfiler || !objectRef) return;
  if (profilerRuntimeRegistry[name]) return;
  try {
    if (typeof objectRef === 'function') {
      screepsProfiler.registerFN(objectRef, `runtime:${name}`);
    } else if (typeof objectRef === 'object') {
      screepsProfiler.registerObject(objectRef, `runtime:${name}`);
    }
    profilerRuntimeRegistry[name] = true;
  } catch (err) {
    profilerRuntimeRegistry[name] = true;
    statsConsole.log(`Profiler register runtime skipped: ${name} (${err})`, 3);
  }
}

function registerLoadedModulesForProfiler() {
  if (!screepsProfiler || !screepsProfilerReady) return;
  if (typeof require === 'undefined' || !require.cache) return;
  const cache = require.cache;
  const cacheKeys = Object.keys(cache);
  const cacheSizeChanged = cacheKeys.length !== profilerLastCacheSize;
  if (cacheSizeChanged) {
    for (const moduleKey of cacheKeys) {
      if (profilerModuleRegistry[moduleKey]) continue;
      profilerModuleRegistry[moduleKey] = true;
      if (shouldSkipProfilerRegistration(moduleKey)) continue;
      const cachedModule = cache[moduleKey];
      if (!cachedModule || !('exports' in cachedModule)) continue;
      const moduleExports = cachedModule.exports;
      if (!moduleExports) continue;
      const label = normalizeProfilerModuleLabel(moduleKey);
      try {
        if (typeof moduleExports === 'function') {
          const wrapped = screepsProfiler.registerFN(moduleExports, `module:${label}`);
          if (wrapped && wrapped !== moduleExports) {
            cachedModule.exports = wrapped;
          }
        } else if (typeof moduleExports === 'object') {
          screepsProfiler.registerObject(moduleExports, `module:${label}`);
        }
      } catch (err) {
        statsConsole.log(`Profiler register module skipped: ${label} (${err})`, 3);
      }
    }
    profilerLastCacheSize = cacheKeys.length;
  }

  // Runtime objects can change independently from require.cache size.
  registerRuntimeObjectForProfiler('global.visual', global.visual);
  registerRuntimeObjectForProfiler('manager.htm', htm);
  registerRuntimeObjectForProfiler('manager.hud', hudManager);
  registerRuntimeObjectForProfiler('scheduler', scheduler);
  registerAdditionalProfilerCode();
}

function queueProfilerCommand(action, duration, filter) {
  if (!Memory.settings) Memory.settings = {};
  Memory.settings.profilerControl = {
    action: String(action || '').toLowerCase(),
    duration: typeof duration === 'number' ? duration : null,
    filter: filter ? String(filter) : null,
    tick: Game.time,
  };
}

function processProfilerControl() {
  if (!Memory.settings || !Memory.settings.profilerControl) return;
  if (!Game.profiler) return;
  const control = Memory.settings.profilerControl;
  const action = String(control.action || '').toLowerCase();
  const duration =
    typeof control.duration === 'number' && Number.isFinite(control.duration)
      ? Math.max(1, Math.floor(control.duration))
      : undefined;
  const filter = control.filter || undefined;
  try {
    if (action === 'stream') {
      Game.profiler.stream(duration, filter);
    } else if (action === 'profile') {
      Game.profiler.profile(duration, filter);
    } else if (action === 'email') {
      Game.profiler.email(duration, filter);
    } else if (action === 'callgrind') {
      Game.profiler.callgrind(duration, filter);
    } else if (action === 'background') {
      Game.profiler.background(filter);
    } else if (action === 'restart') {
      Game.profiler.restart();
    } else if (action === 'reset') {
      Game.profiler.reset();
    } else if (action === 'output') {
      const outputLimit = duration || 5000;
      console.log(Game.profiler.output(outputLimit));
    }
  } catch (err) {
    statsConsole.log(`screeps-profiler action failed (${action}): ${err}`, 4);
  }
  delete Memory.settings.profilerControl;
}

function processProfilerResetPending() {
  if (!Memory.settings || !Memory.settings.profilerResetPending) return;
  let resetViaApi = false;
  if (Game.profiler && typeof Game.profiler.reset === 'function') {
    try {
      Game.profiler.reset();
      resetViaApi = true;
    } catch (err) {
      statsConsole.log(`screeps-profiler reset failed: ${err}`, 4);
    }
  }
  if (!resetViaApi && Memory.profiler) {
    Memory.profiler = null;
  }
  Memory.settings.profilerResetPending = false;
}

function ensureMemHackState() {
  if (!global.__memHack || typeof global.__memHack !== 'object') {
    global.__memHack = {
      enabled: true,
      parsed: global.Memory || null,
      raw: null,
      tick: 0,
      lastRawBytes: 0,
      hits: 0,
      misses: 0,
      lastMode: 'cold',
      lastError: '',
      lastAppliedTick: 0,
    };
  }
  return global.__memHack;
}

function primeMemHackForTick() {
  const state = ensureMemHackState();
  if (typeof RawMemory === 'undefined') {
    state.lastMode = 'unsupported';
    state.enabled = false;
    return state;
  }
  try {
    // Classic memhack: reuse previously parsed Memory only on consecutive ticks.
    if (state.enabled !== false && state.parsed && state.tick === Game.time - 1) {
      delete global.Memory;
      global.Memory = state.parsed;
      state.hits += 1;
      state.lastMode = 'hit';
      state.lastAppliedTick = Game.time;
    } else {
      state.misses += 1;
      state.lastMode = 'miss';
    }
  } catch (err) {
    state.lastMode = 'error';
    state.lastError = err && err.toString ? err.toString() : String(err);
  }
  return state;
}

function finalizeMemHackForTick() {
  const state = ensureMemHackState();
  const enabledSetting =
    Memory && Memory.settings ? Memory.settings.enableMemHack !== false : true;
  state.enabled = enabledSetting;
  if (!enabledSetting) {
    state.lastMode = state.lastMode === 'unsupported' ? state.lastMode : 'disabled';
    return;
  }
  try {
    if (
      typeof RawMemory !== 'undefined' &&
      typeof RawMemory.get === 'function' &&
      (Game.time % 25 === 0 || !state.lastRawBytes)
    ) {
      const raw = RawMemory.get();
      state.raw = raw;
      state.lastRawBytes = raw ? raw.length : state.lastRawBytes;
    }
    state.parsed = global.Memory || Memory || null;
    state.tick = Game.time;
  } catch (err) {
    state.lastMode = 'error';
    state.lastError = err && err.toString ? err.toString() : String(err);
  }
}

function recordLoopEnvelope(loopStartCpu = 0) {
  if (typeof Game === 'undefined' || !Game.cpu || typeof Game.cpu.getUsed !== 'function') return;
  const fullLoopCpu = Math.max(0, Number(Game.cpu.getUsed() || 0) - Number(loopStartCpu || 0));
  if (!Memory.stats) Memory.stats = {};
  Memory.stats.runtime = Memory.stats.runtime || {};
  Memory.stats.runtime.fullLoopCpu = Number(fullLoopCpu.toFixed(4));
  Memory.stats.runtime.fullLoopTick = Number(Game.time || 0);
  if (Memory.stats.tickPipeline && Memory.stats.tickPipeline.byTick) {
    const key = String(Game.time);
    const byTick = Memory.stats.tickPipeline.byTick[key];
    if (byTick && typeof byTick === 'object') {
      byTick.fullLoopCpu = Number(fullLoopCpu.toFixed(4));
      const totalCpu = Number(byTick.totalCpu || 0);
      byTick.postCommitCpu = Number(Math.max(0, fullLoopCpu - totalCpu).toFixed(4));
    }
  }
}

global.visual = {
  DT: function (toggle) {
    if (toggle === 1) {
      visualizeDT = true;
      statsConsole.log("Distance Transform Visualization: ON", 2);
    } else if (toggle === 0) {
      visualizeDT = false;
      statsConsole.log("Distance Transform Visualization: OFF", 2);
    } else {
      statsConsole.log("Usage: visual.DT(1) to show, visual.DT(0) to hide", 3);
    }
  },
  overlay: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.overlayMode = 'normal';
      Memory.settings.alwaysShowHud = true;
      Memory.settings.enableVisuals = true;
      syncOverlayModeSettings();
      statsConsole.log("HUD visuals: ON", 2);
    } else if (toggle === 0) {
      Memory.settings.overlayMode = 'off';
      syncOverlayModeSettings();
      statsConsole.log("HUD visuals: OFF", 2);
    } else {
      statsConsole.log(
        "Usage: visual.overlay(1) to show, visual.overlay(0) to hide",
        3,
      );
    }
  },
  spawnQueue: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.alwaysShowHud = true;
      Memory.settings.showSpawnQueueHud = true;
      statsConsole.log("Spawn queue HUD: ON", 2);
    } else if (toggle === 0) {
      if (Memory.settings.alwaysShowHud) {
        Memory.settings.alwaysShowHud = false;
      }
      Memory.settings.showSpawnQueueHud = false;
      statsConsole.log("Spawn queue HUD: OFF", 2);
    } else {
      statsConsole.log(
        "Usage: visual.spawnQueue(1) to show, visual.spawnQueue(0) to hide",
        3,
      );
    }
  },
  hudAll: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 0) {
      Memory.settings.overlayMode = 'off';
      syncOverlayModeSettings();
      statsConsole.log("All HUD/overlay visuals: OFF", 2);
      return;
    }
    if (toggle === 1) {
      Memory.settings.overlayMode = 'normal';
      Memory.settings.enableVisuals = true;
      Memory.settings.alwaysShowHud = true;
      Memory.settings.showSpawnQueueHud = true;
      Memory.settings.showHtmOverlay = true;
      if (Memory.settings.layoutPlanningMode === 'theoretical') {
        Memory.settings.showLayoutOverlay = true;
      }
      syncOverlayModeSettings();
      statsConsole.log("All HUD/overlay visuals: ON", 2);
      return;
    }
    statsConsole.log("Usage: visual.hudAll(1) to enable, visual.hudAll(0) to disable", 3);
  },
  overlayMode: function (mode) {
    if (!Memory.settings) Memory.settings = {};
    if (mode === undefined || mode === null || mode === '') {
      const current = String(Memory.settings.overlayMode || 'normal').toLowerCase();
      statsConsole.log(`Overlay mode: ${current.toUpperCase()}`, 2);
      return;
    }
    const normalized = String(mode || '').toLowerCase();
    if (normalized !== 'off' && normalized !== 'normal' && normalized !== 'debug') {
      statsConsole.log("Usage: visual.overlayMode('off'|'normal'|'debug')", 3);
      return;
    }
    Memory.settings.overlayMode = normalized;
    if (normalized === 'normal') {
      if (Memory.settings.enableVisuals === false) Memory.settings.enableVisuals = true;
      if (Memory.settings.alwaysShowHud === false) Memory.settings.alwaysShowHud = true;
      if (Memory.settings.showSpawnQueueHud === false) Memory.settings.showSpawnQueueHud = true;
    }
    syncOverlayModeSettings();
    statsConsole.log(`Overlay mode: ${normalized.toUpperCase()}`, 2);
  },
  baseBuilder: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.enableBaseBuilderPlanning = true;
      Memory.settings.showLayoutOverlay = true;
      statsConsole.log("Base builder planning: ON", 2);
    } else if (toggle === 0) {
      Memory.settings.enableBaseBuilderPlanning = false;
      Memory.settings.showLayoutOverlay = false;
      statsConsole.log("Base builder planning: OFF", 2);
    } else {
      statsConsole.log(
        "Usage: visual.baseBuilder(1) to enable, visual.baseBuilder(0) to disable",
        3,
      );
    }
  },
  rescanRooms(force = true) {
    if (!Memory.hive) Memory.hive = {};
    Memory.hive.scoutRescanRequested = Boolean(force);
    statsConsole.log(
      force
        ? 'Scout rescan requested.'
        : 'Scout rescan flag cleared.',
      2,
    );
  },
  buildPreview: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.buildPreviewOnly = true;
      Memory.settings.pauseBot = false;
      Memory.settings.enableVisuals = true;
      Memory.settings.alwaysShowHud = true;
      Memory.settings.showLayoutOverlay = true;
      statsConsole.log("Build preview mode: ON", 2);
    } else if (toggle === 0) {
      Memory.settings.buildPreviewOnly = false;
      statsConsole.log("Build preview mode: OFF", 2);
    } else {
      statsConsole.log(
        "Usage: visual.buildPreview(1) to enable, visual.buildPreview(0) to disable",
        3,
      );
    }
  },
  layoutLegend: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.showLayoutLegend = true;
      statsConsole.log("Layout legend: ON", 2);
    } else if (toggle === 0) {
      Memory.settings.showLayoutLegend = false;
      statsConsole.log("Layout legend: OFF", 2);
    } else {
      statsConsole.log(
        "Usage: visual.layoutLegend(1) to show, visual.layoutLegend(0) to hide",
        3,
      );
    }
  },
  hudCalcCache: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.enableHudCalcCache = true;
      statsConsole.log("HUD calc cache: ON", 2);
      return;
    }
    if (toggle === 0) {
      Memory.settings.enableHudCalcCache = false;
      statsConsole.log("HUD calc cache: OFF", 2);
      return;
    }
    statsConsole.log(
      "Usage: visual.hudCalcCache(1) to enable, visual.hudCalcCache(0) to disable",
      3,
    );
  },
  roadRclLabels: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.showRoadRclLabels = true;
      statsConsole.log("Road RCL labels: ON", 2);
      return;
    }
    if (toggle === 0) {
      Memory.settings.showRoadRclLabels = false;
      statsConsole.log("Road RCL labels: OFF", 2);
      return;
    }
    statsConsole.log(
      "Usage: visual.roadRclLabels(1) to show, visual.roadRclLabels(0) to hide",
      3,
    );
  },
  htmOverlay: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      if ((Memory.settings.overlayMode || 'normal') === 'off') {
        Memory.settings.overlayMode = 'normal';
      }
      Memory.settings.showHtmOverlay = true;
      if (Memory.settings.enableScreepsProfiler !== true) {
        Memory.settings.enableScreepsProfiler = true;
        Memory.settings.profilerEnabledByOverlay = true;
      }
      Memory.settings.profilerOverlayMode = Memory.settings.profilerOverlayMode || 'global';
      queueProfilerCommand('background', null, Memory.settings.profilerOverlayFilter || null);
      statsConsole.log("HTM overlay: ON", 2);
    } else if (toggle === 0) {
      Memory.settings.showHtmOverlay = false;
      if ((Memory.settings.overlayMode || 'normal') === 'debug') {
        Memory.settings.overlayMode = 'normal';
      }
      if (Memory.settings.profilerEnabledByOverlay) {
        Memory.settings.profilerEnabledByOverlay = false;
        Memory.settings.enableScreepsProfiler = false;
        Memory.settings.profilerResetPending = true;
        delete Memory.settings.profilerControl;
      }
      statsConsole.log("HTM overlay: OFF", 2);
    } else {
      statsConsole.log(
        "Usage: visual.htmOverlay(1) to show, visual.htmOverlay(0) to hide",
        3,
      );
    }
  },
  profiler: function (mode = 'status', duration = 100, filter) {
    if (!Memory.settings) Memory.settings = {};
    const action = String(mode || '').toLowerCase();
    if (action === 'on' || action === 'enable' || action === '1') {
      Memory.settings.enableScreepsProfiler = true;
      Memory.settings.profilerEnabledByOverlay = false;
      statsConsole.log('screeps-profiler: ENABLED (wrap active next tick).', 2);
      return;
    }
    if (action === 'off' || action === 'disable' || action === '0') {
      Memory.settings.enableScreepsProfiler = false;
      Memory.settings.profilerEnabledByOverlay = false;
      delete Memory.settings.profilerControl;
      Memory.settings.profilerResetPending = true;
      statsConsole.log('screeps-profiler: DISABLED.', 2);
      return;
    }
    if (action === 'status') {
      const enabled = Boolean(Memory.settings.enableScreepsProfiler);
      const active = Boolean(Memory.profiler && Memory.profiler.enabledTick);
      const type = Memory.profiler && Memory.profiler.type ? Memory.profiler.type : 'none';
      statsConsole.log(`screeps-profiler status: enabled=${enabled} active=${active} type=${type}`, 2);
      return;
    }
    const allowed = ['stream', 'profile', 'email', 'callgrind', 'background', 'restart', 'reset', 'output'];
    if (!allowed.includes(action)) {
      statsConsole.log(
        "Usage: visual.profiler('on'|'off'|'status'|'stream'|'profile'|'output'|'reset'|'restart'|'background'|'email'|'callgrind', duration?, filter?)",
        3,
      );
      return;
    }
    Memory.settings.enableScreepsProfiler = true;
    queueProfilerCommand(action, duration, filter);
    statsConsole.log(`screeps-profiler queued: ${action}.`, 2);
  },
  profilerCoverage: function () {
    const cacheSize =
      typeof require !== 'undefined' && require.cache ? Object.keys(require.cache).length : 0;
    const registeredModules = Object.keys(profilerModuleRegistry).length;
    const registeredRuntime = Object.keys(profilerRuntimeRegistry).length;
    const enabled = Boolean(Memory.settings && Memory.settings.enableScreepsProfiler);
    const active = Boolean(Memory.profiler && Memory.profiler.enabledTick);
    statsConsole.log(
      `Profiler coverage: enabled=${enabled} active=${active} modules=${registeredModules}/${cacheSize} runtime=${registeredRuntime}`,
      2,
    );
  },
  profilerOverlayLimit: function (limit = 20) {
    if (!Memory.settings) Memory.settings = {};
    const parsed = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
    Memory.settings.profilerOverlayLimit = parsed;
    statsConsole.log(`Profiler overlay limit: ${parsed}`, 2);
  },
  profilerOverlayFilter: function (filter = '') {
    if (!Memory.settings) Memory.settings = {};
    const normalized = filter ? String(filter) : '';
    Memory.settings.profilerOverlayFilter = normalized;
    Memory.settings.profilerOverlayMode = normalized ? 'drilldown' : 'global';
    if (Memory.settings.showHtmOverlay) {
      Memory.settings.enableScreepsProfiler = true;
      queueProfilerCommand('background', null, normalized || null);
    }
    statsConsole.log(
      normalized
        ? `Profiler overlay filter: ${normalized}`
        : 'Profiler overlay filter cleared (global)',
      2,
    );
  },
  profilerOverlayMode: function (mode = 'global') {
    if (!Memory.settings) Memory.settings = {};
    const normalized = String(mode || 'global').toLowerCase();
    if (!['global', 'drilldown'].includes(normalized)) {
      statsConsole.log("Usage: visual.profilerOverlayMode('global'|'drilldown')", 3);
      return;
    }
    Memory.settings.profilerOverlayMode = normalized;
    const filter = normalized === 'drilldown' ? (Memory.settings.profilerOverlayFilter || null) : null;
    if (Memory.settings.showHtmOverlay) {
      Memory.settings.enableScreepsProfiler = true;
      queueProfilerCommand('background', null, filter);
    }
    statsConsole.log(`Profiler overlay mode: ${normalized}`, 2);
  },
  taskProfiling: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.enableTaskProfiling = true;
      statsConsole.log('Scheduler/HTM task profiling: ON', 2);
      return;
    }
    if (toggle === 0) {
      Memory.settings.enableTaskProfiling = false;
      statsConsole.log('Scheduler/HTM task profiling: OFF', 2);
      return;
    }
    statsConsole.log("Usage: visual.taskProfiling(1) to enable, visual.taskProfiling(0) to disable", 3);
  },
  memHack: function (toggle = 'status') {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1 || toggle === '1' || toggle === 'on') {
      Memory.settings.enableMemHack = true;
      statsConsole.log('MemHack: ON', 2);
      return true;
    }
    if (toggle === 0 || toggle === '0' || toggle === 'off') {
      Memory.settings.enableMemHack = false;
      statsConsole.log('MemHack: OFF', 2);
      return false;
    }
    if (toggle === 'status') {
      const state = ensureMemHackState();
      const payload = {
        enabled: Boolean(Memory.settings.enableMemHack !== false),
        mode: state.lastMode || 'unknown',
        lastRawBytes: Number(state.lastRawBytes || 0),
        hits: Number(state.hits || 0),
        misses: Number(state.misses || 0),
        lastAppliedTick: Number(state.lastAppliedTick || 0),
        lastError: state.lastError || '',
      };
      statsConsole.log(
        `MemHack status: enabled=${payload.enabled} mode=${payload.mode} bytes=${payload.lastRawBytes} hits=${payload.hits} misses=${payload.misses}`,
        2,
      );
      return payload;
    }
    statsConsole.log("Usage: visual.memHack(1|0|'status')", 3);
    return null;
  },
  memTrimNow: function (roomName = null) {
    const roomNames = roomName
      ? [String(roomName)]
      : Object.keys(Memory.rooms || {});
    const results = [];
    for (const rn of roomNames) {
      const summary = layoutPlanner._pruneTheoreticalMemory(rn, { reason: 'manual-trim' });
      if (summary) results.push(summary);
    }
    const totals = results.reduce(
      (acc, row) => {
        acc.rooms += 1;
        acc.removedCandidates += Number(row.removedCandidates || 0);
        acc.removedCandidatePlans += Number(row.removedCandidatePlans || 0);
        acc.removedPipelineResults += Number(row.removedPipelineResults || 0);
        acc.removedPipelineRuns += Number(row.removedPipelineRuns || 0);
        return acc;
      },
      { rooms: 0, removedCandidates: 0, removedCandidatePlans: 0, removedPipelineResults: 0, removedPipelineRuns: 0 },
    );
    const removedTotal =
      totals.removedCandidates +
      totals.removedCandidatePlans +
      totals.removedPipelineResults +
      totals.removedPipelineRuns;
    if (!Memory.stats) Memory.stats = {};
    Memory.stats.memTrimLast = Object.assign({ tick: Game.time, removedTotal }, totals);
    statsConsole.log(`MemTrim: rooms=${totals.rooms} removed=${removedTotal}`, 2);
    return { totals, results };
  },
  memoryFootprint: function (roomName = null) {
    const rawBytes =
      typeof RawMemory !== 'undefined' && typeof RawMemory.get === 'function'
        ? Number((RawMemory.get() || '').length)
        : 0;
    const roomNames = roomName
      ? [String(roomName)]
      : Object.keys(Memory.rooms || {});
    const rooms = [];
    for (const rn of roomNames) {
      const roomMem = Memory.rooms && Memory.rooms[rn] ? Memory.rooms[rn] : null;
      const layout = roomMem && roomMem.layout ? roomMem.layout : null;
      if (!layout) continue;
      const theoretical = layout.theoretical || {};
      const candidateCount = Array.isArray(theoretical.candidates) ? theoretical.candidates.length : 0;
      const candidatePlans = layout.theoreticalCandidatePlans || {};
      const candidatePlanCount = Object.keys(candidatePlans).length;
      const pipelineRuns = layout.pipelineRuns || {};
      const pipelineRunCount = Object.keys(pipelineRuns).length;
      rooms.push({
        room: rn,
        candidateCount,
        candidatePlanCount,
        pipelineRunCount,
        planningStatus:
          layout.theoreticalPipeline && layout.theoreticalPipeline.status
            ? layout.theoreticalPipeline.status
            : null,
      });
    }
    const payload = {
      rawMemoryBytes: rawBytes,
      roomCount: rooms.length,
      rooms,
    };
    statsConsole.log(
      `Memory footprint: bytes=${rawBytes} rooms=${rooms.length}`,
      2,
    );
    return payload;
  },
  memorySweep: function (mode = 'ownedOnly') {
    const normalized = String(mode || 'ownedOnly').toLowerCase();
    if (!['ownedonly', 'hard', 'statsonly'].includes(normalized)) {
      statsConsole.log("Usage: visual.memorySweep('ownedOnly'|'hard'|'statsOnly')", 3);
      return null;
    }
    const summary = performMemorySweep(normalized);
    const delta = Number(summary.beforeRawBytes || 0) - Number(summary.afterRawBytes || 0);
    statsConsole.log(
      `MemorySweep(${normalized}): roomsRemoved=${summary.removedRooms} logsTrim=${summary.trimmedLogs} taskLogsTrim=${summary.trimmedTaskLogs} bytesDelta=${delta}`,
      2,
    );
    return summary;
  },
  idleGating: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.enableIdleGating = true;
      statsConsole.log('Idle gating: ON', 2);
      return;
    }
    if (toggle === 0) {
      Memory.settings.enableIdleGating = false;
      statsConsole.log('Idle gating: OFF', 2);
      return;
    }
    statsConsole.log("Usage: visual.idleGating(1|0)", 3);
  },
  planningHeartbeat: function (toggle = 1, ticks = null) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.enablePlanningHeartbeat = true;
      if (ticks !== null && Number.isFinite(Number(ticks))) {
        Memory.settings.planningHeartbeatTicks = Math.max(10, Math.floor(Number(ticks)));
      }
      statsConsole.log(`Planning heartbeat: ON (${Memory.settings.planningHeartbeatTicks || 50} ticks)`, 2);
      return;
    }
    if (toggle === 0) {
      Memory.settings.enablePlanningHeartbeat = false;
      statsConsole.log('Planning heartbeat: OFF', 2);
      return;
    }
    statsConsole.log("Usage: visual.planningHeartbeat(1|0, ticks?)", 3);
  },
  cpuPolicy: function (policy = 'aggressive') {
    if (!Memory.settings) Memory.settings = {};
    const normalized = String(policy || '').toLowerCase();
    if (!Memory.settings.cpu || typeof Memory.settings.cpu !== 'object') Memory.settings.cpu = {};
    if (!Memory.settings.cpu.stopAt || typeof Memory.settings.cpu.stopAt !== 'object') Memory.settings.cpu.stopAt = {};
    if (!Memory.settings.cpu.throttleAt || typeof Memory.settings.cpu.throttleAt !== 'object') Memory.settings.cpu.throttleAt = {};
    if (normalized === 'aggressive') {
      Memory.settings.cpu.stopAt = { critical: 500, realtime: 2000, background: 4000, burstOnly: 8000 };
      Memory.settings.cpu.throttleAt = { critical: 1000, realtime: 4000, background: 7000, burstOnly: 9000 };
      Memory.settings.cpu.emergencyBrakeRatio = 0.85;
      Memory.settings.enableIdleGating = true;
      Memory.settings.enablePlanningHeartbeat = true;
      Memory.settings.planningHeartbeatTicks = 50;
      Memory.settings.idleStatsIntervalTicks = 5;
      Memory.settings.idleSnapshotIntervalTicks = 10;
      Memory.settings.criticalCheckIntervalTicks = 10;
      statsConsole.log('CPU policy set: AGGRESSIVE', 2);
      return;
    }
    if (normalized === 'balanced') {
      Memory.settings.cpu.stopAt = { critical: 500, realtime: 1500, background: 3000, burstOnly: 7000 };
      Memory.settings.cpu.throttleAt = { critical: 1000, realtime: 3500, background: 6500, burstOnly: 8500 };
      Memory.settings.cpu.emergencyBrakeRatio = 0.88;
      Memory.settings.enableIdleGating = true;
      Memory.settings.enablePlanningHeartbeat = true;
      Memory.settings.planningHeartbeatTicks = 25;
      Memory.settings.idleStatsIntervalTicks = 3;
      Memory.settings.idleSnapshotIntervalTicks = 5;
      Memory.settings.criticalCheckIntervalTicks = 7;
      statsConsole.log('CPU policy set: BALANCED', 2);
      return;
    }
    if (normalized === 'conservative') {
      Memory.settings.cpu.stopAt = { critical: 300, realtime: 800, background: 1500, burstOnly: 5000 };
      Memory.settings.cpu.throttleAt = { critical: 700, realtime: 2000, background: 4500, burstOnly: 7500 };
      Memory.settings.cpu.emergencyBrakeRatio = 0.92;
      Memory.settings.enableIdleGating = false;
      Memory.settings.enablePlanningHeartbeat = true;
      Memory.settings.planningHeartbeatTicks = 20;
      Memory.settings.idleStatsIntervalTicks = 1;
      Memory.settings.idleSnapshotIntervalTicks = 3;
      Memory.settings.criticalCheckIntervalTicks = 5;
      statsConsole.log('CPU policy set: CONSERVATIVE', 2);
      return;
    }
    statsConsole.log("Usage: visual.cpuPolicy('aggressive'|'balanced'|'conservative')", 3);
  },
  runtimeExplain: function () {
    const runtime = Memory.stats && Memory.stats.runtime ? Memory.stats.runtime : null;
    if (!runtime) {
      statsConsole.log('Runtime explain: no runtime stats available yet.', 3);
      return null;
    }
    const line = `Runtime ${runtime.state || 'unknown'} (reason=${runtime.reason || 'n/a'}, forcePlanning=${runtime.forcePlanningTick ? 1 : 0}, nextHeartbeat=${runtime.nextPlanningHeartbeatTick || 0}, total=${Number(runtime.fullLoopCpu || 0).toFixed(3)}, internal=${Number((Memory.stats && Memory.stats.tickPipeline && Memory.stats.tickPipeline.byTick && Memory.stats.tickPipeline.byTick[String(Game.time)] && Memory.stats.tickPipeline.byTick[String(Game.time)].totalCpu) || 0).toFixed(3)})`;
    statsConsole.log(line, 2);
    return runtime;
  },
  profilingDump: function (tick) {
    const targetTick =
      typeof tick === 'number' && Number.isFinite(tick) ? Math.floor(tick) : Game.time - 1;
    console.log(buildProfilingDumpForTick(targetTick));
  },
  profilingExplain: function (tick) {
    const targetTick =
      typeof tick === 'number' && Number.isFinite(tick) ? Math.floor(tick) : Game.time - 1;
    console.log(buildProfilingExplainForTick(targetTick));
  },
  htmLastLog: function (count = 1, tick = null) {
    const logs = Memory.stats && Array.isArray(Memory.stats.taskLogs) ? Memory.stats.taskLogs : [];
    const limit = Math.max(1, Math.floor(Number(count) || 1));
    const hasTick = typeof tick === 'number' && Number.isFinite(tick);
    const targetTick = hasTick ? Math.floor(tick) : null;
    const filtered = logs.filter((entry) => {
      if (!entry) return false;
      if (targetTick !== null && entry.tick !== targetTick) return false;
      const name = String(entry.name || '');
      return name.indexOf('HTM::') === 0;
    });
    if (!filtered.length) {
      const suffix = targetTick !== null ? ` for tick ${targetTick}` : '';
      statsConsole.log(`No HTM logs found${suffix}.`, 3);
      return;
    }
    const selected = filtered.slice(-limit);
    const lines = [`HTM Logs (${selected.length}/${filtered.length})`];
    for (const entry of selected) {
      const cpu = Number(entry.cpu || 0);
      const cpuText = Number.isFinite(cpu) ? cpu.toFixed(4) : '0.0000';
      const parts = [
        `tick=${entry.tick}`,
        `cpu=${cpuText}`,
        `name=${entry.name || 'HTM::unknown'}`,
      ];
      if (entry.result) parts.push(`result=${entry.result}`);
      if (entry.reason) parts.push(`reason=${entry.reason}`);
      if (entry.id) parts.push(`id=${entry.id}`);
      lines.push(parts.join('  '));
    }
    console.log(lines.join('\n'));
  },
  layoutMode: function (mode = 'standard') {
    if (!Memory.settings) Memory.settings = {};
    const normalized = String(mode || '').toLowerCase();
    const allowed = ['standard', 'theoretical'];
    if (!allowed.includes(normalized)) {
      statsConsole.log(
        "Usage: visual.layoutMode('standard'|'theoretical')",
        3,
      );
      return;
    }
    Memory.settings.layoutPlanningMode = normalized;
    if (normalized === 'theoretical') {
      Memory.settings.showLayoutOverlay = true;
      Memory.settings.enableBaseBuilderPlanning = true;
    }
    statsConsole.log(`Layout planning mode: ${normalized.toUpperCase()}`, 2);
  },
  layoutView: function (view = 'plan') {
    if (!Memory.settings) Memory.settings = {};
    const normalized = String(view || '').toLowerCase();
    const allowed = [
      'plan',
      'walldistance',
      'controllerdistance',
      'flood',
      'flooddepth',
      'spawnscore',
      'candidates',
      'evaluation',
    ];
    if (!allowed.includes(normalized)) {
      statsConsole.log(
        "Usage: visual.layoutView('plan'|'wallDistance'|'controllerDistance'|'flood'|'floodDepth'|'spawnScore'|'candidates'|'evaluation')",
        3,
      );
      return;
    }
    Memory.settings.layoutOverlayView = normalized;
    Memory.settings.showLayoutOverlay = true;
    statsConsole.log(`Layout overlay view: ${normalized}`, 2);
  },
  layoutCandidate: function (candidate = 'selected') {
    if (!Memory.settings) Memory.settings = {};
    if (candidate === 'selected' || candidate === 'best' || candidate === -1) {
      Memory.settings.layoutCandidateOverlayIndex = -1;
      const ownedRooms = Object.values(Game.rooms || {}).filter(
        (room) => room && room.controller && room.controller.my,
      );
      for (const room of ownedRooms) {
        intentPipeline.queueOverlayRefresh(room.name, 'layout-candidate-selected');
      }
      statsConsole.log('Layout candidate overlay: selected winner', 2);
      return;
    }

    const parsed = Number(candidate);
    if (!Number.isFinite(parsed) || parsed < 1) {
      statsConsole.log(
        "Usage: visual.layoutCandidate('selected') or visual.layoutCandidate(<index>=1..N)",
        3,
      );
      return;
    }

    const resolvedIndex = Math.floor(parsed) - 1;
    Memory.settings.layoutCandidateOverlayIndex = resolvedIndex;
    Memory.settings.showLayoutOverlay = true;
    const ownedRooms = Object.values(Game.rooms || {}).filter(
      (room) => room && room.controller && room.controller.my,
    );
    for (const room of ownedRooms) {
      intentPipeline.queueOverlayRefresh(room.name, 'layout-candidate-command');
    }
    statsConsole.log(
      `Layout candidate overlay index: ${resolvedIndex + 1}`,
      2,
    );
  },
  layoutHudOffset: function (value = null) {
    if (!Memory.settings) Memory.settings = {};
    if (value === null || value === undefined || value === 'status') {
      const current =
        typeof Memory.settings.layoutPlanningHudYOffset === 'number'
          ? Number(Memory.settings.layoutPlanningHudYOffset)
          : 3.2;
      statsConsole.log(`Layout planning HUD Y offset: ${current.toFixed(1)}`, 2);
      return current;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      statsConsole.log("Usage: visual.layoutHudOffset(<number>|'status')", 3);
      return null;
    }
    const clamped = Math.max(0, Math.min(20, parsed));
    Memory.settings.layoutPlanningHudYOffset = clamped;
    statsConsole.log(`Layout planning HUD Y offset set to ${clamped.toFixed(1)}`, 2);
    return clamped;
  },
  layoutBatching: function (mode = 'dynamic', perTick = null, maxPerTick = null) {
    if (!Memory.settings) Memory.settings = {};
    const normalized = String(mode || '').toLowerCase();
    if (!['dynamic', 'static'].includes(normalized)) {
      statsConsole.log(
        "Usage: visual.layoutBatching('dynamic'|'static', perTick?, maxPerTick?)",
        3,
      );
      return;
    }
    Memory.settings.layoutPlanningDynamicBatching = normalized === 'dynamic';
    if (perTick !== null && Number.isFinite(Number(perTick))) {
      Memory.settings.layoutPlanningCandidatesPerTick = Math.max(1, Math.floor(Number(perTick)));
    }
    if (maxPerTick !== null && Number.isFinite(Number(maxPerTick))) {
      Memory.settings.layoutPlanningMaxCandidatesPerTick = Math.max(
        Memory.settings.layoutPlanningCandidatesPerTick || 1,
        Math.floor(Number(maxPerTick)),
      );
    }
    statsConsole.log(
      `Layout batching: ${normalized.toUpperCase()} (base=${Memory.settings.layoutPlanningCandidatesPerTick}, max=${Memory.settings.layoutPlanningMaxCandidatesPerTick})`,
      2,
    );
  },
  layoutRefinement: function (toggle = 'status') {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 'status') {
      const enabled = Memory.settings.layoutRefinementEnabled !== false;
      const topSeeds = Number(Memory.settings.layoutRefinementTopSeeds || 2);
      const generations = Number(Memory.settings.layoutRefinementMaxGenerations || 8);
      const variants = Number(Memory.settings.layoutRefinementVariantsPerGeneration || 4);
      const minBucket = Number(Memory.settings.layoutRefinementMinBucket || 3500);
      const line = `Layout refinement: ${enabled ? 'ON' : 'OFF'} (top=${topSeeds}, generations=${generations}, variants=${variants}, minBucket=${minBucket})`;
      statsConsole.log(line, 2);
      return line;
    }
    if (toggle === 1 || toggle === true) {
      Memory.settings.layoutRefinementEnabled = true;
      statsConsole.log('Layout refinement: ON', 2);
      return true;
    }
    if (toggle === 0 || toggle === false) {
      Memory.settings.layoutRefinementEnabled = false;
      statsConsole.log('Layout refinement: OFF', 2);
      return false;
    }
    statsConsole.log("Usage: visual.layoutRefinement(1|0|'status')", 3);
    return null;
  },
  layoutRefinementBudget: function (generations = 8, variants = 4, minBucket = 3500) {
    if (!Memory.settings) Memory.settings = {};
    const g = Math.max(1, Math.min(50, Math.floor(Number(generations) || 8)));
    const v = Math.max(1, Math.min(10, Math.floor(Number(variants) || 4)));
    const b = Math.max(0, Math.min(10000, Math.floor(Number(minBucket) || 3500)));
    Memory.settings.layoutRefinementMaxGenerations = g;
    Memory.settings.layoutRefinementVariantsPerGeneration = v;
    Memory.settings.layoutRefinementMinBucket = b;
    statsConsole.log(`Layout refinement budget: generations=${g}, variants=${v}, minBucket=${b}`, 2);
    return { generations: g, variants: v, minBucket: b };
  },

  layoutPhaseWindow: function (from = 1, to = 10) {
    if (!Memory.settings) Memory.settings = {};
    const f = Math.max(1, Math.min(10, Math.floor(Number(from) || 1)));
    const t = Math.max(1, Math.min(10, Math.floor(Number(to) || 10)));
    Memory.settings.layoutPlanningDebugPhaseFrom = Math.min(f, t);
    Memory.settings.layoutPlanningDebugPhaseTo = Math.max(f, t);
    statsConsole.log(
      `Layout debug phase window: ${Memory.settings.layoutPlanningDebugPhaseFrom}..${Memory.settings.layoutPlanningDebugPhaseTo}`,
      2,
    );
  },
  layoutRecalcScope: function (scope = 'all') {
    if (!Memory.settings) Memory.settings = {};
    const normalized = String(scope || 'all').toLowerCase();
    const allowed = ['all', 'foundation', 'placement', 'evaluation', 'persist'];
    if (!allowed.includes(normalized)) {
      statsConsole.log(
        "Usage: visual.layoutRecalcScope('all'|'foundation'|'placement'|'evaluation'|'persist')",
        3,
      );
      return;
    }
    Memory.settings.layoutPlanningRecalcScope = normalized;
    statsConsole.log(`Layout recalc scope: ${normalized.toUpperCase()}`, 2);
  },

  layoutManualMode: function (toggle = 1) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1 || toggle === true) {
      Memory.settings.layoutPlanningManualMode = true;
      Memory.settings.layoutPlanningMode = 'theoretical';
      Memory.settings.showLayoutOverlay = true;
      statsConsole.log('Layout manual planner mode: ON (waits for explicit phase initialization)', 2);
      return;
    }
    if (toggle === 0 || toggle === false) {
      Memory.settings.layoutPlanningManualMode = false;
      statsConsole.log('Layout manual planner mode: OFF (automatic theoretical planning resumes)', 2);
      return;
    }
    statsConsole.log('Usage: visual.layoutManualMode(1|0)', 3);
  },

  layoutInitializePhase: function (roomName = null, phaseTo = 4, phaseFrom = 1) {
    const ownedRooms = Object.values(Game.rooms || {}).filter(
      (room) => room && room.controller && room.controller.my,
    );
    const targetName = roomName || (ownedRooms[0] && ownedRooms[0].name) || null;
    if (!targetName || !Game.rooms[targetName]) {
      statsConsole.log("Usage: visual.layoutInitializePhase('W1N1', <phaseTo:1..6>, <phaseFrom:1..6>)", 3);
      return false;
    }
    const to = Math.max(1, Math.min(6, Math.floor(Number(phaseTo) || 4)));
    const from = Math.max(1, Math.min(6, Math.floor(Number(phaseFrom) || 1)));
    const ok = layoutPlanner.initializeManualPhaseRun(targetName, to, from);
    if (!ok) {
      statsConsole.log(`Manual phase initialization failed for ${targetName}`, 4);
      return false;
    }
    if (!Memory.settings) Memory.settings = {};
    Memory.settings.layoutPlanningManualMode = true;
    Memory.settings.layoutPlanningMode = 'theoretical';
    statsConsole.log(
      `Manual phase init for ${targetName}: base phases ${Math.min(from,to)}..${Math.max(from,to)} queued`,
      2,
    );
    return true;
  },


  recalculateLayout: function (roomName = null, mode = null, scope = null, phaseFrom = null, phaseTo = null) {
    const ownedRooms = Object.values(Game.rooms || {}).filter(
      (room) => room && room.controller && room.controller.my,
    );
    const targetName =
      roomName ||
      (ownedRooms[0] && ownedRooms[0].name) ||
      null;
    if (!targetName || !Game.rooms[targetName]) {
      statsConsole.log(
        "Usage: visual.recalculateLayout('W1N1', 'theoretical'|'standard')",
        3,
      );
      return false;
    }
    const targetMode = mode || (Memory.settings && Memory.settings.layoutPlanningMode) || 'standard';
    const recalcScope = String(scope || (Memory.settings && Memory.settings.layoutPlanningRecalcScope) || 'all').toLowerCase();
    const phaseFromValue = phaseFrom !== null ? Number(phaseFrom) : (Memory.settings && Memory.settings.layoutPlanningDebugPhaseFrom);
    const phaseToValue = phaseTo !== null ? Number(phaseTo) : (Memory.settings && Memory.settings.layoutPlanningDebugPhaseTo);
    if (!Memory.settings) Memory.settings = {};
    Memory.settings.layoutRecalculateRequested = targetName;
    Memory.settings.layoutRecalculateMode = targetMode;
    Memory.settings.layoutPlanningRecalcScope = recalcScope;
    Memory.settings.layoutPlanningDebugPhaseFrom = Number.isFinite(phaseFromValue) ? phaseFromValue : 1;
    Memory.settings.layoutPlanningDebugPhaseTo = Number.isFinite(phaseToValue) ? phaseToValue : 10;
    processPendingLayoutRecalculation();
    statsConsole.log(
      `Layout recalculation intent queued for ${targetName} (${String(targetMode).toUpperCase()}, scope=${recalcScope}, phases=${Memory.settings.layoutPlanningDebugPhaseFrom}..${Memory.settings.layoutPlanningDebugPhaseTo})`,
      2,
    );
    return true;
  },
  theoreticalPlanning: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      applyRuntimeMode('theoretical', { suspend: true });
      statsConsole.log('Theoretical planning mode: ON (bot suspended, layout-only)', 2);
    } else if (toggle === 0) {
      applyRuntimeMode('live');
      statsConsole.log('Theoretical planning mode: OFF', 2);
    } else {
      statsConsole.log(
        "Usage: visual.theoreticalPlanning(1) to enable, visual.theoreticalPlanning(0) to disable",
        3,
      );
    }
  },
  runMode: function (mode = 'live') {
    const normalized = String(mode || '').toLowerCase();
    if (normalized === 'theoretical') {
      applyRuntimeMode('theoretical', { suspend: true });
      statsConsole.log('Run mode set to THEORETICAL (suspended + planning overlays).', 2);
      return;
    }
    if (normalized === 'maintenance') {
      applyRuntimeMode('maintenance');
      statsConsole.log('Run mode set to MAINTENANCE (strict minimal + CPU telemetry).', 2);
      return;
    }
    if (normalized === 'live') {
      applyRuntimeMode('live');
      statsConsole.log('Run mode set to LIVE.', 2);
      return;
    }
    statsConsole.log("Usage: visual.runMode('theoretical'|'live'|'maintenance')", 3);
  },
  enterTheoretical: function () {
    applyRuntimeMode('theoretical', { suspend: true });
    statsConsole.log('Run mode set to THEORETICAL (suspended + planning overlays).', 2);
  },
  enterLive: function () {
    applyRuntimeMode('live');
    statsConsole.log('Run mode set to LIVE.', 2);
  },
  enterMaintenance: function () {
    applyRuntimeMode('maintenance');
    statsConsole.log('Run mode set to MAINTENANCE (strict minimal + CPU telemetry).', 2);
  },
  showIntents: function (roomName = null) {
    const ownedRooms = Object.values(Game.rooms || {}).filter(
      (room) => room && room.controller && room.controller.my,
    );
    const target = roomName || (ownedRooms[0] && ownedRooms[0].name);
    if (!target) {
      statsConsole.log("Usage: visual.showIntents('W1N1')", 3);
      return null;
    }
    const payload = intentPipeline.listRoomIntents(target);
    payload.runtimeState = Memory.stats && Memory.stats.runtime ? (Memory.stats.runtime.state || null) : null;
    payload.runtimeReason = Memory.stats && Memory.stats.runtime ? (Memory.stats.runtime.reason || null) : null;
    payload.nextPlanningHeartbeatTick =
      Memory.stats && Memory.stats.runtime ? Number(Memory.stats.runtime.nextPlanningHeartbeatTick || 0) : 0;
    statsConsole.log(`Intent queue ${target}: ${payload.queue.length} task(s)`, 2);
    return payload;
  },
  retryIntent: function (roomName, runId, intentType) {
    if (!roomName || !intentType) {
      statsConsole.log("Usage: visual.retryIntent('W1N1', runId, 'INTENT_PLAN_PHASE_4')", 3);
      return false;
    }
    const ok = intentPipeline.retryIntent(roomName, runId, intentType);
    statsConsole.log(ok ? `Intent queued: ${intentType}` : `Intent retry failed: ${intentType}`, ok ? 2 : 4);
    return ok;
  },
  cancelIntentRun: function (roomName, runId = null) {
    if (!roomName) {
      statsConsole.log("Usage: visual.cancelIntentRun('W1N1', runId?)", 3);
      return 0;
    }
    const removed = intentPipeline.cancelIntentRun(roomName, runId);
    statsConsole.log(`Cancelled ${removed} intent task(s) in ${roomName}`, 2);
    return removed;
  },
};

global.debug = {
  toggle(module, state) {
    if (logger.toggle(module, state)) {
      statsConsole.log(
        `Debug for ${module} ${state ? "enabled" : "disabled"}`,
        2,
      );
    } else {
      statsConsole.log(`Module ${module} not found in debug configuration`, 3);
    }
  },
  config: logger.getConfig,
  showHTM() {
    introspect.printHTMTasks();
  },
  showSchedule() {
    introspect.printSchedulerJobs();
  },
  memoryStatus() {
    introspect.printMemoryStatus();
  },
  saveSavestate(id, note = '') {
    return savestate.saveSavestate(id, note);
  },
  restoreSavestate(id, options = {}) {
    return savestate.restoreSavestate(id, options);
  },
  listSavestates() {
    return savestate.listSavestates();
  },
  inspectSavestate(id) {
    return savestate.inspectSavestate(id);
  },
  pruneSavestates() {
    return savestate.pruneSavestates();
  },
  saveIncident(id, note = '', options = {}) {
    return incidentDebug.saveIncident(id, note, options);
  },
  inspectIncident(id) {
    return incidentDebug.inspectIncident(id);
  },
  listIncidents() {
    return incidentDebug.listIncidents();
  },
  exportIncident(id) {
    return incidentDebug.exportIncident(id);
  },
  importIncident(payload, idOverride = null) {
    return incidentDebug.importIncident(payload, idOverride);
  },
  pruneIncidents() {
    return incidentDebug.pruneIncidents();
  },
  setSpawnLimit(room, role, amount = 'auto') {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room]) Memory.rooms[room] = {};
    if (!Memory.rooms[room].manualSpawnLimits)
      Memory.rooms[room].manualSpawnLimits = {};

    if (amount === 'auto') {
      delete Memory.rooms[room].manualSpawnLimits[role];
      statsConsole.log(
        `Manual spawn limit for ${role} in ${room} reset to auto`,
        2,
      );
    } else {
      Memory.rooms[room].manualSpawnLimits[role] = amount;
      statsConsole.log(
        `Manual spawn limit for ${role} in ${room} set to ${amount}`,
        2,
      );
    }
  },
};

const startFresh = require('./startFresh');
global.startFresh = startFresh;
global.layoutPlanDump = function(roomName = null, options = {}) {
  return layoutDumpDebug.dump(roomName, options);
};
intentPipeline.registerHandlers();


// High priority initialization tasks - run once at start of tick 0
scheduler.addTask(
  "initializeRoomMemory",
  0,
  () => {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      memoryManager.initializeRoomMemory(room);
      // Ensure hierarchical memory structure is prepared
      memoryManager.initializeHiveMemory(room.name, room.name);
    }
  },
  { highPriority: true, once: true },
); // @codex-owner main @codex-trigger once

scheduler.addTask("clearMemory", 100, () => {
  let removed = false;
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      assimilation.assimilateCreep(name);
      removed = true;
    }
  }
  if (removed) scheduler.triggerEvent('roleUpdate', {});
}); // @codex-owner main @codex-trigger {"type":"interval","interval":100}


scheduler.addTask("updateHUD", 1, () => {
  if (!visualizeDT) return;
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];

    // Distance Transform Calculation and Visualization
    if (visualizeDT) {
      const dist = distanceTransform.distanceTransform(room);
      distanceTransform.visualizeDistanceTransform(roomName, dist);
    }
  }
}); // @codex-owner main @codex-trigger {"type":"interval","interval":1}

// Initialize layout plan when a room is claimed
scheduler.addTask({
  name: 'layoutPlanningInit',
  type: ONCE,
  event: 'roomOwnershipEstablished',
  fn: (data) => {
    if (!data || !data.roomName) return;
    intentPipeline.queueOwnershipIntents(data.roomName);
  },
});

// Layout planning intents are enqueued explicitly by intentPipeline (no periodic fallback tasks).

// Add on-demand building manager task
scheduler.addTask("buildInfrastructure", 0, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) continue;
    buildingManager.buildInfrastructure(room);
  }
}); // @codex-owner buildingManager @codex-trigger {"type":"interval","interval":0}

scheduler.addTask('maintainStructures', 5, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) continue;
    maintenanceManager.run(room);
  }
}); // @codex-owner maintenanceManager @codex-trigger {"type":"interval","interval":5}

// Lifecycle-based miner replacement
scheduler.addTask('predictMinerLifecycles', 25, () => {
  lifecycle.run();
}); // @codex-owner lifecyclePredictor @codex-trigger {"type":"interval","interval":25}

// Lifecycle-based hauler replacement
scheduler.addTask('predictHaulerLifecycle', 25, () => {
  haulerLifecycle.run();
}); // @codex-owner haulerLifecycle @codex-trigger {"type":"interval","interval":25}

// Periodic expansion vision check
scheduler.addTask('hiveGazeRefresh', 15000, () => {
  hivemind.evaluateExpansionVision();
}); // @codex-owner hiveGaze @codex-trigger {"type":"interval","interval":15000}

// Scout lifecycle management
scheduler.addTask('hiveGazeManageScouts', 10, () => {
  hivemind.manageScouts();
}); // @codex-owner hiveGaze @codex-trigger {"type":"interval","interval":10}

// Decision making layer feeding tasks into HTM
scheduler.addTask("hivemind", 1, () => {
  hivemind.run();
}); // @codex-owner hivemind @codex-trigger {"type":"interval","interval":1}

scheduler.addTask("energyDemand", 1000, () => {
  energyDemand.run();
}); // @codex-owner demand @codex-trigger {"type":"interval","interval":1000}

// React to creep deaths, spawns and construction updates
scheduler.addTask('roleUpdateEvent', 0, (data) => {
  if (data && data.room && Game.rooms[data.room]) {
    hiveRoles.evaluateRoom(Game.rooms[data.room]);
  } else {
    for (const rName in Game.rooms) {
      const r = Game.rooms[rName];
      if (r.controller && r.controller.my) hiveRoles.evaluateRoom(r);
    }
  }
}, { event: 'roleUpdate' }); // @codex-owner main @codex-trigger {"type":"event","eventName":"roleUpdate"}

// Fallback evaluation every 50 ticks when bucket high
scheduler.addTask('roleUpdateFallback', 50, () => {
  const last = Memory.roleEval ? Memory.roleEval.lastRun || 0 : 0;
  if (Game.cpu.bucket > 9800 && Game.time - last >= 50) {
    for (const rName in Game.rooms) {
      const r = Game.rooms[rName];
      if (r.controller && r.controller.my) hiveRoles.evaluateRoom(r);
    }
  }
}); // @codex-owner main @codex-trigger {"type":"interval","interval":50}
// Scheduled console drawing
scheduler.addTask(
  "consoleDisplay",
  5,
  () => {
    drawAsciiConsole();
  },
  { minBucket: 1000 },
); // @codex-owner console.console @codex-trigger {"type":"interval","interval":5}

// Periodically purge console log counts to avoid memory bloat
scheduler.addTask('purgeLogs', 250, () => {
  memoryManager.purgeConsoleLogCounts();
}); // @codex-owner memoryManager @codex-trigger {"type":"interval","interval":250}

// Regularly validate mining reservations to free spots from dead creeps
scheduler.addTask('verifyMiningReservations', 10, () => {
  for (const roomName in Memory.rooms) {
    memoryManager.verifyMiningReservations(roomName);
  }
  // Also clean up legacy reservation entries
  memoryManager.cleanUpReservedPositions();
}); // @codex-owner memoryManager @codex-trigger {"type":"interval","interval":10}

// Periodically prune stale energy reservations and spawn requests
scheduler.addTask('cleanEnergyReserves', 50, () => {
  memoryManager.cleanUpEnergyReserves();
}); // @codex-owner memoryManager @codex-trigger {"type":"interval","interval":50}

scheduler.addTask('pruneSpawnQueue', 50, () => {
  spawnQueue.cleanUp();
}); // @codex-owner spawnQueue @codex-trigger {"type":"interval","interval":50}

scheduler.addTask('runTowers', 3, () => {
  towerManager.run();
}, { highPriority: true, minBucket: 5000 }); // @codex-owner towers @codex-trigger {"type":"interval","interval":3}

scheduler.addTask('checkStorageAndSpawnBaseDistributor', 25, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) continue;
    spawnManager.checkStorageAndSpawnBaseDistributor(room);
  }
}); // @codex-owner baseDistributor @codex-trigger {"type":"interval","interval":25}

// Cleanup stale HTM creep containers
scheduler.addTask('htmCleanup', 50, () => {
  htm.cleanupDeadCreeps();
}); // @codex-owner htm @codex-trigger {"type":"interval","interval":50}

// Debug listing of scheduled tasks
scheduler.addTask(
  "showScheduled",
  50,
  () => {
    if (Memory.settings && Memory.settings.showTaskList) {
      scheduler.logTaskList();
    }
  },
  { minBucket: 0 },
); // @codex-owner scheduler @codex-trigger {"type":"interval","interval":50}

function runMainLoop(loopStartCpu = 0) {
  const tickCtx = tickPipeline.bootstrapTick();
  tickCtx.preLoopCpu = Math.max(0, Number(tickCtx.tickStartUsed || 0) - Number(loopStartCpu || 0));
  const startCPU = tickCtx.tickStartUsed;
  // Defensive runtime init: Memory can be wiped on private server crashes or manual hard resets
  // without forcing a global reset, so top-level module init may not run again in time.
  if (!Memory.settings) Memory.settings = {};
  if (Memory.settings.pauseBot === undefined) Memory.settings.pauseBot = false;
  if (Memory.settings.buildPreviewOnly === undefined) Memory.settings.buildPreviewOnly = false;
  if (Memory.settings.alwaysShowHud === undefined) Memory.settings.alwaysShowHud = true;
  if (Memory.settings.enableVisuals === undefined) Memory.settings.enableVisuals = true;
  if (Memory.settings.showSpawnQueueHud === undefined) Memory.settings.showSpawnQueueHud = true;
  if (Memory.settings.showHtmOverlay === undefined) Memory.settings.showHtmOverlay = true;
  if (Memory.settings.enableScreepsProfiler === undefined) Memory.settings.enableScreepsProfiler = false;
  if (Memory.settings.profilerEnabledByOverlay === undefined) Memory.settings.profilerEnabledByOverlay = false;
  if (Memory.settings.enableTaskProfiling === undefined) Memory.settings.enableTaskProfiling = false;
  if (Memory.settings.enableLegacyHtmRun === undefined) Memory.settings.enableLegacyHtmRun = false;
  if (Memory.settings.runtimeMode === undefined) Memory.settings.runtimeMode = 'live';
  if (Memory.settings.overlayMode === undefined) Memory.settings.overlayMode = 'normal';
  if (Memory.settings.enableHudCalcCache === undefined) Memory.settings.enableHudCalcCache = true;
  if (Memory.settings.enableMemHack === undefined) Memory.settings.enableMemHack = true;
  if (Memory.settings.memHackDebug === undefined) Memory.settings.memHackDebug = false;
  if (Memory.settings.enableIdleGating === undefined) Memory.settings.enableIdleGating = true;
  if (Memory.settings.enablePlanningHeartbeat === undefined) Memory.settings.enablePlanningHeartbeat = true;
  if (Memory.settings.planningHeartbeatTicks === undefined) Memory.settings.planningHeartbeatTicks = 50;
  if (Memory.settings.idleStatsIntervalTicks === undefined) Memory.settings.idleStatsIntervalTicks = 5;
  if (Memory.settings.idleSnapshotIntervalTicks === undefined) Memory.settings.idleSnapshotIntervalTicks = 10;
  if (Memory.settings.criticalCheckIntervalTicks === undefined) Memory.settings.criticalCheckIntervalTicks = 10;
  getCpuPolicySettings();
  if (Memory.settings.layoutPlanningTopCandidates === undefined) Memory.settings.layoutPlanningTopCandidates = 5;
  if (Memory.settings.layoutPlanningCandidatesPerTick === undefined) Memory.settings.layoutPlanningCandidatesPerTick = 1;
  if (Memory.settings.layoutPlanningMaxCandidatesPerTick === undefined) Memory.settings.layoutPlanningMaxCandidatesPerTick = 25;
  if (Memory.settings.layoutPlanningDynamicBatching === undefined) Memory.settings.layoutPlanningDynamicBatching = true;
  if (Memory.settings.layoutPlanningDebugPhaseFrom === undefined) Memory.settings.layoutPlanningDebugPhaseFrom = 1;
  if (Memory.settings.layoutPlanningDebugPhaseTo === undefined) Memory.settings.layoutPlanningDebugPhaseTo = 10;
  if (Memory.settings.layoutPlanningRecalcScope === undefined) Memory.settings.layoutPlanningRecalcScope = 'all';
  if (Memory.settings.layoutRefinementEnabled === undefined) Memory.settings.layoutRefinementEnabled = true;
  if (Memory.settings.layoutRefinementTopSeeds === undefined) Memory.settings.layoutRefinementTopSeeds = 2;
  if (Memory.settings.layoutRefinementMaxGenerations === undefined) Memory.settings.layoutRefinementMaxGenerations = 8;
  if (Memory.settings.layoutRefinementVariantsPerGeneration === undefined) Memory.settings.layoutRefinementVariantsPerGeneration = 4;
  if (Memory.settings.layoutRefinementMinBucket === undefined) Memory.settings.layoutRefinementMinBucket = 3500;
  // Manual phase planner mode: planner waits idle until a phase range is initialized via visual.layoutInitializePhase().
  if (Memory.settings.layoutPlanningManualMode === undefined) Memory.settings.layoutPlanningManualMode = false;
  if (Memory.settings.layoutPlanningManualBypassOnce === undefined) Memory.settings.layoutPlanningManualBypassOnce = false;
  processProfilerControl();
  if (String((Memory.settings && Memory.settings.runtimeMode) || 'live').toLowerCase() === 'maintenance') {
    Memory.settings.overlayMode = 'off';
    Memory.settings.enableVisuals = false;
    Memory.settings.alwaysShowHud = false;
    Memory.settings.showSpawnQueueHud = false;
    Memory.settings.showLayoutOverlay = false;
    Memory.settings.showLayoutLegend = false;
    Memory.settings.showHtmOverlay = false;
    Memory.settings.enableTaskProfiling = false;
  }
  syncOverlayModeSettings();

  if (
    Memory.settings &&
    (Memory.settings.overlayMode || 'normal') === 'normal' &&
    Memory.settings.alwaysShowHud
  ) {
    Memory.settings.enableVisuals = true;
    Memory.settings.showSpawnQueueHud = true;
  }

  recordTickPhase(tickCtx, 'bootstrap', () => {
    memoryManager.observeEnergyReserveEvents();
  });

  if (String((Memory.settings && Memory.settings.runtimeMode) || 'live').toLowerCase() === 'maintenance') {
    const initCPUUsage = Game.cpu.getUsed() - startCPU;
    const hygieneCpu = recordTickPhase(tickCtx, 'maintenance-hygiene', () => {
      const hygieneStart = Game.cpu.getUsed();
      if (Game.time % 50 === 0) {
        htm.cleanupDeadCreeps();
      }
      if (Game.time % 250 === 0) {
        memoryManager.purgeConsoleLogCounts();
      }
      if (Game.time % 200 === 0) {
        const roomNames = Object.keys(Memory.rooms || {});
        for (const roomName of roomNames) {
          layoutPlanner._pruneTheoreticalMemory(roomName, { reason: 'maintenance-hygiene' });
        }
      }
      if (Game.time % 100 === 0 && Memory.creeps) {
        for (const name in Memory.creeps) {
          if (!Game.creeps[name]) {
            assimilation.assimilateCreep(name);
          }
        }
      }
      return Game.cpu.getUsed() - hygieneStart;
    });
    const totalCPUUsage = Game.cpu.getUsed() - startCPU;
    myStats = [
      ["Mode", 1],
      ["Init", initCPUUsage],
      ["PreLoop", Number(tickCtx.preLoopCpu || 0)],
      ["Hygiene", hygieneCpu],
      ["Memory Bytes", Number((Memory.stats && Memory.stats.runtime && Memory.stats.runtime.memoryBytes) || 0)],
      ["MemHack", Memory.settings && Memory.settings.enableMemHack !== false ? 1 : 0],
      ["MemTrim", Number((Memory.stats && Memory.stats.memTrimLast && Memory.stats.memTrimLast.removedTotal) || 0)],
      ["Total", totalCPUUsage],
      ["Bucket", Game.cpu.bucket || 0],
    ];
    statsConsole.run(myStats);
    if (Game.cpu.bucket >= 1000 && Game.time % 5 === 0) {
      drawAsciiConsole();
    }
    tickPipeline.commitTick(tickCtx);
    return;
  }

  if (Memory.settings.pauseBot && !(Memory.settings && Memory.settings.buildPreviewOnly)) {
    if (!Memory.stats) Memory.stats = {};
    if (
      Memory.settings.pauseNotice === undefined ||
      Game.time - Memory.settings.pauseNotice >= 10
    ) {
      statsConsole.log(
        "Bot paused. Set Memory.settings.pauseBot = false to resume.",
        2,
      );
      Memory.settings.pauseNotice = Game.time;
    }
    statsConsole.run([], false);
    tickPipeline.commitTick(tickCtx);
    return;
  }
  if (Memory.settings.pauseNotice !== undefined) {
    delete Memory.settings.pauseNotice;
  }

  const runtimeState = buildRuntimeState(tickCtx);
  tickCtx.runtimeState = runtimeState.runtimeState;
  tickCtx.runtimeReason = runtimeState.runtimeReason;
  tickCtx.forcePlanningTick = runtimeState.forcePlanningTick;
  tickCtx.nextPlanningHeartbeatTick = runtimeState.nextPlanningHeartbeatTick;
  if (!Memory.stats) Memory.stats = {};
  Memory.stats.runtime = Memory.stats.runtime || {};
  Memory.stats.runtime.state = runtimeState.runtimeState;
  Memory.stats.runtime.reason = runtimeState.runtimeReason;
  Memory.stats.runtime.tick = Game.time;
  Memory.stats.runtime.forcePlanningTick = Boolean(runtimeState.forcePlanningTick);
  Memory.stats.runtime.nextPlanningHeartbeatTick = Number(runtimeState.nextPlanningHeartbeatTick || 0);
  const memHackState = ensureMemHackState();
  Memory.stats.runtime.memoryBytes = Number(memHackState.lastRawBytes || 0);
  Memory.stats.runtime.memHackEnabled = Boolean(Memory.settings && Memory.settings.enableMemHack !== false);
  Memory.stats.runtime.memHackMode = memHackState.lastMode || 'unknown';

  if (
    String((Memory.settings && Memory.settings.runtimeMode) || 'live').toLowerCase() === 'live' &&
    runtimeState.runtimeState === 'idle' &&
    runtimeState.forcePlanningTick !== true
  ) {
    const idleSnapshotInterval = Math.max(3, Math.floor(Number((Memory.settings && Memory.settings.idleSnapshotIntervalTicks) || 10)));
    if (Game.time % idleSnapshotInterval === 0) {
      recordTickPhase(tickCtx, 'snapshot', () => {
        tickCtx.snapshot = tickPipeline.buildMinimalSnapshot();
      }, { notes: 'idle-minimal' });
    } else {
      tickCtx.phases.snapshot = { cpu: 0, notes: 'skipped-idle-snapshot-interval' };
    }
    tickCtx.phases.planning = { cpu: 0, notes: 'skipped-idle' };
    tickCtx.phases['execution-scheduler'] = { cpu: 0, notes: 'skipped-idle' };
    tickCtx.phases['execution-htm'] = { cpu: 0, notes: 'skipped-idle' };
    tickCtx.phases['execution-room-managers'] = { cpu: 0, notes: 'skipped-idle' };
    tickCtx.phases['execution-creeps'] = { cpu: 0, notes: 'skipped-idle' };
    tickCtx.phases['execution-movement'] = { cpu: 0, notes: 'skipped-idle' };
    tickCtx.phases['execution-hud'] = { cpu: 0, notes: 'skipped-idle' };
    const totalCPUUsage = Game.cpu.getUsed() - startCPU;
    myStats = [
      ["Mode", 1],
      ["State", 1],
      ["PreLoop", Number(tickCtx.preLoopCpu || 0)],
      ["Memory Bytes", Number((Memory.stats && Memory.stats.runtime && Memory.stats.runtime.memoryBytes) || 0)],
      ["MemHack", Memory.settings && Memory.settings.enableMemHack !== false ? 1 : 0],
      ["MemTrim", Number((Memory.stats && Memory.stats.memTrimLast && Memory.stats.memTrimLast.removedTotal) || 0)],
      ["Total", totalCPUUsage],
      ["Bucket", Game.cpu.bucket || 0],
    ];
    const idleStatsInterval = Math.max(1, Math.floor(Number((Memory.settings && Memory.settings.idleStatsIntervalTicks) || 5)));
    if (Game.time % idleStatsInterval === 0) {
      statsConsole.run(myStats);
    }
    if (Game.cpu.bucket >= 1000 && Game.time % 5 === 0) {
      drawAsciiConsole();
    }
    tickPipeline.commitTick(tickCtx);
    return;
  }

  recordTickPhase(tickCtx, 'snapshot', () => {
    const shouldRunFullSnapshot = runtimeState.forcePlanningTick === true || runtimeState.runtimeState !== 'idle';
    tickCtx.snapshot = shouldRunFullSnapshot
      ? tickPipeline.buildFullSnapshot()
      : tickPipeline.buildMinimalSnapshot();
    queueDomainEvents(tickCtx, {
      includeIntentProducer: Boolean(runtimeState.forcePlanningTick),
      forceProducer: Boolean(runtimeState.forcePlanningTick),
    });
  });

  recordTickPhase(tickCtx, 'planning', () => {
    if (runtimeState.runtimeState !== 'idle' || runtimeState.forcePlanningTick === true) {
      runDomainPlanning(tickCtx);
    }
    processPendingLayoutRecalculation();
  });

  if (Memory.settings && Memory.settings.buildPreviewOnly) {
    const planningCpu =
      tickCtx.phases['planning'] && typeof tickCtx.phases['planning'].cpu === 'number'
        ? tickCtx.phases['planning'].cpu
        : 0;
    logProfileEntry('Preview Pipeline::Domain Planning', planningCpu, {
      parent: 'Preview Pipeline',
      reason: 'preview',
    });
    const htmCpu = recordTickPhase(tickCtx, 'execution-htm', () => {
      const result = executeHtmPhase(tickCtx, 'preview');
      return Number(result && result.cpu ? result.cpu : 0);
    });
    logProfileEntry('Preview Pipeline::Execute HTM Tasks', htmCpu, {
      parent: 'Preview Pipeline',
      reason: 'preview',
    });
    if (Game.cpu.bucket >= 1000 && Game.time % 5 === 0) {
      const consoleStart = Game.cpu.getUsed();
      drawAsciiConsole();
      logProfileEntry('Preview Pipeline::ASCII Console Render', Game.cpu.getUsed() - consoleStart, {
        parent: 'Preview Pipeline',
        reason: 'preview',
      });
    }
    const intentCpu = gatherIntentCpuForTick(Game.time);
    const totalCPUUsage = Game.cpu.getUsed() - startCPU;
    logProfileEntry('Preview Pipeline::Total', totalCPUUsage, {
      parent: 'Preview Pipeline',
      reason: 'preview',
    });
    logProfileEntry('Main Loop::Tick Total', totalCPUUsage, {
      parent: 'Main Loop',
      reason: 'tick-total',
    });
    myStats = [
      ["Domain Planning", planningCpu],
      ["Intent HTM", htmCpu],
      ["Intent Scan", intentCpu.scan],
      ["Intent Eval", intentCpu.eval],
      ["Intent Plan", intentCpu.plan],
      ["Intent Sync", intentCpu.sync],
      ["Intent HUD", intentCpu.hud],
      ["Intent Other", intentCpu.other],
      ["PreLoop", Number(tickCtx.preLoopCpu || 0)],
      ["Memory Bytes", Number((Memory.stats && Memory.stats.runtime && Memory.stats.runtime.memoryBytes) || 0)],
      ["MemHack", Memory.settings && Memory.settings.enableMemHack !== false ? 1 : 0],
      ["MemTrim", Number((Memory.stats && Memory.stats.memTrimLast && Memory.stats.memTrimLast.removedTotal) || 0)],
      ["Preview Mode", totalCPUUsage],
      ["Total", totalCPUUsage],
    ];
    statsConsole.run(myStats);
    tickPipeline.commitTick(tickCtx);
    return;
  }

  const cpuPolicy = getCpuPolicySettings();
  const emergencyRatio = Math.max(0.5, Math.min(0.98, Number(cpuPolicy.emergencyBrakeRatio || 0.85)));
  if (Game.cpu.getUsed() > Number(tickCtx.softBudget || Game.cpu.tickLimit) * emergencyRatio) {
    tickCtx.phases['execution-scheduler'] = { cpu: 0, notes: 'skipped-emergency-brake' };
    tickCtx.phases['execution-htm'] = { cpu: 0, notes: 'skipped-emergency-brake' };
    tickCtx.phases['execution-room-managers'] = { cpu: 0, notes: 'skipped-emergency-brake' };
    tickCtx.phases['execution-creeps'] = { cpu: 0, notes: 'skipped-emergency-brake' };
    tickCtx.phases['execution-movement'] = { cpu: 0, notes: 'skipped-emergency-brake' };
    tickCtx.phases['execution-hud'] = { cpu: 0, notes: 'skipped-emergency-brake' };
    const totalCPUUsage = Game.cpu.getUsed() - startCPU;
    myStats = [
      ["Mode", 1],
      ["Emergency", 1],
      ["Total", totalCPUUsage],
      ["Bucket", Game.cpu.bucket || 0],
    ];
    statsConsole.run(myStats);
    tickPipeline.commitTick(tickCtx);
    return;
  }

  const schedulerCpu = recordTickPhase(tickCtx, 'execution-scheduler', () => {
    const schedulerStart = Game.cpu.getUsed();
    scheduler.run();
    return Game.cpu.getUsed() - schedulerStart;
  });
  logProfileEntry('Main Loop::Run Scheduler', schedulerCpu, {
    parent: 'Main Loop',
    reason: 'scheduler',
  });

  const htmExecutionCpu = recordTickPhase(tickCtx, 'execution-htm', () => {
    const result = executeHtmPhase(tickCtx, 'live');
    return Number(result && result.cpu ? result.cpu : 0);
  });
  logProfileEntry('Main Loop::Execute HTM Tasks', htmExecutionCpu, {
    parent: 'Main Loop',
    reason: 'htm-execution',
  });

  const initCPUUsage = Game.cpu.getUsed() - startCPU;
  let totalCPUUsage = initCPUUsage;

  // Initialize CPU usage variables
  let CreepsCPUUsage = 0;
  let CreepManagersCPUUsage = 0;
  let towersCPUUsage = 0;
  let linksCPUUsage = 0;
  let SetupRolesCPUUsage = 0;
  let statsCPUUsage = 0;

  // Run room managers
  const roomManagersCPUUsage = recordTickPhase(tickCtx, 'execution-room-managers', () => {
    const roomManagersStartCPU = Game.cpu.getUsed();
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room || !room.controller || !room.controller.my) continue;
      spawnManager.run(room);
    }
    return Game.cpu.getUsed() - roomManagersStartCPU;
  });
  logProfileEntry('Main Loop::Room Managers', roomManagersCPUUsage, {
    parent: 'Main Loop',
    reason: 'room-managers',
  });
  CreepManagersCPUUsage = roomManagersCPUUsage;

  // Run creep roles
  const roleCpuTotals = {
    upgrader: 0,
    miner: 0,
    builder: 0,
    hauler: 0,
    baseDistributor: 0,
    remoteMiner: 0,
    reservist: 0,
    other: 0,
  };
  recordTickPhase(tickCtx, 'execution-creeps', () => {
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      const creepStartCPU = Game.cpu.getUsed();

    if (creep.memory && creep.memory.abortOnSpawn) {
      if (Memory.settings && Memory.settings.debugVisuals) {
        statsConsole.log(`Aborting creep ${name} (${creep.memory.role || 'unknown'})`, 3);
      }
      creep.suicide();
      continue;
    }

    if (creep.memory.role === "upgrader") {
      roleUpgrader.run(creep);
    } else if (creep.memory.role === "miner") {
      roleMiner.run(creep);
    } else if (creep.memory.role === "builder") {
      roleBuilder.run(creep);
    } else if (creep.memory.role === "hauler") {
      roleHauler.run(creep);
    } else if (creep.memory.role === 'baseDistributor') {
      roleBaseDistributor.run(creep);
    } else if (creep.memory.role === 'remoteMiner') {
      roleRemoteMiner.run(creep);
    } else if (creep.memory.role === 'reservist') {
      roleReservist.run(creep);
    }
      const creepCpu = Game.cpu.getUsed() - creepStartCPU;
      const role = creep.memory && creep.memory.role ? creep.memory.role : 'other';
      if (roleCpuTotals[role] === undefined) roleCpuTotals.other += creepCpu;
      else roleCpuTotals[role] += creepCpu;
      CreepsCPUUsage += creepCpu;
    }
  }, { count: Object.keys(Game.creeps || {}).length });
  logProfileEntry('Creep Roles::Total', CreepsCPUUsage, {
    parent: 'Creep Roles',
    reason: 'creep-roles',
  });
  for (const roleName in roleCpuTotals) {
    const value = roleCpuTotals[roleName];
    if (!value || value <= 0) continue;
    const label = roleName.charAt(0).toUpperCase() + roleName.slice(1);
    logProfileEntry(`Creep Roles::${label}`, value, {
      parent: 'Creep Roles',
      reason: 'creep-role',
    });
  }

  // Ensure creeps vacate restricted spawn areas after running role logic
  const movementCpu = recordTickPhase(tickCtx, 'execution-movement', () => {
    const movementStart = Game.cpu.getUsed();
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      movementUtils.avoidSpawnArea(creep);
    }
    return Game.cpu.getUsed() - movementStart;
  });
  logProfileEntry('Main Loop::Movement Safety', movementCpu, {
    parent: 'Main Loop',
    reason: 'movement',
  });

  // Run late tick management
  let hudPassCpu = 0;
  const overlayMode = String((Memory.settings && Memory.settings.overlayMode) || 'normal').toLowerCase();
  const runtimeMode = String((Memory.settings && Memory.settings.runtimeMode) || 'live').toLowerCase();
  const cpuBucket = typeof Game.cpu.bucket === 'number' ? Game.cpu.bucket : 10000;
  const forceHudInTheoretical = runtimeMode === 'theoretical' && cpuBucket >= 2000;
  const shouldRunHudPass =
    overlayMode !== 'off' &&
    (
      overlayMode === 'debug' ||
      Boolean(Memory.settings && Memory.settings.enableVisuals) ||
      Boolean(Memory.settings && Memory.settings.showHtmOverlay)
    );
  if (shouldRunHudPass && (!tickPipeline.hardStopReached(tickCtx, 2) || forceHudInTheoretical)) {
    hudPassCpu = recordTickPhase(tickCtx, 'execution-hud', () => {
      const hudStart = Game.cpu.getUsed();
      for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        hudManager.createHUD(room);
      }
      return Game.cpu.getUsed() - hudStart;
    });
  } else {
    tickCtx.phases['execution-hud'] = { cpu: 0, notes: 'skipped-hard-stop' };
  }
  logProfileEntry('Main Loop::HUD Pass', hudPassCpu, {
    parent: 'Main Loop',
    reason: 'hud-pass',
  });

  const lateTickCPUUsage =
    Game.cpu.getUsed() -
    (initCPUUsage + CreepManagersCPUUsage + CreepsCPUUsage);
  towersCPUUsage = lateTickCPUUsage;
  linksCPUUsage = lateTickCPUUsage;
  SetupRolesCPUUsage = lateTickCPUUsage;
  statsCPUUsage = lateTickCPUUsage;

  totalCPUUsage = Game.cpu.getUsed() - startCPU;
  logProfileEntry('Main Loop::Total', totalCPUUsage, {
    parent: 'Main Loop',
    reason: 'main-total',
  });
  logProfileEntry('Main Loop::Tick Total', totalCPUUsage, {
    parent: 'Main Loop',
    reason: 'tick-total',
  });

  myStats = [
    ["HTM", htmExecutionCpu],
    ["Creep Managers", CreepManagersCPUUsage],
    ["Towers", towersCPUUsage],
    ["Links", linksCPUUsage],
    ["Setup Roles", SetupRolesCPUUsage],
    ["Creeps", CreepsCPUUsage],
    ["Init", initCPUUsage],
    ["Stats", statsCPUUsage],
    ["PreLoop", Number(tickCtx.preLoopCpu || 0)],
    ["Memory Bytes", Number((Memory.stats && Memory.stats.runtime && Memory.stats.runtime.memoryBytes) || 0)],
    ["MemHack", Memory.settings && Memory.settings.enableMemHack !== false ? 1 : 0],
    ["MemTrim", Number((Memory.stats && Memory.stats.memTrimLast && Memory.stats.memTrimLast.removedTotal) || 0)],
    ["Total", totalCPUUsage],
  ];

  statsConsole.run(myStats);

  if (totalCPUUsage > Game.cpu.limit) {
    statsConsole.log(
      "Tick: " +
        Game.time +
        "  CPU OVERRUN: " +
        Game.cpu.getUsed().toFixed(2) +
        "  Bucket:" +
        Game.cpu.bucket,
      5,
    );
  }

  // drawing handled by scheduler
  tickPipeline.commitTick(tickCtx);
}

module.exports.loop = function () {
  const loopStartCpu = typeof Game !== 'undefined' && Game.cpu && typeof Game.cpu.getUsed === 'function'
    ? Game.cpu.getUsed()
    : 0;
  primeMemHackForTick();
  try {
    processProfilerResetPending();
    const profilerShouldRun = Boolean(Memory && Memory.settings && Memory.settings.enableScreepsProfiler);
    if (profilerShouldRun) {
      if (ensureScreepsProfilerEnabled() && screepsProfiler) {
        registerLoadedModulesForProfiler();
        return screepsProfiler.wrap(() => runMainLoop(loopStartCpu));
      }
    }
    return runMainLoop(loopStartCpu);
  } finally {
    finalizeMemHackForTick();
    recordLoopEnvelope(loopStartCpu);
  }
};
