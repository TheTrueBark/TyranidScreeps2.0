const { expect } = require('chai');
const globals = require('./mocks/globals');
const _ = require('lodash');
const htm = require('../manager.htm');

require('../utils.quotes');

global.OK = 0;

const quotesPath = require.resolve('../utils.quotes');

function loadRoleReservist(quote = 'For the swarm!') {
  const originalQuotesEntry = require.cache[quotesPath];
  require.cache[quotesPath] = {
    id: quotesPath,
    filename: quotesPath,
    loaded: true,
    exports: { getRandomTyranidQuote: () => quote },
  };

  try {
    delete require.cache[require.resolve('../role.reservist')];
    return require('../role.reservist');
  } finally {
    if (originalQuotesEntry) {
      require.cache[quotesPath] = originalQuotesEntry;
    } else {
      delete require.cache[quotesPath];
    }
  }
}

describe('role.reservist', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Memory.htm.colonies['W1N1'] = { tasks: [] };
  });

  it('queues retry when controller reserved by others', function() {
    const roleReservist = loadRoleReservist();
    Game.rooms['W1N5'] = { name:'W1N5', controller:{ reservation:{ username:'enemy' }, my:false } };
    const creep = { name:'r1', memory:{ role:'reservist', targetRoom:'W1N5', homeRoom:'W1N1' }, room: Game.rooms['W1N5'], travelTo:()=>{}, suicide:()=>{ creep.died = true; } };
    roleReservist.run(creep);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks.length).to.equal(1);
    expect(tasks[0].manager).to.equal('autoRetry');
    expect(creep.died).to.be.true;
  });

  it('suicides when no controller present', function() {
    const roleReservist = loadRoleReservist();
    Game.rooms['W1N5'] = { name:'W1N5', controller:null };
    const creep = { name:'r2', memory:{ role:'reservist', targetRoom:'W1N5' }, room: Game.rooms['W1N5'], travelTo:()=>{}, suicide:()=>{ creep.died = true; } };
    roleReservist.run(creep);
    expect(creep.died).to.be.true;
  });

  it('signs controller when reservation succeeds with different signature', function() {
    const roleReservist = loadRoleReservist('For the swarm!');
    Memory.username = 'ally';
    Memory.rooms = { W1N5: { reserveAttempts: 2 } };
    Game.rooms['W1N5'] = { name:'W1N5', controller:{ sign:{ username:'other', text:'Old' } } };
    const controller = Game.rooms['W1N5'].controller;
    const creep = {
      name:'r3',
      memory:{ role:'reservist', targetRoom:'W1N5' },
      room: Game.rooms['W1N5'],
      travelTo:()=>{},
      reserveController: () => OK,
      signController: () => { creep.signed = true; },
      suicide: () => { creep.died = true; },
    };

    roleReservist.run(creep);

    expect(creep.signed).to.be.true;
    expect(_.get(Memory, ['rooms', 'W1N5', 'reserveAttempts'])).to.equal(0);
    const stats = Memory.stats.remoteRooms['W1N5'];
    expect(stats.reservistSuccesses).to.equal(1);
    expect(creep.died).to.be.true;
  });

  it('does not sign when controller already has matching signature', function() {
    const roleReservist = loadRoleReservist('For the swarm!');
    Memory.username = 'ally';
    Memory.rooms = { W1N5: { reserveAttempts: 1 } };
    Game.rooms['W1N5'] = { name:'W1N5', controller:{ sign:{ username:'ally', text:'For the swarm!' } } };
    const controller = Game.rooms['W1N5'].controller;
    const creep = {
      name:'r4',
      memory:{ role:'reservist', targetRoom:'W1N5' },
      room: Game.rooms['W1N5'],
      travelTo:()=>{},
      reserveController: () => OK,
      signController: () => { creep.signed = true; },
      suicide: () => { creep.died = true; },
    };

    roleReservist.run(creep);

    expect(creep.signed).to.not.be.true;
    expect(_.get(Memory, ['rooms', 'W1N5', 'reserveAttempts'])).to.equal(0);
    const stats = Memory.stats.remoteRooms['W1N5'];
    expect(stats.reservistSuccesses).to.equal(1);
    expect(creep.died).to.be.true;
  });
});
