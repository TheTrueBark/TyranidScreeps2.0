const statsConsole = require('console.console');
const htm = require('./manager.htm');
const structureVisualizer = require('./manager.visualizer');
const TYPES = {
  EXTENSION: typeof STRUCTURE_EXTENSION !== 'undefined' ? STRUCTURE_EXTENSION : 'extension',
  STORAGE: typeof STRUCTURE_STORAGE !== 'undefined' ? STRUCTURE_STORAGE : 'storage',
  TOWER: typeof STRUCTURE_TOWER !== 'undefined' ? STRUCTURE_TOWER : 'tower',
  LINK: typeof STRUCTURE_LINK !== 'undefined' ? STRUCTURE_LINK : 'link',
  SPAWN: typeof STRUCTURE_SPAWN !== 'undefined' ? STRUCTURE_SPAWN : 'spawn',
  ROAD: typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road',
  CONTAINER: typeof STRUCTURE_CONTAINER !== 'undefined' ? STRUCTURE_CONTAINER : 'container',
  TERMINAL: typeof STRUCTURE_TERMINAL !== 'undefined' ? STRUCTURE_TERMINAL : 'terminal',
  LAB: typeof STRUCTURE_LAB !== 'undefined' ? STRUCTURE_LAB : 'lab',
  FACTORY: typeof STRUCTURE_FACTORY !== 'undefined' ? STRUCTURE_FACTORY : 'factory',
  OBSERVER: typeof STRUCTURE_OBSERVER !== 'undefined' ? STRUCTURE_OBSERVER : 'observer',
  POWER_SPAWN:
    typeof STRUCTURE_POWER_SPAWN !== 'undefined' ? STRUCTURE_POWER_SPAWN : 'powerSpawn',
  NUKER: typeof STRUCTURE_NUKER !== 'undefined' ? STRUCTURE_NUKER : 'nuker',
  EXTRACTOR: typeof STRUCTURE_EXTRACTOR !== 'undefined' ? STRUCTURE_EXTRACTOR : 'extractor',
  RAMPART: typeof STRUCTURE_RAMPART !== 'undefined' ? STRUCTURE_RAMPART : 'rampart',
  WALL: typeof STRUCTURE_WALL !== 'undefined' ? STRUCTURE_WALL : 'constructedWall',
};
/**
 * Draw ghost overlays for planned structures using matrix layout.
 * Toggle via Memory.settings.showLayoutOverlay.
 */
/** @codex-owner layoutVisualizer */
function getGlyph(type) {
  const map = {
    [TYPES.EXTENSION]: 'E',
    [TYPES.STORAGE]: 'S',
    [TYPES.TOWER]: 'T',
    [TYPES.LINK]: 'K',
    [TYPES.SPAWN]: 'S',
    [TYPES.ROAD]: 'R',
    [TYPES.CONTAINER]: 'C',
    [TYPES.TERMINAL]: 'M',
    [TYPES.LAB]: 'L',
    [TYPES.FACTORY]: 'F',
    [TYPES.OBSERVER]: 'O',
    [TYPES.POWER_SPAWN]: 'Q',
    [TYPES.NUKER]: 'N',
    [TYPES.EXTRACTOR]: 'X',
    [TYPES.RAMPART]: 'A',
    [TYPES.WALL]: 'W',
  };
  return map[type] || '?';
}

function getLabelForCell(cell = {}) {
  if (!cell || !cell.structureType) return '?';
  const type = cell.structureType;
  if (type === TYPES.RAMPART) {
    if (cell.overlapRoad) return 'AR';
    return 'A';
  }
  if (type === TYPES.SPAWN) {
    const tag = String(cell.tag || '');
    const match = tag.match(/^spawn\.(\d+)$/i);
    if (match && match[1]) return `S${match[1]}`;
    return 'S';
  }
  if (type === TYPES.POWER_SPAWN) return 'PS';
  return getGlyph(type);
}

function getColor(type) {
  const map = {
    [TYPES.EXTENSION]: '#f6c945',
    [TYPES.STORAGE]: '#4da6ff',
    [TYPES.TOWER]: '#ff8a65',
    [TYPES.LINK]: '#8b6cff',
    [TYPES.SPAWN]: '#7bd389',
    [TYPES.ROAD]: '#9e9e9e',
    [TYPES.CONTAINER]: '#ffd166',
    [TYPES.TERMINAL]: '#40c4ff',
    [TYPES.LAB]: '#e573ff',
    [TYPES.FACTORY]: '#ffca28',
    [TYPES.OBSERVER]: '#80deea',
    [TYPES.POWER_SPAWN]: '#ef5350',
    [TYPES.NUKER]: '#b39ddb',
    [TYPES.EXTRACTOR]: '#66bb6a',
    [TYPES.RAMPART]: '#26a69a',
    [TYPES.WALL]: '#607d8b',
  };
  return map[type] || '#ffffff';
}

function assignExtensionCandidateRcl(index) {
  const idx = Math.max(0, Math.trunc(Number(index) || 0));
  if (idx < 5) return 2;
  if (idx < 10) return 3;
  if (idx < 20) return 4;
  if (idx < 30) return 5;
  if (idx < 40) return 6;
  if (idx < 50) return 7;
  return 8;
}

function resolvePreviewDistanceOrigin(structurePlanning = null) {
  const ranking =
    structurePlanning &&
    structurePlanning.ranking &&
    typeof structurePlanning.ranking === 'object'
      ? structurePlanning.ranking
      : null;
  if (!ranking) return null;
  if (
    ranking.spawnRef &&
    Number.isFinite(ranking.spawnRef.x) &&
    Number.isFinite(ranking.spawnRef.y)
  ) {
    // `spawnRef` is the authoritative origin for D<n> labels in the current
    // foundation preview models. Keep this priority before legacy fallbacks.
    return {
      x: Number(ranking.spawnRef.x),
      y: Number(ranking.spawnRef.y),
    };
  }
  if (
    ranking.spawnStampCenter &&
    Number.isFinite(ranking.spawnStampCenter.x) &&
    Number.isFinite(ranking.spawnStampCenter.y)
  ) {
    return {
      x: Number(ranking.spawnStampCenter.x),
      y: Number(ranking.spawnStampCenter.y),
    };
  }
  return null;
}

