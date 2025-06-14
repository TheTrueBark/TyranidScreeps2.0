const { expect } = require('chai');
const globals = require('./mocks/globals');

global._ = require('lodash');

global.CARRY = 'carry';
global.MOVE = 'move';
global.BODYPART_COST = { carry: 50, move: 50 };
global.TOP = 1;
global.TOP_RIGHT = 2;
global.RIGHT = 3;
global.BOTTOM_RIGHT = 4;
global.BOTTOM = 5;
global.BOTTOM_LEFT = 6;
global.LEFT = 7;
global.TOP_LEFT = 8;
global.TERRAIN_MASK_WALL = 1;
global.OBSTACLE_OBJECT_TYPES = [];

const spawnManager = require('../manager.spawn');
const spawnQueue = require('../manager.spawnQueue');

describe('spawnManager.spawnEmergencyCollector', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    spawnQueue.queue = [];
    Game.rooms['W1N1'] = { name: 'W1N1', energyAvailable: 100 };
  });

  it('queues minimal hauler creep', function () {
    const spawn = { id: 's1', room: Game.rooms['W1N1'] };
    spawnManager.spawnEmergencyCollector(spawn, Game.rooms['W1N1']);
    expect(spawnQueue.queue.length).to.equal(1);
    const req = spawnQueue.queue[0];
    expect(req.bodyParts).to.deep.equal([CARRY, MOVE]);
    expect(req.memory.role).to.equal('hauler');
    expect(req.memory.emergency).to.be.true;
  });
});
