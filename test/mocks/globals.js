/**
 * Expose the Game and Memory mocks to the global scope so
 * modules behave like in the Screeps runtime during tests.
 */

const { Game, resetGame } = require('./game');
const { Memory, resetMemory } = require('./memory');

// Attach mocks
global.Game = Game;
global.Memory = Memory;

module.exports = { Game, Memory, resetGame, resetMemory };
