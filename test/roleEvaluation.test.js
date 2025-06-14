const { expect } = require('chai');
const globals = require('./mocks/globals');

global._ = require('lodash');

global.WORK = 'work';
global.MOVE = 'move';
global.CARRY = 'carry';
global.HARVEST_POWER = 2;
global.ENERGY_REGEN_TIME = 300;

global.FIND_SOURCES = 1;
global.FIND_CONSTRUCTION_SITES = 2;
global.FIND_STRUCTURES = 3;

global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_ROAD = 'road';

global.OK = 0;

const htm = require('../manager.htm');
const roles = require('../hive.roles');
const spawnQueue = require('../manager.spawnQueue');

function createRoom() {
  return {
    name: 'W1N1',
    controller: { my: true, level: 1, pos: { findInRange: () => [] } },
    energyCapacityAvailable: 300,
    find: type => {
      if (type === FIND_SOURCES) {
        return [{ id: 's1', energyCapacity: 3000, pos: {} }];
      }
      if (type === FIND_CONSTRUCTION_SITES) return [];
      if (type === FIND_STRUCTURES) return [];
      return [];
    },
    memory: { buildingQueue: [] },
  };
}

describe('hive.roles evaluateRoom', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    spawnQueue.queue = [];
    const room = createRoom();
    Game.rooms['W1N1'] = room;
    Memory.rooms = { W1N1: { miningPositions: { s1: { positions: { a:{}, b:{}, c:{} } } } } };
    htm.init();
  });

  it('queues miners for unsaturated source', function() {
    roles.evaluateRoom(Game.rooms['W1N1']);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    const miner = tasks.find(x => x.name === 'spawnMiner');
    const couple = tasks.find(x => x.name === 'spawnStarterCouple');
    const t = miner || couple;
    expect(t).to.exist;
    expect(t.amount).to.equal(3);
  });

  it('stores spawn limits in room memory', function() {
    roles.evaluateRoom(Game.rooms['W1N1']);
    const limits = Memory.rooms['W1N1'].spawnLimits;
    expect(limits).to.include.keys('miners', 'builders', 'upgraders');
  });

  it('caps builders at RCL1', function() {
    const room = Game.rooms['W1N1'];
    room.find = type => {
      if (type === FIND_SOURCES) {
        return [{ id: 's1', energyCapacity: 3000, pos: {} }];
      }
      if (type === FIND_CONSTRUCTION_SITES) {
        return [
          { id: 'c1', structureType: STRUCTURE_EXTENSION },
          { id: 'c2', structureType: STRUCTURE_EXTENSION },
        ];
      }
      if (type === FIND_STRUCTURES) return [];
      return [];
    };
    room.memory.buildingQueue = [
      { id: 'c1', priority: 100 },
      { id: 'c2', priority: 80 },
    ];
    Game.creeps = {
      h1: { memory: { role: 'hauler' }, room: { name: 'W1N1' } },
      h2: { memory: { role: 'hauler' }, room: { name: 'W1N1' } },
    };
    roles.evaluateRoom(room);
    const limits = Memory.rooms['W1N1'].spawnLimits;
    expect(limits.builders).to.equal(4);
  });

  it('limits upgraders to four', function() {
    const room = Game.rooms['W1N1'];
    Memory.rooms['W1N1'].controllerUpgradeSpots = 8;
    roles.evaluateRoom(room);
    const limits = Memory.rooms['W1N1'].spawnLimits;
    expect(limits.upgraders).to.equal(4);
  });
});
