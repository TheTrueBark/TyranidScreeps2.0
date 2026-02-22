const { expect } = require('chai');
const globals = require('./mocks/globals');

const movementUtils = require('../utils.movement');

describe('movement restricted transit rules', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    global.FIND_MY_SPAWNS = 1;
    Memory.rooms = {
      W1N1: {
        restrictedArea: [
          { x: 5, y: 5 }, // soft: transit allowed for haulers
          { x: 6, y: 6, mode: 'blocked' }, // hard: always blocked
        ],
      },
    };
  });

  it('allows haulers to transit soft restricted tiles but blocks hard tiles', function() {
    const creep = { memory: { role: 'hauler' } };
    const destination = new RoomPosition(20, 20, 'W1N1');

    const options = movementUtils.applyTravelDefaults(creep, destination, {});
    const matrix = options.roomCallback('W1N1');

    expect(matrix.get(5, 5)).to.equal(25);
    expect(matrix.get(6, 6)).to.equal(0xff);
  });

  it('keeps soft restricted tiles blocked for non-hauler creeps', function() {
    const creep = { memory: { role: 'builder' } };
    const destination = new RoomPosition(20, 20, 'W1N1');

    const options = movementUtils.applyTravelDefaults(creep, destination, {});
    const matrix = options.roomCallback('W1N1');

    expect(matrix.get(5, 5)).to.equal(0xff);
    expect(matrix.get(6, 6)).to.equal(0xff);
  });

  it('does not push haulers off soft restricted tiles while transiting', function() {
    Game.rooms.W1N1 = {
      name: 'W1N1',
      find(type) {
        if (type === FIND_MY_SPAWNS) return [spawn];
        return [];
      },
    };
    const spawn = {
      pos: { x: 10, y: 10, findInRange: () => [] },
    };
    let moved = false;
    const creep = {
      memory: { role: 'hauler' },
      room: Game.rooms.W1N1,
      pos: {
        x: 5,
        y: 5,
        roomName: 'W1N1',
        findClosestByRange: () => spawn,
      },
      travelTo() { moved = true; },
    };

    movementUtils.avoidSpawnArea(creep);
    expect(moved).to.equal(false);
  });
});
