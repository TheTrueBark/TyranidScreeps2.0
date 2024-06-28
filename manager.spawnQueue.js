const debugConfig = require("console.debugLogs");

const spawnQueue = {
    queue: [],

    addToQueue(priority, role, bodyParts, memory) {
        this.queue.push({ priority, role, bodyParts, memory });
        this.queue.sort((a, b) => a.priority - b.priority);
        if (debugConfig.spawnQueue) console.log(`Added to spawn queue: role=${role}, priority=${priority}, bodyParts=${JSON.stringify(bodyParts)}`);
    },

    getNextSpawn() {
        if (this.queue.length > 0) {
            const nextSpawn = this.queue[0];
            if (debugConfig.spawnQueue) console.log(`Next spawn in queue: ${JSON.stringify(nextSpawn)}`);
            return nextSpawn;
        }
        return null;
    },

    removeSpawnFromQueue() {
        if (this.queue.length > 0) {
            const removed = this.queue.shift();
            if (debugConfig.spawnQueue) console.log(`Removed from spawn queue: ${JSON.stringify(removed)}`);
            return removed;
        }
        return null;
    },

    adjustPriorities(room) {
        if (debugConfig.spawnQueue) console.log(`Adjusting priorities for room: ${room.name}`);
        for (const spawnRequest of this.queue) {
            if (spawnRequest.role === 'builder' && room.find(FIND_CONSTRUCTION_SITES).length > 0) {
                spawnRequest.priority = 5; // Higher priority for builders if construction sites exist
            }
        }
        this.queue.sort((a, b) => a.priority - b.priority);
    }
};

module.exports = spawnQueue;