function buildPreviewDebugLabelsByPos(structurePlanning = null, validStructureDebug = null) {
  const result = new Map();
  const hasStructurePlanning = structurePlanning && typeof structurePlanning === 'object';
  if (!hasStructurePlanning && !(validStructureDebug && Array.isArray(validStructureDebug.positions))) {
    return result;
  }
  const setDebug = (x, y, distValue, controllerLevelValue, priority = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const k = `${x}:${y}`;
    const current = result.get(k) || {
      dist: null,
      c: null,
      distPriority: -1,
      cPriority: -1,
    };
    let dist = current.dist;
    let c = current.c;
    let distPriority = current.distPriority;
    let cPriority = current.cPriority;
    if (Number.isFinite(distValue) && priority >= current.distPriority) {
      dist = Math.max(0, Math.trunc(Number(distValue)));
      distPriority = priority;
    }
    if (Number.isFinite(controllerLevelValue) && priority >= current.cPriority) {
      c = Math.max(1, Math.trunc(Number(controllerLevelValue)));
      cPriority = priority;
    }
    if (dist === null && c === null) return;
    result.set(k, { dist, c, distPriority, cPriority });
  };

  const validPositions =
    validStructureDebug && Array.isArray(validStructureDebug.positions)
      ? validStructureDebug.positions
      : [];

  if (hasStructurePlanning && Array.isArray(structurePlanning.placements)) {
    for (const placement of structurePlanning.placements) {
      if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
      setDebug(placement.x, placement.y, placement.range, placement.rcl, 3);
    }
  }

  const ranking =
    hasStructurePlanning &&
    structurePlanning.ranking &&
    Array.isArray(structurePlanning.ranking.extensionOrder)
      ? structurePlanning.ranking.extensionOrder
      : [];
  let extensionCandidateCount = 0;
  for (const row of ranking) {
    if (!row || typeof row.x !== 'number' || typeof row.y !== 'number') continue;
    const selectedType = String(row.selectedType || '');
    if (selectedType && selectedType !== TYPES.EXTENSION) continue;
    extensionCandidateCount += 1;
    const cValue = Number.isFinite(row.selectedRcl) ? row.selectedRcl : row.candidateRcl;
    setDebug(row.x, row.y, row.range, cValue, 1);
  }

  for (const pos of validPositions) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    const distValue = Number.isFinite(pos.dist) ? pos.dist : pos.range;
    const cValue = Number.isFinite(pos.candidateRcl) ? pos.candidateRcl : null;
    setDebug(pos.x, pos.y, distValue, cValue, 2);
  }

  if (validPositions.length > 0) {
    const rankingMeta = hasStructurePlanning && structurePlanning.ranking ? structurePlanning.ranking : {};
    const spawnStampCenter =
      rankingMeta &&
      rankingMeta.spawnStampCenter &&
      Number.isFinite(rankingMeta.spawnStampCenter.x) &&
      Number.isFinite(rankingMeta.spawnStampCenter.y)
        ? rankingMeta.spawnStampCenter
        : null;
    const spawnRef =
      rankingMeta &&
      rankingMeta.spawnRef &&
      Number.isFinite(rankingMeta.spawnRef.x) &&
      Number.isFinite(rankingMeta.spawnRef.y)
        ? rankingMeta.spawnRef
        : spawnStampCenter;
    const fallbackCandidates = [];
    for (const pos of validPositions) {
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
      const k = `${pos.x}:${pos.y}`;
      if (result.has(k)) continue;
      const dist =
        spawnRef
          ? Math.max(Math.abs(pos.x - spawnRef.x), Math.abs(pos.y - spawnRef.y))
          : 0;
      fallbackCandidates.push({
        x: pos.x,
        y: pos.y,
        dist,
        spawnDist: dist,
      });
    }
    fallbackCandidates.sort(
      (a, b) =>
        a.dist - b.dist ||
        a.spawnDist - b.spawnDist ||
        a.y - b.y ||
        a.x - b.x,
    );
    for (let i = 0; i < fallbackCandidates.length; i++) {
      const candidate = fallbackCandidates[i];
      const candidateOrder = extensionCandidateCount + i;
      setDebug(
        candidate.x,
        candidate.y,
        candidate.dist,
        assignExtensionCandidateRcl(candidateOrder),
        0,
      );
    }
  }

  return result;
}

function resolveOriginFloodOverlay(structurePlanning = null) {
  const ranking =
    structurePlanning &&
    structurePlanning.ranking &&
    typeof structurePlanning.ranking === 'object'
      ? structurePlanning.ranking
      : null;
  if (!ranking) return null;
  const tiles = Array.isArray(ranking.originFloodTiles) ? ranking.originFloodTiles : [];
  if (tiles.length === 0) return null;
  const stats =
    ranking.originFloodStats && typeof ranking.originFloodStats === 'object'
      ? ranking.originFloodStats
      : { reachableTiles: tiles.length, roadTiles: 0, candidateTiles: 0 };
  return {
    tiles,
    stats,
    origin: resolvePreviewDistanceOrigin(structurePlanning),
    distanceModel: typeof ranking.distanceModel === 'string' ? ranking.distanceModel : 'spawn-origin-dual-v1',
    rangeMode: typeof ranking.rangeMode === 'string' ? ranking.rangeMode : 'origin-flood-8way',
    roadSelection: typeof ranking.roadSelection === 'string' ? ranking.roadSelection : 'foundation-road-net',
  };
}

function drawOriginFloodOverlay(vis, overlay, overlayView = 'originflood') {
  if (!vis || !overlay || !Array.isArray(overlay.tiles)) return;
  const depthView = overlayView === 'originflooddepth';
  for (const tile of overlay.tiles) {
    if (!tile || !Number.isFinite(tile.x) || !Number.isFinite(tile.y)) continue;
    const depth = Number.isFinite(tile.d) ? Math.max(0, Number(tile.d)) : 0;
    let fill = '#8f8f8f';
    if (tile.kind === 'road') fill = '#5db0ff';
    if (tile.kind === 'candidate') fill = '#ffd166';
    if (tile.kind === 'origin') fill = '#ffffff';
    vis.rect(tile.x - 0.5, tile.y - 0.5, 1, 1, {
      fill,
      opacity: depthView ? Math.max(0.08, 0.34 - depth * 0.01) : 0.2,
      stroke: 'transparent',
    });
    if (depthView && depth <= 20) {
      vis.text(String(Math.trunc(depth)), tile.x, tile.y + 0.12, {
        color: tile.kind === 'origin' ? '#1f1f1f' : '#111111',
        font: 0.34,
        align: 'center',
      });
    }
  }
  if (overlay.origin && Number.isFinite(overlay.origin.x) && Number.isFinite(overlay.origin.y)) {
    vis.circle(overlay.origin.x, overlay.origin.y, {
      radius: 0.34,
      stroke: '#ffffff',
      fill: 'transparent',
      opacity: 0.9,
    });
    vis.text('OF0', overlay.origin.x + 0.52, overlay.origin.y - 0.34, {
      color: '#ffffff',
      font: 0.3,
      align: 'left',
    });
  }
  vis.text(
    `OriginFlood ${overlay.roadSelection} tiles=${overlay.stats.reachableTiles || 0} roads=${overlay.stats.roadTiles || 0} candidates=${overlay.stats.candidateTiles || 0}`,
    2,
    3,
    { color: '#ffffff', font: 0.52, align: 'left' },
  );
  vis.text(
    `Model=${overlay.distanceModel} mode=${overlay.rangeMode}`,
    2,
    3.7,
    { color: '#d8d8d8', font: 0.42, align: 'left' },
  );
}

function drawPreviewDebugLabels(vis, x, y, labels = {}) {
  if (!vis || typeof vis.text !== 'function') return;
  const dist = Number.isFinite(labels.dist) ? Math.max(0, Math.trunc(Number(labels.dist))) : null;
  const c = Number.isFinite(labels.c) ? Math.max(1, Math.trunc(Number(labels.c))) : null;
  if (dist === null && c === null) return;
  const distPart = dist !== null ? `D${dist}` : 'D?';
  const cPart = c !== null ? `C${c}` : 'C?';
  vis.text(`${distPart},${cPart}`, x + 0.3, y + 0.38, {
    color: '#d6b34d',
    font: 0.23,
    align: 'left',
  });
}

