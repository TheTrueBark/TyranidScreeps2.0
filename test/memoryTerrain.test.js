const { expect } = require('chai');
const globals = require('./mocks/globals');
const terrainMemory = require('../memory.terrain');

const WALL_MASK = typeof TERRAIN_MASK_WALL === 'number' ? TERRAIN_MASK_WALL : 1;
const SWAMP_MASK = typeof TERRAIN_MASK_SWAMP === 'number' ? TERRAIN_MASK_SWAMP : 2;

describe('memory.terrain', function() {
  beforeEach(function() {
    globals.resetGame();
    globals.resetMemory();
    Game.map.getRoomTerrain = () => ({
      get(x, y) {
        if (x === 0 && y === 0) return WALL_MASK;
        if (x === 1 && y === 0) return SWAMP_MASK;
        return 0;
      },
    });
  });

  it('stores compressed terrain payloads', function() {
    const record = terrainMemory.captureRoomTerrain('W1N1', { force: true });
    expect(record).to.have.property('version', terrainMemory.TERRAIN_VERSION);
    expect(record).to.have.property('compressed').that.is.a('string');
    expect(Memory.rooms.W1N1.terrainInfo.compressed).to.equal(record.compressed);

    const decoded = terrainMemory.decodeTerrain(record);
    expect(decoded).to.include({ room: 'W1N1', width: 50, height: 50 });
    expect(decoded.tiles.length).to.equal(2500);
    expect(decoded.tiles[0]).to.equal('2');
    expect(decoded.tiles[1]).to.equal('1');
    expect(decoded.wallMask[0]).to.equal('1');
    expect(decoded.wallMask[1]).to.equal('0');
  });

  it('skips recapture unless forced', function() {
    Game.time = 10;
    const first = terrainMemory.captureRoomTerrain('W1N1', { force: true });
    Game.time = 20;
    const second = terrainMemory.captureRoomTerrain('W1N1');
    expect(second.generated).to.equal(first.generated);
    const forced = terrainMemory.captureRoomTerrain('W1N1', { force: true });
    expect(forced.generated).to.equal(Game.time);
  });
});
