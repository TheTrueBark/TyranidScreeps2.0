// hudManager.js
const visualizer = require('manager.visualizer');
const layoutVisualizer = require('./layoutVisualizer');
const spawnQueue = require('./manager.spawnQueue');
const energyRequests = require('./manager.energyRequests');
const maintenance = require('./manager.maintenance');
const htm = require('./manager.htm');

const MAX_QUEUE_LINES = 5;
const MAX_TASK_LINES = 6;
const MAX_ENERGY_LINES = 3;
const TASK_PANEL_POS = { x: 47, y: 2 };
const SPAWN_PANEL_POS = { x: 2, y: 2 };
const PANEL_FONT = { align: 'left', font: 0.9 };
const hudCalcCache = {
  theoreticalStatusRowsByRoom: {},
};

const formatCpu = (value) => Number(value || 0).toFixed(2).replace('.', ',');
const toNumber = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
};
const getOverlayMode = () =>
  String((Memory.settings && Memory.settings.overlayMode) || 'normal').toLowerCase();

const sortSpawnRequests = (requests) => spawnQueue.getOrderedQueue(requests);

const formatSpawnLabel = (request) => {
  const rawLabel =
    (request.memory && (request.memory.role || request.memory.roleName)) ||
    request.category ||
    'unknown';
  const withSpaces = rawLabel
    .replace(/[_\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!withSpaces) return 'Unknown';
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
};

const prettifyWords = (value = '') =>
  value
    .toString()
    .replace(/[_\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/^\w/, (match) => match.toUpperCase());

const getSpawnStatusLine = (room = {}) => {
  if (typeof FIND_MY_SPAWNS === 'undefined' || typeof room.find !== 'function') {
    return 'Status: TBD';
  }
  const spawns = room.find(FIND_MY_SPAWNS) || [];
  if (!spawns || spawns.length === 0) return 'Status: TBD';
  const active = spawns.find((spawn) => spawn.spawning);
  if (active && active.spawning) {
    const { name, remainingTime } = active.spawning;
    return `Status: Spawning ${name} (${remainingTime || 0}t)`;
  }
  return 'Status: Idle';
};

const recordRenderSubtask = (roomName, label, cpu) => {
  if (!roomName || !cpu || cpu <= 0) return;
  htm.logSubtaskExecution(`HTM::${label}::Rendering`, cpu, {
    roomName,
    parent: 'HTM',
    reason: 'hud',
  });
};

const buildSpawnQueueLines = (room = {}, requests = []) => {
  const roomName = room.name || 'Spawn';
  const lines = [roomName, getSpawnStatusLine(room), '-----------------', 'Spawn Queue'];

  if (!requests.length) {
    lines.push('  (empty)');
    return lines;
  }

  const ordered = sortSpawnRequests(requests).slice(0, MAX_QUEUE_LINES);
  ordered.forEach((request) => {
    const label = formatSpawnLabel(request);
    const energy =
      typeof request.energyRequired === 'number'
        ? `${request.energyRequired}`
        : '?';
    lines.push(`  ${label} - ${energy}`);
  });

  if (requests.length > MAX_QUEUE_LINES) {
    lines.push(`  +${requests.length - MAX_QUEUE_LINES} more…`);
  }

  return lines;
};

const drawSpawnQueueHud = (room) => {
  if (!Memory.settings || !Memory.settings.showSpawnQueueHud) return;

  const roomQueue = spawnQueue.queue.filter((req) => req.room === room.name);
  const lines = buildSpawnQueueLines(room, roomQueue);
  visualizer.showInfo(
    lines,
    { room, pos: new RoomPosition(SPAWN_PANEL_POS.x, SPAWN_PANEL_POS.y, room.name) },
    PANEL_FONT,
  );
};

const formatTaskLabel = (task, index) => {
  const count =
    typeof task.amount === 'number' && task.amount > 1
      ? ` x${task.amount}`
      : '';
  const priority =
    typeof task.priority === 'number' ? ` [p${task.priority}]` : '';
  const name = prettifyWords(task.name || 'task');
  const manager =
    task.manager && task.manager !== 'unknown'
      ? ` • ${prettifyWords(task.manager)}`
      : '';
  return `  ${index + 1}. ${name}${count}${priority}${manager}`;
};

const buildColonyTaskLines = (room) => {
  const colony =
    Memory.htm &&
    Memory.htm.colonies &&
    Memory.htm.colonies[room.name] &&
    Array.isArray(Memory.htm.colonies[room.name].tasks)
      ? Memory.htm.colonies[room.name].tasks
      : [];
  const sorted = colony
    .slice()
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));
  const now = typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0;
  const planned = sorted.filter((task) => !task.claimedUntil || task.claimedUntil <= now);
  const inProgress = sorted.filter((task) => task.claimedUntil && task.claimedUntil > now);
  const limitedPlanned = planned.slice(0, MAX_TASK_LINES);
  const limitedInProgress = inProgress.slice(0, MAX_TASK_LINES);

  const lines = [`${room.name} Tasks`, `Active: ${colony.length}`, '-----------------'];
  lines.push('Tasks Planned');
  if (!limitedPlanned.length) {
    lines.push('  (none)');
  } else {
    limitedPlanned.forEach((task, idx) => lines.push(formatTaskLabel(task, idx)));
    if (planned.length > MAX_TASK_LINES) {
      lines.push(`  +${planned.length - MAX_TASK_LINES} more…`);
    }
  }
  lines.push('');
  lines.push('Tasks In Progress');
  if (!limitedInProgress.length) {
    lines.push('  (none)');
  } else {
    limitedInProgress.forEach((task, idx) => lines.push(formatTaskLabel(task, idx)));
    if (inProgress.length > MAX_TASK_LINES) {
      lines.push(`  +${inProgress.length - MAX_TASK_LINES} more…`);
    }
  }
  return lines;
};

