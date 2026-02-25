const { expect } = require('chai');
const globals = require('./mocks/globals');
const tickPipeline = require('../manager.tickPipeline');

describe('tickPipeline snapshot modes', function () {
  beforeEach(function () {
    globals.resetGame({
      rooms: {
        W1N1: {
          name: 'W1N1',
          controller: { my: true, level: 2 },
          find() {
            return [];
          },
        },
      },
    });
    globals.resetMemory();
  });

  it('marks minimal snapshots explicitly', function () {
    const snap = tickPipeline.buildMinimalSnapshot();
    expect(snap.minimal).to.equal(true);
  });

  it('marks full snapshots explicitly', function () {
    const snap = tickPipeline.buildFullSnapshot();
    expect(snap.minimal).to.equal(false);
  });
});
