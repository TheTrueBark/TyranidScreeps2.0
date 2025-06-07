const { expect } = require('chai');
const globals = require('./mocks/globals');

const memoryManager = require('../manager.memory');

// Minimal creep mock used for releaseMiningPosition
function createCreep(name) {
  return { name, memory: {} };
}

describe('memoryManager.assignMiningPosition', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();

    Game.rooms['W1N1'] = { name: 'W1N1' };
    Memory.rooms = {
      W1N1: {
        miningPositions: {
          source1: {
            positions: {
              best1: { x: 10, y: 20, roomName: 'W1N1', reserved: false },
            },
          },
        },
      },
    };
  });

  it('stores roomName when assigning mining position', function() {
    const creepMemory = { source: 'source1' };
    const room = Game.rooms['W1N1'];
    const assigned = memoryManager.assignMiningPosition(creepMemory, room);
    expect(assigned).to.be.true;
    expect(creepMemory.miningPosition).to.deep.equal({
      x: 10,
      y: 20,
      roomName: 'W1N1',
      reserved: true,
    });
  });

  it('releases mining position correctly', function() {
    const creep = createCreep('miner1');
    creep.memory.source = 'source1';
    const room = Game.rooms['W1N1'];
    memoryManager.assignMiningPosition(creep.memory, room);
    expect(
      Memory.rooms.W1N1.miningPositions.source1.positions.best1.reserved
    ).to.be.true;

    memoryManager.releaseMiningPosition(creep);
    expect(
      Memory.rooms.W1N1.miningPositions.source1.positions.best1.reserved
    ).to.be.false;
    expect(creep.memory.miningPosition).to.be.undefined;
  });
});

