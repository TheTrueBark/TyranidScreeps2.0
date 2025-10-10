const { expect } = require('chai');
const globals = require('./mocks/globals');
const roleScout = require('../role.scout');
const htm = require('../manager.htm');
const terrainMemory = require('../memory.terrain');

global.FIND_SOURCES = 1;
global.FIND_HOSTILE_CREEPS = 2;

describe('role.scout', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = { W1N2: {} };
    Memory.htm.colonies['W1N1'] = { tasks: [{ name: 'SCOUT_ROOM', id: 't1', data: { roomName: 'W1N2' }, priority: 5, ttl: 500, age:0, amount:1 }] };
    Game.rooms['W1N1'] = { name: 'W1N1', controller: { my: true }, find: () => [] };
    Game.rooms['W1N2'] = { name: 'W1N2', find: type => [], controller: null };
    Game.map.describeExits = () => ({ 1:'W1N3' });
    const terrain = { get: () => 0 };
    Game.map.getRoomTerrain = () => terrain;
    Game.map.getRoomLinearDistance = () => 1;
    Game.creeps.sc1 = { name: 'sc1', memory: { role: 'scout', homeRoom: 'W1N1' }, room: Game.rooms['W1N2'], travelTo: () => {} };
  });

  it('updates memory when scouting room', function() {
    roleScout.run(Game.creeps.sc1);
    expect(Memory.rooms['W1N2'].lastScouted).to.equal(Game.time);
    expect(Memory.rooms['W1N2'].scouted).to.be.true;
    expect(Memory.rooms['W1N2'].terrainInfo.version).to.equal(terrainMemory.TERRAIN_VERSION);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks[0].name).to.equal('REMOTE_SCORE_ROOM');
  });

  it('requeues task when ttl low', function() {
    Game.creeps.sc1.ticksToLive = 40;
    Game.creeps.sc1.memory.targetRoom = 'W1N2';
    Memory.htm.colonies['W1N1'].tasks = [];
    roleScout.run(Game.creeps.sc1);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks.length).to.equal(1);
    expect(tasks[0].name).to.equal('SCOUT_ROOM');
    expect(Game.creeps.sc1.memory.retiring).to.be.true;
  });

  it('applies cooldown after repeated failures', function() {
    Memory.htm.colonies['W1N1'].tasks = [];
    Game.creeps.sc1.ticksToLive = 40;
    Game.creeps.sc1.memory.targetRoom = 'W1N2';
    for (let i = 0; i < 3; i++) {
      Game.time = i * 300;
      roleScout.run(Game.creeps.sc1);
      Game.creeps.sc1.memory.targetRoom = 'W1N2';
    }
    expect(Memory.rooms['W1N2'].scoutCooldownUntil).to.be.a('number');
    expect(Memory.rooms['W1N2'].scoutCooldownUntil).to.be.above(Game.time);
    expect((Memory.htm.colonies['W1N1'].tasks || []).length).to.equal(1);
  });

  it('suppresses task claims when idle', function() {
    Game.creeps.sc1.room = Game.rooms['W1N1'];
    Game.creeps.sc1.travelTo = () => {};
    Memory.htm.colonies['W1N1'].tasks = [];
    Memory.hive = { clusters: { W1N1: { colonies: { W1N1: { meta: { basePos: { x:5, y:5 } } } } } } };
    roleScout.run(Game.creeps.sc1);
    expect(Game.creeps.sc1.memory.idle).to.be.true;
    Game.time += 3;
    Memory.htm.colonies['W1N1'].tasks.push({ name:'SCOUT_ROOM', id:'t2', data:{ roomName:'W1N2' }, priority:5, ttl:500, age:0, amount:1 });
    roleScout.run(Game.creeps.sc1);
    expect(Game.creeps.sc1.memory.targetRoom).to.be.undefined;
    Game.time = Game.creeps.sc1.memory.idleUntil;
    roleScout.run(Game.creeps.sc1);
    expect(Game.creeps.sc1.memory.targetRoom).to.equal('W1N2');
  });

  it('moves to base when idle', function() {
    let moved = false;
    Game.creeps.sc1.room = Game.rooms['W1N1'];
    Game.creeps.sc1.travelTo = () => { moved = true; };
    Memory.htm.colonies['W1N1'].tasks = [];
    Memory.hive = { clusters: { W1N1: { colonies: { W1N1: { meta: { basePos: { x:5, y:5 } } } } } } };
    roleScout.run(Game.creeps.sc1);
    expect(moved).to.be.true;
  });

  it('logs when debug enabled', function() {
    globals.resetMemory({ stats: { logs: [] }, settings: { debugHiveGaze: true } });
    htm.init();
    Memory.rooms = { W1N2: {} };
    Game.rooms['W1N2'] = { name: 'W1N2', find: type => [], controller: null };
    Memory.htm.colonies['W1N1'] = { tasks: [{ name: 'SCOUT_ROOM', id: 't1', data: { roomName: 'W1N2' }, priority:5, ttl:500, age:0, amount:1 }] };
    Game.creeps.sc1.room = Game.rooms['W1N2'];
    roleScout.run(Game.creeps.sc1);
    expect(Memory.stats.logs.length).to.be.above(0);
  });
});