const buildEnergySummaryLines = (room) => {
  const deliveries = energyRequests
    .getRoomDeliverySummary(room.name)
    .filter((entry) => (entry.outstanding || 0) > 0 || (entry.reserved || 0) > 0);
  const repairs = maintenance.getRoomRepairSummary(room.name);

  const deliverySlice = deliveries.slice(0, MAX_ENERGY_LINES);
  const repairSlice = repairs.slice(0, MAX_ENERGY_LINES);

  if (!deliverySlice.length && !repairSlice.length) return [];

  const lines = ['Energy Logistics', '-----------------'];

  if (deliverySlice.length) {
    deliverySlice.forEach((entry) => {
      const label = prettifyWords(entry.structureType || 'structure');
      const outstanding = entry.outstanding || 0;
      const reserved = entry.reserved || 0;
      lines.push(`  ${label}: need ${outstanding}, reserved ${reserved}`);
    });
    if (deliveries.length > deliverySlice.length) {
      lines.push('  …');
    }
  } else {
    lines.push('  Deliveries: none');
  }

  if (repairSlice.length) {
    if (deliverySlice.length) lines.push('');
    lines.push('Repair Requests');
    repairSlice.forEach((entry) => {
      const label = prettifyWords(entry.structureType || 'structure');
      const missing = Math.max(0, Math.ceil(entry.outstanding || 0));
      const integrity = Math.max(0, Math.min(100, Math.round((entry.ratio || 0) * 100)));
      lines.push(`  ${label}: repair ${missing} (${integrity}% hp)`);
    });
    if (repairs.length > repairSlice.length) {
      lines.push('  …');
    }
  }

  return lines;
};

