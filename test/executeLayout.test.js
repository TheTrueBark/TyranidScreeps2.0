const { expect } = require('chai');
const globals = require('./mocks/globals');

const buildingManager = require('../manager.building');
const htm = require('../manager.htm');

global.STRUCTURE_EXTENSION = 'extension';
global.LOOK_STRUCTURES = 'structure';
global.LOOK_CONSTRUCTION_SITES = 'site';
global.OK = 0;
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_TOWER = 'tower';
global.STRUCTURE_STORAGE = 'storage';
global.STRUCTURE_TERMINAL = 'terminal';
global.STRUCTURE_ROAD = 'road';

const dummyRoom = () => ({
  name: 'W1N1',
  controller: { level: 2, my: true },
  lookForAt: () => [],
  find: () => [],
  createConstructionSite: () => OK,
  memory: Memory.rooms['W1N1'],
});

describe('buildingManager.executeLayout', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    Memory.rooms = {
      W1N1: {
        layout: {
          baseAnchor: { x: 25, y: 25 },
          matrix: {
            10: { 10: { structureType: STRUCTURE_EXTENSION, rcl: 2, planned: true } },
          },
          reserved: { 10: { 10: true } },
          planVersion: 1,
        },
      },
    };
    Game.rooms['W1N1'] = dummyRoom();
  });

  it('does not queue tasks from legacy layout matrix when basePlan is missing', function() {
    const room = Game.rooms['W1N1'];
    buildingManager.executeLayout(room);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container).to.be.undefined;
  });

  it('ignores legacy layout matrix regardless of room RCL', function() {
    Game.rooms['W1N1'].controller.level = 1;
    buildingManager.executeLayout(Game.rooms['W1N1']);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container).to.be.undefined;
  });

  it('does not duplicate queued tasks for basePlan entries', function() {
    const room = Game.rooms['W1N1'];
    Memory.rooms.W1N1.basePlan = {
      buildQueue: [
        {
          type: STRUCTURE_EXTENSION,
          pos: { x: 10, y: 10 },
          rcl: 2,
          priority: 1,
          built: false,
        },
      ],
    };
    buildingManager.executeLayout(room);
    buildingManager.executeLayout(room);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container.tasks.length).to.equal(1);
  });

  it('ignores built structures from basePlan entries', function() {
    Memory.rooms.W1N1.basePlan = {
      buildQueue: [
        {
          type: STRUCTURE_EXTENSION,
          pos: { x: 10, y: 10 },
          rcl: 2,
          priority: 1,
          built: false,
        },
      ],
    };
    Game.rooms['W1N1'].lookForAt = (type) =>
      type === LOOK_STRUCTURES ? [{ structureType: STRUCTURE_EXTENSION }] : [];
    buildingManager.executeLayout(Game.rooms['W1N1']);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container).to.be.undefined;
  });

  it('consumes basePlan buildQueue before legacy layout matrix', function() {
    Memory.rooms.W1N1.basePlan = {
      buildQueue: [
        {
          type: STRUCTURE_SPAWN,
          pos: { x: 12, y: 12 },
          rcl: 1,
          priority: 1,
          built: false,
        },
      ],
    };
    buildingManager.executeLayout(Game.rooms.W1N1);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container).to.exist;
    expect(container.tasks).to.have.lengthOf(1);
    expect(container.tasks[0].data).to.include({
      x: 12,
      y: 12,
      structureType: STRUCTURE_SPAWN,
      queueSource: 'basePlan',
    });
  });

  it('marks basePlan queue entry built when structure already exists', function() {
    Memory.rooms.W1N1.basePlan = {
      buildQueue: [
        {
          type: STRUCTURE_SPAWN,
          pos: { x: 12, y: 12 },
          rcl: 1,
          priority: 1,
          built: false,
        },
      ],
    };
    Game.rooms.W1N1.lookForAt = (type, x, y) =>
      type === LOOK_STRUCTURES && x === 12 && y === 12 ? [{ structureType: STRUCTURE_SPAWN }] : [];

    buildingManager.executeLayout(Game.rooms.W1N1);

    expect(Memory.rooms.W1N1.basePlan.buildQueue[0].built).to.equal(true);
    const container = htm._getContainer(htm.LEVELS.COLONY, 'W1N1');
    expect(container).to.be.undefined;
  });
});
