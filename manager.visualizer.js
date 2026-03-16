const _ = require('lodash');

const ROAD_TYPE = typeof STRUCTURE_ROAD !== 'undefined' ? STRUCTURE_ROAD : 'road';
const RAMPART_TYPE = typeof STRUCTURE_RAMPART !== 'undefined' ? STRUCTURE_RAMPART : 'rampart';
const RAMPART_STROKE = '#5D735F';
const RAMPART_FILL = '#6E8B72';
const RAMPART_FILL_OPACITY_MIN = 0.08;
const RAMPART_FILL_OPACITY_MAX = 0.16;
const RAMPART_INNER_FILL_SIZE = 0.82;
const RAMPART_INNER_FILL_OPACITY_FACTOR = 0.72;

function mergeIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];
  const sorted = intervals
    .filter((interval) => Array.isArray(interval) && interval.length === 2)
    .map((interval) => [Number(interval[0]), Number(interval[1])])
    .filter((interval) => Number.isFinite(interval[0]) && Number.isFinite(interval[1]))
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (!sorted.length) return [];
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];
    if (current[0] <= previous[1] + 0.0001) {
      previous[1] = Math.max(previous[1], current[1]);
      continue;
    }
    merged.push(current);
  }
  return merged;
}

function addSegment(segmentsByAxis, axisKey, start, end) {
  if (!segmentsByAxis.has(axisKey)) segmentsByAxis.set(axisKey, []);
  segmentsByAxis.get(axisKey).push([start, end]);
}

function drawMergedSegments(vis, segmentsByAxis, orientation, opts = {}) {
  requireVisualMethod(vis, 'unknown', 'line');
  for (const [axisKey, intervals] of segmentsByAxis.entries()) {
    const fixed = Number(axisKey);
    if (!Number.isFinite(fixed)) continue;
    for (const [start, end] of mergeIntervals(intervals)) {
      if (orientation === 'horizontal') {
        vis.line(start, fixed, end, fixed, opts);
      } else {
        vis.line(fixed, start, fixed, end, opts);
      }
    }
  }
}

function toRampartLineOpts(rawOpts = {}) {
  const opacity = Number.isFinite(rawOpts.opacity) ? Number(rawOpts.opacity) : 0.9;
  return {
    color: rawOpts.rampartStroke || RAMPART_STROKE,
    width:
      Number.isFinite(rawOpts.rampartStrokeWidth) && Number(rawOpts.rampartStrokeWidth) > 0
        ? Number(rawOpts.rampartStrokeWidth)
        : 0.12,
    opacity,
  };
}

function toRampartFillOpts(rawOpts = {}) {
  const lineOpacity = Number.isFinite(rawOpts.opacity) ? Number(rawOpts.opacity) : 0.9;
  const derivedOpacity = Math.max(
    RAMPART_FILL_OPACITY_MIN,
    Math.min(RAMPART_FILL_OPACITY_MAX, lineOpacity * 0.18),
  );
  return {
    fill: rawOpts.rampartFill || RAMPART_FILL,
    opacity: Number.isFinite(rawOpts.rampartFillOpacity)
      ? Number(rawOpts.rampartFillOpacity)
      : derivedOpacity,
    strokeWidth: 0,
  };
}

function getRampartStyleKey(lineOpts = {}) {
  return [lineOpts.color, lineOpts.width, lineOpts.opacity].join('|');
}

function getRampartSegmentGroup(groups, lineOpts = {}) {
  const key = getRampartStyleKey(lineOpts);
  if (!groups.has(key)) {
    groups.set(key, {
      lineOpts,
      horizontalSegments: new Map(),
      verticalSegments: new Map(),
    });
  }
  return groups.get(key);
}

function toInnerRampartLineOpts(lineOpts = {}) {
  return {
    color: lineOpts.color || RAMPART_STROKE,
    width: Math.max(0.08, Math.min(Number(lineOpts.width || 0.12), 0.1)),
    opacity: Math.max(0.55, Math.min(0.8, Number(lineOpts.opacity || 0.9) * 0.78)),
  };
}

function toRampartBridgeStrokeOpts(tileA, tileB) {
  const lineA = tileA && tileA.lineOpts ? tileA.lineOpts : {};
  const lineB = tileB && tileB.lineOpts ? tileB.lineOpts : {};
  return {
    color: lineA.color || lineB.color || RAMPART_STROKE,
    opacity: Math.max(
      0.7,
      Math.min(
        1,
        Math.max(
          Number.isFinite(lineA.opacity) ? lineA.opacity : 0,
          Number.isFinite(lineB.opacity) ? lineB.opacity : 0,
        ),
      ),
    ),
    width: Math.max(
      Number.isFinite(lineA.width) ? lineA.width : 0.12,
      Number.isFinite(lineB.width) ? lineB.width : 0.12,
    ),
  };
}

