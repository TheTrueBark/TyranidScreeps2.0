const { expect } = require('chai');
const globals = require('./mocks/globals');

const maintenance = require('../manager.maintenance');

describe('structure maintenance requests', function () {
  beforeEach(function () {
    globals.resetGame();
    globals.resetMemory({ stats: { logs: [] } });
    Game.time = 12345;
    Game.getObjectById = () => null;
  });

  it('records repair requests for damaged structures', function () {
    const room = {
      name: 'W1N1',
      controller: { my: true },
      find: () => [
        {
          id: 'cont1',
          structureType: STRUCTURE_CONTAINER,
          hits: 1000,
          hitsMax: 2000,
          pos: new RoomPosition(10, 10, 'W1N1'),
        },
      ],
    };

    maintenance.run(room);
    const roomMem = Memory.maintenance.rooms['W1N1'];
    expect(roomMem).to.exist;
    expect(roomMem.requests.cont1).to.exist;
    expect(roomMem.requests.cont1.missingHits).to.equal(1000);
  });

  it('assigns and clears repair targets', function () {
    const structure = {
      id: 'cont2',
      structureType: STRUCTURE_CONTAINER,
      hits: 800,
      hitsMax: 2000,
      pos: new RoomPosition(5, 5, 'W1N1'),
    };
    const room = {
      name: 'W1N1',
      controller: { my: true },
      find: () => [structure],
    };
    Game.creeps = { Builder1: { name: 'Builder1' } };
    Game.getObjectById = (id) => (id === structure.id ? structure : null);

    maintenance.run(room);

    const request = maintenance.assignRepairTarget('W1N1', 'Builder1');
    expect(request).to.exist;
    expect(request.id).to.equal('cont2');

    maintenance.completeRepair('W1N1', 'cont2', 'Builder1');
    const summary = maintenance.getRoomRepairSummary('W1N1');
    expect(summary).to.be.an('array').that.is.empty;
  });

  it('queues rebuild when tracked structure vanishes', function () {
    Game.time = 2468;
    Memory.rooms = {
      W1N1: {
        structures: [
          { id: 'contMissing', structureType: STRUCTURE_CONTAINER, pos: { x: 7, y: 7 } },
        ],
      },
    };
    Memory.maintenance = {
      rooms: {
        W1N1: {
          requests: {
            contMissing: {
              id: 'contMissing',
              structureType: STRUCTURE_CONTAINER,
              pos: { x: 7, y: 7, roomName: 'W1N1' },
              assignedTo: null,
              ratio: 0.2,
              threshold: 0.75,
            },
          },
          lastRun: 0,
        },
      },
    };

    const room = {
      name: 'W1N1',
      controller: { my: true },
      find: () => [],
    };

    maintenance.run(room);

    expect(Memory.rooms.W1N1.structures).to.be.an('array').that.is.empty;
    expect(Memory.rooms.W1N1.rebuildQueue).to.be.an('array').with.lengthOf(1);
    const queued = Memory.rooms.W1N1.rebuildQueue[0];
    expect(queued.structureType).to.equal(STRUCTURE_CONTAINER);
    expect(queued.pos).to.deep.equal({ x: 7, y: 7, roomName: 'W1N1' });
    expect(queued.queued).to.equal(Game.time);
  });
});
