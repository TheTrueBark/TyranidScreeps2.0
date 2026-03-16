const CHECK_INTERVAL = 25;
const PERIODIC_SWEEP_INTERVAL = 500;
const WARN_BYTES = 1500000;
const TRIM_BYTES = 1800000;
const SWEEP_BYTES = 1950000;
const WARN_COOLDOWN = 100;
const PERIODIC_SWEEP_MIN_BUCKET = 2000;
const PRESSURE_TRIM_MIN_BUCKET = 500;
const PRESSURE_SWEEP_MIN_BUCKET = 1000;

const SAFE_PIPELINE_STATUSES = new Set([
  'completed',
  'failed',
  'stale',
  'paused_phase_10',
  'cancelled',
  'canceled',
  'aborted',
]);

function shouldCheckAutoMemoryHygiene(gameTime, lastCheckTick = 0, interval = CHECK_INTERVAL) {
  const tick = Number(gameTime || 0);
  const previous = Number(lastCheckTick || 0);
  const cadence = Math.max(1, Math.floor(Number(interval) || CHECK_INTERVAL));
  if (!Number.isFinite(tick) || tick <= 0) return false;
  if (!Number.isFinite(previous) || previous <= 0) return true;
  return tick - previous >= cadence;
}

function classifyMemoryPressure(memoryBytes = 0) {
  const bytes = Math.max(0, Number(memoryBytes || 0));
  if (bytes >= SWEEP_BYTES) return 'sweep';
  if (bytes >= TRIM_BYTES) return 'trim';
  if (bytes >= WARN_BYTES) return 'warn';
  return 'normal';
}

function shouldRunPeriodicMemorySweep(options = {}) {
  const runtimeMode = String(options.runtimeMode || 'live').toLowerCase();
  if (runtimeMode === 'maintenance') return false;
  const tick = Number(options.gameTime || 0);
  const lastSweepTick = Number(options.lastSweepTick || 0);
  const cadence = Math.max(1, Math.floor(Number(options.interval) || PERIODIC_SWEEP_INTERVAL));
  const bucket = Number.isFinite(Number(options.bucket)) ? Number(options.bucket) : 10000;
  const minBucket = Math.max(
    0,
    Math.floor(Number(options.minBucket) || PERIODIC_SWEEP_MIN_BUCKET),
  );
  if (!Number.isFinite(tick) || tick <= 0) return false;
  if (bucket < minBucket) return false;
  if (!Number.isFinite(lastSweepTick) || lastSweepTick <= 0) return tick >= cadence;
  return tick - lastSweepTick >= cadence;
}

function canAutoPruneLayout(roomMem = null) {
  if (!roomMem || typeof roomMem !== 'object') return true;
  const layout = roomMem.layout && typeof roomMem.layout === 'object' ? roomMem.layout : null;
  const pipeline = layout && layout.theoreticalPipeline && typeof layout.theoreticalPipeline === 'object'
    ? layout.theoreticalPipeline
    : null;
  const activeRunId =
    roomMem.intentState && roomMem.intentState.activeRunId
      ? String(roomMem.intentState.activeRunId)
      : '';
  if (!pipeline) {
    return activeRunId === '';
  }
  const status = String(pipeline.status || '').toLowerCase();
  if (!SAFE_PIPELINE_STATUSES.has(status)) return false;
  if (!activeRunId) return true;
  const pipelineRunId = pipeline.runId ? String(pipeline.runId) : '';
  return pipelineRunId !== activeRunId;
}

function decideAutoMemoryHygieneAction(options = {}) {
  const runtimeMode = String(options.runtimeMode || 'live').toLowerCase();
  const pressure = classifyMemoryPressure(options.memoryBytes || 0);
  const bucket = Number.isFinite(Number(options.bucket)) ? Number(options.bucket) : 10000;
  if (runtimeMode === 'maintenance') {
    return { action: 'none', reason: 'maintenance', pressure };
  }

  if (pressure === 'sweep') {
    if (bucket >= PRESSURE_SWEEP_MIN_BUCKET) {
      return { action: 'sweep', reason: 'pressure-sweep', pressure };
    }
    if (bucket >= PRESSURE_TRIM_MIN_BUCKET) {
      return { action: 'trim', reason: 'pressure-sweep-downgraded', pressure };
    }
    return { action: 'warn', reason: 'pressure-sweep-deferred', pressure };
  }

  if (pressure === 'trim') {
    if (bucket >= PRESSURE_TRIM_MIN_BUCKET) {
      return { action: 'trim', reason: 'pressure-trim', pressure };
    }
    return { action: 'warn', reason: 'pressure-trim-deferred', pressure };
  }

  if (pressure === 'warn') {
    return { action: 'warn', reason: 'pressure-warn', pressure };
  }

  if (shouldRunPeriodicMemorySweep(options)) {
    return { action: 'sweep', reason: 'periodic-sweep', pressure };
  }

  return { action: 'none', reason: 'steady', pressure };
}

module.exports = {
  CHECK_INTERVAL,
  PERIODIC_SWEEP_INTERVAL,
  WARN_BYTES,
  TRIM_BYTES,
  SWEEP_BYTES,
  WARN_COOLDOWN,
  PERIODIC_SWEEP_MIN_BUCKET,
  PRESSURE_TRIM_MIN_BUCKET,
  PRESSURE_SWEEP_MIN_BUCKET,
  shouldCheckAutoMemoryHygiene,
  shouldRunPeriodicMemorySweep,
  classifyMemoryPressure,
  canAutoPruneLayout,
  decideAutoMemoryHygieneAction,
};