function collectRampartDiagonalBridges(rampartTiles, halfSize = 0.5) {
  const bridges = [];
  const skipEdges = new Set();
  const diagonalOnlyTiles = new Set();
  const hasRampart = (x, y) => rampartTiles.has(`${x}:${y}`);
  const hasOrthogonalNeighbor = (tile) =>
    hasRampart(tile.x, tile.y - 1) ||
    hasRampart(tile.x, tile.y + 1) ||
    hasRampart(tile.x - 1, tile.y) ||
    hasRampart(tile.x + 1, tile.y);
  for (const tile of rampartTiles.values()) {
    const diagonalChecks = [
      { nx: tile.x + 1, ny: tile.y - 1, ax: tile.x + 1, ay: tile.y, bx: tile.x, by: tile.y - 1 },
      { nx: tile.x + 1, ny: tile.y + 1, ax: tile.x + 1, ay: tile.y, bx: tile.x, by: tile.y + 1 },
    ];
    for (const diagonal of diagonalChecks) {
      if (!hasRampart(diagonal.nx, diagonal.ny)) continue;
      if (hasRampart(diagonal.ax, diagonal.ay) || hasRampart(diagonal.bx, diagonal.by)) continue;
      const neighbor = rampartTiles.get(`${diagonal.nx}:${diagonal.ny}`);
      const dx = diagonal.nx - tile.x;
      const dy = diagonal.ny - tile.y;
      const offsetX = dy * halfSize;
      const offsetY = -dx * halfSize;
      bridges.push({
        fromX: tile.x + offsetX,
        fromY: tile.y + offsetY,
        toX: diagonal.nx + offsetX,
        toY: diagonal.ny + offsetY,
        opts: toRampartBridgeStrokeOpts(tile, neighbor),
      });
      bridges.push({
        fromX: tile.x - offsetX,
        fromY: tile.y - offsetY,
        toX: diagonal.nx - offsetX,
        toY: diagonal.ny - offsetY,
        opts: toRampartBridgeStrokeOpts(tile, neighbor),
      });
      if (!hasOrthogonalNeighbor(tile)) diagonalOnlyTiles.add(`${tile.x}:${tile.y}`);
      if (neighbor && !hasOrthogonalNeighbor(neighbor)) {
        diagonalOnlyTiles.add(`${neighbor.x}:${neighbor.y}`);
      }
      if (dy < 0) {
        skipEdges.add(`${tile.x}:${tile.y}:top`);
        skipEdges.add(`${tile.x}:${tile.y}:right`);
        skipEdges.add(`${diagonal.nx}:${diagonal.ny}:bottom`);
        skipEdges.add(`${diagonal.nx}:${diagonal.ny}:left`);
      } else {
        skipEdges.add(`${tile.x}:${tile.y}:bottom`);
        skipEdges.add(`${tile.x}:${tile.y}:right`);
        skipEdges.add(`${diagonal.nx}:${diagonal.ny}:top`);
        skipEdges.add(`${diagonal.nx}:${diagonal.ny}:left`);
      }
    }
  }
  return { bridges, skipEdges, diagonalOnlyTiles };
}

function drawRampartDiagonalBridges(vis, diagonalBridgeData, roomName = 'unknown') {
  requireVisualMethod(vis, roomName, 'line');
  for (const bridge of diagonalBridgeData.bridges || []) {
    vis.line(bridge.fromX, bridge.fromY, bridge.toX, bridge.toY, bridge.opts);
  }
}

