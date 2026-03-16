const { expect } = require('chai');
const globals = require('./mocks/globals');

global.STRUCTURE_RAMPART = 'rampart';
global.STRUCTURE_WALL = 'constructedWall';
global.TERRAIN_MASK_WALL = 1;
global.TERRAIN_MASK_SWAMP = 2;
global.OBSTACLE_OBJECT_TYPES = [];

describe('planner.rampartMincut', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({ rooms: { W1N1: {} } });
    Game.rooms.W1N1 = {
      name: 'W1N1',
      memory: Memory.rooms.W1N1,
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
  });

  it('plans a standalone rampart shell, dragon teeth, and no-go zone for a single protected coordinate', function() {
    const planner = require('../planner.rampartMincut');
    const result = planner.planRoomTarget('W1N1', '25,25');

    expect(result.ok).to.equal(true);
    expect(result.target).to.deep.equal({ x: 25, y: 25 });
    expect(result.ramparts).to.be.an('array').that.is.not.empty;
    expect(result.ramparts.every((tile) => tile.type === STRUCTURE_RAMPART)).to.equal(true);
    expect(result.placements.some((tile) => tile.type === 'road')).to.equal(false);
    expect(result.dragonTeeth).to.be.an('array').that.is.not.empty;
    expect(result.dragonTeeth.every((tile) => tile.type === STRUCTURE_WALL)).to.equal(true);
    expect(result.noGoZone).to.be.an('array').that.is.not.empty;
    expect(Memory.rooms.W1N1.layout.rampartMincut).to.exist;
    expect(Memory.rooms.W1N1.layout.rampartMincut.target).to.deep.equal({ x: 25, y: 25 });
    expect(result.meta.boundaryCount).to.equal(result.ramparts.length);
    expect(result.meta.outerBandCount).to.be.at.least(1);
    expect(result.meta.exitApproachCount).to.be.at.least(1);
    expect(result.meta.dragonToothCount).to.equal(result.dragonTeeth.length);
    expect(result.meta.noGoCount).to.equal(result.noGoZone.length);
  });

  it('supports configurable shell thickness, no-go depth, and dragon teeth depth', function() {
    const planner = require('../planner.rampartMincut');
    const shallow = planner.planRoomTarget('W1N1', '25,25', {
      rampartThickness: 2,
      noGoDepth: 1,
      dragonTeethThickness: 1,
    });
    const deep = planner.planRoomTarget('W1N1', '25,25', {
      rampartThickness: 3,
      noGoDepth: 3,
      dragonTeethThickness: 2,
    });

    expect(shallow.ok).to.equal(true);
    expect(deep.ok).to.equal(true);
    expect(deep.meta.rampartThickness).to.equal(3);
    expect(deep.meta.noGoDepth).to.equal(3);
    expect(deep.meta.dragonTeethThickness).to.equal(2);
    expect(deep.outerBandRamparts).to.have.length(deep.meta.outerBandCount);
    expect(deep.primaryRamparts).to.have.length(deep.meta.primaryBoundaryCount);
    expect(deep.meta.outerBandCount).to.be.at.least(shallow.meta.outerBandCount);
    expect(deep.meta.noGoCount).to.be.at.least(shallow.meta.noGoCount);
    expect(deep.meta.dragonToothCount).to.be.at.least(shallow.meta.dragonToothCount);
  });

  it('seeds defense planning from multiple separated exits instead of a single opening only', function() {
    const planner = require('../planner.rampartMincut');
    Game.rooms.W1N1.getTerrain = () => ({
      get(x, y) {
        const onBorder = x === 0 || x === 49 || y === 0 || y === 49;
        if (!onBorder) return 0;
        const topOpening = y === 0 && x >= 24 && x <= 25;
        const rightOpening = x === 49 && y >= 24 && y <= 25;
        return topOpening || rightOpening ? 0 : TERRAIN_MASK_WALL;
      },
    });

    const result = planner.planRoomTarget('W1N1', '25,25');

    expect(result.ok).to.equal(true);
    expect(result.meta.exitApproachCount).to.be.at.least(2);
    expect(result.ramparts.every((tile) => tile.x > 0 && tile.x < 49 && tile.y > 0 && tile.y < 49)).to.equal(true);
  });

  it('rejects invalid coordinate input', function() {
    const planner = require('../planner.rampartMincut');
    const result = planner.planRoomTarget('W1N1', 'not-a-coordinate');

    expect(result.ok).to.equal(false);
    expect(result.error).to.equal('invalid-target');
  });

  it('builds a paste-friendly debug dump with exits, cut, and planned structures', function() {
    const planner = require('../planner.rampartMincut');
    planner.planRoomTarget('W1N1', '25,25');

    const result = planner.dumpRoomPlan('W1N1', { print: false, returnObject: true });

    expect(result.ok).to.equal(true);
    expect(result.payload).to.have.property('exits');
    expect(result.payload).to.have.property('mincut');
    expect(result.payload).to.have.property('planned');
    expect(result.lines.some((line) => line.includes('exitApproach'))).to.equal(true);
    expect(result.lines.some((line) => line.includes('canonicalBoundary'))).to.equal(true);
    expect(result.lines.some((line) => line.includes('dragonTeeth'))).to.equal(true);
  });
});
