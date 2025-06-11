const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const roleAllPurpose = require('../role.allPurpose');

// Constants
global.FIND_SOURCES = 1;
global.FIND_MY_SPAWNS = 2;
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;

// Simple RoomPosition mock
global.RoomPosition = function(x, y, roomName) {
  this.x = x;
  this.y = y;
  this.roomName = roomName;
  this.isEqualTo = () => false;
  this.isNearTo = () => false;
  this.findClosestByRange = () => ({ id: 's1', pos: this });
};

function createCreep() {
  return {
    name: 'ap1',
    room: Game.rooms['W1N1'],
    store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
    pos: {
      x: 10,
      y: 10,
      roomName: 'W1N1',
      findClosestByRange: () => ({ id: 's1', pos: { x: 5, y: 5, roomName: 'W1N1' } }),
      isNearTo: () => false,
      findClosestByPath: () => null,
      isEqualTo: () => false,
    },
    travelTo: () => {},
    harvest: () => OK,
    transfer: () => OK,
    memory: { working: false, desiredPosition: {} },
  };
}

describe('allPurpose fallback', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: {},
      find: type => {
        if (type === FIND_SOURCES) return [{ id: 's1', pos: { x: 5, y: 5, roomName: 'W1N1' } }];
        if (type === FIND_MY_SPAWNS) return [{ pos: { x: 1, y: 1, roomName: 'W1N1', getRangeTo: () => 1 } }];
        return [];
      },
    };
    Memory.rooms = { W1N1: {} }; // missing miningPositions
    htm.init();
  });

  it('queues acquireMiningData when mining info missing', function() {
    const creep = createCreep();
    roleAllPurpose.run(creep);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks[0].name).to.equal('acquireMiningData');
    expect(creep.memory.fallbackReason).to.equal('missingMiningData');
  });

  it('clears fallback when data exists', function() {
    Memory.rooms['W1N1'] = { miningPositions: { s1: { positions: { a: { x:1, y:1, roomName:'W1N1', reserved:false } } } } };
    const creep = createCreep();
    creep.memory.fallbackReason = 'missingMiningData';
    roleAllPurpose.run(creep);
    expect(creep.memory.fallbackReason).to.be.undefined;
  });
});
