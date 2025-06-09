const { expect } = require('chai');
const globals = require('./mocks/globals');

const building = require('../manager.building');
let created;

global.FIND_SOURCES = 1;
global.FIND_STRUCTURES = 2;
global.FIND_CONSTRUCTION_SITES = 3;
global.FIND_MY_SPAWNS = 4;

global.STRUCTURE_CONTAINER = 'container';
global.LOOK_CONSTRUCTION_SITES = 'constructionSite';
global.LOOK_STRUCTURES = 'structure';
global.RoomPosition = function(x, y, roomName) {
  return { x, y, roomName, lookFor: () => [] };
};

describe('buildSourceContainers single site', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = { W1N1: {} };
    Memory.stats = { logs: [] };
    const container = { structureType: STRUCTURE_CONTAINER, pos: { x: 11, y: 10, inRangeTo: () => true } };
    const source = { id: 's1', pos: { x: 10, y: 10, findInRange: (type) => type === FIND_STRUCTURES ? [container] : [] } };
    const spawn = { pos: { getRangeTo: () => 5 } };
    created = false;
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      memory: { buildableAreas: { s1: [{ x: 11, y: 10 }] } },
      find: type => {
        if (type === FIND_SOURCES) return [source];
        if (type === FIND_STRUCTURES) return [container];
        if (type === FIND_CONSTRUCTION_SITES) return [];
        if (type === FIND_MY_SPAWNS) return [spawn];
        return [];
      },
      createConstructionSite: () => { created = true; return OK; },
    };
  });

  it('does not create site if container exists', function() {
    const room = Game.rooms['W1N1'];
    building.buildSourceContainers(room);
    expect(created).to.be.false;
  });
});
