// distanceTransform.js

module.exports = {
    getTerrainData: function(roomName) {
        const terrain = new Room.Terrain(roomName);
        const data = new Array(2500).fill(0);

        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL || x === 0 || x === 49 || y === 0 || y === 49) {
                    data[y * 50 + x] = 1; // Mark walls and edges as 1
                }
            }
        }

        return data;
    },

    distanceTransform: function(room) {
        const terrainData = this.getTerrainData(room.name);
        const dist = new Array(2500).fill(Infinity);

        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const index = y * 50 + x;
                if (terrainData[index] === 1) {
                    dist[index] = 0;
                }
            }
        }

        // Pass 1: top-left to bottom-right
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const index = y * 50 + x;
                if (x > 0) dist[index] = Math.min(dist[index], dist[index - 1] + 1);
                if (y > 0) dist[index] = Math.min(dist[index], dist[index - 50] + 1);
            }
        }

        // Pass 2: bottom-right to top-left
        for (let y = 49; y >= 0; y--) {
            for (let x = 49; x >= 0; x--) {
                const index = y * 50 + x;
                if (x < 49) dist[index] = Math.min(dist[index], dist[index + 1] + 1);
                if (y < 49) dist[index] = Math.min(dist[index], dist[index + 50] + 1);
            }
        }

        // Save the distance transform data to room memory
        room.memory.distanceTransform = dist;
        return dist;
    },

    visualizeDistanceTransform: function(roomName, dist) {
        const visual = new RoomVisual(roomName);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const index = y * 50 + x;
                visual.text(dist[index].toString(), x, y, { color: 'white', font: 0.5 });
            }
        }
    }
};
