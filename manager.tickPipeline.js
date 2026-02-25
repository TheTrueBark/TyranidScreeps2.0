'use strict';

function computeBurstAllowance(bucket) {
  const value = Number(bucket || 0);
  if (value >= 9000) return 220;
  if (value >= 7000) return 140;
  if (value >= 5000) return 80;
  if (value >= 3000) return 30;
  return 0;
}

function deriveMode(bucket) {
  const value = Number(bucket || 0);
  if (value < 2000) return 'LOW_BUCKET';
  if (value > 8000) return 'BURST';
  return 'NORMAL';
}

function bootstrapTick() {
  const used = Game.cpu.getUsed();
  const burst = computeBurstAllowance(Game.cpu.bucket);
  const tickLimit =
    typeof Game.cpu.tickLimit === 'number' && Number.isFinite(Game.cpu.tickLimit)
      ? Game.cpu.tickLimit
      : Number(Game.cpu.limit || 0);
  const softBudget = Math.min(Number(Game.cpu.limit || 0) + burst, tickLimit);
  const mode = deriveMode(Game.cpu.bucket);
  return {
    tick: Game.time,
    tickStartUsed: used,
    burstAllowance: burst,
    softBudget,
    mode,
    flags: {
      LOW_BUCKET: mode === 'LOW_BUCKET',
      NORMAL: mode === 'NORMAL',
      BURST: mode === 'BURST',
    },
    phases: {},
    snapshot: null,
  };
}

function markPhaseStart(ctx, phaseName) {
  if (!ctx || !phaseName) return;
  ctx.phases[phaseName] = ctx.phases[phaseName] || {};
  ctx.phases[phaseName].start = Game.cpu.getUsed();
}

function markPhaseEnd(ctx, phaseName, extra = {}) {
  if (!ctx || !phaseName) return;
  ctx.phases[phaseName] = ctx.phases[phaseName] || {};
  const phase = ctx.phases[phaseName];
  const end = Game.cpu.getUsed();
  const start = Number(phase.start || end);
  phase.cpu = Math.max(0, end - start);
  phase.end = end;
  for (const key in extra) phase[key] = extra[key];
}

function hardStopReached(ctx, headroom = 1.5) {
  if (!ctx) return false;
  return Game.cpu.getUsed() >= Math.max(0, Number(ctx.softBudget || 0) - Number(headroom || 0));
}

function buildMinimalSnapshot() {
  const rooms = {};
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room) continue;
    if (!room.controller || !room.controller.my) continue;
    const hasController = Boolean(room.controller);
    rooms[roomName] = {
      id: roomName,
      my: Boolean(room.controller && room.controller.my),
      hasController,
      controllerLevel: hasController ? Number(room.controller.level || 0) : 0,
      hasSpawn: false,
      spawnCount: 0,
      hostileCount: 0,
      constructionSiteCount: 0,
    };
  }
  return { rooms, events: [], minimal: true };
}

function buildFullSnapshot() {
  const rooms = {};
  const events = [];
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room) continue;
    if (!room.controller || !room.controller.my) continue;
    const hasController = Boolean(room.controller);
    const my = Boolean(room.controller && room.controller.my);
    const spawnCount =
      typeof FIND_MY_SPAWNS !== 'undefined' && typeof room.find === 'function'
        ? room.find(FIND_MY_SPAWNS).length
        : 0;
    const hostileCount =
      typeof FIND_HOSTILE_CREEPS !== 'undefined' && typeof room.find === 'function'
        ? room.find(FIND_HOSTILE_CREEPS).length
        : 0;
    const siteCount =
      typeof FIND_CONSTRUCTION_SITES !== 'undefined' && typeof room.find === 'function'
        ? room.find(FIND_CONSTRUCTION_SITES).length
        : 0;
    rooms[roomName] = {
      id: roomName,
      my,
      hasController,
      controllerLevel: hasController ? Number(room.controller.level || 0) : 0,
      hasSpawn: spawnCount > 0,
      spawnCount,
      hostileCount,
      constructionSiteCount: siteCount,
    };
    if (hostileCount > 0) events.push({ type: 'hostilesSeen', roomName, count: hostileCount });
    if (siteCount > 0) events.push({ type: 'constructionSitesPresent', roomName, count: siteCount });
  }

  return { rooms, events, minimal: false };
}

function buildSnapshot() {
  return buildFullSnapshot();
}

function commitTick(ctx) {
  if (!Memory.stats) Memory.stats = {};
  Memory.stats.tickPipeline = Memory.stats.tickPipeline || { ticks: [], byTick: {} };
  const store = Memory.stats.tickPipeline;
  const snapshot = {
    tick: ctx.tick,
    mode: ctx.mode,
    softBudget: Number(ctx.softBudget || 0),
    tickStartUsed: Number(ctx.tickStartUsed || 0),
    totalCpu: Number((Game.cpu.getUsed() - Number(ctx.tickStartUsed || 0)).toFixed(4)),
    runtime: {
      state: ctx.runtimeState || 'active',
      reason: ctx.runtimeReason || '',
      planningHeartbeat: Boolean(ctx.forcePlanningTick),
      planningHeartbeatTick: Number(ctx.nextPlanningHeartbeatTick || 0),
      preLoopCpu: Number(Number(ctx.preLoopCpu || 0).toFixed(4)),
    },
    phases: {},
  };
  for (const phaseName in ctx.phases) {
    const src = ctx.phases[phaseName] || {};
    snapshot.phases[phaseName] = {
      cpu: Number(Number(src.cpu || 0).toFixed(4)),
      count: Number(src.count || 0),
      notes: src.notes || '',
    };
  }
  store.byTick[String(ctx.tick)] = snapshot;
  store.ticks.push(ctx.tick);
  if (store.ticks.length > 200) {
    const removed = store.ticks.shift();
    delete store.byTick[String(removed)];
  }
}

module.exports = {
  bootstrapTick,
  markPhaseStart,
  markPhaseEnd,
  hardStopReached,
  buildSnapshot,
  buildMinimalSnapshot,
  buildFullSnapshot,
  commitTick,
};
