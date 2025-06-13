const { expect } = require('chai');
const globals = require('./mocks/globals');
const htm = require('../manager.htm');
const buildingManager = require('../manager.building');

global.LOOK_STRUCTURES = 'structure';
global.LOOK_CONSTRUCTION_SITES = 'site';
global.FIND_STRUCTURES = 1;
global.FIND_CONSTRUCTION_SITES = 2;
global.OK = 0;
global.TERRAIN_MASK_WALL = 1;

const STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_EXTENSION = 'extension';

describe('BUILD_LAYOUT_PART execution', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = {
      W1N1: {
        layout: {
          matrix: {
            10: { 10: { structureType: STRUCTURE_EXTENSION, rcl: 2 } },
            12: { 10: { structureType: STRUCTURE_EXTENSION, rcl: 2 } }
          },
          reserved: {},
          status: { structures: { [STRUCTURE_EXTENSION]: { built: 0, total: 2 } } }
        }
      }
    };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      memory: Memory.rooms['W1N1'],
      controller: { level: 2, my: true },
      find: type => type === FIND_STRUCTURES ? [{ structureType: STRUCTURE_EXTENSION }] : [],
      lookForAt: (type,x,y) =>
        type === LOOK_STRUCTURES && x === 10 && y === 10 ? [{ structureType: STRUCTURE_EXTENSION }] : [],
      createConstructionSite: () => OK,
      getTerrain: () => ({ get: () => 0 })
    };
    global.CONTROLLER_STRUCTURES = { extension: { 2: 1 } };
  });

  it('removes task when structure already built and increments count', function() {
    htm.addColonyTask('W1N1', 'BUILD_LAYOUT_PART', { x: 10, y: 10, structureType: STRUCTURE_EXTENSION }, 5, 100, 1, 'layoutPlanner');
    buildingManager.processHTMTasks(Game.rooms['W1N1']);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.length).to.equal(0);
    expect(Memory.rooms['W1N1'].layout.status.structures.extension.built).to.equal(1);
  });

  it('skips placement when at structure limit', function() {
    Game.rooms['W1N1'].find = type => [];
    Game.rooms['W1N1'].lookForAt = () => [];
    htm.addColonyTask('W1N1', 'BUILD_LAYOUT_PART', { x: 11, y: 10, structureType: STRUCTURE_EXTENSION }, 5, 100, 1, 'layoutPlanner');
    buildingManager.processHTMTasks(Game.rooms['W1N1']);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.length).to.equal(1);
  });

  it('removes task on unwalkable terrain', function() {
    Game.rooms['W1N1'].find = () => [];
    Game.rooms['W1N1'].lookForAt = () => [];
    Game.rooms['W1N1'].getTerrain = () => ({ get: () => TERRAIN_MASK_WALL });
    global.TERRAIN_MASK_WALL = 1;
    htm.addColonyTask('W1N1', 'BUILD_LAYOUT_PART', { x: 12, y: 10, structureType: STRUCTURE_EXTENSION }, 5, 100, 1, 'layoutPlanner');
    buildingManager.processHTMTasks(Game.rooms['W1N1']);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.length).to.equal(0);
    expect(Memory.rooms['W1N1'].layout.matrix[12][10].invalid).to.be.true;
  });
});
