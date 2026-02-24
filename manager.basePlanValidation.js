/** @codex-owner layoutPlanner */

const ROAD = typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road';
const RAMPART = typeof STRUCTURE_RAMPART !== 'undefined' ? STRUCTURE_RAMPART : 'rampart';
const EXTENSION = typeof STRUCTURE_EXTENSION !== 'undefined' ? STRUCTURE_EXTENSION : 'extension';
const CONTAINER = typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container';
const LAB = typeof STRUCTURE_LAB !== 'undefined' ? STRUCTURE_LAB : 'lab';

const EXTENSION_CAP_BY_RCL = {
  1: 0,
  2: 5,
  3: 10,
  4: 20,
  5: 30,
  6: 40,
  7: 50,
  8: 60,
};

function toInt(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function inRoomBounds(x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function isBorderTile(x, y) {
  return x === 0 || x === 49 || y === 0 || y === 49;
}

function normalizeBuildQueue(buildQueue = []) {
  if (!Array.isArray(buildQueue)) return { queue: [], issues: ['buildQueue-not-array'], fixes: 1 };

  const queue = [];
  const seen = new Set();
  const issues = [];
  let fixes = 0;

  for (let i = 0; i < buildQueue.length; i++) {
    const entry = buildQueue[i];
    if (!entry || !entry.pos || typeof entry.type !== 'string') {
      issues.push(`queue-invalid-entry:${i}`);
      fixes += 1;
      continue;
    }

    const x = toInt(entry.pos.x, NaN);
    const y = toInt(entry.pos.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !inRoomBounds(x, y)) {
      issues.push(`queue-out-of-bounds:${i}`);
      fixes += 1;
      continue;
    }

    if (isBorderTile(x, y) && entry.type !== ROAD && entry.type !== RAMPART) {
      issues.push(`queue-border-placement:${entry.type}:${x}:${y}`);
      fixes += 1;
      continue;
    }

    const dedupeKey = `${entry.type}:${x}:${y}`;
    if (seen.has(dedupeKey)) {
      issues.push(`queue-duplicate:${dedupeKey}`);
      fixes += 1;
      continue;
    }
    seen.add(dedupeKey);

    const normalized = Object.assign({}, entry, {
      pos: { x, y },
      rcl: Math.max(1, Math.min(8, toInt(entry.rcl, 1))),
      priority: Math.max(1, toInt(entry.priority, 4)),
      built: Boolean(entry.built),
    });

    queue.push(normalized);
  }

  return { queue, issues, fixes };
}

function canCoexist(existingType, nextType) {
  if (existingType === RAMPART || nextType === RAMPART) return true;
  if (existingType === ROAD && nextType === ROAD) return true;
  return false;
}

function normalizeOverlaps(queue = []) {
  const byPos = new Map();
  const nextQueue = [];
  const issues = [];
  let fixes = 0;

  for (const entry of queue) {
    const posKey = `${entry.pos.x}:${entry.pos.y}`;
    const placed = byPos.get(posKey) || [];
    const conflicts = placed.filter((e) => !canCoexist(e.type, entry.type));
    if (conflicts.length > 0) {
      issues.push(`queue-overlap:${entry.type}:${posKey}`);
      fixes += 1;
      continue;
    }
    placed.push(entry);
    byPos.set(posKey, placed);
    nextQueue.push(entry);
  }

  return { queue: nextQueue, issues, fixes };
}

function normalizeExtensionRcl(queue = []) {
  const extEntries = queue.filter((entry) => entry.type === EXTENSION);
  if (extEntries.length === 0) return { queue, issues: [], fixes: 0 };

  const nonExt = queue.filter((entry) => entry.type !== EXTENSION);
  const sorted = extEntries.slice().sort((a, b) => (a.rcl || 1) - (b.rcl || 1));
  const assigned = [];
  const issues = [];
  let fixes = 0;

  function wouldFitAt(rcl) {
    for (let lvl = 1; lvl <= 8; lvl++) {
      const cap = EXTENSION_CAP_BY_RCL[lvl] || 0;
      const used = assigned.reduce((sum, val) => sum + (val <= lvl ? 1 : 0), 0) + (rcl <= lvl ? 1 : 0);
      if (used > cap) return false;
    }
    return true;
  }

  const normalizedExt = [];
  for (const ext of sorted) {
    const start = Math.max(1, Math.min(8, ext.rcl || 1));
    let assignedRcl = null;
    for (let rcl = start; rcl <= 8; rcl++) {
      if (wouldFitAt(rcl)) {
        assignedRcl = rcl;
        break;
      }
    }
    if (assignedRcl === null) {
      issues.push(`queue-extension-over-cap:${ext.pos.x}:${ext.pos.y}`);
      fixes += 1;
      continue;
    }
    if (assignedRcl !== ext.rcl) {
      issues.push(`queue-extension-rcl-shift:${ext.pos.x}:${ext.pos.y}:${ext.rcl}->${assignedRcl}`);
      fixes += 1;
    }
    assigned.push(assignedRcl);
    normalizedExt.push(Object.assign({}, ext, { rcl: assignedRcl }));
  }

  return { queue: [...nonExt, ...normalizedExt], issues, fixes };
}

function validateControllerContainer(roomName, queue = []) {
  const issues = [];
  const room = typeof Game !== 'undefined' && Game.rooms ? Game.rooms[roomName] : null;
  if (!room || !room.controller || !room.controller.pos) return issues;
  const controller = room.controller.pos;
  const cc = queue.find((entry) => entry.type === CONTAINER && entry.tag === 'controller.container');
  if (!cc) {
    issues.push('controller-container-missing');
    return issues;
  }
  const dist = Math.max(Math.abs(cc.pos.x - controller.x), Math.abs(cc.pos.y - controller.y));
  if (dist > 1) {
    issues.push(`controller-container-range-fail:${dist}`);
  }
  return issues;
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function validateLabConstraints(queue = []) {
  const issues = [];
  const labs = queue.filter((entry) => entry.type === LAB);
  if (labs.length === 0) return issues;
  const source1 = labs.find((entry) => entry.tag === 'lab.source.1');
  const source2 = labs.find((entry) => entry.tag === 'lab.source.2');
  const reaction = labs.filter(
    (entry) => entry.tag && String(entry.tag).startsWith('lab.reaction.'),
  );

  if (reaction.length > 0 && (!source1 || !source2)) {
    issues.push('lab-source-missing');
    return issues;
  }

  if (!source1 || !source2) return issues;
  for (const lab of reaction) {
    const d1 = chebyshev(lab.pos, source1.pos);
    const d2 = chebyshev(lab.pos, source2.pos);
    if (d1 > 2 || d2 > 2) {
      issues.push(`lab-range-fail:${lab.pos.x}:${lab.pos.y}`);
    }
  }
  return issues;
}

function validateRampartConnectivity(queue = []) {
  const issues = [];
  const edgeRamparts = queue.filter(
    (entry) => entry.type === RAMPART && entry.tag && String(entry.tag).startsWith('rampart.edge'),
  );
  if (edgeRamparts.length <= 1) return issues;

  const byPos = new Set(edgeRamparts.map((entry) => `${entry.pos.x}:${entry.pos.y}`));
  const seen = new Set();
  let components = 0;

  for (const entry of edgeRamparts) {
    const start = `${entry.pos.x}:${entry.pos.y}`;
    if (seen.has(start)) continue;
    components += 1;
    const stack = [entry.pos];
    seen.add(start);
    while (stack.length > 0) {
      const cur = stack.pop();
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          const key = `${nx}:${ny}`;
          if (!byPos.has(key) || seen.has(key)) continue;
          seen.add(key);
          stack.push({ x: nx, y: ny });
        }
      }
    }
  }

  if (components > 1) {
    issues.push(`rampart-connectivity-fail:${components}`);
  }
  return issues;
}

function validateBasePlan(roomName, basePlan = {}) {
  const startMs = Date.now();
  const issues = [];
  if (!basePlan || typeof basePlan !== 'object') {
    return {
      valid: false,
      issues: ['basePlan-missing'],
      autoFixes: 1,
      normalizedPlan: {
        version: 1,
        generatedAt: typeof Game !== 'undefined' ? Game.time : 0,
        buildQueue: [],
        structures: {},
        evaluation: {},
      },
    };
  }

  const normalizedPlan = Object.assign(
    {
      version: 1,
      generatedAt: typeof Game !== 'undefined' ? Game.time : 0,
      spawnPos: null,
      structures: {},
      buildQueue: [],
      evaluation: {},
      selection: null,
      planningRunId: null,
    },
    basePlan,
  );

  if (normalizedPlan.spawnPos) {
    const sx = toInt(normalizedPlan.spawnPos.x, NaN);
    const sy = toInt(normalizedPlan.spawnPos.y, NaN);
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !inRoomBounds(sx, sy) || isBorderTile(sx, sy)) {
      issues.push('spawnPos-invalid');
      normalizedPlan.spawnPos = null;
    } else {
      normalizedPlan.spawnPos = { x: sx, y: sy };
    }
  }

  const queueNormalization = normalizeBuildQueue(normalizedPlan.buildQueue);
  const overlapNormalization = normalizeOverlaps(queueNormalization.queue);
  const extensionNormalization = normalizeExtensionRcl(overlapNormalization.queue);
  normalizedPlan.buildQueue = extensionNormalization.queue;
  issues.push(...queueNormalization.issues, ...overlapNormalization.issues, ...extensionNormalization.issues);
  issues.push(...validateControllerContainer(roomName, normalizedPlan.buildQueue));
  issues.push(...validateLabConstraints(normalizedPlan.buildQueue));
  issues.push(...validateRampartConnectivity(normalizedPlan.buildQueue));

  const valid = issues.length === 0;
  const durationMs = Math.max(0, Date.now() - startMs);
  return {
    valid,
    issues,
    autoFixes: queueNormalization.fixes + overlapNormalization.fixes + extensionNormalization.fixes,
    roomName: roomName || null,
    checkedAt: typeof Game !== 'undefined' ? Game.time : 0,
    durationMs,
    normalizedPlan,
  };
}

function handleValidationFailure(roomName, validation) {
  const issues = (validation && validation.issues) || [];
  return {
    roomName,
    status: issues.length > 0 ? 'recovered-with-autofix' : 'ok',
    issueCount: issues.length,
    issues,
    checkedAt: typeof Game !== 'undefined' ? Game.time : 0,
  };
}

module.exports = {
  validateBasePlan,
  handleValidationFailure,
  _helpers: {
    normalizeBuildQueue,
    normalizeOverlaps,
    normalizeExtensionRcl,
    validateLabConstraints,
    validateRampartConnectivity,
    isBorderTile,
    inRoomBounds,
  },
};
