const { expect } = require('chai');
const globals = require('./mocks/globals');

global.FIND_MY_SPAWNS = global.FIND_MY_SPAWNS || 4;
global.FIND_SOURCES = global.FIND_SOURCES || 1;
global.FIND_STRUCTURES = global.FIND_STRUCTURES || 2;
global.FIND_CONSTRUCTION_SITES = global.FIND_CONSTRUCTION_SITES || 3;

const htm = require('../manager.htm');
const intentPipeline = require('../manager.intentPipeline');

describe('intent producer cadence', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.settings = {
      overlayMode: 'normal',
      enableBaseBuilderPlanning: true,
    };
    Memory.rooms = { W1N1: { layout: {} } };
    Game.rooms.W1N1 = {
      name: 'W1N1',
      controller: { my: true, level: 3 },
      find(type) {
        if (type === FIND_MY_SPAWNS) return [{ id: 'spawn1' }];
        return [];
      },
    };
  });

  it('skips producer work before nextEligibleTick', function () {
    intentPipeline.produceRoomIntents(Game.rooms.W1N1, { force: true });
    const roomMem = Memory.rooms.W1N1;
    roomMem.intentState.fingerprints.nextEligibleTick = Game.time + 20;
    const lastEvaluated = roomMem.intentState.fingerprints.lastEvaluatedTick;
    Game.time += 1;

    intentPipeline.produceRoomIntents(Game.rooms.W1N1, { previewOnly: true });

    expect(roomMem.intentState.fingerprints.lastEvaluatedTick).to.equal(lastEvaluated);
  });

  it('allows event-driven producer work even before nextEligibleTick', function () {
    intentPipeline.produceRoomIntents(Game.rooms.W1N1, { force: true });
    const roomMem = Memory.rooms.W1N1;
    roomMem.intentState.fingerprints.nextEligibleTick = Game.time + 20;
    Game.time += 1;

    intentPipeline.produceRoomIntents(Game.rooms.W1N1, {
      previewOnly: true,
      eventDriven: true,
    });

    expect(roomMem.intentState.fingerprints.lastEvaluatedTick).to.equal(Game.time);
  });
});
