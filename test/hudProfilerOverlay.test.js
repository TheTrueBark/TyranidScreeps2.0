const { expect } = require('chai');
const globals = require('./mocks/globals');

describe('hud profiler overlay rows', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    Memory.settings = {
      profilerOverlayLimit: 5,
      profilerOverlayMode: 'global',
      profilerOverlayFilter: '',
    };
    delete require.cache[require.resolve('../manager.hud')];
  });

  it('shows inactive hint when profiler output reports inactive', function () {
    Game.profiler = {
      output: () => 'Profiler not active.',
    };
    const hudManager = require('../manager.hud');
    const rows = hudManager._buildHtmOverlayRows();
    expect(rows[0].text).to.equal('Profiler not active');
  });

  it('parses profiler rows and renders cpu summary from raw output', function () {
    Game.profiler = {
      output: () =>
        [
          'calls\t\ttime\t\tavg\t\tfunction',
          '10\t\t6.0\t\t0.600\t\truntime:manager.htm.run',
          '5\t\t2.5\t\t0.500\t\truntime:manager.hud.createHUD',
          'Avg: 0.85\tTotal: 8.5\tTicks: 1',
        ].join('\n'),
    };
    const hudManager = require('../manager.hud');
    const rows = hudManager._buildHtmOverlayRows();
    expect(rows[0].text).to.equal('Profiler Overlay - 8,50 CPU');
    expect(rows.some((row) => row.text.indexOf('runtime:manager.htm.run') !== -1)).to.equal(true);
    expect(rows.some((row) => row.text.indexOf('Calls 10  CPU 6,00') !== -1)).to.equal(true);
  });
});
