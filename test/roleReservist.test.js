const { expect } = require('chai');
const globals = require('./mocks/globals');
const roleReservist = require('../role.reservist');
const htm = require('../manager.htm');

global.OK = 0;

describe('role.reservist', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    htm.init();
    Memory.htm.colonies['W1N1'] = { tasks: [] };
  });

  it('queues retry when controller reserved by others', function() {
    Game.rooms['W1N5'] = { name:'W1N5', controller:{ reservation:{ username:'enemy' }, my:false } };
    const creep = { name:'r1', memory:{ role:'reservist', targetRoom:'W1N5', homeRoom:'W1N1' }, room: Game.rooms['W1N5'], travelTo:()=>{}, suicide:()=>{ creep.died = true; } };
    roleReservist.run(creep);
    const tasks = Memory.htm.colonies['W1N1'].tasks;
    expect(tasks.length).to.equal(1);
    expect(tasks[0].manager).to.equal('autoRetry');
    expect(creep.died).to.be.true;
  });

  it('suicides when no controller present', function() {
    Game.rooms['W1N5'] = { name:'W1N5', controller:null };
    const creep = { name:'r2', memory:{ role:'reservist', targetRoom:'W1N5' }, room: Game.rooms['W1N5'], travelTo:()=>{}, suicide:()=>{ creep.died = true; } };
    roleReservist.run(creep);
    expect(creep.died).to.be.true;
  });
});
