const { expect } = require('chai');
const globals = require('./mocks/globals');
const hiveGaze = require('../manager.hiveGaze');
const htm = require('../manager.htm');
const spawnQueue = require('../manager.spawnQueue');
const { getRandomTyranidQuote, tyranidQuotes } = require('../utils.quotes');

global.FIND_MY_SPAWNS = 1;
global.TERRAIN_MASK_WALL = 1;

describe('remote pipeline', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    htm.init();
    spawnQueue.queue = [];
    this.oldPF = global.PathFinder;
    global.PathFinder = { search: () => ({ path: [{x:5,y:5}], incomplete:false }) };
    Memory.rooms = {
      W1N2: { sources: { s1:{ pos:{x:10,y:10} } }, homeColony:'W1N1' }
    };
    Game.rooms['W1N2'] = { name:'W1N2', find: () => [], controller: {} };
    Game.rooms['W1N1'] = {
      name:'W1N1',
      controller:{ my:true },
      find:type=> type===FIND_MY_SPAWNS ? [{id:'s1', pos:{x:25,y:25}}] : []
    };
  });

  afterEach(function() {
    global.PathFinder = this.oldPF;
  });

  it('scores remote room and stores result', function() {
    hiveGaze.remoteScoreRoom({ roomName:'W1N2', colony:'W1N1' });
    expect(Memory.rooms.W1N2.remoteScore).to.be.above(0);
    expect(Memory.rooms.W1N2.sources.s1.score).to.be.a('number');
  });

  it('queues remote miner on init', function() {
    hiveGaze.initRemoteMiner({ room:'W1N2', sourceId:'s1' });
    expect(Memory.rooms.W1N2.sources.s1.assignedPosition).to.be.an('object');
    expect(spawnQueue.queue.length).to.equal(1);
  });

  it('requeues scoring when room not visible', function() {
    Memory.htm.colonies = { W1N1: { tasks: [] } };
    delete Game.rooms['W1N2'];
    hiveGaze.remoteScoreRoom({ roomName:'W1N2', colony:'W1N1' });
    const tasks = Memory.htm.colonies.W1N1.tasks;
    expect(tasks.length).to.equal(1);
    expect(tasks[0].name).to.equal('REMOTE_SCORE_ROOM');
    expect(tasks[0].ttl).to.equal(50);
    expect(Memory.rooms.W1N2.remoteScore).to.be.undefined;
  });

  it('skips miner init when no walkable tile', function() {
    const oldTerrain = Game.map.getRoomTerrain;
    Game.map.getRoomTerrain = () => ({ get: () => TERRAIN_MASK_WALL });
    hiveGaze.initRemoteMiner({ room:'W1N2', sourceId:'s1' });
    expect(spawnQueue.queue.length).to.equal(0);
    expect(Memory.rooms.W1N2.sources.s1.assignedPosition).to.be.undefined;
    Game.map.getRoomTerrain = oldTerrain;
  });


  it('queues reservist with claim body parts', function() {
    global.CLAIM = global.CLAIM || 'claim';
    global.MOVE = global.MOVE || 'move';

    hiveGaze.reserveRemoteRoom({ room: 'W1N2' });

    expect(spawnQueue.queue.length).to.equal(1);
    expect(spawnQueue.queue[0].category).to.equal('reservist');
    expect(spawnQueue.queue[0].bodyParts).to.deep.equal([CLAIM, MOVE]);
  });

  it('returns a tyranid quote', function() {
    const quote = getRandomTyranidQuote();
    expect(tyranidQuotes).to.include(quote);
  });
});
