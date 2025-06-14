const { expect } = require('chai');
const globals = require('./mocks/globals');

const memoryManager = require('../manager.memory');

global.RESOURCE_ENERGY = 'energy';

describe('cleanUpEnergyReserves', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.energyReserves = { old: 20, empty: 5, good: 10 };
    Game.getObjectById = id => {
      if (id === 'good') return { store: { [RESOURCE_ENERGY]: 50 } };
      if (id === 'empty') return { store: { [RESOURCE_ENERGY]: 0 } };
      return null;
    };
  });

  it('removes missing or empty entries', function() {
    memoryManager.cleanUpEnergyReserves();
    expect(Memory.energyReserves).to.deep.equal({ good: 10 });
  });
});