const buildSpawnLimitLines = (room) => {
  const roomMem = (Memory.rooms && Memory.rooms[room.name]) || {};
  const auto = roomMem.spawnLimits || {};
  const manual = roomMem.manualSpawnLimits || {};
  const roles = ['miners', 'haulers', 'builders', 'upgraders'];
  const roleToCreep = {
    miners: ['miner'],
    haulers: ['hauler'],
    builders: ['builder'],
    upgraders: ['upgrader'],
  };
  const liveCounts = { miner: 0, hauler: 0, builder: 0, upgrader: 0 };

  const belongsToRoom = (creep) => {
    if (!creep || !creep.memory) return false;
    if (creep.room && creep.room.name === room.name) return true;
    if (creep.memory.home === room.name) return true;
    if (creep.memory.colony === room.name) return true;
    if (creep.memory.originRoom === room.name) return true;
    return false;
  };

  const resolveEffectiveRole = (creep) => {
    if (!creep || !creep.memory) return null;
    const memRole = creep.memory.role;
    if (liveCounts[memRole] !== undefined) return memRole;
    const primary = creep.memory.primaryRole;
    if (liveCounts[primary] !== undefined) return primary;
    return null;
  };

  const creeps = Object.values((typeof Game !== 'undefined' && Game.creeps) || {});
  for (const creep of creeps) {
    if (!belongsToRoom(creep)) continue;
    const role = resolveEffectiveRole(creep);
    if (liveCounts[role] !== undefined) liveCounts[role] += 1;
  }
  const lines = ['Spawn Limits', '-----------------'];
  let shown = 0;
  for (const role of roles) {
    const autoValue = auto[role];
    const manualValue = manual[role];
    const hasAuto = typeof autoValue === 'number' && Number.isFinite(autoValue);
    const hasManual = typeof manualValue === 'number' && Number.isFinite(manualValue);
    if (!hasAuto && !hasManual) continue;
    const maxValue = hasManual ? manualValue : autoValue;
    const mode = hasManual ? 'm' : 'a';
    const label = prettifyWords(role);
    const current = (roleToCreep[role] || []).reduce(
      (sum, key) => sum + (liveCounts[key] || 0),
      0,
    );
    lines.push(`  ${label} ${current}/${maxValue} (${mode})`);
    shown += 1;
  }
  if (shown === 0) {
    lines.push('  (none)');
  }
  return lines;
};

const buildBasePlanLines = (room) => {
  const roomMem = (Memory.rooms && Memory.rooms[room.name]) || {};
  const plan = roomMem.basePlan;
  const lines = ['Base Plan', '-----------------'];
  if (!plan || !Array.isArray(plan.buildQueue)) {
    lines.push('  Status: missing');
    return lines;
  }

  const total = plan.buildQueue.length;
  const built = plan.buildQueue.filter((entry) => entry && entry.built).length;
  lines.push(`  Status: ready (${built}/${total})`);
  if (plan.spawnPos && typeof plan.spawnPos.x === 'number') {
    lines.push(`  Spawn: ${plan.spawnPos.x},${plan.spawnPos.y}`);
  }
  if (plan.evaluation && typeof plan.evaluation.weightedScore === 'number') {
    lines.push(`  Score: ${plan.evaluation.weightedScore.toFixed(3)}`);
  }
  if (plan.validation) {
    const issueCount = Array.isArray(plan.validation.issues) ? plan.validation.issues.length : 0;
    lines.push(`  Validation: ${plan.validation.valid ? 'ok' : `warn (${issueCount})`}`);
  }

  const next = plan.buildQueue.find((entry) => entry && !entry.built);
  if (next && next.type && next.pos) {
    lines.push(`  Next: ${prettifyWords(next.type)} @${next.pos.x},${next.pos.y}`);
  } else {
    lines.push('  Next: complete');
  }
  return lines;
};

