const { expect } = require('chai');
const globals = require('./mocks/globals');
const hiveGaze = require('../manager.hiveGaze');
const htm = require('../manager.htm');

global.FIND_MY_SPAWNS = 1;

describe('hiveGaze.evaluateExpansionVision', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N1: {} };
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true },
      find: (type) => {
        if (type === FIND_MY_SPAWNS) return [{ id: 's1', pos: { x:25, y:25 } }];
        return [];
      },
    };
    Game.map.describeExits = () => ({ 1: 'W1N2' });
  });

  it('queues scout tasks for unexplored exits', function() {
    hiveGaze.evaluateExpansionVision();
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks.length).to.equal(1);
    expect(tasks[0].name).to.equal('SCOUT_ROOM');
    expect(Memory.hive.expansionVisionLastCheck).to.equal(Game.time);
  });

  it('skips rooms on scout cooldown', function() {
    Memory.rooms['W1N2'] = { scoutCooldownUntil: Game.time + 50 };
    hiveGaze.evaluateExpansionVision();
    const container = Memory.htm.colonies['W1N1'];
    expect(container).to.be.undefined;
  });
});

describe('hiveGaze.manageScouts', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Game.rooms['W1N1'] = {
      name: 'W1N1',
      controller: { my: true },
      find: type => (type === FIND_MY_SPAWNS ? [{ id: 's1', pos: { x:25,y:25 }, room: { name: 'W1N1' } }] : [])
    };
    Memory.htm.colonies = { W1N1: { tasks: [{ name: 'SCOUT_ROOM', id: 't1', data: { roomName: 'W1N2' }, priority: 5, ttl: 500, age:0, amount:1 }] } };
    const spawnQueue = require('../manager.spawnQueue');
    spawnQueue.queue = [];
  });

  it('queues a scout when none exist', function() {
    hiveGaze.manageScouts();
    const spawnQueue = require('../manager.spawnQueue');
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].category).to.equal('scout');
  });
});

