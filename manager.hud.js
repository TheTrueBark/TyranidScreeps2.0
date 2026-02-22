// hudManager.js
const visualizer = require('manager.visualizer');
const layoutVisualizer = require('./layoutVisualizer');
const spawnQueue = require('./manager.spawnQueue');
const energyRequests = require('./manager.energyRequests');
const maintenance = require('./manager.maintenance');

const MAX_QUEUE_LINES = 5;
const MAX_TASK_LINES = 6;
const MAX_ENERGY_LINES = 3;
const TASK_PANEL_POS = { x: 47, y: 2 };
const SPAWN_PANEL_POS = { x: 2, y: 2 };
const PANEL_FONT = { align: 'left', font: 0.9 };

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

const drawTaskHud = (room) => {
  const taskLines = buildColonyTaskLines(room);
  const energyLines = buildEnergySummaryLines(room);
  const limitLines = buildSpawnLimitLines(room);
  const combined = [...taskLines, '', ...limitLines];
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

module.exports = {
  createHUD(room) {
    const settings = Memory.settings || {};
    const theoreticalMode =
      String(settings.layoutPlanningMode || 'standard').toLowerCase() === 'theoretical';

    // Allow layout overlay rendering even when regular HUD visuals are disabled.
    if (!visualizer.enabled) {
      layoutVisualizer.drawLayout(room.name);
      return;
    }

    if (theoreticalMode) {
      // Theoretical planning view intentionally suppresses normal runtime HUD
      // panels and source markers to keep the planning overlay readable.
      layoutVisualizer.drawLayout(room.name);
      return;
    }

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
    layoutVisualizer.drawLayout(room.name);
  },
  _buildSpawnQueueLines: buildSpawnQueueLines,
  _buildColonyTaskLines: buildColonyTaskLines,
  _buildSpawnLimitLines: buildSpawnLimitLines,
};