const drawTaskHud = (room) => {
  const taskLines = buildColonyTaskLines(room);
  const energyLines = buildEnergySummaryLines(room);
  const limitLines = buildSpawnLimitLines(room);
  const basePlanLines = buildBasePlanLines(room);
  const combined = [...taskLines, '', ...limitLines, '', ...basePlanLines];
  if (energyLines.length) {
    combined.push('');
    combined.push(...energyLines);
  }
  visualizer.showInfo(
    combined,
    { room, pos: new RoomPosition(TASK_PANEL_POS.x, TASK_PANEL_POS.y, room.name) },
    { align: 'right', font: 0.9 },
  );
};

const buildTheoreticalStatusRows = (room) => {
  const layout = (Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].layout) || {};
  const theoretical = layout.theoretical || {};
  const pipeline = layout.theoreticalPipeline || {};
  const viewing =
    typeof layout.currentDisplayCandidateIndex === 'number'
      ? layout.currentDisplayCandidateIndex
      : typeof theoretical.currentlyViewingCandidate === 'number'
      ? theoretical.currentlyViewingCandidate
      : typeof theoretical.selectedCandidateIndex === 'number'
      ? theoretical.selectedCandidateIndex
      : 0;
  const candidateCount =
    typeof pipeline.candidateCount === 'number'
      ? pipeline.candidateCount
      : Array.isArray(theoretical.candidates)
      ? theoretical.candidates.length
      : 0;
  const completedCount =
    pipeline && pipeline.results ? Object.keys(pipeline.results).length : candidateCount;

  const rows = [
    { text: `${room.name} Planning`, color: '#ffffff', font: 0.62 },
    { text: `Candidate View: ${viewing + 1}`, color: '#99d1ff', font: 0.5 },
    { text: `Progress: ${completedCount}/${candidateCount || 0}`, color: '#a8f0c6', font: 0.5 },
  ];

  if (typeof theoretical.selectedCandidateIndex === 'number') {
    rows.push({
      text: `Selected Candidate: ${theoretical.selectedCandidateIndex + 1}`,
      color: '#7bd389',
      font: 0.48,
    });
  }
  if (typeof theoretical.selectedWeightedScore === 'number') {
    rows.push({
      text: `Final Score: ${theoretical.selectedWeightedScore.toFixed(3)}`,
      color: '#ffd166',
      font: 0.48,
    });
  }
  if (pipeline && pipeline.status) {
    rows.push({
      text: `Pipeline: ${String(pipeline.status).toUpperCase()}`,
      color: '#c9d7f2',
      font: 0.48,
    });
  }
  const candidateRows = Array.isArray(theoretical.candidates) ? theoretical.candidates : [];
  if (candidateRows.length > 0) {
    const bestIndex =
      typeof theoretical.selectedCandidateIndex === 'number'
        ? theoretical.selectedCandidateIndex
        : typeof pipeline.bestCandidateIndex === 'number'
        ? pipeline.bestCandidateIndex
        : -1;
    rows.push({ text: 'Candidates:', color: '#d9e8ff', font: 0.46 });
    const sorted = candidateRows
      .slice()
      .filter((row) => row && row.anchor && typeof row.index === 'number')
      .sort((a, b) => a.index - b.index)
      .slice(0, 8);
    for (const row of sorted) {
      const isBest = row.index === bestIndex;
      rows.push({
        text: `C${row.index + 1} ${row.anchor.x}/${row.anchor.y}${isBest ? ' ✔' : ''}`,
        color: isBest ? '#7bd389' : '#d9e8ff',
        font: 0.42,
      });
    }
  }
  if (Memory.settings && Memory.settings.enableTaskProfiling) {
    const taskLogs = Memory.stats && Array.isArray(Memory.stats.taskLogs) ? Memory.stats.taskLogs : [];
    const recentIntents = taskLogs
      .filter((entry) => entry && /^INTENT_/.test(String(entry.name || '')))
      .slice(-12);
    const latest = recentIntents.length ? recentIntents[recentIntents.length - 1] : null;
    if (latest) {
      rows.push({
        text: `Last Intent: ${latest.name} (${Number(latest.cpu || 0).toFixed(2)} CPU)`,
        color: '#f8c87a',
        font: 0.45,
      });
    }
  }
  rows.push({
    text: "Switch: visual.layoutCandidate('selected'|1..N)",
    color: '#c1c7d0',
    font: 0.42,
  });
  return rows;
};

