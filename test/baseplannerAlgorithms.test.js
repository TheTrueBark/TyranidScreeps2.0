const { expect } = require('chai');

describe('baseplanner phase 2 algorithm primitives', function () {
  it('flood fill returns reachable depth-limited tiles', function () {
    const { floodFill } = require('../algorithm.floodFill');
    const walkable = new Array(2500).fill(1);
    walkable[25 * 50 + 26] = 0;

    const out = floodFill(walkable, { x: 25, y: 25 }, { maxDepth: 2 });
    expect(out).to.be.an('array').that.is.not.empty;
    expect(out.some((p) => p.x === 25 && p.y === 25 && p.d === 0)).to.equal(true);
    expect(out.some((p) => p.x === 26 && p.y === 25)).to.equal(false);
    expect(out.every((p) => p.d <= 2)).to.equal(true);
  });

  it('flood fill supports weighted terrain costs and 4-way expansion', function () {
    const { floodFill } = require('../algorithm.floodFill');
    const walkable = new Array(2500).fill(1);
    const terrain = new Array(2500).fill(0);
    terrain[25 * 50 + 26] = 1; // swamp on east tile

    const weighted = floodFill(walkable, { x: 25, y: 25 }, {
      weighted: true,
      diagonal: false,
      terrainMatrix: terrain,
      maxDepth: 2,
      maxCost: 4,
    });

    const east = weighted.find((p) => p.x === 26 && p.y === 25);
    expect(east).to.not.exist; // excluded by maxCost due to swamp weight
    const north = weighted.find((p) => p.x === 25 && p.y === 24);
    expect(north).to.exist;
    expect(north.cost).to.equal(1);
  });

  it('checkerboard helper classifies structure vs road parity', function () {
    const checkerboard = require('../algorithm.checkerboard');
    const parity = checkerboard.parityAt(10, 10);
    expect(checkerboard.classifyTile(10, 10, parity)).to.equal('structure');
    expect(checkerboard.classifyTile(10, 11, parity)).to.equal('road');
    expect(checkerboard.sameParity({ x: 10, y: 10 }, { x: 12, y: 12 })).to.equal(true);
  });

  it('min-cut flow computes rampart candidates around structure envelope', function () {
    const { computeRampartCut } = require('../algorithm.minCut');
    const ctx = {
      structuresByPos: new Map([
        ['20:20', 'spawn'],
        ['22:22', 'storage'],
      ]),
      matrices: {
        walkableMatrix: new Array(2500).fill(1),
        terrainMatrix: new Array(2500).fill(0),
        exitDistance: new Array(2500).fill(8),
      },
    };

    const result = computeRampartCut(ctx, { margin: 3 });
    expect(result).to.exist;
    expect(result.meta).to.have.property('method', 'flow-mincut');
    expect(result.line).to.be.an('array').that.is.not.empty;
    expect(result.line.some((p) => p.x === 20 && p.y === 20)).to.equal(false);
    expect(result.meta).to.have.property('flow');
    expect(result.meta).to.have.property('continuity');
    expect(result.meta.continuity).to.have.property('connected');
    expect(result.meta.continuity.connected).to.equal(true);
  });
});
