/** @codex-owner layoutPlanner */

function parityAt(x, y) {
  return (x + y) % 2;
}

function sameParity(a, b) {
  if (!a || !b) return false;
  return parityAt(a.x, a.y) === parityAt(b.x, b.y);
}

function classifyTile(x, y, preferredParity) {
  return parityAt(x, y) === preferredParity ? 'structure' : 'road';
}

function mod(value, base) {
  return ((value % base) + base) % base;
}

function isDiagonal2x2Pattern(pattern) {
  return pattern === 'cluster3' || pattern === 'harabi' || pattern === 'diag2';
}

function classifyTileByPattern(x, y, anchor, options = {}) {
  const pattern = String(options.pattern || 'parity').toLowerCase();
  const preferredParity =
    typeof options.preferredParity === 'number'
      ? options.preferredParity
      : parityAt(anchor && typeof anchor.x === 'number' ? anchor.x : 25, anchor && typeof anchor.y === 'number' ? anchor.y : 25);

  if (!isDiagonal2x2Pattern(pattern)) {
    return classifyTile(x, y, preferredParity);
  }

  const baseX = anchor && typeof anchor.x === 'number' ? anchor.x : 25;
  const baseY = anchor && typeof anchor.y === 'number' ? anchor.y : 25;
  const localX = mod(x - baseX, 4);
  const localY = mod(y - baseY, 4);

  const isRoad =
    (localX === 0 && localY === 2) ||
    (localX === 2 && localY === 0) ||
    ((localX === 1 || localX === 3) && (localY === 1 || localY === 3));

  return isRoad ? 'road' : 'structure';
}

module.exports = {
  parityAt,
  sameParity,
  classifyTile,
  classifyTileByPattern,
};
