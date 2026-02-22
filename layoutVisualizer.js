const statsConsole = require('console.console');
/**
 * Draw ghost overlays for planned structures using matrix layout.
 * Toggle via Memory.settings.showLayoutOverlay.
 */
/** @codex-owner layoutVisualizer */
function getGlyph(type) {
  const map = {
    [STRUCTURE_EXTENSION]: 'E',
    [STRUCTURE_STORAGE]: 'S',
    [STRUCTURE_TOWER]: 'T',
    [STRUCTURE_LINK]: 'K',
    [STRUCTURE_SPAWN]: 'P',
    [STRUCTURE_ROAD]: 'R',
    [STRUCTURE_CONTAINER]: 'C',
  };
  return map[type] || '?';
}

function getColor(type) {
  const map = {
    [STRUCTURE_EXTENSION]: '#f6c945',
    [STRUCTURE_STORAGE]: '#4da6ff',
    [STRUCTURE_TOWER]: '#ff8a65',
    [STRUCTURE_LINK]: '#8b6cff',
    [STRUCTURE_SPAWN]: '#7bd389',
    [STRUCTURE_ROAD]: '#9e9e9e',
    [STRUCTURE_CONTAINER]: '#c58f58',
  };
  return map[type] || '#ffffff';
}

const layoutVisualizer = {
  drawLayout(roomName) {
    if (!Memory.settings || !Memory.settings.showLayoutOverlay) return;
    const room = Game.rooms[roomName];
    if (!room || !room.memory.layout) return;
    const start = Game.cpu.getUsed();
    const vis = new RoomVisual(roomName);
    const layoutMode = String((Memory.settings && Memory.settings.layoutPlanningMode) || 'standard').toLowerCase();
    const overlayView = String((Memory.settings && Memory.settings.layoutOverlayView) || 'plan').toLowerCase();
    const isTheoretical = room.memory.layout.mode === 'theoretical' || layoutMode === 'theoretical';

    const matrix = room.memory.layout.matrix || {};
    const theoretical = room.memory.layout.theoretical || {};

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
          `Score:${Math.round(theoretical.spawnCandidate.score || 0)} F:${Math.round(theoretical.spawnCandidate.floodScore || 0)} M:${Math.round(theoretical.spawnCandidate.mincutScore || 0)}`,
          2,
          3,
          { color: '#ffffff', font: 0.6, align: 'left' },
        );
      }
      if (overlayView === 'flood' && theoretical.spawnCandidate) {
        const sx = theoretical.spawnCandidate.x;
        const sy = theoretical.spawnCandidate.y;
        vis.circle(sx, sy, { radius: 0.45, fill: '#55ffaa', opacity: 0.35, stroke: '#55ffaa', strokeWidth: 0.05 });
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
        vis.text('TH-SP', theoretical.spawnCandidate.x + 0.55, theoretical.spawnCandidate.y - 0.35, {
          color: '#7bd389',
          font: 0.45,
          align: 'left',
        });
      }
    }

    if (Memory.settings.showLayoutLegend !== false) {
      const legend = isTheoretical
        ? [
            [STRUCTURE_SPAWN, 'Theoretical Spawn'],
            [STRUCTURE_CONTAINER, 'Controller/Source Container'],
            [STRUCTURE_ROAD, 'Logistics Road'],
            [STRUCTURE_EXTENSION, 'Planned Extension'],
            [STRUCTURE_TOWER, 'Planned Tower'],
            [STRUCTURE_STORAGE, 'Planned Storage'],
            [STRUCTURE_LINK, 'Planned Link'],
          ]
        : [
            [STRUCTURE_SPAWN, 'Spawn'],
            [STRUCTURE_EXTENSION, 'Extension'],
            [STRUCTURE_CONTAINER, 'Container'],
            [STRUCTURE_ROAD, 'Road'],
            [STRUCTURE_TOWER, 'Tower'],
            [STRUCTURE_STORAGE, 'Storage'],
            [STRUCTURE_LINK, 'Link'],
          ];
      const baseX = 2;
      const baseY = isTheoretical ? 40 : 46;
      vis.text('Layout Legend', baseX, baseY - 0.5, {
        color: '#ffffff',
        font: 0.6,
        align: 'left',
      });
      if (isTheoretical) {
        vis.text(`View: ${overlayView}`, baseX, baseY - 1.3, {
          color: '#99d1ff',
          font: 0.52,
          align: 'left',
        });
      }
      for (let i = 0; i < legend.length; i++) {
        const [type, label] = legend[i];
        const y = baseY + i * 0.8;
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
        const y = baseY + legend.length * 0.8 + 0.3;
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
  },
};

module.exports = layoutVisualizer;
