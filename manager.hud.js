// hudManager.js
const visualizer = require("manager.visualizer");
const layoutVisualizer = require('./layoutVisualizer');
const spawnQueue = require('./manager.spawnQueue');

const MAX_QUEUE_LINES = 5;
const STATUS_PLACEHOLDER = 'Status: TBD';

const sortSpawnRequests = (requests) =>
  requests.sort((a, b) => {
    if (a.parentTick !== b.parentTick) return a.parentTick - b.parentTick;
    if (a.subOrder !== b.subOrder) return a.subOrder - b.subOrder;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.ticksToSpawn - b.ticksToSpawn;
  });

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

const buildSpawnQueueLines = (room, requests = []) => {
  const lines = [
    room.name,
    STATUS_PLACEHOLDER,
    '-----------------',
    'Spawn Queue',
  ];

  if (!requests.length) {
    lines.push('  (empty)');
    return lines;
  }

  const ordered = sortSpawnRequests([...requests]).slice(0, MAX_QUEUE_LINES);
  for (const request of ordered) {
    lines.push(`  ${formatSpawnLabel(request)} - ${request.energyRequired}`);
  }

  return lines;
};

const drawSpawnQueueHud = (room) => {
  if (!Memory.settings || !Memory.settings.showSpawnQueueHud) return;

  const roomQueue = spawnQueue.queue.filter((req) => req.room === room.name);
  const lines = buildSpawnQueueLines(room, roomQueue);
  visualizer.showInfo(
    lines,
    { room, pos: new RoomPosition(2, 2, room.name) },
    { align: 'left', font: 0.9 },
  );
};

module.exports = {
  createHUD(room) {
    if (!visualizer.enabled) return;

    drawSpawnQueueHud(room);

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
    const tasks =
      (Memory.htm &&
        Memory.htm.colonies &&
        Memory.htm.colonies[room.name] &&
        Memory.htm.colonies[room.name].tasks) || [];
    const taskLines = tasks.map((t) => `${t.name} (${t.amount})`);
    if (taskLines.length > 0) {
      visualizer.showInfo(
        taskLines,
        { room, pos: new RoomPosition(48, 1, room.name) },
        { align: 'right' },
      );
    }

    layoutVisualizer.drawLayout(room.name);
  },
  _buildSpawnQueueLines: buildSpawnQueueLines,
};
