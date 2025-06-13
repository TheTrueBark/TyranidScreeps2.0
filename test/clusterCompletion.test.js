const { expect } = require('chai');
const globals = require('./mocks/globals');
const htm = require('../manager.htm');
const buildingManager = require('../manager.building');

global.STRUCTURE_EXTENSION = 'extension';

describe('BUILD_CLUSTER completion', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N1: { layout: { matrix: {}, reserved: {}, status: { clusters: {} } } } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      memory: Memory.rooms['W1N1'],
      find: () => [],
      lookForAt: () => [],
      controller: { level: 3, my: true },
    };
  });

  it('marks cluster complete when subtasks done', function() {
    htm.addColonyTask('W1N1', 'BUILD_CLUSTER', { clusterId: 'c1', total: 1 }, 4, 500, 1, 'layoutPlanner');
    htm.addColonyTask('W1N1', 'BUILD_LAYOUT_PART', { x: 10, y: 10, structureType: STRUCTURE_EXTENSION }, 5, 100, 1, 'layoutPlanner', {}, { parentTaskId: 'c1' });
    buildingManager.monitorClusterTasks(Game.rooms['W1N1']);
    let container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.find(t => t.name === 'BUILD_CLUSTER')).to.exist;
    container.tasks = container.tasks.filter(t => t.name !== 'BUILD_LAYOUT_PART');
    buildingManager.monitorClusterTasks(Game.rooms['W1N1']);
    container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    const cluster = container.tasks.find(t => t.name === 'BUILD_CLUSTER');
    expect(cluster).to.be.undefined;
    expect(Game.rooms['W1N1'].memory.layout.status.clusters.c1.complete).to.be.true;
  });
});
