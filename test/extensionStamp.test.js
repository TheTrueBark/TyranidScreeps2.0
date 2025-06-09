const { expect } = require('chai');
const globals = require('./mocks/globals');

const building = require('../manager.building');

global.FIND_MY_SPAWNS = 1;
global.FIND_MY_STRUCTURES = 2;
global.FIND_CONSTRUCTION_SITES = 3;
global.LOOK_STRUCTURES = 'structure';
global.LOOK_CONSTRUCTION_SITES = 'site';
global.STRUCTURE_EXTENSION = 'extension';
global.OK = 0;
global.TERRAIN_MASK_WALL = 1;
global.CONTROLLER_STRUCTURES = { extension: { 2: 5 } };

describe('extension stamp placement', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.stats = { logs: [] };
    const terrain = { get: () => 0 };
    const spawn = { pos: { x:4, y:4, roomName:'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level:2 },
      find: type => {
        if (type === FIND_MY_SPAWNS) return [spawn];
        if (type === FIND_MY_STRUCTURES) return [];
        if (type === FIND_CONSTRUCTION_SITES) return [];
        return [];
      },
      lookForAt: () => [],
      getTerrain: () => terrain,
      createConstructionSite: (x,y,type) => { created.push({x,y,type}); return OK; },
      memory: {},
    };
    created = [];
  });

  let created;

  it('creates plus-shaped extension stamp', function() {
    const room = Game.rooms['W1N1'];
    building.buildExtensions(room);
    expect(created).to.have.lengthOf(5);
    const coords = created.map(p => `${p.x},${p.y}`);
    expect(coords).to.have.members(['2,1','1,2','2,2','3,2','2,3']);
    expect(room.memory.extensionCenters).to.include('2,2');
  });
});