const getLatestIntentSummary = (roomName) => {
  if (!Memory.settings || Memory.settings.enableTaskProfiling !== true) return null;
  const taskLogs = Memory.stats && Array.isArray(Memory.stats.taskLogs) ? Memory.stats.taskLogs : [];
  for (let i = taskLogs.length - 1; i >= 0; i--) {
    const entry = taskLogs[i];
    if (!entry) continue;
    const name = String(entry.name || '');
    if (!/^INTENT_/.test(name)) continue;
    const id = entry.id ? String(entry.id) : '';
    if (roomName && id && id !== roomName) continue;
    return {
      tick: Number(entry.tick || 0),
      name,
      cpu: Number(entry.cpu || 0),
      id,
    };
  }
  return null;
};

const getTheoreticalStatusRowsCached = (room) => {
  const cacheEnabled =
    !Memory.settings || Memory.settings.enableHudCalcCache !== false;
  if (!cacheEnabled) return buildTheoreticalStatusRows(room);
  const layout = (Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].layout) || {};
  const theoretical = layout.theoretical || {};
  const pipeline = layout.theoreticalPipeline || {};
  const viewing =
    typeof layout.currentDisplayCandidateIndex === 'number'
      ? layout.currentDisplayCandidateIndex
      : typeof theoretical.currentlyViewingCandidate === 'number'
      ? theoretical.currentlyViewingCandidate
      : typeof theoretical.selectedCandidateIndex === 'number'
      ? theoretical.selectedCandidateIndex
      : -1;
  const candidateCount =
    typeof pipeline.candidateCount === 'number'
      ? pipeline.candidateCount
      : Array.isArray(theoretical.candidates)
      ? theoretical.candidates.length
      : 0;
  const completedCount = pipeline && pipeline.results ? Object.keys(pipeline.results).length : candidateCount;
  const latestIntent = getLatestIntentSummary(room.name);
  const latestKey = latestIntent
    ? `${latestIntent.tick}:${latestIntent.name}:${latestIntent.cpu.toFixed(2)}`
    : 'none';
  const score = typeof theoretical.selectedWeightedScore === 'number'
    ? theoretical.selectedWeightedScore.toFixed(3)
    : 'n/a';
  const selected = typeof theoretical.selectedCandidateIndex === 'number'
    ? theoretical.selectedCandidateIndex
    : -1;
  const key = [
    room.name,
    viewing,
    candidateCount,
    completedCount,
    selected,
    score,
    String((pipeline && pipeline.status) || ''),
    latestKey,
  ].join('|');
  const existing = hudCalcCache.theoreticalStatusRowsByRoom[room.name];
  if (existing && existing.key === key && Array.isArray(existing.rows)) {
    return existing.rows;
  }
  const rows = buildTheoreticalStatusRows(room);
  hudCalcCache.theoreticalStatusRowsByRoom[room.name] = { key, rows };
  return rows;
};

const drawTheoreticalStatusHud = (room) => {
  const rows = getTheoreticalStatusRowsCached(room);
  visualizer.showInfo(
    rows.map((row) => row.text),
    { room, pos: new RoomPosition(SPAWN_PANEL_POS.x, SPAWN_PANEL_POS.y, room.name) },
    PANEL_FONT,
  );
};

