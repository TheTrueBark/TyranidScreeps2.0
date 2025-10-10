/**
 * Terrain serialization and caching helpers.
 *
 * Stores per-room terrain matrices in a compressed format compatible with the
 * savestate system so large payloads remain memory friendly.
 * @codex-owner memoryManager
 */
const LZString = require('./vendor.lz-string');

const TERRAIN_VERSION = 1;
const WALL_MASK = typeof TERRAIN_MASK_WALL === 'number' ? TERRAIN_MASK_WALL : 1;
const SWAMP_MASK = typeof TERRAIN_MASK_SWAMP === 'number' ? TERRAIN_MASK_SWAMP : 2;

const normalizeTerrain = (value) => {
  if (typeof value === 'string') {
    if (value === 'wall') return 2;
    if (value === 'swamp') return 1;
    return 0;
  }
  const numeric = Number(value) || 0;
  if ((numeric & WALL_MASK) === WALL_MASK) return 2;
  if ((numeric & SWAMP_MASK) === SWAMP_MASK) return 1;
  return 0;
};

const buildTerrainPayload = (roomName) => {
  if (!Game || !Game.map || typeof Game.map.getRoomTerrain !== 'function') return null;
  const terrain = Game.map.getRoomTerrain(roomName);
  if (!terrain || typeof terrain.get !== 'function') return null;

  let tiles = '';
  let walls = '';
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const tileType = normalizeTerrain(terrain.get(x, y));
      tiles += tileType;
      walls += tileType === 2 ? '1' : '0';
    }
  }

  return {
    room: roomName,
    width: 50,
    height: 50,
    encoding: 'plain=0,swamp=1,wall=2',
    tiles,
    wallMask: walls,
  };
};

const captureRoomTerrain = (roomName, options = {}) => {
  const force = options.force === true;
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  const mem = Memory.rooms[roomName];
  if (!force && mem.terrainInfo && mem.terrainInfo.version === TERRAIN_VERSION) {
    return mem.terrainInfo;
  }

  const payload = buildTerrainPayload(roomName);
  if (!payload) return null;
  const compressed = LZString.compressToBase64(JSON.stringify(payload));
  const record = {
    version: TERRAIN_VERSION,
    compressed,
    generated: Game && typeof Game.time === 'number' ? Game.time : null,
    format: 'lz-base64-json',
  };
  mem.terrainInfo = record;
  return record;
};

const decodeTerrain = (record) => {
  if (!record || !record.compressed) return null;
  try {
    const json = LZString.decompressFromBase64(record.compressed);
    if (!json) return null;
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
};

module.exports = {
  TERRAIN_VERSION,
  captureRoomTerrain,
  decodeTerrain,
  _normalizeTerrain: normalizeTerrain,
};
