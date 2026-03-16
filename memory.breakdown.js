const AUTO_INTERVAL = 100;
const DEFAULT_TOP_N = 12;
const DEFAULT_ROOM_LIMIT = 6;
const DEFAULT_ROOM_BRANCH_LIMIT = 4;
const DEFAULT_TOP_TICK_LIMIT = 5;

function normalizeLimit(value, fallback, max = 50) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(num)));
}

function shouldCaptureMemoryBreakdown(gameTime, lastTick = 0, interval = AUTO_INTERVAL) {
  const tick = Number(gameTime || 0);
  const previous = Number(lastTick || 0);
  const cadence = Math.max(1, Math.floor(Number(interval) || AUTO_INTERVAL));
  if (!Number.isFinite(tick) || tick <= 0) return false;
  if (!Number.isFinite(previous) || previous <= 0) return true;
  return tick - previous >= cadence;
}

function measureSerializedBytes(value) {
  if (value === undefined) return 0;
  try {
    const serialized = JSON.stringify(value);
    return serialized ? serialized.length : 0;
  } catch (err) {
    return 0;
  }
}

function sortBranches(rows = []) {
  return rows
    .filter((row) => row && Number.isFinite(row.bytes) && row.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || String(a.path || '').localeCompare(String(b.path || '')));
}

function pushBranch(rows, path, value, extra = {}) {
  if (!rows || !path || value === undefined) return;
  rows.push(Object.assign({ path, bytes: measureSerializedBytes(value) }, extra));
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0B';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${Math.round(value)}B`;
}

function summarizeTickPipeline(store) {
  const ticks = store && Array.isArray(store.ticks) ? store.ticks : [];
  const byTick = store && store.byTick && typeof store.byTick === 'object' ? store.byTick : {};
  const topTicks = Object.keys(byTick)
    .map((tick) => ({ tick: String(tick), bytes: measureSerializedBytes(byTick[tick]) }))
    .filter((row) => Number.isFinite(row.bytes) && row.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || a.tick.localeCompare(b.tick))
    .slice(0, DEFAULT_TOP_TICK_LIMIT);
  return {
    totalBytes: measureSerializedBytes(store),
    byTickBytes: measureSerializedBytes(store && store.byTick),
    ticksBytes: measureSerializedBytes(ticks),
    tickCount: ticks.length,
    topTicks,
  };
}

function summarizeRoom(roomName, roomMem, branchLimit = DEFAULT_ROOM_BRANCH_LIMIT) {
  const rows = [];
  const layout = roomMem && roomMem.layout ? roomMem.layout : null;
  pushBranch(rows, `rooms.${roomName}.layout`, layout);
  pushBranch(rows, `rooms.${roomName}.layout.theoreticalPipeline`, layout && layout.theoreticalPipeline);
  pushBranch(rows, `rooms.${roomName}.layout.theoreticalCandidatePlans`, layout && layout.theoreticalCandidatePlans);
  pushBranch(rows, `rooms.${roomName}.layout.theoretical`, layout && layout.theoretical);
  pushBranch(rows, `rooms.${roomName}.layout.matrix`, layout && layout.matrix);
  pushBranch(rows, `rooms.${roomName}.layout.roadMatrix`, layout && layout.roadMatrix);
  pushBranch(rows, `rooms.${roomName}.layout.reserved`, layout && layout.reserved);
  pushBranch(rows, `rooms.${roomName}.layout.pipelineRuns`, layout && layout.pipelineRuns);
  pushBranch(rows, `rooms.${roomName}.basePlan`, roomMem && roomMem.basePlan);
  pushBranch(rows, `rooms.${roomName}.distanceTransform`, roomMem && roomMem.distanceTransform);
  pushBranch(rows, `rooms.${roomName}.intentState`, roomMem && roomMem.intentState);
  pushBranch(rows, `rooms.${roomName}.rebuildQueue`, roomMem && roomMem.rebuildQueue);
  pushBranch(rows, `rooms.${roomName}.sources`, roomMem && roomMem.sources);
  pushBranch(rows, `rooms.${roomName}.terrainInfo`, roomMem && roomMem.terrainInfo);

  return {
    room: roomName,
    totalBytes: measureSerializedBytes(roomMem),
    layoutBytes: measureSerializedBytes(layout),
    basePlanBytes: measureSerializedBytes(roomMem && roomMem.basePlan),
    distanceTransformBytes: measureSerializedBytes(roomMem && roomMem.distanceTransform),
    topBranches: sortBranches(rows).slice(0, normalizeLimit(branchLimit, DEFAULT_ROOM_BRANCH_LIMIT, 10)),
  };
}

