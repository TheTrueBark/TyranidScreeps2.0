const { expect } = require('chai');
const globals = require('./mocks/globals');

const roleBuilder = require('../role.builder');
const htm = require('../manager.htm');

global.FIND_CONSTRUCTION_SITES = 1;
global.FIND_MY_SPAWNS = 2;
global.STRUCTURE_EXTENSION = 'extension';
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_STORAGE = 'storage';
global.RESOURCE_ENERGY = 'energy';
global.OK = 0;
global.ERR_NOT_IN_RANGE = -9;

describe('builder prioritization', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.constructionReservations = {};
    const extSite = {
      id: 'ext1',
      structureType: STRUCTURE_EXTENSION,
      progress: 0,
      progressTotal: 100,
      pos: { x: 1, y: 1, roomName: 'W1N1', lookFor: () => [] },
    };
    const contSite = {
      id: 'c1',
      structureType: STRUCTURE_CONTAINER,
      progress: 0,
      progressTotal: 100,
      pos: { x: 2, y: 1, roomName: 'W1N1', lookFor: () => [] },
    };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => (type === FIND_CONSTRUCTION_SITES ? [extSite, contSite] : []),
      memory: {
        buildingQueue: [
          { id: 'ext1', priority: 100 },
          { id: 'c1', priority: 60 },
        ],
      },
      controller: {},
    };
    Game.getObjectById = id => (id === 'ext1' ? extSite : contSite);
    Memory.rooms = {
      W1N1: {
        buildingQueue: [
          { id: 'ext1', priority: 100 },
          { id: 'c1', priority: 60 },
        ],
      },
    };
  });

  it('builds extensions before containers', function () {
    const creep = {
      name: 'b1',
      memory: { working: true },
      room: Game.rooms['W1N1'],
      store: { [RESOURCE_ENERGY]: 50, getFreeCapacity: () => 0 },
      pos: {
        x: 10,
        y: 10,
        roomName: 'W1N1',
        getRangeTo: () => 5,
        findClosestByRange: () => null,
        findInRange: () => [],
        isEqualTo: function (p) { return p.x === this.x && p.y === this.y; },
      },
      travelTo: () => {},
      build: target => {
        creep.built = target.id;
        return OK;
      },
      upgradeController: () => OK,
    };
    roleBuilder.run(creep);
    expect(creep.built).to.equal('ext1');
  });
});
