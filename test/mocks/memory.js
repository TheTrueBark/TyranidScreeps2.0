/**
 * Mock for the persistent Memory object used by Screeps.
 * The object persists across tests unless resetMemory is invoked.
 */

const Memory = {};

/**
 * Reset Memory to a known state.
 * All existing keys are removed so references stay intact.
 */
function resetMemory(initial = {}) {
  for (const key of Object.keys(Memory)) delete Memory[key];
  Object.assign(Memory, initial);
}

// Initialize with an empty object
resetMemory();

module.exports = { Memory, resetMemory };
