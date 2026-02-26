/** @codex-owner layoutPlanner */
const statsConsole = require('console.console');

function safeLog(message, severity = 2) {
  try {
    if (!Memory.stats) Memory.stats = {};
    statsConsole.log(message, severity);
  } catch (err) {
    console.log(message);
  }
}

function toCountMap(rows) {
  const counts = {};
  if (!Array.isArray(rows)) return counts;
  for (const row of rows) {
    if (!row || !row.type) continue;
    counts[row.type] = (counts[row.type] || 0) + 1;
  }
  return counts;
}

function groupPlacementsByType(placements = []) {
  const grouped = {};
  if (!Array.isArray(placements)) return grouped;
  for (const placement of placements) {
    if (!placement || !placement.type) continue;
    if (!grouped[placement.type]) grouped[placement.type] = [];
    grouped[placement.type].push({
      x: placement.x,
      y: placement.y,
      rcl: placement.rcl || 1,
      tag: placement.tag || null,
      type: placement.type,
      priority: placement.priority || 0,
    });
  }
  return grouped;
}

function toStructureCounts(basePlan) {
  const counts = {};
  const structures = basePlan && basePlan.structures ? basePlan.structures : {};
  for (const type of Object.keys(structures)) {
    const rows = Array.isArray(structures[type]) ? structures[type] : [];
    counts[type] = rows.length;
  }
  return counts;
}

function sortedCountEntries(counts) {
  return Object.keys(counts || {})
    .map((k) => ({ type: k, count: counts[k] }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function toRoadTagCounts(placements = []) {
  const counts = {};
  for (const p of Array.isArray(placements) ? placements : []) {
    if (!p || p.type !== 'road') continue;
    const tag = String(p.tag || '-');
    counts[tag] = (counts[tag] || 0) + 1;
  }
  return counts;
}

function placementsFromStructures(structuresByType = {}) {
  const placements = [];
  if (!structuresByType || typeof structuresByType !== 'object') return placements;
  for (const type of Object.keys(structuresByType)) {
    const rows = Array.isArray(structuresByType[type]) ? structuresByType[type] : [];
    for (const row of rows) {
      if (!row || typeof row.x !== 'number' || typeof row.y !== 'number') continue;
      placements.push({
        type,
        x: row.x,
        y: row.y,
        tag: row.tag || null,
      });
    }
  }
  return placements;
}

function inferStampGeometryFromPlacements(placements = [], maxCenters = 80) {
  const roadStampSet = new Set(
    (Array.isArray(placements) ? placements : [])
      .filter((p) => p && p.type === 'road' && String(p.tag || '') === 'road.stamp')
      .map((p) => `${p.x}:${p.y}`),
  );
  if (roadStampSet.size === 0) {
    return { bigPlaced: 0, smallPlaced: 0, bigCenters: [], smallCenters: [] };
  }

  const hasRoad = (x, y) => roadStampSet.has(`${x}:${y}`);
  const bigOffsets = [
    [0, -2],
    [-1, -1],
    [1, -1],
    [-2, 0],
    [2, 0],
    [-1, 1],
    [1, 1],
    [0, 2],
  ];
  const smallOffsets = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ];

  const centers = new Set();
  for (const k of roadStampSet) {
    const [x, y] = k.split(':').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        centers.add(`${x + dx}:${y + dy}`);
      }
    }
  }

  const bigCenters = new Set();
  const smallCenters = new Set();
  for (const c of centers) {
    const [cx, cy] = c.split(':').map(Number);
    const bigMatch = bigOffsets.every(([dx, dy]) => hasRoad(cx + dx, cy + dy));
    if (bigMatch) {
      bigCenters.add(c);
      continue;
    }
    const smallMatch = smallOffsets.every(([dx, dy]) => hasRoad(cx + dx, cy + dy));
    if (smallMatch) smallCenters.add(c);
  }

  // If a small center sits inside a detected big center envelope, treat it as part of the big stamp.
  const prunedSmall = new Set();
  for (const c of smallCenters) {
    const [cx, cy] = c.split(':').map(Number);
    const overlappedByBig = [...bigCenters].some((b) => {
      const [bx, by] = b.split(':').map(Number);
      return Math.max(Math.abs(cx - bx), Math.abs(cy - by)) <= 1;
    });
    if (!overlappedByBig) prunedSmall.add(c);
  }

  return {
    bigPlaced: bigCenters.size,
    smallPlaced: prunedSmall.size,
    bigCenters: [...bigCenters]
      .slice(0, maxCenters)
      .map((c) => {
        const [x, y] = c.split(':').map(Number);
        return { x, y };
      }),
    smallCenters: [...prunedSmall]
      .slice(0, maxCenters)
      .map((c) => {
        const [x, y] = c.split(':').map(Number);
        return { x, y };
      }),
  };
}

