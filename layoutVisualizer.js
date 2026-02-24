const statsConsole = require('console.console');
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
    [TYPES.SPAWN]: 'P',
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

function getColor(type) {
  const map = {
    [TYPES.EXTENSION]: '#f6c945',
    [TYPES.STORAGE]: '#4da6ff',
    [TYPES.TOWER]: '#ff8a65',
    [TYPES.LINK]: '#8b6cff',
    [TYPES.SPAWN]: '#7bd389',
    [TYPES.ROAD]: '#9e9e9e',
    [TYPES.CONTAINER]: '#c58f58',
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
      const theoretical = room.memory.layout.theoretical || {};
      const theoreticalPipeline = room.memory.layout.theoreticalPipeline || null;
      const pipelineCandidates =
        theoreticalPipeline && Array.isArray(theoreticalPipeline.candidates)
          ? theoreticalPipeline.candidates.map((candidate) => ({
              index: candidate.index,
              anchor: candidate.anchor,
              initialScore: candidate.initialScore,
              weightedScore:
                theoreticalPipeline.results && theoreticalPipeline.results[candidate.index]
                  ? theoreticalPipeline.results[candidate.index].weightedScore
                  : null,
              weightedContributions:
                theoreticalPipeline.results && theoreticalPipeline.results[candidate.index]
                  ? theoreticalPipeline.results[candidate.index].weightedContributions
                  : null,
            }))
          : [];
      const candidateViewPref =
        Memory.settings && typeof Memory.settings.layoutCandidateOverlayIndex === 'number'
          ? Memory.settings.layoutCandidateOverlayIndex
          : -1;
      const effectiveTheoretical =
        Array.isArray(theoretical.candidates) && theoretical.candidates.length > 0
          ? theoretical
          : Object.assign({}, theoretical, { candidates: pipelineCandidates });
      const activeCandidateIndex = resolveCandidateIndex(effectiveTheoretical, candidateViewPref);
      const candidateRows = Array.isArray(effectiveTheoretical.candidates)
        ? effectiveTheoretical.candidates
        : [];
      const activeCandidate =
        activeCandidateIndex !== null
          ? candidateRows.find((c) => c.index === activeCandidateIndex) || null
          : null;

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
          vis.circle(sx, sy, {
            radius: 0.45,
            fill: '#55ffaa',
            opacity: 0.35,
            stroke: '#55ffaa',
            strokeWidth: 0.05,
          });
        }
      }

      for (const x in matrix) {
      for (const y in matrix[x]) {
        const cell = matrix[x][y];
        const px = parseInt(x, 10);
        const py = parseInt(y, 10);
        const color = getColor(cell.structureType);
        vis.circle(px, py, {
          radius: 0.17,
          fill: color,
          opacity: 0.85,
          stroke: '#111111',
          strokeWidth: 0.03,
        });
        if (Memory.settings.showLayoutOverlayLabels) {
          vis.text(getGlyph(cell.structureType), px + 0.18, py - 0.15, {
            color,
            font: 0.45,
            align: 'left',
          });
        }
        if (cell.rcl) {
          vis.text(String(cell.rcl), px + 0.28, py + 0.28, {
            color: '#888888',
            font: 0.38,
            align: 'left',
          });
        }
      }
    }

      const reserved = room.memory.layout.reserved || {};
      for (const x in reserved) {
      for (const y in reserved[x]) {
        vis.rect(parseInt(x) - 0.5, parseInt(y) - 0.5, 1, 1, {
          fill: 'red',
          opacity: 0.1,
          stroke: 'red',
        });
      }
    }

      if (isTheoretical) {
        if (theoretical.controllerPos) {
          vis.circle(theoretical.controllerPos.x, theoretical.controllerPos.y, {
            radius: 0.45,
            fill: 'transparent',
            stroke: '#66ddff',
            strokeWidth: 0.12,
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
          vis.circle(theoretical.controllerContainer.x, theoretical.controllerContainer.y, {
            radius: 0.28,
            fill: '#ffd166',
            opacity: 0.75,
            stroke: '#111111',
            strokeWidth: 0.04,
          });
        }
        if (Array.isArray(theoretical.sourceContainers)) {
          for (const src of theoretical.sourceContainers) {
            vis.circle(src.x, src.y, {
              radius: 0.24,
              fill: '#ffaf6b',
              opacity: 0.8,
              stroke: '#111111',
              strokeWidth: 0.03,
            });
          }
        }
        if (theoretical.spawnCandidate) {
          vis.circle(theoretical.spawnCandidate.x, theoretical.spawnCandidate.y, {
            radius: 0.35,
            fill: '#7bd389',
            opacity: 0.5,
            stroke: '#7bd389',
            strokeWidth: 0.07,
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
          for (const candidate of candidateRows) {
            if (!candidate || !candidate.anchor) continue;
            const isSelected = candidate.index === theoretical.selectedCandidateIndex;
            const isActive = candidate.index === activeCandidateIndex;
            const stroke = isActive ? '#ffd166' : isSelected ? '#7bd389' : '#99c2ff';
            const fill = isActive ? '#ffd166' : isSelected ? '#7bd389' : '#4da6ff';
            vis.circle(candidate.anchor.x, candidate.anchor.y, {
              radius: isActive ? 0.42 : 0.32,
              fill,
              opacity: isActive ? 0.45 : 0.3,
              stroke,
              strokeWidth: 0.07,
            });
            vis.text(
              `C${candidate.index + 1}`,
              candidate.anchor.x + 0.5,
              candidate.anchor.y - 0.45,
              {
                color: stroke,
                font: 0.45,
                align: 'left',
              },
            );
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
            const sortedRows = candidateRows
              .slice()
              .sort(
                (a, b) =>
                  (b && typeof b.weightedScore === 'number' ? b.weightedScore : -1) -
                  (a && typeof a.weightedScore === 'number' ? a.weightedScore : -1),
              );
            for (const row of sortedRows.slice(0, 5)) {
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

        const checklist =
          theoretical && theoretical.checklist
            ? theoretical.checklist
            : theoreticalPipeline
            ? {
                stages: [
                  { number: 1, label: 'Distance Transform', status: 'done', progress: '✔' },
                  {
                    number: 2,
                    label: 'Candidate Filter',
                    status: 'done',
                    progress: '✔',
                  },
                  {
                    number: 3,
                    label: 'Candidate Pre-Scoring',
                    status: 'done',
                    progress: '✔',
                  },
                  {
                    number: 4,
                    label: 'Core + Stations',
                    status:
                      Object.keys(theoreticalPipeline.results || {}).length >=
                      (theoreticalPipeline.candidateCount || 0)
                        ? 'done'
                        : 'in_progress',
                    progress: `${Object.keys(theoreticalPipeline.results || {}).length}/${theoreticalPipeline.candidateCount || 0}`,
                  },
                  {
                    number: 5,
                    label: 'Flood Fill + Extensions',
                    status:
                      Object.keys(theoreticalPipeline.results || {}).length >=
                      (theoreticalPipeline.candidateCount || 0)
                        ? 'done'
                        : 'in_progress',
                    progress: `${Object.keys(theoreticalPipeline.results || {}).length}/${theoreticalPipeline.candidateCount || 0}`,
                  },
                  {
                    number: 6,
                    label: 'Labs + Ramparts + Towers',
                    status:
                      Object.keys(theoreticalPipeline.results || {}).length >=
                      (theoreticalPipeline.candidateCount || 0)
                        ? 'done'
                        : 'in_progress',
                    progress: `${Object.keys(theoreticalPipeline.results || {}).length}/${theoreticalPipeline.candidateCount || 0}`,
                  },
                  {
                    number: 7,
                    label: 'Road Networks',
                    status:
                      Object.keys(theoreticalPipeline.results || {}).length >=
                      (theoreticalPipeline.candidateCount || 0)
                        ? 'done'
                        : 'in_progress',
                    progress: `${Object.keys(theoreticalPipeline.results || {}).length}/${theoreticalPipeline.candidateCount || 0}`,
                  },
                  {
                    number: 8,
                    label: 'End Evaluation (Weighted)',
                    status:
                      Object.keys(theoreticalPipeline.results || {}).length >=
                      (theoreticalPipeline.candidateCount || 0)
                        ? 'done'
                        : 'in_progress',
                    progress: `${Object.keys(theoreticalPipeline.results || {}).length}/${theoreticalPipeline.candidateCount || 0}`,
                  },
                  {
                    number: 9,
                    label: 'Winner Selection',
                    status:
                      typeof theoreticalPipeline.bestCandidateIndex === 'number'
                        ? 'done'
                        : 'pending',
                    progress:
                      typeof theoreticalPipeline.bestCandidateIndex === 'number'
                        ? '✔'
                        : 'X',
                  },
                  {
                    number: 10,
                    label: 'Persist + Overlay',
                    status:
                      theoreticalPipeline.status === 'completed' ? 'done' : 'pending',
                    progress:
                      theoreticalPipeline.status === 'completed' ? '✔' : 'X',
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
          }

          const candidateStates = Array.isArray(checklist.candidateStates)
            ? checklist.candidateStates
            : [];
          if (candidateStates.length) {
            cy += 0.2;
            vis.text('Candidates', cx, cy, {
              color: '#d9e8ff',
              font: 0.46,
              align: 'right',
            });
            cy += 0.58;
            for (const state of candidateStates.slice(0, 8)) {
              const isActive = state.active || state.index === activeCandidateIndex;
              const mark = state.complete ? '✔' : isActive ? '...' : 'X';
              vis.text(`C${state.index + 1}: ${mark}`, cx, cy, {
                color: isActive ? '#ffd166' : state.complete ? '#7bd389' : '#ff8a80',
                font: 0.42,
                align: 'right',
              });
              cy += 0.52;
            }
          }
        }
      }

      if (Memory.settings.showLayoutLegend !== false) {
      const legend = isTheoretical
        ? [
            [TYPES.SPAWN, 'Theoretical Spawn'],
            [TYPES.CONTAINER, 'Controller/Source Container'],
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
            [TYPES.SPAWN, 'Spawn'],
            [TYPES.EXTENSION, 'Extension'],
            [TYPES.CONTAINER, 'Container'],
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
        vis.circle(baseX, y, {
          radius: 0.17,
          fill: color,
          opacity: 0.9,
          stroke: '#111111',
          strokeWidth: 0.03,
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
      }
      statsConsole.run([["layoutVisualizer", Game.cpu.getUsed() - start]]);
    } catch (err) {
      console.log(`[layoutVisualizer] drawLayout failed for ${roomName}: ${err && err.stack ? err.stack : err}`);
    }
  },
};

module.exports = layoutVisualizer;
