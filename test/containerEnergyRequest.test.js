const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const energyRequests = require('../manager.energyRequests');

global.FIND_STRUCTURES = 3;
global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';

describe('controller container energy requests', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Memory.rooms = { W1N1: {} };
    const container = {
      id: 'c1',
      store: {
        [global.RESOURCE_ENERGY]: 1200,
        getCapacity: () => 2000,
        getFreeCapacity: () => 800,
      },
      pos: { x: 5, y: 5, roomName: 'W1N1', inRangeTo: () => true },
      structureType: STRUCTURE_CONTAINER,
    };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { pos: { x: 6, y: 5, roomName: 'W1N1', findInRange: () => [container] } },
      find: type => (type === FIND_STRUCTURES ? [container] : []),
    };
  });

  afterEach(function () {
    global.FIND_STRUCTURES = 3;
    global.STRUCTURE_CONTAINER = 'container';
    global.RESOURCE_ENERGY = 'energy';
    delete Memory.rooms;
  });

  it('creates deliverEnergy task when container missing >= hauler capacity', function () {
    const room = Game.rooms['W1N1'];
    energyRequests.run(room);
    const tasks = Memory.htm.creeps['c1'].tasks;
    expect(tasks[0].name).to.equal('deliverEnergy');
  });
});

