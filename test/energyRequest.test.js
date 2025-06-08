const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleUpgrader = require('../role.upgrader');

global.FIND_MY_SPAWNS = 1;
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.STRUCTURE_CONTAINER = 'container';

function createCreep(name) {
  return {
    name,
    room: Game.rooms['W1N1'],
    store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
    pos: { x: 10, y: 10, roomName: 'W1N1', getRangeTo: () => 5 },
    travelTo: () => {},
    upgradeController: () => OK,
    memory: {},
  };
}

describe('energy request tasks', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [], controller: {} };
    Game.getObjectById = () => null;
    Memory.rooms = { W1N1: {} };
    htm.init();
  });

  afterEach(function() {
    global.STRUCTURE_CONTAINER = 'container';
  });

  it('queues deliverEnergy when upgrader is empty', function() {
    const creep = createCreep('u1');
    roleUpgrader.run(creep);
    const tasks = Memory.htm.creeps['u1'].tasks;
    expect(tasks[0].name).to.equal('deliverEnergy');
  });

  it('withdraws energy from container before requesting delivery', function() {
    const container = {
      id: 'c1',
      store: { [RESOURCE_ENERGY]: 200, getCapacity: () => 2000 },
      pos: { x: 5, y: 5, roomName: 'W1N1' },
      structureType: STRUCTURE_CONTAINER,
    };
    Game.rooms['W1N1'].controller = {
      pos: { findInRange: () => [container] },
    };
    Game.getObjectById = id => container;
    const creep = createCreep('u2');
    creep.withdraw = () => OK;
    creep.pos.getRangeTo = () => 1;
    roleUpgrader.run(creep);
    expect(Memory.htm.creeps['u2']).to.be.undefined;
  });
});
