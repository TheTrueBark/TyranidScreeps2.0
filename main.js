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
require('./taskDefinitions');
const htm = require("manager.htm");
const intentPipeline = require('./manager.intentPipeline');
const hivemind = require("manager.hivemind");
const hiveGaze = require('./manager.hiveGaze');
const lifecycle = require('./hiveMind.lifecycle');
const haulerLifecycle = require('./haulerLifecycle');
const movementUtils = require("./utils.movement");
const profilerRegistry = require('./profiler.registry');

const energyDemand = require("./manager.hivemind.demand");
const hiveRoles = require('./hive.roles');
// HiveTravel installs travelTo on creeps
let screepsProfiler = null;
let screepsProfilerReady = false;
let profilerModuleRegistry = {};
let profilerRuntimeRegistry = {};
let profilerLastCacheSize = -1;
let profilerAdditionalRegistered = false;

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
  Memory.settings.enableTaskProfiling = true;
}
if (Memory.settings.enableHudCalcCache === undefined) {
  Memory.settings.enableHudCalcCache = true;
}
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
if (Memory.settings.alwaysShowHud) {
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

function applyRuntimeMode(mode, options = {}) {
  if (!Memory.settings) Memory.settings = {};
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'theoretical') {
    const suspend = options.suspend !== false;
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
    Memory.settings.layoutPlanningMode = 'standard';
    Memory.settings.buildPreviewOnly = false;
    Memory.settings.pauseBot = false;
    if (options.keepLayoutOverlay !== true) {
      Memory.settings.showLayoutOverlay = false;
    }
    if (Memory.settings.alwaysShowHud) {
      Memory.settings.enableVisuals = true;
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
      Memory.settings.alwaysShowHud = true;
      Memory.settings.enableVisuals = true;
      statsConsole.log("HUD visuals: ON", 2);
    } else if (toggle === 0) {
      if (Memory.settings.alwaysShowHud) {
        Memory.settings.alwaysShowHud = false;
      }
      Memory.settings.enableVisuals = false;
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
      Memory.settings.enableVisuals = false;
      Memory.settings.alwaysShowHud = false;
      Memory.settings.showSpawnQueueHud = false;
      Memory.settings.showLayoutOverlay = false;
      Memory.settings.showLayoutLegend = false;
      Memory.settings.showHtmOverlay = false;
      statsConsole.log("All HUD/overlay visuals: OFF", 2);
      return;
    }
    if (toggle === 1) {
      Memory.settings.enableVisuals = true;
      Memory.settings.alwaysShowHud = true;
      Memory.settings.showSpawnQueueHud = true;
      Memory.settings.showHtmOverlay = true;
      if (Memory.settings.layoutPlanningMode === 'theoretical') {
        Memory.settings.showLayoutOverlay = true;
      }
      statsConsole.log("All HUD/overlay visuals: ON", 2);
      return;
    }
    statsConsole.log("Usage: visual.hudAll(1) to enable, visual.hudAll(0) to disable", 3);
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
    if (normalized === 'live') {
      applyRuntimeMode('live');
      statsConsole.log('Run mode set to LIVE.', 2);
      return;
    }
    statsConsole.log("Usage: visual.runMode('theoretical'|'live')", 3);
  },
  enterTheoretical: function () {
    applyRuntimeMode('theoretical', { suspend: true });
    statsConsole.log('Run mode set to THEORETICAL (suspended + planning overlays).', 2);
  },
  enterLive: function () {
    applyRuntimeMode('live');
    statsConsole.log('Run mode set to LIVE.', 2);
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
    buildingManager.buildInfrastructure(room);
  }
}); // @codex-owner buildingManager @codex-trigger {"type":"interval","interval":0}

