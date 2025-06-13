const { expect } = require('chai');
const globals = require('./mocks/globals');
const layoutPlanner = require('../layoutPlanner');
const htm = require('../manager.htm');

global.FIND_MY_SPAWNS = 1;

global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_LINK = 'link';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_CONTAINER = 'container';
global.LOOK_STRUCTURES = 'structure';

describe('layoutPlanner.populateDynamicLayout', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N1: { layout: { matrix: {}, reserved: {} } } };
    const spawn = { pos: { x: 10, y: 10, roomName: 'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 3, my: true, pos: { x: 20, y: 20 } },
      find: type => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: Memory.rooms['W1N1'],
      lookForAt: () => [],
      getTerrain: () => ({ get: () => 0 }),
    };
    Game.rooms['W1N1'].memory.distanceTransform = new Array(2500).fill(5);
  });

  it('adds cluster tasks and matrix entries', function() {
    layoutPlanner.populateDynamicLayout('W1N1');
    const matrix = Memory.rooms['W1N1'].layout.matrix;
    expect(Object.keys(matrix).length).to.be.above(0);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const cluster = container.tasks.find(t => t.name === 'BUILD_CLUSTER');
    const part = container.tasks.find(t => t.name === 'BUILD_LAYOUT_PART');
    expect(cluster).to.exist;
    expect(part).to.exist;
    expect(part.parentTaskId).to.equal('extCluster1');
    const firstCell = matrix[Object.keys(matrix)[0]][Object.keys(matrix[Object.keys(matrix)[0]])[0]];
    expect(firstCell).to.have.property('planned', true);
    expect(firstCell).to.have.property('plannedBy', 'layoutPlanner');
    expect(firstCell).to.have.property('blockedUntil');
  });

  it('skips tasks for existing structures', function() {
    Game.rooms['W1N1'].lookForAt = (type, x, y) =>
      type === LOOK_STRUCTURES && x === 11 && y === 10
        ? [{ structureType: STRUCTURE_EXTENSION }]
        : [];
    layoutPlanner.populateDynamicLayout('W1N1');
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const part = container.tasks.find(
      t => t.name === 'BUILD_LAYOUT_PART' && t.data.x === 11 && t.data.y === 10
    );
    expect(part).to.be.undefined;
  });
});
