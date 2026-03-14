// distanceTransform.js

function idx(x, y) {
  return y * 50 + x;
}

function inBounds(x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function neighbors8(x, y) {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function computeDistanceTransformFromTerrain(terrain) {
  const terrainData = new Array(2500).fill(0);
  const dist = new Array(2500).fill(Infinity);
  const queue = [];

  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const index = idx(x, y);
      if (
        terrain.get(x, y) === TERRAIN_MASK_WALL ||
        x === 0 ||
        x === 49 ||
        y === 0 ||
        y === 49
      ) {
        terrainData[index] = 1;
        dist[index] = 0;
        queue.push({ x, y });
      }
    }
  }

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const base = dist[idx(current.x, current.y)];
    for (const next of neighbors8(current.x, current.y)) {
      const nextIndex = idx(next.x, next.y);
      if (terrainData[nextIndex] === 1) continue;
      if (dist[nextIndex] <= base + 1) continue;
      dist[nextIndex] = base + 1;
      queue.push(next);
    }
  }

  return dist;
}

module.exports = {
  getTerrainData: function (roomName) {
    const terrain = new Room.Terrain(roomName);
    const data = new Array(2500).fill(0);

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (
          terrain.get(x, y) === TERRAIN_MASK_WALL ||
          x === 0 ||
          x === 49 ||
          y === 0 ||
          y === 49
        ) {
          data[idx(x, y)] = 1;
        }
      }
    }

    return data;
  },

  distanceTransform: function (room) {
    const terrain =
      room && typeof room.getTerrain === 'function'
        ? room.getTerrain()
        : new Room.Terrain(room.name);
    const dist = computeDistanceTransformFromTerrain(terrain);

    // Save the distance transform data to room memory
    room.memory.distanceTransform = dist;
    return dist;
  },

  visualizeDistanceTransform: function (roomName, dist) {
    const visual = new RoomVisual(roomName);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const index = idx(x, y);
        visual.text(dist[index].toString(), x, y, {
          color: "white",
          font: 0.5,
        });
      }
    }
  },

  _helpers: {
    computeDistanceTransformFromTerrain,
  },
};