function drawRampartContourTiles(vis, contourTiles, roomName = 'unknown', halfSize = 0.5) {
  if (!(contourTiles instanceof Map) || contourTiles.size === 0) return;
  const hasRampart = (x, y) => contourTiles.has(`${x}:${y}`);
  const diagonalBridgeData = collectRampartDiagonalBridges(contourTiles, halfSize);
  const segmentGroups = new Map();
  for (const tile of contourTiles.values()) {
    const tileKey = `${tile.x}:${tile.y}`;
    if (diagonalBridgeData.diagonalOnlyTiles.has(tileKey)) continue;
    const segmentGroup = getRampartSegmentGroup(segmentGroups, tile.lineOpts);
    if (!hasRampart(tile.x, tile.y - 1) && !diagonalBridgeData.skipEdges.has(`${tile.x}:${tile.y}:top`)) {
      addSegment(segmentGroup.horizontalSegments, tile.y - halfSize, tile.x - halfSize, tile.x + halfSize);
    }
    if (!hasRampart(tile.x, tile.y + 1) && !diagonalBridgeData.skipEdges.has(`${tile.x}:${tile.y}:bottom`)) {
      addSegment(segmentGroup.horizontalSegments, tile.y + halfSize, tile.x - halfSize, tile.x + halfSize);
    }
    if (!hasRampart(tile.x - 1, tile.y) && !diagonalBridgeData.skipEdges.has(`${tile.x}:${tile.y}:left`)) {
      addSegment(segmentGroup.verticalSegments, tile.x - halfSize, tile.y - halfSize, tile.y + halfSize);
    }
    if (!hasRampart(tile.x + 1, tile.y) && !diagonalBridgeData.skipEdges.has(`${tile.x}:${tile.y}:right`)) {
      addSegment(segmentGroup.verticalSegments, tile.x + halfSize, tile.y - halfSize, tile.y + halfSize);
    }
  }
  drawRampartDiagonalBridges(vis, diagonalBridgeData, roomName);
  for (const segmentGroup of segmentGroups.values()) {
    drawMergedSegments(vis, segmentGroup.horizontalSegments, 'horizontal', segmentGroup.lineOpts);
    drawMergedSegments(vis, segmentGroup.verticalSegments, 'vertical', segmentGroup.lineOpts);
  }
}

function drawRampartPlacements(vis, placements, opts = {}, roomName = 'unknown') {
  if (!Array.isArray(placements) || placements.length === 0) return;
  requireVisualMethod(vis, roomName, 'line');
  requireVisualMethod(vis, roomName, 'rect');

  const rampartTiles = new Map();
  const outlineTiles = new Map();
  const innerContourTiles = new Map();
  for (const placement of placements) {
    if (!placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) continue;
    const effectiveOpts = Object.assign(
      {},
      opts,
      placement.opts && typeof placement.opts === 'object' ? placement.opts : {},
    );
    const tile = {
      x: placement.x,
      y: placement.y,
      tag: placement.tag || null,
      lineOpts: toRampartLineOpts(effectiveOpts),
      fillOpts: toRampartFillOpts(effectiveOpts),
    };
    const tileKey = `${placement.x}:${placement.y}`;
    rampartTiles.set(tileKey, tile);
    const tag = String(placement.tag || '');
    const isInnerBand = tag === 'rampart.support' || tag === 'rampart.corridor';
    if (!isInnerBand) {
      outlineTiles.set(tileKey, tile);
    } else {
      innerContourTiles.set(tileKey, Object.assign({}, tile, {
        lineOpts: toInnerRampartLineOpts(tile.lineOpts),
      }));
    }
  }
  if (rampartTiles.size === 0) return;
  const contourTiles = outlineTiles.size > 0 ? outlineTiles : rampartTiles;
  for (const tile of rampartTiles.values()) {
    const isInnerBand = tile.tag === 'rampart.support' || tile.tag === 'rampart.corridor';
    const fillSize = isInnerBand ? RAMPART_INNER_FILL_SIZE : 1;
    const fillOffset = fillSize / 2;
    const fillOpts = isInnerBand
      ? Object.assign({}, tile.fillOpts, {
          opacity: Math.max(
            RAMPART_FILL_OPACITY_MIN,
            Math.min(RAMPART_FILL_OPACITY_MAX, Number(tile.fillOpts.opacity || 0) * RAMPART_INNER_FILL_OPACITY_FACTOR),
          ),
        })
      : tile.fillOpts;
    vis.rect(tile.x - fillOffset, tile.y - fillOffset, fillSize, fillSize, fillOpts);
  }
  drawRampartContourTiles(vis, contourTiles, roomName, 0.5);
  drawRampartContourTiles(vis, innerContourTiles, roomName, RAMPART_INNER_FILL_SIZE / 2);
}

function requireVisualMethod(vis, roomName, methodName) {
  if (vis && typeof vis[methodName] === 'function') return;
  throw new Error(
    `[manager.visualizer] RoomVisual.${methodName} is required to render structure visuals in ${roomName}`,
  );
}