function buildMemoryBreakdown(memoryRoot = {}, options = {}) {
  const memory = memoryRoot && typeof memoryRoot === 'object' ? memoryRoot : {};
  const topN = normalizeLimit(options.topN, DEFAULT_TOP_N);
  const roomLimit = normalizeLimit(options.roomLimit, DEFAULT_ROOM_LIMIT, 20);
  const roomBranchLimit = normalizeLimit(
    options.roomBranchLimit,
    DEFAULT_ROOM_BRANCH_LIMIT,
    10,
  );
  const topLevelRows = [];
  for (const key of Object.keys(memory)) {
    if (key === 'stats') continue;
    pushBranch(topLevelRows, key, memory[key]);
  }
  const stats = memory.stats && typeof memory.stats === 'object' ? memory.stats : {};
  pushBranch(topLevelRows, 'stats', stats);

  const statsBranches = [];
  pushBranch(statsBranches, 'stats.tickPipeline', stats.tickPipeline);
  pushBranch(statsBranches, 'stats.tickPipeline.byTick', stats.tickPipeline && stats.tickPipeline.byTick, {
    tickCount:
      stats.tickPipeline && Array.isArray(stats.tickPipeline.ticks)
        ? stats.tickPipeline.ticks.length
        : 0,
  });
  pushBranch(statsBranches, 'stats.tickPipeline.ticks', stats.tickPipeline && stats.tickPipeline.ticks);
  pushBranch(statsBranches, 'stats.profilerTickBreakdown', stats.profilerTickBreakdown);
  pushBranch(statsBranches, 'stats.taskLogs', stats.taskLogs);
  pushBranch(statsBranches, 'stats.logs', stats.logs);
  pushBranch(statsBranches, 'stats.taskAverages', stats.taskAverages);
  pushBranch(statsBranches, 'stats.runtime', stats.runtime);
  pushBranch(statsBranches, 'stats.memTrimLast', stats.memTrimLast);
  pushBranch(statsBranches, 'stats.memoryHygiene', stats.memoryHygiene);

  const roomRows = Object.keys(memory.rooms || {})
    .map((roomName) => summarizeRoom(roomName, memory.rooms[roomName], roomBranchLimit))
    .sort((a, b) => b.totalBytes - a.totalBytes || a.room.localeCompare(b.room));

  const topBranches = sortBranches(
    []
      .concat(topLevelRows)
      .concat(statsBranches)
      .concat(roomRows.map((row) => ({ path: `rooms.${row.room}`, bytes: row.totalBytes })))
      .concat(...roomRows.map((row) => row.topBranches)),
  ).slice(0, topN);

  return {
    tick: Number(options.gameTime || 0),
    reason: options.reason || 'manual',
    rawMemoryBytes: Number(options.rawMemoryBytes || 0),
    estimatedBytes: measureSerializedBytes(memory),
    topLevel: sortBranches(topLevelRows).slice(0, topN),
    stats: {
      totalBytes: measureSerializedBytes(stats),
      tickPipeline: summarizeTickPipeline(stats.tickPipeline),
      taskLogsBytes: measureSerializedBytes(stats.taskLogs),
      logsBytes: measureSerializedBytes(stats.logs),
      taskAveragesBytes: measureSerializedBytes(stats.taskAverages),
      profilerTickBreakdownBytes: measureSerializedBytes(stats.profilerTickBreakdown),
      topBranches: sortBranches(statsBranches).slice(0, Math.min(topN, 8)),
    },
    rooms: {
      count: roomRows.length,
      totalBytes: measureSerializedBytes(memory.rooms),
      topRooms: roomRows.slice(0, roomLimit),
    },
    topBranches,
  };
}

