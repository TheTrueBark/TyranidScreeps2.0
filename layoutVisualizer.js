const statsConsole = require('console.console');
const htm = require('./manager.htm');
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
  if (type === TYPES.SPAWN) {
    const tag = String(cell.tag || '');
    const match = tag.match(/^spawn\.(\d+)$/i);
    if (match && match[1]) return `S${match[1]}`;
    return 'S';
  }
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

function fmt(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
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
            { number: 4, label: 'Core + Stations', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Complete for all candidates' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 5, label: 'Flood Fill + Extensions', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Complete for all candidates' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 6, label: 'Labs + Ramparts + Towers', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Complete for all candidates' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 7, label: 'Road Networks', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Complete for all candidates' : `Working ${pipelineDoneCount}/${pipelineCandidateCount}` },
            { number: 8, label: 'End Evaluation (Weighted)', status: pipelineComplete ? 'done' : 'in_progress', progress: `${pipelineDoneCount}/${pipelineCandidateCount}`, detail: pipelineComplete ? 'Weighted scores finalized' : `Scoring ${pipelineDoneCount}/${pipelineCandidateCount}` },
            {
              number: 9,
              label: 'Winner Selection',
              status: typeof theoreticalPipeline.bestCandidateIndex === 'number' ? 'done' : 'pending',
              progress: typeof theoreticalPipeline.bestCandidateIndex === 'number' ? '✔' : 'X',
              detail:
                typeof theoreticalPipeline.bestCandidateIndex === 'number'
                  ? `Winner: C${theoreticalPipeline.bestCandidateIndex + 1}`
                  : 'No winner selected',
            },
            {
              number: 10,
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
      const layoutMode = String((Memory.settings && Memory.settings.layoutPlanningMode) || 'standard').toLowerCase();
      const overlayView = String((Memory.settings && Memory.settings.layoutOverlayView) || 'plan').toLowerCase();
      const isTheoretical = room.memory.layout.mode === 'theoretical' || layoutMode === 'theoretical';

      const matrix = room.memory.layout.matrix || {};
      const showRoadRclLabels = Boolean(Memory.settings && Memory.settings.showRoadRclLabels);
      const overlayState = getTheoreticalOverlayState(roomName, room.memory.layout || {}, Memory.settings || {});
      const theoretical = overlayState.theoretical;
      const theoreticalPipeline = overlayState.theoreticalPipeline;
      const candidateRows = overlayState.candidateRows;
      const activeCandidateIndex = overlayState.activeCandidateIndex;
      const activeCandidate = overlayState.activeCandidate;
      const hasFinalSpawnSelection = overlayState.hasFinalSpawnSelection;

      if (isTheoretical && overlayView !== 'plan') {
        const map =
          overlayView === 'walldistance'
            ? theoretical.wallDistance
            : overlayView === 'controllerdistance'
            ? theoretical.controllerDistance
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
      }

      const roadTiles = [];
      const roadSet = {};
      for (const x in matrix) {
        for (const y in matrix[x]) {
          const cell = matrix[x][y];
          const px = parseInt(x, 10);
          const py = parseInt(y, 10);
          if (cell.structureType === TYPES.ROAD) {
            roadTiles.push({ x: px, y: py, rcl: cell.rcl || null });
            roadSet[`${px}:${py}`] = true;
            continue;
          }
          const color = getColor(cell.structureType);
          vis.text(getLabelForCell(cell), px, py + 0.1, {
            color,
            font: 0.52,
            align: 'center',
          });
          if (cell.rcl) {
            vis.text(String(cell.rcl), px + 0.31, py + 0.32, {
              color: '#a9a9a9',
              font: 0.33,
              align: 'left',
            });
          }
        }
      }
      for (const tile of roadTiles) {
        const tx = tile.x;
        const ty = tile.y;
        const hasLeft = Boolean(roadSet[`${tx - 1}:${ty}`]);
        const hasRight = Boolean(roadSet[`${tx + 1}:${ty}`]);
        const hasUp = Boolean(roadSet[`${tx}:${ty - 1}`]);
        const hasDown = Boolean(roadSet[`${tx}:${ty + 1}`]);
        const roadColor = getColor(TYPES.ROAD);
        if (typeof vis.line === 'function') {
          if (hasLeft) {
            vis.line(tx, ty, tx - 0.5, ty, {
              color: roadColor,
              width: 0.16,
              opacity: 1,
            });
          }
          if (hasRight) {
            vis.line(tx, ty, tx + 0.5, ty, {
              color: roadColor,
              width: 0.16,
              opacity: 1,
            });
          }
          if (hasUp) {
            vis.line(tx, ty, tx, ty - 0.5, {
              color: roadColor,
              width: 0.16,
              opacity: 1,
            });
          }
          if (hasDown) {
            vis.line(tx, ty, tx, ty + 0.5, {
              color: roadColor,
              width: 0.16,
              opacity: 1,
            });
          }
          if (!hasLeft && !hasRight && !hasUp && !hasDown) {
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
        if (showRoadRclLabels && tile.rcl) {
          vis.text(String(tile.rcl), tx + 0.31, ty + 0.32, {
            color: '#a9a9a9',
            font: 0.33,
            align: 'left',
          });
        }
      }

      if (isTheoretical) {
        if (theoretical.controllerPos) {
          vis.text('CTRL', theoretical.controllerPos.x, theoretical.controllerPos.y + 0.1, {
            color: '#66ddff',
            font: 0.36,
            align: 'center',
          });
        }
        if (Array.isArray(theoretical.upgraderSlots)) {
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
          vis.text('C', theoretical.controllerContainer.x, theoretical.controllerContainer.y + 0.1, {
            color: getColor(TYPES.CONTAINER),
            font: 0.52,
            align: 'center',
          });
        }
        if (Array.isArray(theoretical.sourceContainers)) {
          for (const src of theoretical.sourceContainers) {
            vis.text('C', src.x, src.y + 0.1, {
              color: getColor(TYPES.CONTAINER),
              font: 0.52,
              align: 'center',
            });
          }
        }
        if (theoretical.spawnCandidate && !hasFinalSpawnSelection) {
          vis.text('S', theoretical.spawnCandidate.x, theoretical.spawnCandidate.y + 0.1, {
            color: getColor(TYPES.SPAWN),
            font: 0.52,
            align: 'center',
          });
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

          if (overlayView === 'candidates' || overlayView === 'evaluation') {
            const listX = 2;
            let listY = 3.8;
            vis.text('Candidates', listX, listY, {
              color: '#ffffff',
              font: 0.58,
              align: 'left',
            });
            listY += 0.8;
            for (const row of overlayState.sortedCandidatesByScore.slice(0, 5)) {
              if (!row || !row.anchor) continue;
              const selectedMark = row.index === theoretical.selectedCandidateIndex ? '*' : ' ';
              const activeMark = row.index === activeCandidateIndex ? '>' : ' ';
              vis.text(
                `${activeMark}${selectedMark} C${row.index + 1} pre:${fmt(row.initialScore, 1)} final:${fmt(row.weightedScore, 3)}`,
                listX,
                listY,
                {
                  color: row.index === activeCandidateIndex ? '#ffd166' : '#d9e8ff',
                  font: 0.47,
                  align: 'left',
                },
              );
              listY += 0.62;
            }
          }
        }

        if (overlayView === 'evaluation' && activeCandidate) {
          const panelX = 2;
          let panelY = 9.2;
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
          let cy = 2.2;
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

      if (Memory.settings.showLayoutLegend !== false) {
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
            [TYPES.RAMPART, 'Rampart'],
          ];
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
        const [type, label] = legend[i];
        const y = baseY + i * rowStep;
        const color = getColor(type);
        const glyph = type === TYPES.ROAD ? '─' : getGlyph(type);
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
      if (isTheoretical) {
        const y = baseY + legend.length * rowStep + 0.3;
        vis.rect(baseX - 0.17, y - 0.25, 0.34, 0.34, {
          fill: '#56c271',
          opacity: 0.35,
          stroke: '#56c271',
          strokeWidth: 0.04,
        });
        vis.text('Reserved Upgrader Slot (2x4)', baseX + 0.5, y + 0.05, {
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
