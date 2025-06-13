const { expect } = require('chai');
const globals = require('./mocks/globals');

const towerManager = require('../manager.towers');

global.FIND_MY_STRUCTURES = 1;
global.FIND_HOSTILE_CREEPS = 2;
global.FIND_MY_CREEPS = 3;
global.FIND_STRUCTURES = 4;

global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_ROAD = 'road';
global.STRUCTURE_CONTAINER = 'container';
global.STRUCTURE_RAMPART = 'rampart';

global.OK = 0;

describe('towerManager', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({ settings: { enableTowerRepairs: true } });
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true },
      find(type) {
        if (type === FIND_MY_STRUCTURES) return [tower];
        if (type === FIND_HOSTILE_CREEPS) return [hostile];
        if (type === FIND_MY_CREEPS) return [];
        if (type === FIND_STRUCTURES) return [];
        return [];
      },
    };
  });

  let tower;
  let hostile;

  it('attacks hostile creeps first', function() {
    hostile = { id: 'h1' };
    let attacked = false;
    tower = {
      room: Game.rooms['W1N1'],
      pos: { findClosestByRange: () => hostile, x: 25, y:25 },
      attack: () => { attacked = true; return OK; },
      heal: () => OK,
      repair: () => OK,
    };
    towerManager.run();
    expect(attacked).to.be.true;
  });
});
