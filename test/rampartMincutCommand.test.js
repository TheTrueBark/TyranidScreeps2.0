const { expect } = require('chai');
const globals = require('./mocks/globals');

global.STRUCTURE_RAMPART = 'rampart';
global.STRUCTURE_WALL = 'constructedWall';
global.TERRAIN_MASK_WALL = 1;
global.TERRAIN_MASK_SWAMP = 2;
global.OBSTACLE_OBJECT_TYPES = [];

describe('debug.rampartMincutCommand', function() {
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

  it('boots rampart mincut mode and plans the requested coordinate in one command', function() {
    const command = require('../debug.rampartMincutCommand');
    const result = command.run('W1N1', '25,25');

    expect(result.ok).to.equal(true);
    expect(result.bootMode).to.equal('startFresh+rampartMincut');
    expect(result.target).to.deep.equal({ x: 25, y: 25 });
    expect(Memory.settings.runtimeMode).to.equal('theoretical');
    expect(Memory.settings.enableBaseBuilderPlanning).to.equal(false);
    expect(Memory.rooms.W1N1.layout.rampartMincut).to.exist;
  });

  it('can skip the fresh boot step when requested', function() {
    const command = require('../debug.rampartMincutCommand');
    Memory.settings = { runtimeMode: 'live' };

    const result = command.run('W1N1', '25,25', { fresh: false });

    expect(result.ok).to.equal(true);
    expect(result.bootMode).to.equal('rampartMincut-only');
    expect(Memory.settings.runtimeMode).to.equal('live');
  });
});
