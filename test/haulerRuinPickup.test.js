const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleHauler = require('../role.hauler');

// Minimal constants
global.RESOURCE_ENERGY = 'energy';
global.FIND_DROPPED_RESOURCES = 1;
global.FIND_RUINS = 2;
global.FIND_TOMBSTONES = 3;
global.FIND_STRUCTURES = 4;
global.STRUCTURE_CONTAINER = 'container';
global.OK = 0;

function createHauler(name) {
  return {
    name,
    store: { [RESOURCE_ENERGY]: 0, getFreeCapacity: () => 50 },
    room: { name: 'W1N1', storage: null },
    pos: {
      x: 10,
      y: 10,
      roomName: 'W1N1',
      getRangeTo(pos) {
        return Math.abs(this.x - pos.x) + Math.abs(this.y - pos.y);
      },
      findClosestByPath(type, opts) {
        if (type === FIND_RUINS) return this._ruin;
        if (type === FIND_STRUCTURES) return this._container;
        return null;
      }
    },
    travelTo: () => {},
    pickup: () => OK,
    withdraw(target) { this.target = target; return OK; },
    memory: {},
  };
}

describe('hauler prefers nearby ruin', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [] };
  });

  it('withdraws from ruin when closer than container', function() {
    const creep = createHauler('h1');
    const ruin = { store: { [RESOURCE_ENERGY]: 100 }, pos: { x: 11, y: 10, roomName: 'W1N1' } };
    const container = { structureType: STRUCTURE_CONTAINER, store: { [RESOURCE_ENERGY]: 100 }, pos: { x: 20, y: 20, roomName: 'W1N1' } };
    creep.pos._ruin = ruin;
    creep.pos._container = container;
    roleHauler.run(creep);
    expect(creep.target).to.equal(ruin);
  });
});
