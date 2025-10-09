const { expect } = require('chai');
const globals = require('./mocks/globals');

globals.resetGame();
globals.resetMemory({ stats: { logs: [] } });

global.LOOK_STRUCTURES = 'structure';
global.LOOK_CONSTRUCTION_SITES = 'constructionSite';
global.OK = 0;
global.ERR_FULL = -8;
global.ERR_RCL_NOT_ENOUGH = -14;

delete require.cache[require.resolve('../manager.building')];
const buildingManager = require('../manager.building');

describe('structure rebuild queue processing', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    Game.time = 100;
  });

  it('creates construction site for queued rebuild entry', function () {
    const created = [];
    const room = {
      name: 'W1N1',
      memory: {
        rebuildQueue: [
          {
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 10, y: 11, roomName: 'W1N1' },
          },
        ],
      },
      lookForAt: () => [],
      createConstructionSite: (x, y, type) => {
        created.push({ x, y, type });
        return OK;
      },
    };
    Memory.rooms = { W1N1: room.memory };

    buildingManager.processRebuildQueue(room);

    expect(created).to.deep.equal([
      { x: 10, y: 11, type: STRUCTURE_CONTAINER },
    ]);
    expect(room.memory.rebuildQueue).to.be.an('array').that.is.empty;
  });

  it('defers rebuild when construction queue is full', function () {
    const room = {
      name: 'W1N1',
      memory: {
        rebuildQueue: [
          {
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 15, y: 20, roomName: 'W1N1' },
          },
        ],
      },
      lookForAt: () => [],
      createConstructionSite: () => ERR_FULL,
    };
    Memory.rooms = { W1N1: room.memory };

    buildingManager.processRebuildQueue(room);

    expect(room.memory.rebuildQueue).to.have.lengthOf(1);
    const entry = room.memory.rebuildQueue[0];
    expect(entry.retryAt).to.be.greaterThan(Game.time);
    expect(entry.lastError).to.equal(ERR_FULL);
  });
});
