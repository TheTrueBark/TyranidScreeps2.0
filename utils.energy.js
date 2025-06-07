/**
 * Estimate the number of ticks required to collect specific amounts of energy.
 *
 * The calculation factors in a small decay component so results roughly match
 * in-game drop behaviour.
 *
 * @param {number} energyProducedPerTick - Energy created each tick by miners.
 * @returns {Object} Lookup tables for decay and container collection times.
 */
const calculateCollectionTicks = (energyProducedPerTick) => {
  const decayRate = 0.1; // Example decay rate
  return {
    decay: {
      50: Math.ceil(50 / (energyProducedPerTick * (1 - decayRate))),
      100: Math.ceil(100 / (energyProducedPerTick * (1 - decayRate))),
      150: Math.ceil(150 / (energyProducedPerTick * (1 - decayRate))),
      // Add more as needed
    },
    container: {
      50: Math.ceil(50 / energyProducedPerTick),
      100: Math.ceil(100 / energyProducedPerTick),
      150: Math.ceil(150 / energyProducedPerTick),
      // Add more as needed
    },
  };
};

module.exports = {
  calculateCollectionTicks,
};
