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
              best2: { x: 11, y: 20, roomName: 'W1N1', reserved: false },
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

  it('assigns unique positions for multiple creeps', function() {
    const room = Game.rooms['W1N1'];
    const creep1 = { memory: { source: 'source1' } };
    const creep2 = { memory: { source: 'source1' } };
    memoryManager.assignMiningPosition(creep1.memory, room);
    memoryManager.assignMiningPosition(creep2.memory, room);

    expect(creep1.memory.miningPosition).to.not.deep.equal(creep2.memory.miningPosition);
    const pos1 = creep1.memory.miningPosition;
    const pos2 = creep2.memory.miningPosition;
    expect(Memory.rooms.W1N1.miningPositions.source1.positions.best1.reserved || Memory.rooms.W1N1.miningPositions.source1.positions.best2.reserved).to.be.true;
    expect(pos1).to.have.property('roomName', 'W1N1');
    expect(pos2).to.have.property('roomName', 'W1N1');
  });

  it('frees a mining position without touching creep memory', function() {
    const room = Game.rooms['W1N1'];
    const creep = createCreep('m1');
    creep.memory.source = 'source1';
    memoryManager.assignMiningPosition(creep.memory, room);

    const pos = { ...creep.memory.miningPosition };
    memoryManager.freeMiningPosition(pos);
    expect(
      Memory.rooms.W1N1.miningPositions.source1.positions.best1.reserved ||
        Memory.rooms.W1N1.miningPositions.source1.positions.best2.reserved,
    ).to.be.false;
    expect(creep.memory.miningPosition).to.deep.equal(pos);
  });
});

