const { expect } = require('chai');
const globals = require('./mocks/globals');

global.TERRAIN_MASK_WALL = 1;
global.TERRAIN_MASK_SWAMP = 2;

describe('baseplanner foundation module', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
  });

  it('builds terrain, walkability and exit distance matrices', function () {
    const foundation = require('../planner.baseplannerFoundation');
    const terrainMap = new Map();
    terrainMap.set('10:10', TERRAIN_MASK_WALL);
    terrainMap.set('11:11', TERRAIN_MASK_SWAMP);

    const room = {
      name: 'W1N1',
      getTerrain() {
        return {
          get(x, y) {
            return terrainMap.get(`${x}:${y}`) || 0;
          },
        };
      },
    };

    const matrices = foundation.buildTerrainMatrices(room);
    expect(matrices.walkableMatrix[foundation.idx(10, 10)]).to.equal(0);
    expect(matrices.terrainMatrix[foundation.idx(11, 11)]).to.equal(1);
    expect(matrices.exitDistance[foundation.idx(0, 0)]).to.equal(0);
    expect(matrices.exitDistance[foundation.idx(25, 25)]).to.be.greaterThan(0);
    expect(matrices.exitProximity[foundation.idx(1, 1)]).to.equal(1);
  });

  it('uses distance transform fallback when memory DT is missing', function () {
    const foundation = require('../planner.baseplannerFoundation');
    const room = {
      name: 'W1N1',
      getTerrain() {
        return {
          get(x, y) {
            return x === 15 && y === 15 ? TERRAIN_MASK_WALL : 0;
          },
        };
      },
    };

    Game.rooms.W1N1 = room;
    Memory.rooms = {};
    Memory.rooms.W1N1 = {};
    room.memory = { distanceTransform: [] };

    const dt = foundation.ensureDistanceTransform(room);
    expect(dt).to.have.length(2500);
    expect(dt[foundation.idx(15, 15)]).to.equal(0);
    expect(dt[foundation.idx(20, 20)]).to.equal(2);
  });
});
