const { expect } = require('chai');
const globals = require('./mocks/globals');

global.TOP = 1;
global.TOP_RIGHT = 2;
global.RIGHT = 3;
global.BOTTOM_RIGHT = 4;
global.BOTTOM = 5;
global.BOTTOM_LEFT = 6;
global.LEFT = 7;
global.TOP_LEFT = 8;
global.WORK = 'work';
global.CARRY = 'carry';
global.MOVE = 'move';
global.BODYPART_COST = { work: 100, carry: 50, move: 50 };
global.FIND_MY_CONSTRUCTION_SITES = 1;
global.STRUCTURE_EXTENSION = 'extension';
global.EXTENSION_ENERGY_CAPACITY = { 1: 50 };
global.FIND_MY_SPAWNS = 2;

const htm = require('../manager.htm');
const spawnManager = require('../manager.spawn');

global._ = require('lodash');

describe('spawnStarterCouple subtasks', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.stats = { logs: [], logCounts: {} };
    htm.init();
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => (type === FIND_MY_SPAWNS ? [{ id: 's1', spawning: false, room: { name: 'W1N1' } }] : []),
      energyCapacityAvailable: 300,
    };
    htm.addColonyTask('W1N1', spawnManager.TASK_STARTER_COUPLE, {}, 0, 50, 1, 'spawnManager');
  });

  it('creates miner then hauler subtasks and removes parent', function() {
    spawnManager.processHTMTasks(Game.rooms['W1N1']);
    let container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.some(t => t.name === 'spawnMiner')).to.be.true;

    // simulate miner completed
    container.tasks = container.tasks.filter(t => t.name !== 'spawnMiner');
    spawnManager.processHTMTasks(Game.rooms['W1N1']);
    container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.find(t => t.name === spawnManager.TASK_STARTER_COUPLE)).to.exist;

    // simulate hauler completed
    container.tasks = container.tasks.filter(t => t.name !== 'spawnHauler');
    spawnManager.processHTMTasks(Game.rooms['W1N1']);
    container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.find(t => t.name === spawnManager.TASK_STARTER_COUPLE)).to.be.undefined;
  });
});
