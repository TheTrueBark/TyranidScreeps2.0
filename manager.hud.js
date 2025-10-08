// hudManager.js
const visualizer = require('manager.visualizer');
const layoutVisualizer = require('./layoutVisualizer');
const spawnQueue = require('./manager.spawnQueue');
const energyRequests = require('./manager.energyRequests');

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
  const limited = sorted.slice(0, MAX_TASK_LINES);

  const lines = [`${room.name} Tasks`, `Active: ${colony.length}`, '-----------------'];

  if (!limited.length) {
    lines.push('  (no pending tasks)');
    return lines;
  }

  limited.forEach((task, idx) => lines.push(formatTaskLabel(task, idx)));
  if (colony.length > MAX_TASK_LINES) {
    lines.push(`  +${colony.length - MAX_TASK_LINES} more…`);
  }
  return lines;
};

const buildEnergySummaryLines = (room) => {
  const summaries = energyRequests
    .getRoomDeliverySummary(room.name)
    .filter(
      (entry) =>
        (entry.outstanding || 0) > 0 || (entry.reserved || 0) > 0,
    )
    .slice(0, MAX_ENERGY_LINES);

  if (!summaries.length) return [];

  const lines = ['Energy Logistics', '-----------------'];
  summaries.forEach((entry) => {
    const label = prettifyWords(entry.structureType || 'structure');
    const outstanding = entry.outstanding || 0;
    const reserved = entry.reserved || 0;
    lines.push(`  ${label}: need ${outstanding}, reserved ${reserved}`);
  });
  if (summaries.length < energyRequests.getRoomDeliverySummary(room.name).length) {
    lines.push('  …');
  }
  return lines;
};

const drawTaskHud = (room) => {
  const taskLines = buildColonyTaskLines(room);
  const energyLines = buildEnergySummaryLines(room);
  const combined = energyLines.length
    ? [...taskLines, '', ...energyLines]
    : taskLines;
  visualizer.showInfo(
    combined,
    { room, pos: new RoomPosition(TASK_PANEL_POS.x, TASK_PANEL_POS.y, room.name) },
    { align: 'right', font: 0.9 },
  );
};

module.exports = {
  createHUD(room) {
    if (!visualizer.enabled) return;

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
};