const buildLegacyHtmOverlayRows = () => {
  const logs = Memory.stats && Array.isArray(Memory.stats.taskLogs) ? Memory.stats.taskLogs : [];
  const byModule = {};
  const addMetric = (moduleName, metricName, cpu) => {
    if (!byModule[moduleName]) byModule[moduleName] = { calculating: 0, rendering: 0, execution: 0, other: 0, tasks: {} };
    byModule[moduleName][metricName] += cpu;
  };
  const tickHasData = {};
  for (const entry of logs) if (entry && typeof entry.tick === 'number') tickHasData[entry.tick] = true;
  const preferredTick = Game.time - 1;
  const maxTick = logs.reduce((max, entry) => {
    const tick = entry && typeof entry.tick === 'number' ? entry.tick : max;
    return tick > max ? tick : max;
  }, -1);
  const targetTick = tickHasData[preferredTick] ? preferredTick : (maxTick >= 0 ? maxTick : Game.time);
  let tickTotal = 0;
  for (const entry of logs) {
    if (!entry || entry.tick !== targetTick) continue;
    const name = String(entry.name || '');
    const cpu = toNumber(entry.cpu);
    if (!(cpu > 0) || name.indexOf('HTM::') !== 0) continue;
    const parts = name.split('::');
    if (parts.length >= 3 && parts[1] === 'Tick Total') {
      tickTotal += cpu;
      continue;
    }
    if (parts.length >= 3 && parts[1] === 'HTM Tasks (Middle)' && parts[2] !== 'Rendering' && parts[2] !== 'Calcs') {
      const taskName = parts.slice(2).join('::');
      addMetric('HTM Tasks (Middle)', 'execution', cpu);
      if (!byModule['HTM Tasks (Middle)'].tasks[taskName]) byModule['HTM Tasks (Middle)'].tasks[taskName] = 0;
      byModule['HTM Tasks (Middle)'].tasks[taskName] += cpu;
      continue;
    }
    const metricToken = parts[parts.length - 1];
    if (metricToken === 'Calcs' || metricToken === 'Rendering') {
      const modulePath = parts.slice(1, parts.length - 1);
      const moduleName = modulePath.length ? modulePath.join(' -> ') : 'Unknown';
      addMetric(moduleName, metricToken === 'Calcs' ? 'calculating' : 'rendering', cpu);
      continue;
    }
    addMetric(parts.slice(1).join(' -> ') || 'Unknown', 'other', cpu);
  }
  const moduleNames = Object.keys(byModule);
  let moduleSum = 0;
  for (const moduleName of moduleNames) {
    const m = byModule[moduleName];
    moduleSum += m.calculating + m.rendering + m.execution + m.other;
  }
  const rows = [
    { text: `HTM - ${formatCpu(moduleSum)} CPU`, color: '#ffffff', font: 0.5 },
    { text: `Unaccounted - ${formatCpu(tickTotal > 0 ? tickTotal - moduleSum : 0)} CPU`, color: '#ffd166', font: 0.35 },
    { text: 'Profiler data missing (degraded taskLogs)', color: '#ffb366', font: 0.32 },
    { text: ' ', color: '#8ea3cb', font: 0.24 },
  ];
  moduleNames
    .sort((a, b) => {
      const ta = byModule[a].calculating + byModule[a].rendering + byModule[a].execution + byModule[a].other;
      const tb = byModule[b].calculating + byModule[b].rendering + byModule[b].execution + byModule[b].other;
      return tb - ta;
    })
    .forEach((moduleName) => {
      const m = byModule[moduleName];
      const total = m.calculating + m.rendering + m.execution + m.other;
      rows.push({ text: `${moduleName} - ${formatCpu(total)} CPU`, color: '#b8c8e8', font: 0.36 });
      if (m.calculating > 0) rows.push({ text: `|-> Calculating ${formatCpu(m.calculating)} CPU`, color: '#8ea3cb', font: 0.34 });
      if (m.rendering > 0) rows.push({ text: `|-> Rendering ${formatCpu(m.rendering)} CPU`, color: '#8ea3cb', font: 0.34 });
      if (m.execution > 0) rows.push({ text: `|-> Execution ${formatCpu(m.execution)} CPU`, color: '#8ea3cb', font: 0.34 });
      if (m.other > 0) rows.push({ text: `|-> Other ${formatCpu(m.other)} CPU`, color: '#8ea3cb', font: 0.34 });
      if (moduleName === 'HTM Tasks (Middle)') {
        Object.keys(m.tasks)
          .map((taskName) => ({ taskName, cpu: m.tasks[taskName] }))
          .sort((a, b) => b.cpu - a.cpu)
          .forEach((entry) => rows.push({
            text: `|-> Task: ${entry.taskName} - ${formatCpu(entry.cpu)} CPU`,
            color: '#8ea3cb',
            font: 0.32,
          }));
      }
      rows.push({ text: ' ', color: '#8ea3cb', font: 0.24 });
    });
  if (!moduleNames.length) rows.push({ text: 'No HTM data', color: '#888888', font: 0.36 });
  return rows;
};

