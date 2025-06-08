const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleMiner = require('../role.miner');

global.FIND_SOURCES = 1;
global.FIND_STRUCTURES = 2;
global.FIND_MY_SPAWNS = 3;
global.STRUCTURE_CONTAINER = 'container';
global.RESOURCE_ENERGY = 'energy';
global.WORK = 'work';
global.OK = 0;
global.ERR_NOT_ENOUGH_RESOURCES = -6;
global.ERR_NOT_IN_RANGE = -9;

function createMiner() {
  return {
    name: 'm1',
    body: Array(5).fill({ type: WORK }),
    getActiveBodyparts(type) { return this.body.length; },
    memory: { sourceId: 'src1', miningPosition: { x: 5, y: 6, roomName: 'W1N1' } },
    room: { name: 'W1N1', getTerrain: () => ({ get: () => 0 }) },
    store: { [RESOURCE_ENERGY]: 0 },
    pos: {
      x: 5,
      y: 6,
      roomName: 'W1N1',
      isEqualTo(pos) { return this.x === pos.x && this.y === pos.y; },
      findInRange() { return []; },
      findClosestByRange() { return { pos: { x: 1, y: 1 } }; },
      getRangeTo() { return 1; },
      isNearTo() { return false; },
    },
    harvest: () => OK,
    transfer: () => OK,
    travelTo() {},
  };
}

describe('miner relocates onto container', function() {
  let container;
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    container = { structureType: STRUCTURE_CONTAINER, pos: { x: 6, y: 5, roomName: 'W1N1' }, store: { getFreeCapacity: () => 1000 } };
    const source = { id: 'src1', pos: { x: 5, y: 5, findInRange: (t,r) => t === FIND_STRUCTURES ? [container] : [] } };
    global.Game.getObjectById = () => source;
    Game.rooms['W1N1'] = { find: () => [], controller: {} };
  });

  it('updates miningPosition to container when equipped to empty mine', function() {
    const creep = createMiner();
    roleMiner.run(creep);
    expect(creep.memory.miningPosition.x).to.equal(6);
    expect(creep.memory.miningPosition.y).to.equal(5);
  });
});
