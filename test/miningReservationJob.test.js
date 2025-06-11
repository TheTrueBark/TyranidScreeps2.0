const { expect } = require('chai');
const globals = require('./mocks/globals');
const { Scheduler } = require('../scheduler');
const memoryManager = require('../manager.memory');

describe('scheduler verifyMiningReservations job', function() {
  let scheduler;
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();

    Game.rooms['W1N1'] = { name: 'W1N1' };
    Memory.rooms = {
      W1N1: {
        miningPositions: {
          s1: {
            positions: {
              best1: { x: 10, y: 20, roomName: 'W1N1', reserved: true },
            },
          },
        },
        reservedPositions: {},
      },
    };

    scheduler = new Scheduler();
    scheduler.addTask('verifyMiningReservations', 1, () => {
      for (const roomName in Memory.rooms) {
        memoryManager.verifyMiningReservations(roomName);
      }
      memoryManager.cleanUpReservedPositions();
    });
  });

  it('releases reserved flag for dead creeps', function() {
    scheduler.run();
    Game.time++;
    scheduler.run();
    expect(Memory.rooms.W1N1.miningPositions.s1.positions.best1.reserved).to.be.false;
  });
});