function fmt(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

function toBuildQueueCells(basePlan, type) {
  if (!basePlan || !Array.isArray(basePlan.buildQueue) || !type) return [];
  return basePlan.buildQueue
    .filter((entry) => entry && entry.type === type && entry.pos)
    .map((entry) => ({
      x: entry.pos.x,
      y: entry.pos.y,
      rcl: entry.rcl || 1,
      tag: entry.tag || null,
    }))
    .filter((row) => typeof row.x === 'number' && typeof row.y === 'number');
}

function toPlannedCells(basePlan, type) {
  if (!basePlan || !type) return [];
  if (basePlan.structures && typeof basePlan.structures === 'object') {
    const rows = Array.isArray(basePlan.structures[type]) ? basePlan.structures[type] : [];
    return rows.filter((row) => row && typeof row.x === 'number' && typeof row.y === 'number');
  }
  return toBuildQueueCells(basePlan, type);
}

function getPlannedStructureTypes(basePlan) {
  if (!basePlan || typeof basePlan !== 'object') return [];
  if (basePlan.structures && typeof basePlan.structures === 'object') {
    return Object.keys(basePlan.structures);
  }
  if (Array.isArray(basePlan.buildQueue)) {
    return [...new Set(basePlan.buildQueue.map((entry) => entry && entry.type).filter(Boolean))];
  }
  return [];
}

function toCandidatePlanCells(candidatePlan, type) {
  if (!candidatePlan || !Array.isArray(candidatePlan.placements) || !type) return [];
  return candidatePlan.placements.filter(
    (placement) =>
      placement &&
      placement.type === type &&
      typeof placement.x === 'number' &&
      typeof placement.y === 'number',
  );
}

function hasRenderableDebugPositions(debug) {
  return Boolean(debug && Array.isArray(debug.positions) && debug.positions.length > 0);
}

function hasRenderableDebugPlacements(debug) {
  return Boolean(debug && Array.isArray(debug.placements) && debug.placements.length > 0);
}

function hasRenderableLabPlanning(debug) {
  return Boolean(
    debug &&
      ((Array.isArray(debug.sourceLabs) && debug.sourceLabs.length > 0) ||
        (Array.isArray(debug.reactionLabs) && debug.reactionLabs.length > 0)),
  );
}

function pickDebugSource(entries, predicate) {
  let fallback = null;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.value || typeof entry.value !== 'object') continue;
    if (!fallback) fallback = entry;
    if (!predicate || predicate(entry.value)) return entry;
  }
  return fallback;
}

function resolveCandidateIndex(theoretical, preferredIndex) {
  const candidates = Array.isArray(theoretical && theoretical.candidates)
    ? theoretical.candidates
    : [];
  if (!candidates.length) return null;

  if (typeof preferredIndex === 'number' && Number.isFinite(preferredIndex) && preferredIndex >= 0) {
    const exact = candidates.find((c) => c.index === preferredIndex);
    if (exact) return preferredIndex;
  }

  if (
    theoretical &&
    typeof theoretical.selectedCandidateIndex === 'number' &&
    candidates.some((c) => c.index === theoretical.selectedCandidateIndex)
  ) {
    return theoretical.selectedCandidateIndex;
  }

  return candidates[0].index;
}

function stageIndicator(stage = {}) {
  const status = String(stage.status || '').toLowerCase();
  if (status === 'done') return '✔';
  if (status === 'in_progress') return stage.progress || '...';
  return stage.progress || 'X';
}

function getRoadGlyph(connections = {}) {
  const l = Boolean(connections.left);
  const r = Boolean(connections.right);
  const u = Boolean(connections.up);
  const d = Boolean(connections.down);
  if (l && r && u && d) return '┼';
  if (l && r && u) return '┴';
  if (l && r && d) return '┬';
  if (l && u && d) return '┤';
  if (r && u && d) return '├';
  if (l && r) return '─';
  if (u && d) return '│';
  if (r && d) return '┌';
  if (l && d) return '┐';
  if (r && u) return '└';
  if (l && u) return '┘';
  if (l || r) return '─';
  if (u || d) return '│';
  return '·';
}

function recordRenderSubtask(roomName, label, cpu) {
  if (!roomName || !cpu || cpu <= 0) return;
  htm.logSubtaskExecution(`HTM::${label}::Rendering`, cpu, {
    roomName,
    parent: 'HTM',
    reason: 'layoutVisualizer',
  });
}

const visualCalcCache = {
  theoreticalByRoom: {},
};

function getTheoreticalOverlayState(roomName, layout, settings) {
  const theoretical = layout.theoretical || {};
  const theoreticalPipeline = layout.theoreticalPipeline || null;
  const candidateViewPref =
    settings && typeof settings.layoutCandidateOverlayIndex === 'number'
      ? settings.layoutCandidateOverlayIndex
      : -1;
  const pipelineResults = theoreticalPipeline && theoreticalPipeline.results ? theoreticalPipeline.results : null;
  const pipelineDoneCount = pipelineResults ? Object.keys(pipelineResults).length : 0;
  const pipelineCandidateCount =
    theoreticalPipeline && typeof theoreticalPipeline.candidateCount === 'number'
      ? theoreticalPipeline.candidateCount
      : 0;
  const hasTheoreticalCandidates =
    Array.isArray(theoretical.candidates) && theoretical.candidates.length > 0;
  const fp = [
    settings && settings.layoutOverlayView ? String(settings.layoutOverlayView) : 'plan',
    candidateViewPref,
    hasTheoreticalCandidates ? theoretical.candidates.length : 0,
    typeof theoretical.selectedCandidateIndex === 'number' ? theoretical.selectedCandidateIndex : -1,
    typeof theoretical.selectedWeightedScore === 'number'
      ? theoretical.selectedWeightedScore.toFixed(3)
      : 'n',
    typeof theoretical.currentlyViewingCandidate === 'number'
      ? theoretical.currentlyViewingCandidate
      : -1,
    theoreticalPipeline && theoreticalPipeline.status ? String(theoreticalPipeline.status) : '',
    theoreticalPipeline && typeof theoreticalPipeline.updatedAt === 'number'
      ? theoreticalPipeline.updatedAt
      : 0,
    theoreticalPipeline && typeof theoreticalPipeline.bestCandidateIndex === 'number'
      ? theoreticalPipeline.bestCandidateIndex
      : -1,
    theoreticalPipeline && typeof theoreticalPipeline.activeCandidateIndex === 'number'
      ? theoreticalPipeline.activeCandidateIndex
      : -1,
    pipelineCandidateCount,
    pipelineDoneCount,
    theoreticalPipeline &&
    theoreticalPipeline.candidateSet &&
    theoreticalPipeline.candidateSet.fallbackUsed
      ? 'fallback'
      : 'normal',
    theoretical && theoretical.checklist && Array.isArray(theoretical.checklist.stages)
      ? theoretical.checklist.stages.length
      : 0,
  ].join('|');
  const cached = visualCalcCache.theoreticalByRoom[roomName];
  if (cached && cached.fp === fp && cached.state) return cached.state;

  const pipelineCandidates =
    !hasTheoreticalCandidates &&
    theoreticalPipeline &&
    Array.isArray(theoreticalPipeline.candidates)
      ? theoreticalPipeline.candidates.map((candidate) => ({
          index: candidate.index,
          anchor: candidate.anchor,
          initialScore: candidate.initialScore,
          weightedScore:
            pipelineResults && pipelineResults[candidate.index]
              ? pipelineResults[candidate.index].weightedScore
              : null,
          weightedContributions:
            pipelineResults && pipelineResults[candidate.index]
              ? pipelineResults[candidate.index].weightedContributions
              : null,
        }))
      : [];
  const effectiveTheoretical = hasTheoreticalCandidates
    ? theoretical
    : Object.assign({}, theoretical, { candidates: pipelineCandidates });
  const candidateRows = Array.isArray(effectiveTheoretical.candidates)
    ? effectiveTheoretical.candidates
    : [];
  const activeCandidateIndex = resolveCandidateIndex(effectiveTheoretical, candidateViewPref);
  const activeCandidate =
    activeCandidateIndex !== null
      ? candidateRows.find((c) => c.index === activeCandidateIndex) || null
      : null;
  const sortedCandidatesByScore = candidateRows
    .slice()
    .sort(
      (a, b) =>
        (b && typeof b.weightedScore === 'number' ? b.weightedScore : -1) -
        (a && typeof a.weightedScore === 'number' ? a.weightedScore : -1),
    );
  const sortedChecklistCandidates = candidateRows
    .slice()
    .filter((row) => row && row.anchor)
    .sort((a, b) => a.index - b.index);

  const pipelineComplete =
    pipelineDoneCount >= pipelineCandidateCount && pipelineCandidateCount > 0;
  const pipelineFilterDetail =
    theoreticalPipeline &&
    theoreticalPipeline.candidateSet &&
    theoreticalPipeline.candidateSet.fallbackUsed
      ? 'Only Controller Seed (fallback)'
      : pipelineCandidateCount > 0
      ? `${pipelineCandidateCount} seeds queued`
      : 'Candidate scan pending';

  const checklist =
    theoretical && theoretical.checklist
      ? theoretical.checklist
      : theoreticalPipeline
      ? {
          stages: [
            { number: 1, label: 'Distance Transform', status: 'done', progress: '✔', detail: 'Distance map cached' },
            { number: 2, label: 'Candidate Filter', status: 'done', progress: '✔', detail: pipelineFilterDetail },
            { number: 3, label: 'Candidate Pre-Scoring', status: 'done', progress: '✔', detail: pipelineCandidateCount > 0 ? `Top ${pipelineCandidateCount} seeds scored` : 'No seeds scored yet' },
            { number: 4, label: 'Core + Foundations', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Complete for all candidates' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 5, label: 'Sources + Resources', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Complete for all candidates' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 6, label: 'Valid Positions (rough)', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Complete for all candidates' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 7, label: 'Valid Positions (fine)', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Complete for all candidates' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 8, label: 'Road Network Evaluation', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Road tags + connectivity evaluated' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 9, label: 'End Evaluation (Weighted)', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Weighted scores finalized' : `Scoring ${pipelineDoneCount}/${pipelineCandidateCount}` },
            {
              number: 10,
              label: 'Winner Selection',
              status: typeof theoreticalPipeline.bestCandidateIndex === 'number' ? 'done' : 'pending',
              progress: typeof theoreticalPipeline.bestCandidateIndex === 'number' ? '✔' : 'X',
              detail:
                typeof theoreticalPipeline.bestCandidateIndex === 'number'
                  ? `Winner: C${theoreticalPipeline.bestCandidateIndex + 1}`
                  : 'No winner selected',
            },
            {
              number: 11,
              label: 'Persist + Overlay',
              status: theoreticalPipeline.status === 'completed' ? 'done' : 'pending',
              progress: theoreticalPipeline.status === 'completed' ? '✔' : 'X',
              detail:
                theoreticalPipeline.status === 'completed'
                  ? 'Plan persisted and rendered'
                  : 'Waiting for winner',
            },
          ],
          candidateStates: candidateRows.map((candidate) => ({
            index: candidate.index,
            complete:
              typeof candidate.weightedScore === 'number' &&
              Number.isFinite(candidate.weightedScore),
            active:
              theoreticalPipeline &&
              theoreticalPipeline.activeCandidateIndex === candidate.index,
          })),
        }
      : null;

  const bestIndex =
    typeof theoretical.selectedCandidateIndex === 'number'
      ? theoretical.selectedCandidateIndex
      : theoreticalPipeline &&
        typeof theoreticalPipeline.bestCandidateIndex === 'number'
      ? theoreticalPipeline.bestCandidateIndex
      : -1;
  const hasFinalSpawnSelection = bestIndex >= 0;
  const state = {
    theoretical,
    theoreticalPipeline,
    candidateRows,
    activeCandidateIndex,
    activeCandidate,
    sortedCandidatesByScore,
    sortedChecklistCandidates,
    checklist,
    pipelineDoneCount,
    pipelineCandidateCount,
    hasFinalSpawnSelection,
    bestIndex,
  };
  visualCalcCache.theoreticalByRoom[roomName] = { fp, state };
  return state;
}

