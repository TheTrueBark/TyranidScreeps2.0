'use strict';

const PIPELINES = ['critical', 'realtime', 'background', 'burstOnly'];
const DOMAINS = ['combat', 'econ', 'logistics', 'build', 'scout', 'planner', 'misc'];
const BANDS = [0, 1, 2, 3];

class BinaryHeap {
  constructor(compareFn) {
    this.compare = compareFn;
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  push(item) {
    this.items.push(item);
    this._bubbleUp(this.items.length - 1);
  }

  pop() {
    if (!this.items.length) return null;
    const top = this.items[0];
    const tail = this.items.pop();
    if (this.items.length && tail) {
      this.items[0] = tail;
      this._bubbleDown(0);
    }
    return top;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[index], this.items[parent]) >= 0) break;
      const tmp = this.items[index];
      this.items[index] = this.items[parent];
      this.items[parent] = tmp;
      index = parent;
    }
  }

  _bubbleDown(index) {
    const length = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < length && this.compare(this.items[left], this.items[best]) < 0) best = left;
      if (right < length && this.compare(this.items[right], this.items[best]) < 0) best = right;
      if (best === index) break;
      const tmp = this.items[index];
      this.items[index] = this.items[best];
      this.items[best] = tmp;
      index = best;
    }
  }
}

function compareQueueItems(a, b) {
  if ((a.deadlineTick || 0) !== (b.deadlineTick || 0)) {
    const ad = Number.isFinite(a.deadlineTick) ? a.deadlineTick : Number.MAX_SAFE_INTEGER;
    const bd = Number.isFinite(b.deadlineTick) ? b.deadlineTick : Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
  }
  const ap = (a.priorityBase || 0) + (a.priorityDyn || 0);
  const bp = (b.priorityBase || 0) + (b.priorityDyn || 0);
  if (ap !== bp) return ap - bp;
  return (a.insertOrder || 0) - (b.insertOrder || 0);
}

function normalizePipeline(value) {
  const key = String(value || '').toLowerCase();
  if (PIPELINES.indexOf(key) !== -1) return key;
  return 'realtime';
}

function normalizeDomain(value) {
  const key = String(value || '').toLowerCase();
  if (DOMAINS.indexOf(key) !== -1) return key;
  return 'misc';
}

function normalizeBand(value) {
  const num = Math.max(0, Math.min(3, Math.floor(Number(value) || 0)));
  return num;
}

class DomainQueueScheduler {
  constructor() {
    this._insertOrder = 0;
    this._invalid = {};
    this._heaps = {};
    this._stats = {};
    this._currentTick = 0;
    this._buildHeaps();
  }

  _buildHeaps() {
    this._heaps = {};
    this._stats = {
      push: 0,
      pop: 0,
      staleDrops: 0,
      blockedSkips: 0,
      executed: 0,
      costEst: {
        low: 0,
        medium: 0,
        high: 0,
        total: 0,
      },
      queues: {},
    };
    for (const pipeline of PIPELINES) {
      this._heaps[pipeline] = {};
      for (const domain of DOMAINS) {
        this._heaps[pipeline][domain] = {};
        for (const band of BANDS) {
          this._heaps[pipeline][domain][band] = new BinaryHeap(compareQueueItems);
        }
      }
    }
  }

  startTick(tick) {
    this._currentTick = Number(tick || 0);
    this._invalid = {};
    this._buildHeaps();
  }

  enqueue(task) {
    if (!task || !task.taskId) return false;
    const pipeline = normalizePipeline(task.pipelineBucket || task.pipeline || 'realtime');
    const domain = normalizeDomain(task.domain || 'misc');
    const band = normalizeBand(task.priorityBand || 0);
    const item = Object.assign({}, task, {
      pipeline,
      domain,
      priorityBand: band,
      insertOrder: this._insertOrder++,
    });
    this._heaps[pipeline][domain][band].push(item);
    this._stats.push += 1;
    const cost = String(item.costEst || 'low').toLowerCase();
    if (cost === 'high') this._stats.costEst.high += 1;
    else if (cost === 'medium') this._stats.costEst.medium += 1;
    else this._stats.costEst.low += 1;
    this._stats.costEst.total += 1;
    return true;
  }