scheduler.addTask('maintainStructures', 5, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
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
// Core HTM execution task
scheduler.addTask("htmRun", 1, () => {
  htm.run();
}); // @codex-owner htm @codex-trigger {"type":"interval","interval":1}

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

function runMainLoop() {
  const startCPU = Game.cpu.getUsed();
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
  if (Memory.settings.enableTaskProfiling === undefined) Memory.settings.enableTaskProfiling = true;
  if (Memory.settings.enableHudCalcCache === undefined) Memory.settings.enableHudCalcCache = true;
  if (Memory.settings.layoutPlanningTopCandidates === undefined) Memory.settings.layoutPlanningTopCandidates = 5;
  if (Memory.settings.layoutPlanningCandidatesPerTick === undefined) Memory.settings.layoutPlanningCandidatesPerTick = 1;
  if (Memory.settings.layoutPlanningMaxCandidatesPerTick === undefined) Memory.settings.layoutPlanningMaxCandidatesPerTick = 25;
  if (Memory.settings.layoutPlanningDynamicBatching === undefined) Memory.settings.layoutPlanningDynamicBatching = true;
  if (Memory.settings.layoutPlanningDebugPhaseFrom === undefined) Memory.settings.layoutPlanningDebugPhaseFrom = 1;
  if (Memory.settings.layoutPlanningDebugPhaseTo === undefined) Memory.settings.layoutPlanningDebugPhaseTo = 10;
  if (Memory.settings.layoutPlanningRecalcScope === undefined) Memory.settings.layoutPlanningRecalcScope = 'all';
  // Manual phase planner mode: planner waits idle until a phase range is initialized via visual.layoutInitializePhase().
  if (Memory.settings.layoutPlanningManualMode === undefined) Memory.settings.layoutPlanningManualMode = false;
  if (Memory.settings.layoutPlanningManualBypassOnce === undefined) Memory.settings.layoutPlanningManualBypassOnce = false;
  processProfilerControl();

  if (Memory.settings && Memory.settings.alwaysShowHud) {
    Memory.settings.enableVisuals = true;
    Memory.settings.showSpawnQueueHud = true;
  }

  memoryManager.observeEnergyReserveEvents();

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
    return;
  }
  if (Memory.settings.pauseNotice !== undefined) {
    delete Memory.settings.pauseNotice;
  }

  processPendingLayoutRecalculation();

  if (Memory.settings && Memory.settings.buildPreviewOnly) {
    const intentProduceStart = Game.cpu.getUsed();
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room || !room.controller || !room.controller.my) continue;
      intentPipeline.produceRoomIntents(room, { previewOnly: true });
    }
    const intentProduceCpu = Game.cpu.getUsed() - intentProduceStart;
    logProfileEntry('Preview Pipeline::Collect Room Intents', intentProduceCpu, {
      parent: 'Preview Pipeline',
      reason: 'preview',
    });
    const htmStart = Game.cpu.getUsed();
    htm.run();
    const htmCpu = Game.cpu.getUsed() - htmStart;
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
      ["Intent Produce", intentProduceCpu],
      ["Intent HTM", htmCpu],
      ["Intent Scan", intentCpu.scan],
      ["Intent Eval", intentCpu.eval],
      ["Intent Plan", intentCpu.plan],
      ["Intent Sync", intentCpu.sync],
      ["Intent HUD", intentCpu.hud],
      ["Intent Other", intentCpu.other],
      ["Preview Mode", totalCPUUsage],
      ["Total", totalCPUUsage],
    ];
    statsConsole.run(myStats);
    return;
  }

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) continue;
    intentPipeline.produceRoomIntents(room, { previewOnly: false });
    const hasSpawns =
      typeof FIND_MY_SPAWNS !== 'undefined' && typeof room.find === 'function'
        ? room.find(FIND_MY_SPAWNS).length > 0
        : false;
    if (!hasSpawns) continue;
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    const scoutInit = Memory.rooms[roomName].scoutInit;
    const needsInit =
      !scoutInit ||
      scoutInit.version !== hiveGaze.SCOUT_INIT_VERSION ||
      !scoutInit.completed;
    if (!needsInit) continue;
    if (scoutInit && scoutInit.pending) continue;
    const taskName = `initializeScoutMemory_${roomName}`;
    scheduler.addTask(taskName, 0, () => hiveGaze.initializeScoutMemory(roomName), {
      once: true,
    });
    Memory.rooms[roomName].scoutInit = {
      version: hiveGaze.SCOUT_INIT_VERSION,
      pending: true,
      queuedAt: Game.time,
    };
  }

  const schedulerStart = Game.cpu.getUsed();
  scheduler.run();
  logProfileEntry('Main Loop::Run Scheduler', Game.cpu.getUsed() - schedulerStart, {
    parent: 'Main Loop',
    reason: 'scheduler',
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
  const roomManagersStartCPU = Game.cpu.getUsed();
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    spawnManager.run(room);
  }

  const roomManagersCPUUsage = Game.cpu.getUsed() - roomManagersStartCPU;
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
  const movementStart = Game.cpu.getUsed();
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    movementUtils.avoidSpawnArea(creep);
  }
  logProfileEntry('Main Loop::Movement Safety', Game.cpu.getUsed() - movementStart, {
    parent: 'Main Loop',
    reason: 'movement',
  });

  // Run late tick management
  const hudStart = Game.cpu.getUsed();
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    hudManager.createHUD(room);
  }
  logProfileEntry('Main Loop::HUD Pass', Game.cpu.getUsed() - hudStart, {
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
    ["Creep Managers", CreepManagersCPUUsage],
    ["Towers", towersCPUUsage],
    ["Links", linksCPUUsage],
    ["Setup Roles", SetupRolesCPUUsage],
    ["Creeps", CreepsCPUUsage],
    ["Init", initCPUUsage],
    ["Stats", statsCPUUsage],
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
}

module.exports.loop = function () {
  processProfilerResetPending();
  const profilerShouldRun = Boolean(Memory && Memory.settings && Memory.settings.enableScreepsProfiler);
  if (profilerShouldRun) {
    if (ensureScreepsProfilerEnabled() && screepsProfiler) {
      registerLoadedModulesForProfiler();
      return screepsProfiler.wrap(runMainLoop);
    }
  }
  return runMainLoop();
};