function buildLayoutPlanDump(roomName) {
  const rooms = Memory && Memory.rooms ? Memory.rooms : {};
  const fallbackRoom =
    Object.keys(rooms).find((name) => {
      const rm = rooms[name] || {};
      const layout = rm.layout || {};
      return (
        Boolean(rm.basePlan) ||
        (layout.theoreticalCandidatePlans &&
          typeof layout.theoreticalCandidatePlans === 'object' &&
          Object.keys(layout.theoreticalCandidatePlans).length > 0)
      );
    }) || null;
  const targetRoom = roomName || fallbackRoom;
  if (!targetRoom || !rooms[targetRoom]) {
    return {
      ok: false,
      reason: 'missing-room-memory',
      roomName: targetRoom || null,
    };
  }
  const roomMem = rooms[targetRoom];
  const basePlan = roomMem.basePlan || null;
  const layout = roomMem.layout || {};
  const candidatePlans =
    layout.theoreticalCandidatePlans && typeof layout.theoreticalCandidatePlans === 'object'
      ? layout.theoreticalCandidatePlans
      : {};
  const candidateKeys = Object.keys(candidatePlans);
  const selectedCandidateIndex =
    layout.theoretical && typeof layout.theoretical.selectedCandidateIndex === 'number'
      ? layout.theoretical.selectedCandidateIndex
      : null;
  const activeCandidate =
    selectedCandidateIndex !== null &&
    Object.prototype.hasOwnProperty.call(candidatePlans, String(selectedCandidateIndex))
      ? candidatePlans[String(selectedCandidateIndex)]
      : candidateKeys.length > 0
        ? candidatePlans[candidateKeys[0]]
        : null;

  if (!basePlan && !activeCandidate) {
    return {
      ok: false,
      reason: 'missing-base-plan-and-theoretical-candidate',
      roomName: targetRoom,
    };
  }

  const effectivePlan = basePlan
    ? basePlan
    : {
        generatedAt: activeCandidate.completedAt || null,
        structures: groupPlacementsByType(activeCandidate.placements || []),
        buildQueue: [],
        plannerDebug: {
          layoutPattern: Memory && Memory.settings ? Memory.settings.layoutExtensionPattern || null : null,
          harabiStage: Memory && Memory.settings ? Memory.settings.layoutHarabiStage || null : null,
          stampStats: activeCandidate.stampStats || {},
          sourceLogistics: activeCandidate.sourceLogistics || {},
          foundationDebug: activeCandidate.foundationDebug || {},
          sourceResourceDebug: activeCandidate.sourceResourceDebug || {},
          logisticsRoutes: activeCandidate.logisticsRoutes || {},
          validStructurePositions: activeCandidate.validStructurePositions || {},
          validation: activeCandidate.validation || [],
        },
      };
  const plannerDebug = effectivePlan.plannerDebug || {};
  const stampStats = plannerDebug.stampStats || {};
  const inferredPlacements = basePlan
    ? placementsFromStructures(effectivePlan.structures || {})
    : activeCandidate && Array.isArray(activeCandidate.placements)
      ? activeCandidate.placements
      : [];
  const explicitBigCenters = Array.isArray(stampStats.bigCenters) ? stampStats.bigCenters : [];
  const explicitSmallCenters = Array.isArray(stampStats.smallCenters) ? stampStats.smallCenters : [];
  const inferredStampCounts = inferStampGeometryFromPlacements(
    inferredPlacements,
  );
  const hasExplicitStampStats =
    Number.isFinite(Number(stampStats.bigPlaced)) || Number.isFinite(Number(stampStats.smallPlaced));
  const structureCounts = toStructureCounts(effectivePlan);
  const buildQueue = Array.isArray(effectivePlan.buildQueue) ? effectivePlan.buildQueue : [];
  return {
    ok: true,
    roomName: targetRoom,
    source: basePlan ? 'basePlan' : 'theoreticalCandidate',
    generatedAt: effectivePlan.generatedAt || null,
    stampStats: {
      bigPlaced: Number(stampStats.bigPlaced) || 0,
      smallPlaced: Number(stampStats.smallPlaced) || 0,
      capacitySlots: Number(stampStats.capacitySlots) || 0,
      requiredSlots: Number(stampStats.requiredSlots) || 0,
      smallFallbackReasons: stampStats.smallFallbackReasons || {},
      inferredBigPlaced: inferredStampCounts.bigPlaced,
      inferredSmallPlaced: inferredStampCounts.smallPlaced,
      inferredBigCenters: inferredStampCounts.bigCenters || [],
      inferredSmallCenters: inferredStampCounts.smallCenters || [],
      bigCenters: explicitBigCenters,
      smallCenters: explicitSmallCenters,
      hasExplicitStats: hasExplicitStampStats,
    },
    layoutPattern: plannerDebug.layoutPattern || null,
    harabiStage: plannerDebug.harabiStage || null,
    structureCounts,
    buildQueueCounts: toCountMap(buildQueue),
    buildQueue,
    roadTagCounts: toRoadTagCounts(inferredPlacements),
    foundationDebug:
      plannerDebug.foundationDebug && typeof plannerDebug.foundationDebug === 'object'
        ? plannerDebug.foundationDebug
        : {},
    sourceResourceDebug:
      plannerDebug.sourceResourceDebug && typeof plannerDebug.sourceResourceDebug === 'object'
        ? plannerDebug.sourceResourceDebug
        : {},
    logisticsRoutes:
      plannerDebug.logisticsRoutes && typeof plannerDebug.logisticsRoutes === 'object'
        ? plannerDebug.logisticsRoutes
        : {},
    validStructurePositions:
      plannerDebug.validStructurePositions && typeof plannerDebug.validStructurePositions === 'object'
        ? plannerDebug.validStructurePositions
        : {},
    validation: Array.isArray(plannerDebug.validation) ? plannerDebug.validation : [],
  };
}

