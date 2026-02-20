const statsConsole = require('console.console');
const LZString = require('./vendor.lz-string');
const savestate = require('./debug.savestate');

const INCIDENT_SCHEMA_VERSION = 1;
const DEFAULT_LOG_WINDOW = 150;
const DEFAULT_MAX_INCIDENTS = 25;
const DEFAULT_MAX_INCIDENT_AGE = 20000;

function ensureContainers() {
  if (!Memory.debug) Memory.debug = {};
  if (!Memory.debug.incidents) Memory.debug.incidents = {};
  if (!Memory.settings) Memory.settings = {};
  if (Memory.settings.maxIncidents === undefined) {
    Memory.settings.maxIncidents = DEFAULT_MAX_INCIDENTS;
  }
  if (Memory.settings.incidentLogWindow === undefined) {
    Memory.settings.incidentLogWindow = DEFAULT_LOG_WINDOW;
  }
  if (Memory.settings.incidentMaxAge === undefined) {
    Memory.settings.incidentMaxAge = DEFAULT_MAX_INCIDENT_AGE;
  }
}

function clone(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
}

function parseModule(message) {
  if (typeof message !== 'string') return 'unknown';
  const match = /^\[([^\]]+)\]/.exec(message);
  return match ? match[1] : 'general';
}

function sliceLogs(windowTicks) {
  const logs = (Memory.stats && Array.isArray(Memory.stats.logs))
    ? Memory.stats.logs
    : [];
  const fromTick = Math.max(0, (Game.time || 0) - windowTicks);
  return logs
    .filter((entry) => (entry && typeof entry.time === 'number' ? entry.time >= fromTick : true))
    .map((entry) => ({
      message: entry.message,
      severity: entry.severity,
      time: entry.time,
      duration: entry.duration,
      count: entry.count || 1,
      module: parseModule(entry.message),
    }));
}

function sliceTaskLogs(windowTicks) {
  const taskLogs = (Memory.stats && Array.isArray(Memory.stats.taskLogs))
    ? Memory.stats.taskLogs
    : [];
  const fromTick = Math.max(0, (Game.time || 0) - windowTicks);
  return taskLogs
    .filter((entry) => (entry && typeof entry.tick === 'number' ? entry.tick >= fromTick : true))
    .map((entry) => ({
      tick: entry.tick,
      level: entry.level,
      id: entry.id,
      name: entry.name,
      result: entry.result,
      cpu: entry.cpu,
      reason: entry.reason || '',
    }));
}

