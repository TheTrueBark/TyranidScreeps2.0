const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');

global.FIND_STRUCTURES = 1;
global.FIND_MY_SPAWNS = 2;
global.FIND_DROPPED_RESOURCES = 3;

global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;

describe('hauler avoids idling in restricted area', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find(type) {
        if (type === FIND_MY_SPAWNS) return [spawn];
        return [];
      },
      controller: { pos: { findInRange: () => [] } },
      getTerrain() { return { get: () => 0 }; },
    };
    Memory.rooms = { W1N1: { restrictedArea: [{ x: 5, y: 5 }] } };
    spawn = { pos: { x: 6, y: 5 } };
  });

  let spawn;
  it('moves to idle position after depositing in restricted area', function() {
    const container = {
      id: 'c1',
      structureType: STRUCTURE_CONTAINER,
      store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 2000 },
      pos: { x:5, y:5, roomName:'W1N1' }
    };
    Game.getObjectById = id => container;
    Game.rooms['W1N1'].controller.pos.findInRange = () => [container];
    let moved = false;
    const creep = {
      name: 'h1',
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 0 },
      pos: {
        x:5,
        y:5,
        roomName:'W1N1',
        findClosestByPath: () => null,
        getRangeTo: () => 1,
        isEqualTo(pos) { return this.x === pos.x && this.y === pos.y; }
      },
      travelTo(target) { moved = true; },
      transfer() { return OK; },
      pickup: () => OK,
      memory: {},
    };
    roleHauler.run(creep);
    expect(moved).to.be.true;
  });
});
