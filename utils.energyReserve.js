/**
 * Shared helpers for reserving energy on objects so multiple creeps don't
 * attempt to withdraw the same energy chunk simultaneously.
 */

function ensureMemory() {
  if (typeof Memory === 'undefined') return {};
  if (!Memory.energyReserves) Memory.energyReserves = {};
  return Memory.energyReserves;
}

function reserveEnergy(id, amount) {
  if (!id || typeof amount !== 'number' || amount <= 0) return 0;
  const reserves = ensureMemory();
  reserves[id] = (reserves[id] || 0) + amount;
  return reserves[id];
}

function releaseEnergy(id, amount = 0) {
  if (!id) return 0;
  const reserves = ensureMemory();
  if (!reserves[id]) return 0;
  if (!amount || amount <= 0) {
    delete reserves[id];
    return 0;
  }
  reserves[id] = Math.max(0, (reserves[id] || 0) - amount);
  if (reserves[id] === 0) delete reserves[id];
  return reserves[id];
}

function getReserved(id) {
  if (!id) return 0;
  const reserves = ensureMemory();
  return reserves[id] || 0;
}

module.exports = {
  reserveEnergy,
  releaseEnergy,
  getReserved,
};

