const spawnQueue = {
    queue: [],

    addToQueue(priority, role, bodyParts, memory) {
        this.queue.push({ priority, role, bodyParts, memory });
        this.queue.sort((a, b) => a.priority - b.priority); // Sort by priority (lower value means higher priority)
    },

    getNextSpawn() {
        return this.queue.shift();
    },

    getQueue() {
        return this.queue;
    }
};

module.exports = spawnQueue;