  defer(task, untilTick) {
    if (!task) return;
    task.cooldownUntil = Math.max(this._currentTick + 1, Number(untilTick || this._currentTick + 1));
  }

  invalidate(taskId) {
    if (!taskId) return;
    this._invalid[String(taskId)] = true;
  }

  runPhase(phaseName, budget, runner, options = {}) {
    const maxCpu = Math.max(0, Number(budget || 0));
    const startCpu = typeof Game !== 'undefined' && Game.cpu && typeof Game.cpu.getUsed === 'function'
      ? Game.cpu.getUsed()
      : 0;
    const pipelines = Array.isArray(options.pipelines) && options.pipelines.length
      ? options.pipelines.map(normalizePipeline)
      : PIPELINES.slice();
    const domains = Array.isArray(options.domains) && options.domains.length
      ? options.domains.map(normalizeDomain)
      : DOMAINS.slice();
    let executed = 0;
    let keepRunning = true;
    while (keepRunning) {
      const nowCpu =
        typeof Game !== 'undefined' && Game.cpu && typeof Game.cpu.getUsed === 'function'
          ? Game.cpu.getUsed()
          : startCpu;
      if (maxCpu > 0 && nowCpu - startCpu >= maxCpu) break;
      const next = this._popNext(pipelines, domains);
      if (!next) break;
      const id = String(next.taskId);
      if (this._invalid[id]) {
        this._stats.staleDrops += 1;
        continue;
      }
      if (Number(next.validUntil || 0) > 0 && this._currentTick > Number(next.validUntil)) {
        this._stats.staleDrops += 1;
        continue;
      }
      if (Number(next.cooldownUntil || 0) > this._currentTick) {
        this._stats.blockedSkips += 1;
        continue;
      }
      const out = runner(next, phaseName) || {};
      if (out && out.invalidate === true) this.invalidate(id);
      if (out && typeof out.deferUntil === 'number') this.defer(next, out.deferUntil);
      executed += 1;
      this._stats.executed += 1;
      if (out && out.stop === true) keepRunning = false;
    }
    return {
      phase: String(phaseName || 'unknown'),
      executed,
      cpu: (
        (typeof Game !== 'undefined' && Game.cpu && typeof Game.cpu.getUsed === 'function'
          ? Game.cpu.getUsed()
          : startCpu) - startCpu
      ),
    };
  }

  _popNext(pipelines, domains) {
    for (const pipeline of pipelines) {
      const byDomain = this._heaps[pipeline];
      if (!byDomain) continue;
      for (const domain of domains) {
        const byBand = byDomain[domain];
        if (!byBand) continue;
        for (const band of BANDS) {
          const heap = byBand[band];
          if (!heap || heap.size() === 0) continue;
          const item = heap.pop();
          this._stats.pop += 1;
          if (!item) continue;
          return item;
        }
      }
    }
    return null;
  }

  getStats() {
    const queueSizes = {};
    for (const pipeline of PIPELINES) {
      for (const domain of DOMAINS) {
        for (const band of BANDS) {
          const key = `${pipeline}.${domain}.b${band}`;
          const heap = this._heaps[pipeline][domain][band];
          queueSizes[key] = heap ? heap.size() : 0;
        }
      }
    }
    const total = Number(this._stats.costEst.total || 0);
    const weighted =
      Number(this._stats.costEst.low || 0) * 1 +
      Number(this._stats.costEst.medium || 0) * 2 +
      Number(this._stats.costEst.high || 0) * 3;
    return Object.assign({}, this._stats, {
      queueSizes,
      avgCostEst: total > 0 ? Number((weighted / total).toFixed(4)) : 0,
    });
  }
}

module.exports = {
  BinaryHeap,
  DomainQueueScheduler,
  PIPELINES,
  DOMAINS,
  BANDS,
};