const parseProfilerTable = (text = '') => {
  const rows = [];
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.indexOf('calls') === 0) continue;
    if (trimmed.indexOf('Avg:') === 0) continue;
    const parts = trimmed.split(/\t+/).filter(Boolean);
    if (parts.length < 4) continue;
    const calls = Number(parts[0]);
    const total = Number(parts[1]);
    const avg = Number(parts[2]);
    const fn = parts.slice(3).join(' ');
    if (!Number.isFinite(total) || !fn) continue;
    rows.push({ calls: Number.isFinite(calls) ? calls : 0, total, avg: Number.isFinite(avg) ? avg : 0, fn });
  }
  return rows;
};

const buildHtmOverlayRows = () => {
  const settings = Memory.settings || {};
  const filter = settings.profilerOverlayMode === 'drilldown' ? String(settings.profilerOverlayFilter || '') : '';
  const limit = Math.max(1, Math.min(100, Math.floor(Number(settings.profilerOverlayLimit || 20))));
  if (!Game.profiler || typeof Game.profiler.output !== 'function') {
    return [
      { text: 'Profiler API unavailable', color: '#ff9966', font: 0.38 },
      { text: 'Enable profiler and wait one tick', color: '#c1c7d0', font: 0.3 },
    ];
  }
  let output = '';
  try {
    output = String(Game.profiler.output(5000) || '');
  } catch (err) {
    return [
      { text: 'Profiler output unavailable', color: '#ff9966', font: 0.38 },
      { text: String(err), color: '#cc7777', font: 0.3 },
    ];
  }
  if (!output || output === 'Profiler not active.') {
    return [
      { text: 'Profiler not active', color: '#ff9966', font: 0.38 },
      { text: "Use visual.profiler('on') or visual.htmOverlay(1)", color: '#c1c7d0', font: 0.3 },
    ];
  }
  const parsed = parseProfilerTable(output).slice(0, limit);
  if (!parsed.length) {
    return [
      { text: 'Profiler warming up', color: '#ffcc88', font: 0.38 },
      { text: 'Wait 1-3 ticks in background mode', color: '#c1c7d0', font: 0.3 },
    ];
  }
  let total = 0;
  for (const row of parsed) total += toNumber(row.total);
  const rows = [
    { text: `Profiler Overlay - ${formatCpu(total)} CPU`, color: '#ffffff', font: 0.5 },
    { text: `Mode: ${filter ? 'drilldown' : 'global'}  Filter: ${filter || 'none'}`, color: '#9fb5d6', font: 0.3 },
    { text: ' ', color: '#8ea3cb', font: 0.24 },
  ];
  parsed.forEach((entry, idx) => {
    rows.push({
      text: `${idx + 1}. ${entry.fn}`,
      color: '#b8c8e8',
      font: 0.33,
    });
    rows.push({
      text: `|-> Calls ${entry.calls}  CPU ${formatCpu(entry.total)}  Avg ${formatCpu(entry.avg)}`,
      color: '#8ea3cb',
      font: 0.3,
    });
    rows.push({ text: ' ', color: '#8ea3cb', font: 0.24 });
  });
  return rows;
};