const layoutVisualizer = {
  drawLayout(roomName) {
    if (!Memory.settings || Memory.settings.showLayoutOverlay === false) return;
    const room = Game.rooms[roomName];
    if (!room || !room.memory.layout) return;
    const start = Game.cpu.getUsed();
    try {
      const vis = new RoomVisual(roomName);
      const layoutMode = String((Memory.settings && Memory.settings.layoutPlanningMode) || 'theoretical').toLowerCase();
      const overlayView = String((Memory.settings && Memory.settings.layoutOverlayView) || 'plan').toLowerCase();
      const isTheoretical = room.memory.layout.mode === 'theoretical' || layoutMode === 'theoretical';

      const matrix = room.memory.layout.matrix || {};
      const showRoadRclLabels = Boolean(Memory.settings && Memory.settings.showRoadRclLabels);
      const planningHudYOffsetRaw =
        Memory.settings && typeof Memory.settings.layoutPlanningHudYOffset === 'number'
          ? Number(Memory.settings.layoutPlanningHudYOffset)
          : 3.2;
      const planningHudYOffset = Number.isFinite(planningHudYOffsetRaw)
        ? Math.max(0, Math.min(20, planningHudYOffsetRaw))
        : 3.2;
      const overlayState = getTheoreticalOverlayState(roomName, room.memory.layout || {}, Memory.settings || {});
      const theoretical = overlayState.theoretical;
      const theoreticalPipeline = overlayState.theoreticalPipeline;
      const candidateRows = overlayState.candidateRows;
      const activeCandidateIndex = overlayState.activeCandidateIndex;
      const activeCandidate = overlayState.activeCandidate;
      const hasFinalSpawnSelection = overlayState.hasFinalSpawnSelection;
      const showPlannerDebug = Boolean(Memory.settings && Memory.settings.debugVisuals);
      const basePlan = room.memory.basePlan || null;
      const candidatePlans =
        room.memory.layout &&
        room.memory.layout.theoreticalCandidatePlans &&
        typeof room.memory.layout.theoreticalCandidatePlans === 'object'
          ? room.memory.layout.theoreticalCandidatePlans
          : {};
      const selectedCandidateIndex =
        theoretical && typeof theoretical.selectedCandidateIndex === 'number'
          ? theoretical.selectedCandidateIndex
          : theoreticalPipeline && typeof theoreticalPipeline.bestCandidateIndex === 'number'
            ? theoreticalPipeline.bestCandidateIndex
            : null;
      const candidateKeys = Object.keys(candidatePlans);
      const preferredCandidateIndex =
        room.memory.layout && typeof room.memory.layout.currentDisplayCandidateIndex === 'number'
          ? room.memory.layout.currentDisplayCandidateIndex
          : theoretical && typeof theoretical.selectedCandidateIndex === 'number'
            ? theoretical.selectedCandidateIndex
            : candidateKeys.length > 0
              ? Number(candidateKeys[0])
              : null;
      const activeCandidatePlan =
        preferredCandidateIndex !== null &&
        Object.prototype.hasOwnProperty.call(candidatePlans, String(preferredCandidateIndex))
          ? candidatePlans[String(preferredCandidateIndex)]
          : candidateKeys.length > 0
            ? candidatePlans[candidateKeys[0]]
            : null;
      const preferBasePlanOverlay =
        Boolean(
          isTheoretical &&
            basePlan &&
            basePlan.plannerDebug &&
            basePlan.plannerDebug.fullOptimization &&
            typeof basePlan.plannerDebug.fullOptimization === 'object' &&
            preferredCandidateIndex !== null &&
            selectedCandidateIndex !== null &&
            preferredCandidateIndex === selectedCandidateIndex,
        );
      const debugSources = [
        {
          source: 'basePlan',
          value:
            basePlan &&
            basePlan.plannerDebug &&
            typeof basePlan.plannerDebug === 'object'
              ? basePlan.plannerDebug
              : null,
        },
        {
          source: 'theoretical',
          value: theoretical && typeof theoretical === 'object' ? theoretical : null,
        },
        {
          source: 'candidate',
          value: activeCandidatePlan && typeof activeCandidatePlan === 'object' ? activeCandidatePlan : null,
        },
      ];
      const validStructureEntry = pickDebugSource(
        debugSources.map((entry) => ({
          source: entry.source,
          value: entry.value && entry.value.validStructurePositions,
        })),
        hasRenderableDebugPositions,
      );
      const validStructureDebug = validStructureEntry ? validStructureEntry.value : null;
      const labPlanningEntry = pickDebugSource(
        debugSources.map((entry) => ({
          source: entry.source,
          value: entry.value && entry.value.labPlanning,
        })),
        hasRenderableLabPlanning,
      );
      const labPlanningDebug = labPlanningEntry ? labPlanningEntry.value : null;
      const structurePlanningEntry = pickDebugSource(
        debugSources.map((entry) => ({
          source: entry.source,
          value: entry.value && entry.value.structurePlanning,
        })),
        hasRenderableDebugPlacements,
      );
      const structurePlanningDebug = structurePlanningEntry ? structurePlanningEntry.value : null;
      const structurePlanningDebugSource = structurePlanningEntry ? structurePlanningEntry.source : null;
      const hasFullOptimizationDebug =
        (structurePlanningDebugSource === 'basePlan' &&
          basePlan &&
          basePlan.plannerDebug &&
          basePlan.plannerDebug.fullOptimization &&
          typeof basePlan.plannerDebug.fullOptimization === 'object') ||
        (structurePlanningDebugSource === 'theoretical' &&
          theoretical &&
          theoretical.fullOptimization &&
          typeof theoretical.fullOptimization === 'object') ||
        (structurePlanningDebugSource === 'candidate' &&
          activeCandidatePlan &&
          activeCandidatePlan.fullOptimization &&
          typeof activeCandidatePlan.fullOptimization === 'object');

      if (isTheoretical && overlayView !== 'plan') {
        const map =
          overlayView === 'walldistance'
            ? theoretical.wallDistance
            : overlayView === 'controllerdistance'
            ? theoretical.controllerDistance
            : null;
        const originFloodOverlay =
          overlayView === 'originflood' || overlayView === 'originflooddepth'
            ? resolveOriginFloodOverlay(structurePlanningDebug)
            : null;
        if (Array.isArray(map) && map.length >= 2500) {
          for (let y = 1; y <= 48; y++) {
            for (let x = 1; x <= 48; x++) {
              const value = map[y * 50 + x];
              if (typeof value !== 'number' || value < 0) continue;
              const shade = Math.max(0, Math.min(255, 30 + value * 12));
              const fill = `rgb(${shade},${overlayView === 'walldistance' ? shade : 70},${overlayView === 'controllerdistance' ? shade : 70})`;
              vis.rect(x - 0.5, y - 0.5, 1, 1, {
                fill,
                opacity: 0.22,
                stroke: 'transparent',
              });
            }
          }
        }
        if (overlayView === 'spawnscore' && theoretical.spawnCandidate) {
          vis.text(
            `SpawnScore:${Math.round(theoretical.spawnCandidate.score || 0)} Weighted:${fmt(theoretical.selectedWeightedScore || 0, 3)}`,
            2,
            3,
            { color: '#ffffff', font: 0.6, align: 'left' },
          );
        }
        if ((overlayView === 'flood' || overlayView === 'flooddepth') && theoretical.spawnCandidate) {
          const sx = theoretical.spawnCandidate.x;
          const sy = theoretical.spawnCandidate.y;
          const floodTiles = Array.isArray(theoretical.floodTiles) ? theoretical.floodTiles : [];
          for (const tile of floodTiles) {
            const depth = typeof tile.d === 'number' ? tile.d : 0;
            const alpha = overlayView === 'flooddepth' ? Math.max(0.08, 0.32 - depth * 0.012) : 0.18;
            vis.rect(tile.x - 0.5, tile.y - 0.5, 1, 1, {
              fill: '#55ffaa',
              opacity: alpha,
              stroke: 'transparent',
            });
            if (overlayView === 'flooddepth' && depth <= 12) {
              vis.text(String(depth), tile.x, tile.y + 0.12, {
                color: '#103018',
                font: 0.35,
                align: 'center',
              });
            }
          }
          vis.text('SP', sx, sy + 0.1, {
            color: '#55ffaa',
            font: 0.44,
            align: 'center',
          });
        }
        if (originFloodOverlay) {
          drawOriginFloodOverlay(vis, originFloodOverlay, overlayView);
        }
        if (overlayView === 'originflood' || overlayView === 'originflooddepth') {
          if (!originFloodOverlay) {
            vis.text('OriginFlood overlay unavailable', 2, 3, {
              color: '#ffffff',
              font: 0.52,
              align: 'left',
            });
          }
          recordRenderSubtask(roomName, 'LayoutOverlay', Game.cpu.getUsed() - start);
          return;
        }
      }

      const useStructureRenderer = overlayView === 'plan';
      const roadMap = new Map();
      const rampartMap = new Map();
      const roadSet = {};
      const planStructurePlacements = [];
      const queuedPlanStructureKeys = new Set();
      const drawnStructureKeys = new Set();
      const queuePlanStructurePlacement = (type, x, y, opts = null) => {
        if (!useStructureRenderer || !type || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        const structureKey = `${x}:${y}:${type}`;
        if (queuedPlanStructureKeys.has(structureKey)) return false;
        const placement = { x, y, roomName, type };
        if (opts && typeof opts === 'object') {
          placement.opts = Object.assign({}, opts);
        }
        planStructurePlacements.push(placement);
        queuedPlanStructureKeys.add(structureKey);
        return true;
      };
      const drawStructureTile = (cell, x, y, rcl = null) => {
        if (!cell || !cell.structureType || !Number.isFinite(x) || !Number.isFinite(y)) return;
        if (useStructureRenderer) {
          queuePlanStructurePlacement(cell.structureType, x, y);
        } else {
          vis.text(getLabelForCell(cell), x, y + 0.1, {
            color: getColor(cell.structureType),
            font: 0.52,
            align: 'center',
          });
        }
        if (rcl) {
          vis.text(String(rcl), x + 0.31, y + 0.32, {
            color: '#a9a9a9',
            font: 0.33,
            align: 'left',
          });
        }
      };
      const addRoadTile = (x, y, rcl = null) => {
        const k = `${x}:${y}`;
        roadSet[k] = true;
        if (!roadMap.has(k)) {
          roadMap.set(k, { x, y, rcl });
          queuePlanStructurePlacement(TYPES.ROAD, x, y);
        }
      };
      const addRampartTile = (x, y) => {
        const k = `${x}:${y}`;
        if (!rampartMap.has(k)) rampartMap.set(k, { x, y });
      };
      for (const x in matrix) {
        for (const y in matrix[x]) {
          const cell = matrix[x][y];
          const px = parseInt(x, 10);
          const py = parseInt(y, 10);
          if (cell.structureType === TYPES.ROAD) {
            addRoadTile(px, py, cell.rcl || null);
            continue;
          }
          if (cell.structureType === TYPES.RAMPART) {
            addRampartTile(px, py);
            continue;
          }
          drawnStructureKeys.add(`${px}:${py}:${cell.structureType}`);
          drawStructureTile(cell, px, py, cell.rcl);
        }
      }

      // Matrix cannot represent overlaps; enrich with persisted basePlan placements.
      const previewDebugLabelsByPos = buildPreviewDebugLabelsByPos(
        structurePlanningDebug,
        validStructureDebug,
      );
      const previewDistanceOrigin = resolvePreviewDistanceOrigin(structurePlanningDebug);
      for (const tile of toPlannedCells(basePlan, TYPES.ROAD)) {
        addRoadTile(tile.x, tile.y, tile.rcl || null);
      }
      for (const tile of toPlannedCells(basePlan, TYPES.RAMPART)) {
        addRampartTile(tile.x, tile.y);
      }
      if (!preferBasePlanOverlay) {
        for (const tile of toCandidatePlanCells(activeCandidatePlan, TYPES.ROAD)) {
          addRoadTile(tile.x, tile.y, tile.rcl || null);
        }
        for (const tile of toCandidatePlanCells(activeCandidatePlan, TYPES.RAMPART)) {
          addRampartTile(tile.x, tile.y);
        }
      }
      for (const type of getPlannedStructureTypes(basePlan)) {
        if (type === TYPES.ROAD || type === TYPES.RAMPART) continue;
        const tiles = toPlannedCells(basePlan, type);
        for (const tile of tiles) {
          const drawnKey = `${tile.x}:${tile.y}:${type}`;
          if (drawnStructureKeys.has(drawnKey)) continue;
          drawStructureTile({ structureType: type, tag: tile.tag || null }, tile.x, tile.y, tile.rcl);
          drawnStructureKeys.add(drawnKey);
        }
      }
      if (!preferBasePlanOverlay && activeCandidatePlan && Array.isArray(activeCandidatePlan.placements)) {
        for (const placement of activeCandidatePlan.placements) {
          if (!placement || !placement.type) continue;
          if (placement.type === TYPES.ROAD || placement.type === TYPES.RAMPART) continue;
          const drawnKey = `${placement.x}:${placement.y}:${placement.type}`;
          if (drawnStructureKeys.has(drawnKey)) continue;
          drawStructureTile(
            { structureType: placement.type, tag: placement.tag || null },
            placement.x,
            placement.y,
            placement.rcl,
          );
          drawnStructureKeys.add(drawnKey);
        }
      }

      // Keep lab previews readable even when road lines cross them.
      const labKeys = new Set();
      for (const x in matrix) {
        for (const y in matrix[x]) {
          const cell = matrix[x][y];
          if (!cell || cell.structureType !== TYPES.LAB) continue;
          const px = parseInt(x, 10);
          const py = parseInt(y, 10);
          labKeys.add(`${px}:${py}`);
        }
      }
      for (const tile of toPlannedCells(basePlan, TYPES.LAB)) {
        labKeys.add(`${tile.x}:${tile.y}`);
      }
      if (labPlanningDebug && Array.isArray(labPlanningDebug.sourceLabs)) {
        for (const pos of labPlanningDebug.sourceLabs) {
          if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
          labKeys.add(`${pos.x}:${pos.y}`);
        }
      }
      if (labPlanningDebug && Array.isArray(labPlanningDebug.reactionLabs)) {
        for (const pos of labPlanningDebug.reactionLabs) {
          if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
          labKeys.add(`${pos.x}:${pos.y}`);
        }
      }

      if (useStructureRenderer) {
        for (const tile of rampartMap.values()) {
          const overlapRoad = roadMap.has(`${tile.x}:${tile.y}`);
          queuePlanStructurePlacement(TYPES.RAMPART, tile.x, tile.y, {
            opacity: overlapRoad ? 0.65 : 0.85,
            rampartStrokeWidth: overlapRoad ? 0.1 : 0.12,
          });
        }
        for (const k of labKeys) {
          const [lx, ly] = k.split(':').map(Number);
          if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
          queuePlanStructurePlacement(TYPES.LAB, lx, ly, { opacity: 0.55 });
        }
        structureVisualizer.drawStructurePlacements(planStructurePlacements, { opacity: 0.5 });
      }

      const roadTiles = [...roadMap.values()];
      for (const tile of roadTiles) {
        const tx = tile.x;
        const ty = tile.y;
        if (!useStructureRenderer) {
          const hasLeft = Boolean(roadSet[`${tx - 1}:${ty}`]);
          const hasRight = Boolean(roadSet[`${tx + 1}:${ty}`]);
          const hasUp = Boolean(roadSet[`${tx}:${ty - 1}`]);
          const hasDown = Boolean(roadSet[`${tx}:${ty + 1}`]);
          const hasUpLeft = Boolean(roadSet[`${tx - 1}:${ty - 1}`]);
          const hasUpRight = Boolean(roadSet[`${tx + 1}:${ty - 1}`]);
          const hasDownLeft = Boolean(roadSet[`${tx - 1}:${ty + 1}`]);
          const hasDownRight = Boolean(roadSet[`${tx + 1}:${ty + 1}`]);
          const roadColor = getColor(TYPES.ROAD);
          if (typeof vis.line === 'function') {
            if (hasLeft) {
              vis.line(tx, ty, tx - 1, ty, {
                color: roadColor,
                width: 0.12,
                opacity: 1,
              });
            }
            if (hasRight) {
              vis.line(tx, ty, tx + 1, ty, {
                color: roadColor,
                width: 0.12,
                opacity: 1,
              });
            }
            if (hasUp) {
              vis.line(tx, ty, tx, ty - 1, {
                color: roadColor,
                width: 0.12,
                opacity: 1,
              });
            }
            if (hasDown) {
              vis.line(tx, ty, tx, ty + 1, {
                color: roadColor,
                width: 0.12,
                opacity: 1,
              });
            }
            if (hasUpLeft) {
              vis.line(tx, ty, tx - 1, ty - 1, {
                color: roadColor,
                width: 0.1,
                opacity: 1,
              });
            }
            if (hasUpRight) {
              vis.line(tx, ty, tx + 1, ty - 1, {
                color: roadColor,
                width: 0.1,
                opacity: 1,
              });
            }
            if (hasDownLeft) {
              vis.line(tx, ty, tx - 1, ty + 1, {
                color: roadColor,
                width: 0.1,
                opacity: 1,
              });
            }
            if (hasDownRight) {
              vis.line(tx, ty, tx + 1, ty + 1, {
                color: roadColor,
                width: 0.1,
                opacity: 1,
              });
            }
            if (!hasLeft && !hasRight && !hasUp && !hasDown && !hasUpLeft && !hasUpRight && !hasDownLeft && !hasDownRight) {
              vis.text('·', tx, ty + 0.08, {
                color: roadColor,
                font: 0.52,
                align: 'center',
              });
            }
          } else {
            vis.text(
              getRoadGlyph({ left: hasLeft, right: hasRight, up: hasUp, down: hasDown }),
              tx,
              ty + 0.08,
              {
                color: roadColor,
                font: 0.54,
                align: 'center',
              },
            );
          }
        }
        if (showRoadRclLabels && tile.rcl) {
          vis.text(String(tile.rcl), tx + 0.31, ty + 0.32, {
            color: '#a9a9a9',
            font: 0.33,
            align: 'left',
          });
        }
      }

      for (const tile of rampartMap.values()) {
        const overlapRoad = roadMap.has(`${tile.x}:${tile.y}`);
        if (!useStructureRenderer) {
          vis.text(getLabelForCell({ structureType: TYPES.RAMPART, overlapRoad }), tile.x, tile.y + 0.1, {
            color: '#d9fff7',
            font: overlapRoad ? 0.26 : 0.34,
            align: 'center',
          });
        }
      }

      for (const k of labKeys) {
        const [lx, ly] = k.split(':').map(Number);
        if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
        if (useStructureRenderer) continue;
        vis.text('L', lx, ly + 0.1, {
          color: getColor(TYPES.LAB),
          font: 0.54,
          align: 'center',
        });
      }
      if (
        !hasFullOptimizationDebug &&
        structurePlanningDebug &&
        Array.isArray(structurePlanningDebug.placements)
      ) {
        const previewStructurePlacements = [];
        const previewDebugLabelRows = [];
        for (const placement of structurePlanningDebug.placements) {
          if (!placement || !placement.type) continue;
          if (placement.type === TYPES.ROAD || placement.type === TYPES.RAMPART) continue;
          if (typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;
          if (useStructureRenderer) {
            previewStructurePlacements.push({
              x: placement.x,
              y: placement.y,
              roomName,
              type: placement.type,
            });
          } else {
            vis.text(
              getLabelForCell({ structureType: placement.type, tag: placement.tag || null }),
              placement.x,
              placement.y + 0.1,
              {
                color: getColor(placement.type),
                font: 0.52,
                align: 'center',
              },
            );
          }
          const debugLabels = previewDebugLabelsByPos.get(`${placement.x}:${placement.y}`) || null;
          if (showPlannerDebug && debugLabels) {
            if (useStructureRenderer) {
              previewDebugLabelRows.push({
                x: placement.x,
                y: placement.y,
                labels: debugLabels,
              });
            } else {
              drawPreviewDebugLabels(vis, placement.x, placement.y, debugLabels);
            }
          }
        }
        if (useStructureRenderer && previewStructurePlacements.length > 0) {
          structureVisualizer.drawStructurePlacements(previewStructurePlacements, { opacity: 0.5 });
          for (const row of previewDebugLabelRows) {
            drawPreviewDebugLabels(vis, row.x, row.y, row.labels);
          }
        }
      }

      // Keep optional planner diagnostics behind the shared debug toggle.
      if (showPlannerDebug && validStructureDebug && Array.isArray(validStructureDebug.positions)) {
        const occupiedStructureTiles = new Set();
        const markOccupied = (x, y) => {
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          occupiedStructureTiles.add(`${x}:${y}`);
        };
        for (const mx in matrix) {
          for (const my in matrix[mx]) {
            const cell = matrix[mx][my];
            if (!cell || !cell.structureType) continue;
            if (cell.structureType === TYPES.ROAD || cell.structureType === TYPES.RAMPART) continue;
            markOccupied(parseInt(mx, 10), parseInt(my, 10));
          }
        }
        for (const type of getPlannedStructureTypes(basePlan)) {
          if (type === TYPES.ROAD || type === TYPES.RAMPART) continue;
          for (const tile of toPlannedCells(basePlan, type)) {
            markOccupied(tile.x, tile.y);
          }
        }
        if (!preferBasePlanOverlay && activeCandidatePlan && Array.isArray(activeCandidatePlan.placements)) {
          for (const placement of activeCandidatePlan.placements) {
            if (!placement || !placement.type) continue;
            if (placement.type === TYPES.ROAD || placement.type === TYPES.RAMPART) continue;
            markOccupied(placement.x, placement.y);
          }
        }
        if (labPlanningDebug && Array.isArray(labPlanningDebug.sourceLabs)) {
          for (const pos of labPlanningDebug.sourceLabs) {
            markOccupied(pos && pos.x, pos && pos.y);
          }
        }
        if (labPlanningDebug && Array.isArray(labPlanningDebug.reactionLabs)) {
          for (const pos of labPlanningDebug.reactionLabs) {
            markOccupied(pos && pos.x, pos && pos.y);
          }
        }
        if (
          !hasFullOptimizationDebug &&
          structurePlanningDebug &&
          Array.isArray(structurePlanningDebug.placements)
        ) {
          for (const pos of structurePlanningDebug.placements) {
            if (!pos || pos.type === TYPES.ROAD || pos.type === TYPES.RAMPART) continue;
            markOccupied(pos.x, pos.y);
          }
        }
        let shownValidDots = 0;
        for (const pos of validStructureDebug.positions) {
          if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
          if (occupiedStructureTiles.has(`${pos.x}:${pos.y}`)) continue;
          if (typeof vis.circle === 'function') {
            vis.circle(pos.x, pos.y, {
              radius: 0.22,
              fill: '#6df7a7',
              opacity: 0.65,
              stroke: 'transparent',
            });
            shownValidDots += 1;
            const debugLabels = previewDebugLabelsByPos.get(`${pos.x}:${pos.y}`) || null;
            if (debugLabels) {
              drawPreviewDebugLabels(vis, pos.x, pos.y, debugLabels);
            }
          }
        }
        vis.text(
          `ValidStruct ${Number(validStructureDebug.structureClear) || 0} (canPlaceExt ${Number(validStructureDebug.canPlace) || 0}, shown ${shownValidDots}${validStructureDebug.truncated ? '+' : ''})`,
          2,
          2.5 + planningHudYOffset,
          {
            color: '#6df7a7',
            font: 0.45,
            align: 'left',
          },
        );
      }
      if (showPlannerDebug && previewDistanceOrigin) {
        // Mark the exact DT/range origin used for preview distance evaluation.
        if (typeof vis.circle === 'function') {
          vis.circle(previewDistanceOrigin.x, previewDistanceOrigin.y, {
            radius: 0.34,
            fill: 'transparent',
            stroke: '#ffd166',
            strokeWidth: 0.08,
            opacity: 0.95,
          });
        }
        vis.text('DT0', previewDistanceOrigin.x + 0.52, previewDistanceOrigin.y - 0.34, {
          color: '#ffd166',
          font: 0.4,
          align: 'left',
        });
      }

      if (isTheoretical) {
        if (theoretical.controllerPos) {
          vis.text('CTRL', theoretical.controllerPos.x, theoretical.controllerPos.y + 0.1, {
            color: '#66ddff',
            font: 0.36,
            align: 'center',
          });
        }
        const theoreticalStructurePlacements = [];
        const queueTheoreticalPlacement = (type, x, y) => {
          if (!useStructureRenderer || !Number.isFinite(x) || !Number.isFinite(y) || !type) return;
          const key = `${x}:${y}:${type}`;
          if (drawnStructureKeys.has(key)) return;
          theoreticalStructurePlacements.push({ x, y, roomName, type });
          drawnStructureKeys.add(key);
        };
        if (!useStructureRenderer && Array.isArray(theoretical.upgraderSlots)) {
          for (const slot of theoretical.upgraderSlots) {
            vis.rect(slot.x - 0.5, slot.y - 0.5, 1, 1, {
              fill: '#56c271',
              opacity: 0.25,
              stroke: '#56c271',
              strokeWidth: 0.04,
            });
          }
        }
        if (theoretical.controllerContainer) {
          if (useStructureRenderer) {
            queueTheoreticalPlacement(TYPES.CONTAINER, theoretical.controllerContainer.x, theoretical.controllerContainer.y);
          } else {
            vis.text('C', theoretical.controllerContainer.x, theoretical.controllerContainer.y + 0.1, {
              color: getColor(TYPES.CONTAINER),
              font: 0.52,
              align: 'center',
            });
          }
        }
        if (Array.isArray(theoretical.sourceContainers)) {
          for (const src of theoretical.sourceContainers) {
            if (useStructureRenderer) {
              queueTheoreticalPlacement(TYPES.CONTAINER, src.x, src.y);
            } else {
              vis.text('C', src.x, src.y + 0.1, {
                color: getColor(TYPES.CONTAINER),
                font: 0.52,
                align: 'center',
              });
            }
          }
        }
        if (theoretical.spawnCandidate && !hasFinalSpawnSelection) {
          if (useStructureRenderer) {
            queueTheoreticalPlacement(TYPES.SPAWN, theoretical.spawnCandidate.x, theoretical.spawnCandidate.y);
          } else {
            vis.text('S', theoretical.spawnCandidate.x, theoretical.spawnCandidate.y + 0.1, {
              color: getColor(TYPES.SPAWN),
              font: 0.52,
              align: 'center',
            });
          }
          vis.text(
            'TH-SP',
            theoretical.spawnCandidate.x + 0.55,
            theoretical.spawnCandidate.y - 0.35,
            {
              color: '#7bd389',
              font: 0.45,
              align: 'left',
            },
          );
        }
        if (theoreticalStructurePlacements.length > 0) {
          structureVisualizer.drawStructurePlacements(theoreticalStructurePlacements, { opacity: 0.55 });
        }

        if (candidateRows.length > 0) {
          if (!hasFinalSpawnSelection) {
            for (const candidate of candidateRows) {
              if (!candidate || !candidate.anchor) continue;
              const isActive = candidate.index === activeCandidateIndex;
              vis.text(
                `C${candidate.index + 1}`,
                candidate.anchor.x + 0.48,
                candidate.anchor.y - 0.4,
                {
                  color: isActive ? '#ffd166' : '#99c2ff',
                  font: 0.45,
                  align: 'left',
                },
              );
            }
          }

          // Candidate list is now rendered in the room planning HUD (manager.hud)
          // to keep planning checklist + room header in a single place.
        }

        if (overlayView === 'evaluation' && activeCandidate) {
          const panelX = 2;
          let panelY = 9.2 + planningHudYOffset;
          vis.text(
            `Eval C${activeCandidate.index + 1} weighted:${fmt(activeCandidate.weightedScore, 3)}`,
            panelX,
            panelY,
            {
              color: '#ffd166',
              font: 0.53,
              align: 'left',
            },
          );
          panelY += 0.7;
          const contributions = activeCandidate.weightedContributions || {};
          const ranked = Object.keys(contributions)
            .map((metric) => ({ metric, data: contributions[metric] }))
            .sort(
              (a, b) =>
                ((b.data && b.data.contribution) || 0) -
                ((a.data && a.data.contribution) || 0),
            );
          for (const item of ranked.slice(0, 6)) {
            const data = item.data || {};
            vis.text(
              `${item.metric}: n=${fmt(data.normalized, 3)} w=${fmt(data.weight, 2)} c=${fmt(data.contribution, 3)}`,
              panelX,
              panelY,
              {
                color: '#d9e8ff',
                font: 0.44,
                align: 'left',
              },
            );
            panelY += 0.58;
          }
        }

        const checklist = overlayState.checklist;

        const checklistStart = Game.cpu.getUsed();
        if (checklist && Array.isArray(checklist.stages)) {
          const cx = 47;
          let cy = 2.2 + planningHudYOffset;
          vis.text('Planning Checklist', cx, cy, {
            color: '#ffffff',
            font: 0.5,
            align: 'right',
          });
          cy += 0.7;
          if (checklist.debug && checklist.debug.phaseWindow) {
            vis.text(
              `debug ${checklist.debug.phaseWindow.from}..${checklist.debug.phaseWindow.to} (${checklist.debug.recalcScope || 'all'})`,
              cx,
              cy,
              {
                color: '#a8d4ff',
                font: 0.4,
                align: 'right',
              },
            );
            cy += 0.55;
          }
          for (const stage of checklist.stages) {
            vis.text(
              `${stage.number || '?'}). ${stage.label} ${stageIndicator(stage)}`,
              cx,
              cy,
              {
                color:
                  stage.status === 'done'
                    ? '#7bd389'
                    : stage.status === 'in_progress'
                    ? '#ffd166'
                    : '#ff8a80',
                font: 0.44,
                align: 'right',
              },
            );
            cy += 0.58;
            if (stage.detail) {
              vis.text(String(stage.detail), cx, cy, {
                color: '#9fb5d6',
                font: 0.36,
                align: 'right',
              });
              cy += 0.48;
            }
          }

          const checklistCandidates = Array.isArray(candidateRows) ? candidateRows : [];
          if (checklistCandidates.length) {
            cy += 0.2;
            vis.text('Candidates', cx, cy, {
              color: '#d9e8ff',
              font: 0.46,
              align: 'right',
            });
            cy += 0.58;
            const bestIndex = overlayState.bestIndex;
            for (const row of overlayState.sortedChecklistCandidates.slice(0, 8)) {
              const isBest = row.index === bestIndex;
              const isActive = row.index === activeCandidateIndex;
              vis.text(`C${row.index + 1} ${row.anchor.x}/${row.anchor.y}${isBest ? ' ✔' : ''}`, cx, cy, {
                color: isBest ? '#7bd389' : isActive ? '#ffd166' : '#d9e8ff',
                font: 0.42,
                align: 'right',
              });
              cy += 0.52;
            }
          }
          recordRenderSubtask(roomName, 'Planning Checklist (Top Right)', Game.cpu.getUsed() - checklistStart);
        }
      }

      if (!useStructureRenderer && Memory.settings.showLayoutLegend !== false) {
      const legendStart = Game.cpu.getUsed();
      const legend = isTheoretical
        ? [
            [TYPES.SPAWN, 'Theoretical Spawn (S/S2/S3)'],
            [TYPES.CONTAINER, 'Container (C)'],
            [TYPES.ROAD, 'Logistics Road'],
            [TYPES.EXTENSION, 'Planned Extension'],
            [TYPES.TOWER, 'Planned Tower'],
            [TYPES.STORAGE, 'Planned Storage'],
            [TYPES.TERMINAL, 'Planned Terminal'],
            [TYPES.LINK, 'Planned Link'],
            [TYPES.LAB, 'Planned Lab'],
            [TYPES.FACTORY, 'Planned Factory'],
            [TYPES.OBSERVER, 'Planned Observer'],
            [TYPES.POWER_SPAWN, 'Planned Power Spawn'],
            [TYPES.NUKER, 'Planned Nuker'],
            [TYPES.EXTRACTOR, 'Planned Extractor'],
            [TYPES.RAMPART, 'Planned Rampart'],
            [{ structureType: TYPES.RAMPART, overlapRoad: true }, 'Road + Rampart Overlap'],
          ]
        : [
            [TYPES.SPAWN, 'Spawn (S/S2/S3)'],
            [TYPES.EXTENSION, 'Extension'],
            [TYPES.CONTAINER, 'Container (C)'],
            [TYPES.ROAD, 'Road'],
            [TYPES.TOWER, 'Tower'],
            [TYPES.STORAGE, 'Storage'],
            [TYPES.TERMINAL, 'Terminal'],
            [TYPES.LINK, 'Link'],
            [TYPES.LAB, 'Lab'],
            [TYPES.POWER_SPAWN, 'Power Spawn (PS)'],
            [TYPES.RAMPART, 'Rampart'],
            [{ structureType: TYPES.RAMPART, overlapRoad: true }, 'Road + Rampart Overlap'],
          ];
      if (showPlannerDebug) {
        legend.push([TYPES.EXTENSION, 'Valid Structure Tile (debug dot)']);
      }
      const baseX = 2;
      const rowStep = 0.8;
      const extraRows = isTheoretical ? 1.2 : 0.2; // room for upgrader-slot note in theoretical mode
      // Keep legend fully inside the room visual bounds.
      const baseY = Math.max(3, 49 - (legend.length + extraRows) * rowStep);
      vis.text('Layout Legend', baseX, baseY - 0.5, {
        color: '#ffffff',
        font: 0.6,
        align: 'left',
      });
      if (isTheoretical) {
        const activeLabel =
          activeCandidateIndex !== null ? ` · C${activeCandidateIndex + 1}` : '';
        vis.text(`View: ${overlayView}${activeLabel}`, baseX, baseY - 1.3, {
          color: '#99d1ff',
          font: 0.52,
          align: 'left',
        });
      }
      for (let i = 0; i < legend.length; i++) {
        const [typeOrCell, label] = legend[i];
        const y = baseY + i * rowStep;
        const legendCell =
          typeOrCell && typeof typeOrCell === 'object' && typeOrCell.structureType
            ? typeOrCell
            : { structureType: typeOrCell };
        const type = legendCell.structureType;
        const color = getColor(type);
        const glyph =
          type === TYPES.ROAD
            ? '─'
            : type === TYPES.POWER_SPAWN
            ? 'PS'
            : getLabelForCell(legendCell);
        vis.text(glyph, baseX, y + 0.08, {
          color,
          font: 0.52,
          align: 'center',
        });
        vis.text(label, baseX + 0.5, y + 0.1, {
          color: '#dddddd',
          font: 0.5,
          align: 'left',
        });
      }
      recordRenderSubtask(roomName, 'Planning Legend (Bottom Left)', Game.cpu.getUsed() - legendStart);
      }
      statsConsole.run([["layoutVisualizer", Game.cpu.getUsed() - start]]);
    } catch (err) {
      console.log(`[layoutVisualizer] drawLayout failed for ${roomName}: ${err && err.stack ? err.stack : err}`);
    }
  },
};

module.exports = layoutVisualizer;