function normalizePlacement(placement, fallbackType = null, anchor = null) {
  if (!placement || typeof placement !== 'object') return null;
  const type = placement.type || placement.structureType || fallbackType;
  const rawX = typeof placement.x === 'number' ? placement.x : null;
  const rawY = typeof placement.y === 'number' ? placement.y : null;
  if (!type || !Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;

  const anchorX = anchor && Number.isFinite(anchor.x) ? Number(anchor.x) : 0;
  const anchorY = anchor && Number.isFinite(anchor.y) ? Number(anchor.y) : 0;
  const roomName =
    placement.roomName ||
    (anchor && anchor.roomName) ||
    (anchor && anchor.pos && anchor.pos.roomName) ||
    null;
  if (!roomName) return null;

  return {
    x: rawX + anchorX,
    y: rawY + anchorY,
    roomName,
    type,
    tag: placement.tag || null,
    opts:
      placement.opts && typeof placement.opts === 'object'
        ? Object.assign({}, placement.opts)
        : {},
  };
}

function normalizePlacements(placements, fallbackType = null, anchor = null) {
  if (!Array.isArray(placements)) return [];
  return placements
    .map((placement) => normalizePlacement(placement, fallbackType, anchor))
    .filter(Boolean);
}

const Visualizer = {
  get enabled() {
    return Memory.settings && Memory.settings.enableVisuals;
  },

  circle(pos, color = 'red', opts = {}) {
    if (!this.enabled) return;
    _.defaults(opts, { fill: color, radius: 0.35, opacity: 0.5 });
    new RoomVisual(pos.roomName).circle(pos.x, pos.y, opts);
  },

  drawStructurePlacements(placements, opts = {}) {
    const normalized = normalizePlacements(placements);
    if (!normalized.length) return;

    const byRoom = _.groupBy(normalized, (placement) => placement.roomName);
    for (const roomName in byRoom) {
      const roomPlacements = byRoom[roomName];
      if (!roomPlacements || roomPlacements.length === 0) continue;

      const vis = new RoomVisual(roomName);
      requireVisualMethod(vis, roomName, 'structure');

      const roadPlacements = [];
      const rampartPlacements = [];
      const otherPlacements = [];
      for (const placement of roomPlacements) {
        if (placement.type === ROAD_TYPE) {
          roadPlacements.push(placement);
        } else if (placement.type === RAMPART_TYPE) {
          rampartPlacements.push(placement);
        } else {
          otherPlacements.push(placement);
        }
      }

      for (const placement of roadPlacements) {
        vis.structure(placement.x, placement.y, placement.type, Object.assign({}, opts, placement.opts));
      }
      if (roadPlacements.length > 0) {
        requireVisualMethod(vis, roomName, 'connectRoads');
        vis.connectRoads(opts);
      }

      if (rampartPlacements.length > 0) {
        drawRampartPlacements(vis, rampartPlacements, opts, roomName);
      }

      for (const placement of otherPlacements) {
        vis.structure(placement.x, placement.y, placement.type, Object.assign({}, opts, placement.opts));
      }
    }
  },

  drawLayout(layout, anchor, opts = {}) {
    if (!this.enabled) return;
    _.defaults(opts, { opacity: 0.5 });
    const placements = [];
    for (const type in layout) {
      const rows = normalizePlacements(layout[type], type, anchor);
      for (const row of rows) placements.push(row);
    }
    this.drawStructurePlacements(placements, opts);
  },

  drawRoads(positions) {
    if (!this.enabled) return;
    const placements = normalizePlacements(positions, ROAD_TYPE);
    this.drawStructurePlacements(placements);
  },

  showInfo(lines, origin, opts = {}) {
    if (!this.enabled) return;
    const pos = origin.pos || origin;
    const roomName = pos.roomName || (origin.room && origin.room.name);
    const vis = new RoomVisual(roomName);
    if (!Array.isArray(lines)) lines = [String(lines)];
    lines.forEach((line, i) => vis.text(line, pos.x, pos.y + i, opts));
  },

  barGraph(progress, pos, width = 7, scale = 1) {
    if (!this.enabled) return;
    const vis = new RoomVisual(pos.roomName);
    let percent;
    if (Array.isArray(progress)) {
      percent = progress[0] / progress[1];
    } else {
      percent = progress;
    }
    const height = 0.8 * scale;
    vis.rect(pos.x, pos.y - height, width, height, { stroke: '#ffffff', opacity: 0.3 });
    vis.rect(pos.x, pos.y - height, width * percent, height, { fill: '#ffffff', opacity: 0.6, strokeWidth: 0 });
    const text = Array.isArray(progress)
      ? `${progress[0]}/${progress[1]}`
      : `${Math.round(percent * 100)}%`;
    vis.text(text, pos.x + width / 2, pos.y - height / 2, {
      color: '#ffffff',
      align: 'center',
      font: `${0.8 * scale} Trebuchet MS`,
    });
  },
};

module.exports = Visualizer;
