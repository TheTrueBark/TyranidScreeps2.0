const { expect } = require('chai');
const globals = require('./mocks/globals');

const { describeReserveTarget } = require('../utils.energyReserve');

global.RESOURCE_ENERGY = 'energy';

describe('energy reserve classification', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.rooms['W1N1'] = { name: 'W1N1', find: () => [] };
    Memory.energyReserveEvents = { deaths: [], vitals: {}, tombstones: {} };
    Memory.rooms = Memory.rooms || {};
    Memory.rooms['W1N1'] = Memory.rooms['W1N1'] || {};
  });

  it('marks dropped energy from friendly combat deaths', function() {
    Memory.energyReserveEvents.deaths.push({
      tick: Game.time,
      pos: { x: 5, y: 5, roomName: 'W1N1' },
      type: 'friendly',
      cause: 'combat',
    });
    const target = {
      id: 'drop1',
      resourceType: RESOURCE_ENERGY,
      amount: 100,
      pos: { x: 5, y: 5, roomName: 'W1N1' },
    };
    const descriptor = describeReserveTarget(target, 'pickup', { room: Game.rooms['W1N1'] });
    expect(descriptor.type).to.equal('friendlyCombatDrop');
    expect(descriptor.haulersMayWithdraw).to.be.true;
    expect(descriptor.buildersMayWithdraw).to.be.true;
  });

  it('marks mining drops using room mining positions', function() {
    Memory.rooms['W1N1'].miningPositions = {
      source1: {
        positions: {
          a: { x: 3, y: 4, roomName: 'W1N1' },
        },
      },
    };
    const target = {
      id: 'drop2',
      resourceType: RESOURCE_ENERGY,
      amount: 60,
      pos: { x: 3, y: 4, roomName: 'W1N1' },
    };
    const descriptor = describeReserveTarget(target, 'pickup', { room: Game.rooms['W1N1'] });
    expect(descriptor.type).to.equal('miningDrop');
  });

  it('marks hostile death drops as dangerous', function() {
    Memory.energyReserveEvents.deaths.push({
      tick: Game.time,
      pos: { x: 7, y: 8, roomName: 'W1N1' },
      type: 'hostile',
      cause: 'combat',
    });
    const target = {
      id: 'drop3',
      resourceType: RESOURCE_ENERGY,
      amount: 40,
      pos: { x: 7, y: 8, roomName: 'W1N1' },
    };
    const descriptor = describeReserveTarget(target, 'pickup', { room: Game.rooms['W1N1'] });
    expect(descriptor.type).to.equal('hostileDeathDrop');
  });

  it('distinguishes friendly tombstones', function() {
    const tombstone = {
      id: 't1',
      structureType: 'tombstone',
      my: true,
      store: { [RESOURCE_ENERGY]: 50 },
    };
    const descriptor = describeReserveTarget(tombstone, 'withdraw', { room: Game.rooms['W1N1'] });
    expect(descriptor.type).to.equal('friendlyTombstone');
  });

  it('distinguishes hostile tombstones', function() {
    const tombstone = {
      id: 't2',
      structureType: 'tombstone',
      my: false,
      owner: { username: 'Enemy' },
      store: { [RESOURCE_ENERGY]: 120 },
    };
    const descriptor = describeReserveTarget(tombstone, 'withdraw', { room: Game.rooms['W1N1'] });
    expect(descriptor.type).to.equal('hostileTombstone');
  });
});