function formatRowList(rows = [], options = {}) {
  const limit = normalizeLimit(options.limit, 5, 20);
  const stripPrefix = options.stripPrefix ? String(options.stripPrefix) : '';
  return rows
    .slice(0, limit)
    .map((row) => {
      const label = stripPrefix && String(row.path || '').startsWith(stripPrefix)
        ? String(row.path || '').slice(stripPrefix.length)
        : String(row.path || '');
      return `${label}=${formatBytes(row.bytes)}`;
    })
    .join(' | ');
}

function formatMemoryBreakdownReport(payload, options = {}) {
  if (!payload || typeof payload !== 'object') {
    return ['[memoryBreakdown] no payload'];
  }
  const topN = normalizeLimit(options.topN, Math.min(DEFAULT_TOP_N, 6), 20);
  const roomLimit = normalizeLimit(options.roomLimit, Math.min(DEFAULT_ROOM_LIMIT, 4), 10);
  const roomBranchLimit = normalizeLimit(
    options.roomBranchLimit,
    Math.min(DEFAULT_ROOM_BRANCH_LIMIT, 3),
    10,
  );
  const lines = [];
  const tickPipeline =
    payload.stats && payload.stats.tickPipeline && typeof payload.stats.tickPipeline === 'object'
      ? payload.stats.tickPipeline
      : { totalBytes: 0, byTickBytes: 0, ticksBytes: 0, tickCount: 0, topTicks: [] };
  lines.push(
    `[memoryBreakdown] tick=${Number(payload.tick || 0)} reason=${String(
      payload.reason || 'manual',
    )} raw=${formatBytes(payload.rawMemoryBytes)} est=${formatBytes(payload.estimatedBytes)} rooms=${Number(
      payload.rooms && payload.rooms.count ? payload.rooms.count : 0,
    )}`,
  );
  lines.push(
    `[memoryBreakdown] stats total=${formatBytes(
      payload.stats && payload.stats.totalBytes,
    )} tickPipeline=${formatBytes(tickPipeline.totalBytes)} byTick=${formatBytes(
      tickPipeline.byTickBytes,
    )} ticks=${Number(tickPipeline.tickCount || 0)}/${formatBytes(
      tickPipeline.ticksBytes,
    )} taskLogs=${formatBytes(
      payload.stats && payload.stats.taskLogsBytes,
    )} logs=${formatBytes(payload.stats && payload.stats.logsBytes)}`,
  );
  if (Array.isArray(tickPipeline.topTicks) && tickPipeline.topTicks.length > 0) {
    lines.push(
      `[memoryBreakdown] tickPipeline.byTick heavy: ${tickPipeline.topTicks
        .map((row) => `${row.tick}=${formatBytes(row.bytes)}`)
        .join(' | ')}`,
    );
  }
  if (Array.isArray(payload.topLevel) && payload.topLevel.length > 0) {
    lines.push(`[memoryBreakdown] top-level: ${formatRowList(payload.topLevel, { limit: topN })}`);
  }
  if (Array.isArray(payload.topBranches) && payload.topBranches.length > 0) {
    lines.push(`[memoryBreakdown] heavy: ${formatRowList(payload.topBranches, { limit: topN })}`);
  }
  const topRooms =
    payload.rooms && Array.isArray(payload.rooms.topRooms) ? payload.rooms.topRooms.slice(0, roomLimit) : [];
  for (const room of topRooms) {
    lines.push(
      `[memoryBreakdown] room ${room.room}: total=${formatBytes(
        room.totalBytes,
      )} layout=${formatBytes(room.layoutBytes)} basePlan=${formatBytes(
        room.basePlanBytes,
      )} distanceTransform=${formatBytes(room.distanceTransformBytes)}`,
    );
    if (Array.isArray(room.topBranches) && room.topBranches.length > 0) {
      lines.push(
        `[memoryBreakdown] room ${room.room} heavy: ${formatRowList(room.topBranches, {
          limit: roomBranchLimit,
          stripPrefix: `rooms.${room.room}.`,
        })}`,
      );
    }
  }
  return lines;
}

module.exports = {
  AUTO_INTERVAL,
  DEFAULT_TOP_N,
  DEFAULT_ROOM_LIMIT,
  DEFAULT_ROOM_BRANCH_LIMIT,
  DEFAULT_TOP_TICK_LIMIT,
  shouldCaptureMemoryBreakdown,
  measureSerializedBytes,
  buildMemoryBreakdown,
  formatBytes,
  formatMemoryBreakdownReport,
};
