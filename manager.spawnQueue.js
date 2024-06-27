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
    },

    adjustPriorities(room) {
        // Adjust priorities based on room state
        for (let i = 0; i < this.queue.length; i++) {
            const entry = this.queue[i];
            // Example adjustment: Increase priority for upgraders if controller is below certain level
            if (entry.role === 'upgrader' && room.controller.ticksToDowngrade < 1000) {
                entry.priority = 1;
            }
        }
        this.queue.sort((a, b) => a.priority - b.priority);
    }
};

module.exports = spawnQueue;
