const { expect } = require('chai');
const globals = require('./mocks/globals');

const htm = require('../manager.htm');
const energyRequests = require('../manager.energyRequests');

global.FIND_MY_SPAWNS = 1;
global.FIND_MY_STRUCTURES = 2;
global.STRUCTURE_EXTENSION = 'extension';

describe('spawn energy requests', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      find: type => {
        if (type === FIND_MY_SPAWNS) return [
          {
            id: 's1',
            store: { getFreeCapacity: () => 150 },
            pos: { x: 5, y: 5, roomName: 'W1N1' },
            structureType: 'spawn',
          },
        ];
        return [];
      },
    };
  });

  it('creates deliverEnergy task for spawn', function () {
    const room = Game.rooms['W1N1'];
    energyRequests.run(room);
    const tasks = Memory.htm.creeps['s1'].tasks;
    expect(tasks[0].name).to.equal('deliverEnergy');
    expect(tasks[0].data.amount).to.equal(150);
    expect(tasks[0].priority).to.equal(0);
  });
});
