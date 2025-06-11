const { expect } = require('chai');
const globals = require('./mocks/globals');

const layoutPlanner = require('../layoutPlanner');

global.FIND_MY_SPAWNS = 1;
global.STRUCTURE_EXTENSION = 'extension';
// suppress visuals
global.RoomVisual = function () { this.structure = () => {}; };

describe('layoutPlanner.planBaseLayout', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Memory.rooms = { W1N1: {} };
    const spawn = { pos: { x: 10, y: 10, roomName: 'W1N1' } };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { level: 1, my: true },
      find: type => (type === FIND_MY_SPAWNS ? [spawn] : []),
      memory: Memory.rooms['W1N1'],
    };
  });

  it('stores anchor and stamps', function() {
    const room = Game.rooms['W1N1'];
    layoutPlanner.planBaseLayout(room);
    expect(room.memory.baseLayout.anchor).to.deep.equal({ x: 10, y: 10 });
    expect(room.memory.baseLayout.stamps).to.be.an('object');
    const ext = room.memory.baseLayout.stamps[STRUCTURE_EXTENSION];
    expect(ext).to.have.lengthOf(5);
    expect(ext[0]).to.include({ rcl: 2, structureType: STRUCTURE_EXTENSION });
  });
});