function formatLayoutPlanDump(payload, options = {}) {
  if (!payload || payload.ok !== true) {
    const reason = payload && payload.reason ? payload.reason : 'unknown';
    return [`layoutPlanDump: no data (${reason})`];
  }
  const maxEntries = Number.isFinite(options.maxEntries)
    ? Math.max(0, Math.floor(options.maxEntries))
    : 80;
  const includeRoadEntries = Boolean(options.includeRoadEntries);
  const lines = [];
  lines.push(
    `[layoutPlanDump] room=${payload.roomName} source=${payload.source || 'unknown'} tick=${payload.generatedAt || 'n/a'} pattern=${payload.layoutPattern || 'n/a'} stage=${payload.harabiStage || 'n/a'}`,
  );
  lines.push(
    `[layoutPlanDump] stamps big=${payload.stampStats.bigPlaced} small=${payload.stampStats.smallPlaced} slots=${payload.stampStats.capacitySlots}/${payload.stampStats.requiredSlots}`,
  );
  lines.push(
    `[layoutPlanDump] stamps(inferred from road.stamp geometry) big=${payload.stampStats.inferredBigPlaced} small=${payload.stampStats.inferredSmallPlaced}`,
  );
  const bigCenters = Array.isArray(payload.stampStats.bigCenters) ? payload.stampStats.bigCenters : [];
  const smallCenters = Array.isArray(payload.stampStats.smallCenters) ? payload.stampStats.smallCenters : [];
  if (bigCenters.length > 0 || smallCenters.length > 0) {
    lines.push(
      `[layoutPlanDump] stampCenters(explicit planner) big=${bigCenters.length} small=${smallCenters.length}`,
    );
    if (bigCenters.length > 0) {
      lines.push(
        `[layoutPlanDump] stampCenters.big=${bigCenters.slice(0, 40).map((c, i) => `${i + 1}:${c.x},${c.y}`).join(' | ')}`,
      );
    }
    if (smallCenters.length > 0) {
      lines.push(
        `[layoutPlanDump] stampCenters.small=${smallCenters.slice(0, 40).map((c, i) => `${i + 1}:${c.x},${c.y}`).join(' | ')}`,
      );
    }
  }
  const inferredBigCenters = Array.isArray(payload.stampStats.inferredBigCenters)
    ? payload.stampStats.inferredBigCenters
    : [];
  const inferredSmallCenters = Array.isArray(payload.stampStats.inferredSmallCenters)
    ? payload.stampStats.inferredSmallCenters
    : [];
  if (inferredBigCenters.length > 0 || inferredSmallCenters.length > 0) {
    lines.push(
      `[layoutPlanDump] stampCenters(inferred geometry) big=${inferredBigCenters.length} small=${inferredSmallCenters.length}`,
    );
    if (inferredSmallCenters.length > 0) {
      lines.push(
        `[layoutPlanDump] stampCenters.inferred.small=${inferredSmallCenters
          .slice(0, 40)
          .map((c, i) => `${i + 1}:${c.x},${c.y}`)
          .join(' | ')}`,
      );
    }
  }

  const reasons = payload.stampStats.smallFallbackReasons || {};
  const reasonKeys = Object.keys(reasons);
  lines.push(
    `[layoutPlanDump] smallFallbackReasons=${reasonKeys.length ? reasonKeys.map((k) => `${k}:${reasons[k]}`).join(', ') : 'none'}`,
  );

  lines.push('[layoutPlanDump] structures (planned totals):');
  for (const row of sortedCountEntries(payload.structureCounts)) {
    lines.push(`  - ${row.type}: ${row.count}`);
  }

  lines.push('[layoutPlanDump] buildQueue (remaining planned placements by type):');
  for (const row of sortedCountEntries(payload.buildQueueCounts)) {
    lines.push(`  - ${row.type}: ${row.count}`);
  }

  lines.push('[layoutPlanDump] buildQueue entries:');
  const filteredQueue = includeRoadEntries
    ? payload.buildQueue
    : payload.buildQueue.filter((e) => e && e.type !== 'road');
  const skippedRoadEntries = payload.buildQueue.length - filteredQueue.length;
  if (!includeRoadEntries && skippedRoadEntries > 0) {
    lines.push(`  ... skipped road entries: ${skippedRoadEntries} (use includeRoadEntries=true)`);
  }
  const entries = filteredQueue.slice(0, maxEntries);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const x = typeof e.x === 'number' ? e.x : e.pos && typeof e.pos.x === 'number' ? e.pos.x : '?';
    const y = typeof e.y === 'number' ? e.y : e.pos && typeof e.pos.y === 'number' ? e.pos.y : '?';
    lines.push(
      `  ${String(i + 1).padStart(3, '0')}. rcl=${e.rcl || 1} prio=${e.priority || 0} type=${e.type} pos=${x},${y} tag=${e.tag || '-'}`,
    );
  }
  if (filteredQueue.length > entries.length) {
    lines.push(`  ... truncated ${filteredQueue.length - entries.length} entries`);
  }

  const roadTags = payload.roadTagCounts || {};
  const roadTagRows = sortedCountEntries(roadTags);
  if (roadTagRows.length > 0) {
    lines.push(`[layoutPlanDump] roadTags: ${roadTagRows.map((r) => `${r.type}:${r.count}`).join(', ')}`);
  }
  const foundationDebug = payload.foundationDebug || {};
  if (Object.keys(foundationDebug).length > 0) {
    lines.push(
      `[layoutPlanDump] foundationDebug coreStructures=${Number(foundationDebug.coreStructuresPlaced || 0)} coreRoads=${Number(foundationDebug.coreRoadsPlaced || 0)} stampBig=${Number(foundationDebug.stampBigPlaced || 0)} stampSmall=${Number(foundationDebug.stampSmallPlaced || 0)} roads=${Number(foundationDebug.roadCount || 0)}`,
    );
  }
  const sourceResourceDebug = payload.sourceResourceDebug || {};
  if (Object.keys(sourceResourceDebug).length > 0) {
    lines.push(
      `[layoutPlanDump] sourceResourceDebug sources=${Number(sourceResourceDebug.sourcesFound || 0)} containers=${Number(sourceResourceDebug.sourceContainersPlaced || 0)} links=${Number(sourceResourceDebug.sourceLinksPlaced || 0)} anchored=${Number(sourceResourceDebug.sourceRoadAnchored || 0)} routes=${Number(sourceResourceDebug.sourceRoutesConnected || 0)}/${Number(sourceResourceDebug.sourceRouteTargets || 0)} mineral=${Number(sourceResourceDebug.mineralContainerPlaced || 0)}/${Number(sourceResourceDebug.mineralFound || 0)} mineralRoute=${Number(sourceResourceDebug.mineralRouteConnected || 0)}/${Number(sourceResourceDebug.mineralRouteTarget || 0)}`,
    );
  }
  const logisticsRoutes = payload.logisticsRoutes || {};
  if (Object.keys(logisticsRoutes).length > 0) {
    lines.push(
      `[layoutPlanDump] logisticsRoutes required=${Number(logisticsRoutes.required || 0)} connected=${Number(logisticsRoutes.connected || 0)} missing=${Array.isArray(logisticsRoutes.missing) ? logisticsRoutes.missing.length : 0}`,
    );
  }

  const valid = payload.validStructurePositions || {};
  const validTotal = Number(valid.structureClear) || 0;
  const validCanPlace = Number(valid.canPlace) || 0;
  const validShown = Array.isArray(valid.positions) ? valid.positions.length : 0;
  lines.push(
    `[layoutPlanDump] validStructurePositions structureClear=${validTotal} canPlaceExtension=${validCanPlace} shown=${validShown}${valid.truncated ? '+' : ''}`,
  );
  if (validTotal > 0) {
    const counts = [
      `candidates:${Number(valid.totalCandidates) || 0}`,
      `pattern:${Number(valid.patternStructure) || 0}`,
      `walkable:${Number(valid.walkable) || 0}`,
      `staticClear:${Number(valid.staticClear) || 0}`,
      `reservedClear:${Number(valid.reservedClear) || 0}`,
      `structureClear:${Number(valid.structureClear) || 0}`,
      `roadClear:${Number(valid.roadClear) || 0}`,
      `adjacentRoad:${Number(valid.adjacentRoad) || 0}`,
      `labReserveClear:${Number(valid.labReserveClear) || 0}`,
    ];
    lines.push(`[layoutPlanDump] validStructurePositions filters=${counts.join(', ')}`);
  }
  if (validShown > 0) {
    const coords = valid.positions.slice(0, 80).map((p) => `${p.x},${p.y}`);
    lines.push(`[layoutPlanDump] validStructurePositions coords=${coords.join(' | ')}`);
    if (valid.positions.length > 80) {
      lines.push(`[layoutPlanDump] validStructurePositions coords truncated ${valid.positions.length - 80}`);
    }
  }

  if (payload.validation.length > 0) {
    lines.push(`[layoutPlanDump] validation flags: ${payload.validation.join(', ')}`);
  } else {
    lines.push('[layoutPlanDump] validation flags: none');
  }
  return lines;
}

function dump(roomName, options = {}) {
  const debugEnabled =
    Boolean(options.force) ||
    Boolean(Memory && Memory.settings && Memory.settings.layoutPlanDumpDebug === true);
  if (!debugEnabled) {
    safeLog(
      "layoutPlanDump disabled. Enable via startFresh({ ..., layoutPlanDumpDebug: true }) or call layoutPlanDump(room, { force: true }).",
      3,
    );
    return 'layoutPlanDump: disabled (enable via startFresh({... layoutPlanDumpDebug: true }))';
  }

  const payload = buildLayoutPlanDump(roomName);
  const lines = formatLayoutPlanDump(payload, options);
  const text = lines.join('\n');
  const shouldPrint = options.print !== false;
  if (shouldPrint) {
    for (const line of lines) console.log(line);
  }
  if (options && options.returnObject === true) {
    return Object.assign({}, payload, { lines, text });
  }
  if (shouldPrint) {
    return `layoutPlanDump: printed ${lines.length} lines for ${payload && payload.roomName ? payload.roomName : roomName || 'unknown'}`;
  }
  return text;
}

module.exports = {
  buildLayoutPlanDump,
  formatLayoutPlanDump,
  dump,
};
