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

  it('checkerboard helper classifies structure vs road parity', function () {
    const checkerboard = require('../algorithm.checkerboard');
    const parity = checkerboard.parityAt(10, 10);
    expect(checkerboard.classifyTile(10, 10, parity)).to.equal('structure');
    expect(checkerboard.classifyTile(10, 11, parity)).to.equal('road');
    expect(checkerboard.sameParity({ x: 10, y: 10 }, { x: 12, y: 12 })).to.equal(true);
  });

  it('min-cut proxy computes rampart candidates around structure envelope', function () {
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
    expect(result.meta).to.have.property('method', 'proxy-mincut');
    expect(result.line).to.be.an('array').that.is.not.empty;
    const hasTopLeft = result.line.some((p) => p.x === 17 && p.y === 17);
    expect(hasTopLeft).to.equal(true);
  });
});
