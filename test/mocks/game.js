/**
 * Mock implementation of the Screeps Game object.
 * Properties can be freely tweaked by tests.
 */

const Game = {};

// Reset the Game state while preserving object identity
function resetGame(overrides = {}) {
  // Clear existing keys
  for (const key of Object.keys(Game)) delete Game[key];

  Object.assign(Game, {
    time: 0,
    rooms: {},
    creeps: {},
    spawns: {},
    cpu: {
      limit: 20,
      bucket: 10000,
      getUsed: () => 0,
    },
    gcl: {
      level: 1,
      progress: 0,
      progressTotal: 1,
    },
    map: {
      getRoomTerrain: () => ({ get: () => 'plain' }),
    },
  }, overrides);
}

// Initialize defaults on first load
resetGame();

module.exports = { Game, resetGame };
