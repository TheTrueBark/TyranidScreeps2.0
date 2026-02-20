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
    expect(Memory.hive.scoutRescanRequested).to.be.false;
  });


  it('queues one scout task per stale exit target', function() {
    Game.map.describeExits = () => ({ 1: 'W1N2', 3: 'W1N3' });
    Memory.rooms['W1N2'] = { lastScouted: Game.time - 6000, homeColony: 'W1N1' };
    Memory.rooms['W1N3'] = { lastScouted: Game.time - 6000, homeColony: 'W1N1' };

    hiveGaze.evaluateExpansionVision();

    const tasks = Memory.htm.colonies['W1N1'].tasks.filter((t) => t.name === 'SCOUT_ROOM');
    expect(tasks.length).to.equal(2);
    const targets = tasks.map((t) => t.data.roomName).sort();
    expect(targets).to.deep.equal(['W1N2', 'W1N3']);
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
    Game.creeps = {
      miner1: { memory: { role: 'miner' }, room: { name: 'W1N1' } },
      hauler1: { memory: { role: 'hauler' }, room: { name: 'W1N1' } },
    };
  });

  it('queues a scout when none exist', function() {
    hiveGaze.manageScouts();
    const spawnQueue = require('../manager.spawnQueue');
    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].category).to.equal('scout');
  });

  it('requests new scout tasks when memory needs scouting but none queued', function() {
    const original = hiveGaze.evaluateExpansionVision;
    let called = 0;
    hiveGaze.evaluateExpansionVision = function() {
      called++;
      if (!Memory.htm.colonies) Memory.htm.colonies = {};
      Memory.htm.colonies['W1N1'] = {
        tasks: [{ name: 'SCOUT_ROOM', id: 't2', data: { roomName: 'W1N3' }, priority: 5, ttl: 500, age: 0, amount: 1 }],
      };
      if (!Memory.hive) Memory.hive = {};
      Memory.hive.expansionVisionLastCheck = Game.time;
    };

    try {
      Memory.htm.colonies = {};
      Memory.rooms = {
        W1N1: { scouted: true, lastScouted: Game.time, homeColony: 'W1N1' },
        W1N3: { homeColony: 'W1N1', scouted: false },
      };
      Memory.hive = { scoutRescanRequested: false };

      hiveGaze.manageScouts();

      expect(called).to.equal(1);
      expect(Memory.hive.scoutRescanRequested).to.be.true;
      expect(Memory.htm.colonies['W1N1'].tasks[0].name).to.equal('SCOUT_ROOM');
    } finally {
      hiveGaze.evaluateExpansionVision = original;
    }
  });
});

