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

module.exports = {
  parityAt,
  sameParity,
  classifyTile,
};
