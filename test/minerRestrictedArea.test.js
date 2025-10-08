const { expect } = require('chai');
const globals = require('./mocks/globals');

const movementUtils = require('../utils.movement');

global.FIND_MY_SPAWNS = 1;

describe('miner restricted area handling', function() {
  let spawnObj;

  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    spawnObj = {
      id: 's1',
      pos: {
        getRangeTo: () => 1,
        findInRange: () => [],
      },
    };

    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: () => [spawnObj],
    };
    Memory.rooms = {
      W1N1: {
        restrictedArea: [{ x: 10, y: 10 }],
      },
    };
  });

  it('allows miner to stay on dedicated mining tile inside restricted area', function() {
    let moved = false;
    const creep = {
      memory: {
        role: 'miner',
        miningPosition: { x: 10, y: 10, roomName: 'W1N1' },
      },
      room: Game.rooms['W1N1'],
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        findClosestByRange: () => spawnObj,
        isNearTo: () => false,
      },
      travelTo: () => { moved = true; },
    };

    movementUtils.avoidSpawnArea(creep);
    expect(moved).to.equal(false);
  });

  it('moves miner away when standing on restricted tile without assignment', function() {
    let moved = false;
    const creep = {
      memory: { role: 'miner' },
      room: Game.rooms['W1N1'],
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        findClosestByRange: () => spawnObj,
        isNearTo: () => false,
      },
      travelTo: () => { moved = true; },
    };

    movementUtils.avoidSpawnArea(creep);
    expect(moved).to.equal(true);
  });
});
