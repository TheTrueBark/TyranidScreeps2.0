const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleMiner = require('../role.miner');
const memoryManager = require('../manager.memory');

describe('reserved position cleanup on death', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = {
      W1N1: {
        reservedPositions: { '10:20': 'm1' },
        miningPositions: { source1: { positions: {} } },
      },
    };
  });

  it('cleans reserved positions when miner dies', function() {
    const creep = { name: 'm1', memory: { miningPosition: { x: 10, y: 20, roomName: 'W1N1' } } };
    roleMiner.onDeath(creep);
    expect(Memory.rooms.W1N1.reservedPositions).to.deep.equal({});
  });
});