const drawHtmOverlay = (room) => {
  const settings = Memory.settings || {};
  if (settings.showHtmOverlay === false) return;
  if (typeof RoomVisual !== 'function') return;
  const vis = new RoomVisual(room.name);
  if (!vis || typeof vis.text !== 'function') return;
  const calcStart = Game.cpu.getUsed();
  const rows = buildHtmOverlayRows();
  const calcCpu = Game.cpu.getUsed() - calcStart;
  if (calcCpu > 0) {
    htm.logSubtaskExecution('HTM::HTM Tasks (Middle)::Build Rows::Calcs', calcCpu, {
      roomName: room.name,
      parent: 'HTM',
      reason: 'hud',
    });
  }
  const renderStart = Game.cpu.getUsed();
  let y = 1.2;
  for (const row of rows) {
    vis.text(row.text, 25, y, {
      align: 'center',
      color: row.color || '#dddddd',
      font: row.font || 0.38,
    });
    y += 0.48;
  }
  const renderCpu = Game.cpu.getUsed() - renderStart;
  if (renderCpu > 0) {
    htm.logSubtaskExecution('HTM::HTM Tasks (Middle)::Rendering', renderCpu, {
      roomName: room.name,
      parent: 'HTM',
      reason: 'hud',
    });
  }
};

module.exports = {
  createHUD(room) {
    const settings = Memory.settings || {};
    const overlayMode = getOverlayMode();
    if (overlayMode === 'off') return;
    const theoreticalMode =
      String(settings.layoutPlanningMode || 'theoretical').toLowerCase() === 'theoretical';
    const visualsEnabled = Boolean(visualizer.enabled);
    const layoutOverlayEnabled = settings.showLayoutOverlay !== false;

    if (overlayMode === 'debug') {
      if (theoreticalMode) {
        const start = Game.cpu.getUsed();
        drawTheoreticalStatusHud(room);
        recordRenderSubtask(room.name, 'Status Overlay (Top Left)', Game.cpu.getUsed() - start);
      }
      drawHtmOverlay(room);
      return;
    }

    if (!visualsEnabled && settings.showHtmOverlay !== true) {
      return;
    }

    if (theoreticalMode) {
      // In planning mode we only draw planning HUD to avoid overlap with checklist panels.
      if (visualsEnabled) {
        let start = Game.cpu.getUsed();
        drawTheoreticalStatusHud(room);
        recordRenderSubtask(room.name, 'Status Overlay (Top Left)', Game.cpu.getUsed() - start);
      }
      if (layoutOverlayEnabled) {
        const start = Game.cpu.getUsed();
        layoutVisualizer.drawLayout(room.name);
        recordRenderSubtask(room.name, 'Structure Overlay', Game.cpu.getUsed() - start);
      }
      drawHtmOverlay(room);
      return;
    }

    if (visualsEnabled) {
      drawSpawnQueueHud(room);
      drawTaskHud(room);

      // Controller level near controller
      if (room.controller) {
        visualizer.showInfo([`RCL: ${room.controller.level}`], {
          room,
          pos: room.controller.pos,
        });
      }

      // Mark energy sources
      const sources = room.find(FIND_SOURCES);
      for (const source of sources) {
        visualizer.circle(source.pos, "yellow");
      }

      // Task summary for this colony
      const start = Game.cpu.getUsed();
      layoutVisualizer.drawLayout(room.name);
      recordRenderSubtask(room.name, 'Structure Overlay', Game.cpu.getUsed() - start);
    }
    drawHtmOverlay(room);
  },
  _buildSpawnQueueLines: buildSpawnQueueLines,
  _buildColonyTaskLines: buildColonyTaskLines,
  _buildSpawnLimitLines: buildSpawnLimitLines,
  _buildBasePlanLines: buildBasePlanLines,
  _parseProfilerTable: parseProfilerTable,
  _buildHtmOverlayRows: buildHtmOverlayRows,
};