function summarizeLogs(logs) {
  const severityCounts = {};
  const moduleCounts = {};
  for (const log of logs) {
    const sev = String(log.severity);
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    moduleCounts[log.module] = (moduleCounts[log.module] || 0) + 1;
  }

  const topModules = Object.keys(moduleCounts)
    .map((name) => ({ name, count: moduleCounts[name] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { severityCounts, topModules };
}

function summarizeHTM() {
  const summary = { hive: 0, clusters: 0, colonies: 0, creeps: 0 };
  if (!Memory.htm) return summary;

  summary.hive = Memory.htm.hive && Array.isArray(Memory.htm.hive.tasks)
    ? Memory.htm.hive.tasks.length
    : 0;

  if (Memory.htm.clusters) {
    for (const id in Memory.htm.clusters) {
      const tasks = Memory.htm.clusters[id] && Memory.htm.clusters[id].tasks;
      summary.clusters += Array.isArray(tasks) ? tasks.length : 0;
    }
  }

  if (Memory.htm.colonies) {
    for (const id in Memory.htm.colonies) {
      const tasks = Memory.htm.colonies[id] && Memory.htm.colonies[id].tasks;
      summary.colonies += Array.isArray(tasks) ? tasks.length : 0;
    }
  }

  if (Memory.htm.creeps) {
    for (const id in Memory.htm.creeps) {
      const tasks = Memory.htm.creeps[id] && Memory.htm.creeps[id].tasks;
      summary.creeps += Array.isArray(tasks) ? tasks.length : 0;
    }
  }

  return summary;
}

function buildIncident(id, note, options) {
  const windowTicks =
    typeof options.windowTicks === 'number'
      ? options.windowTicks
      : (Memory.settings.incidentLogWindow || DEFAULT_LOG_WINDOW);

  const logs = sliceLogs(windowTicks);
  const taskLogs = sliceTaskLogs(windowTicks);
  const savestateId = options.savestateId || `incident-${id}`;

  let savestateRef = null;
  if (options.includeSavestate !== false) {
    savestate.saveSavestate(savestateId, `Incident ${id}: ${note || ''}`.trim());
    savestateRef = savestateId;
  }

  const queue = Array.isArray(Memory.spawnQueue)
    ? Memory.spawnQueue.map((q) => ({
      requestId: q.requestId,
      room: q.room,
      category: q.category,
      priority: q.priority,
      ticksToSpawn: q.ticksToSpawn,
      parentTaskId: q.parentTaskId || null,
    }))
    : [];

  return {
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    incidentId: id,
    note: note || null,
    capturedAtTick: Game.time,
    shard: Game.shard ? Game.shard.name : null,
    cpu: {
      bucket: Game.cpu ? Game.cpu.bucket : null,
      used: Game.cpu && Game.cpu.getUsed ? Game.cpu.getUsed() : null,
      limit: Game.cpu ? Game.cpu.limit : null,
    },
    savestateRef,
    logWindowTicks: windowTicks,
    logs,
    taskLogs,
    summary: {
      logs: summarizeLogs(logs),
      taskLogCount: taskLogs.length,
      queueSize: queue.length,
      htmTasks: summarizeHTM(),
    },
    queue,
    htm: clone(Memory.htm || {}, {}),
    context: clone(options.context || {}, {}),
  };
}

function pruneIncidents() {
  ensureContainers();
  const entries = Object.keys(Memory.debug.incidents).map((id) => ({
    id,
    created: Memory.debug.incidents[id].created || 0,
  }));
  entries.sort((a, b) => a.created - b.created);

  const maxIncidents = Math.max(1, Memory.settings.maxIncidents || DEFAULT_MAX_INCIDENTS);
  while (entries.length > maxIncidents) {
    const oldest = entries.shift();
    delete Memory.debug.incidents[oldest.id];
  }

  const maxAge = Memory.settings.incidentMaxAge;
  if (typeof maxAge === 'number' && Number.isFinite(maxAge) && maxAge > 0) {
    const cutoff = (Game.time || 0) - maxAge;
    for (const id in Memory.debug.incidents) {
      const created = Memory.debug.incidents[id].created || 0;
      if (created < cutoff) delete Memory.debug.incidents[id];
    }
  }
}

function saveIncident(id, note = '', options = {}) {
  ensureContainers();
  if (!id || typeof id !== 'string') {
    throw new Error('incident id must be a non-empty string');
  }

  const incident = buildIncident(id, note, options);
  const compressed = LZString.compressToBase64(JSON.stringify(incident));
  Memory.debug.incidents[id] = {
    created: Game.time,
    note: note || null,
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    compressed,
    savestateRef: incident.savestateRef,
    summary: incident.summary,
  };

  pruneIncidents();
  statsConsole.log(`[incident] Captured incident ${id}`, 2);
  return Memory.debug.incidents[id];
}

function decodeIncident(entry) {
  if (!entry || !entry.compressed) return null;
  try {
    const json = LZString.decompressFromBase64(entry.compressed);
    if (!json) return null;
    return JSON.parse(json);
  } catch (error) {
    statsConsole.log(`[incident] Failed to decode incident: ${error.message}`, 5);
    return null;
  }
}

function inspectIncident(id) {
  ensureContainers();
  const entry = Memory.debug.incidents[id];
  if (!entry) return null;
  return decodeIncident(entry);
}

function listIncidents() {
  ensureContainers();
  const list = [];
  for (const id in Memory.debug.incidents) {
    const entry = Memory.debug.incidents[id];
    list.push({
      id,
      created: entry.created || null,
      note: entry.note || null,
      savestateRef: entry.savestateRef || null,
      schemaVersion: entry.schemaVersion || null,
      summary: entry.summary || {},
    });
  }
  list.sort((a, b) => (b.created || 0) - (a.created || 0));
  return list;
}

function exportIncident(id) {
  ensureContainers();
  const incident = inspectIncident(id);
  if (!incident) return null;
  const envelope = {
    type: 'tyranid-incident-export',
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    exportedAtTick: Game.time,
    incident,
  };
  return LZString.compressToBase64(JSON.stringify(envelope));
}

function importIncident(payload, idOverride = null) {
  ensureContainers();
  if (!payload || typeof payload !== 'string') {
    throw new Error('payload must be a compressed base64 string');
  }
  const json = LZString.decompressFromBase64(payload);
  if (!json) throw new Error('unable to decompress incident payload');
  const envelope = JSON.parse(json);
  const incident = envelope.incident;
  if (!incident || !incident.incidentId) {
    throw new Error('invalid incident payload: missing incident data');
  }

  const incidentId = idOverride || incident.incidentId;
  const compressed = LZString.compressToBase64(JSON.stringify(incident));
  Memory.debug.incidents[incidentId] = {
    created: Game.time,
    note: incident.note || null,
    schemaVersion: incident.schemaVersion || INCIDENT_SCHEMA_VERSION,
    compressed,
    savestateRef: incident.savestateRef || null,
    summary: incident.summary || {},
  };
  pruneIncidents();
  return incidentId;
}

function captureAuto(type, context = {}, options = {}) {
  ensureContainers();
  if (!(Memory.settings && Memory.settings.enableAutoIncidentCapture)) {
    return null;
  }
  if (!Memory.debug.autoIncidentRateLimit) Memory.debug.autoIncidentRateLimit = {};

  const interval =
    typeof options.minInterval === 'number' ? options.minInterval : 50;
  const key = String(type || 'auto');
  const lastTick = Memory.debug.autoIncidentRateLimit[key] || 0;
  if (Game.time - lastTick < interval) return null;
  Memory.debug.autoIncidentRateLimit[key] = Game.time;

  const incidentId = `${key}-${Game.time}`;
  return saveIncident(
    incidentId,
    `Auto-captured: ${key}`,
    Object.assign({}, options, {
      includeSavestate: options.includeSavestate !== false,
      windowTicks: options.windowTicks,
      context,
    }),
  );
}

module.exports = {
  saveIncident,
  inspectIncident,
  listIncidents,
  exportIncident,
  importIncident,
  pruneIncidents,
  captureAuto,
  _internal: {
    buildIncident,
    decodeIncident,
    summarizeLogs,
    summarizeHTM,
  },
};
