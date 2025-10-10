const { expect } = require('chai');
const globals = require('./mocks/globals');

const memoryManager = require('../manager.memory');

global.RESOURCE_ENERGY = 'energy';

describe('cleanUpEnergyReserves', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.energyReserves = {
      old: { reserved: 20, available: 0 },
      empty: { reserved: 5, available: 0 },
      good: { reserved: 10, available: 0, haulersMayDeposit: true },
    };
    Game.getObjectById = id => {
      if (id === 'good') return { store: { [RESOURCE_ENERGY]: 50 } };
      if (id === 'empty') return { store: { [RESOURCE_ENERGY]: 0 } };
      return null;
    };
  });

  it('flags empty entries before removing them', function() {
    memoryManager.cleanUpEnergyReserves();
    expect(Memory.energyReserves.old).to.include({ flaggedForRemoval: true });
    expect(Memory.energyReserves.empty).to.include({ flaggedForRemoval: true });
    expect(Memory.energyReserves.good).to.deep.include({
      reserved: 10,
      haulersMayDeposit: true,
    });

    memoryManager.cleanUpEnergyReserves();
    expect(Memory.energyReserves).to.deep.equal({
      good: { reserved: 10, available: 0, haulersMayDeposit: true },
    });
  });
});
