const debugConfig = require("console.debugLogs");

if (!Memory.spawnQueue) {
    Memory.spawnQueue = [];
}

const spawnQueue = {
    get queue() {
        if (!Memory.spawnQueue) {
            Memory.spawnQueue = [];
        }
        return Memory.spawnQueue;
    },

    set queue(value) {
        Memory.spawnQueue = value;
    },

    /**
     * Adds a spawn request to the queue.
     * 
     * @param {string} category - Category of the spawn request.
     * @param {string} room - Room where the spawn is requested.
     * @param {Array} bodyParts - Array of body parts for the creep.
     * @param {object} memory - Memory object to be assigned to the creep.
     * @param {string} spawnId - ID of the spawn to handle this request.
     * @param {number} ticksToSpawn - Number of ticks to delay the spawn (default is 0).
     */
    addToQueue(category, room, bodyParts, memory, spawnId, ticksToSpawn = 0) {
        const requestId = Game.time; // Using Game.time as a unique identifier
        const energyRequired = _.sum(bodyParts, part => BODYPART_COST[part]);
        this.queue.push({ requestId, category, room, bodyParts, memory, spawnId, ticksToSpawn, energyRequired });
        if (debugConfig.spawnQueue) {
            console.log(`Added to spawn queue: category=${category}, room=${room}, bodyParts=${JSON.stringify(bodyParts)}, memory=${JSON.stringify(memory)}, spawnId=${spawnId}, ticksToSpawn=${ticksToSpawn}, energyRequired=${energyRequired}`);
        }
    },

    /**
     * Retrieves the next spawn request from the queue for a specific spawn.
     * 
     * @param {string} spawnId - ID of the spawn to fetch the request for.
     * @returns {object|null} - The next spawn request or null if the queue is empty.
     */
    getNextSpawn(spawnId) {
        const sortedQueue = this.queue.filter(req => req.spawnId === spawnId).sort((a, b) => a.ticksToSpawn - b.ticksToSpawn);
        if (sortedQueue.length > 0) {
            const nextSpawn = sortedQueue[0];
            if (!nextSpawn.memory) {
                console.log(`Warning: Memory object missing for spawn request: ${JSON.stringify(nextSpawn)}`);
            }
            return nextSpawn;
        }
        return null;
    },

    /**
     * Removes a spawn request from the queue based on its unique identifier.
     * 
     * @param {number} requestId - The unique identifier of the spawn request to remove.
     * @returns {object|null} - The removed spawn request or null if not found.
     */
    removeSpawnFromQueue(requestId) {
        const index = this.queue.findIndex(req => req.requestId === requestId);
        if (index !== -1) {
            const removed = this.queue.splice(index, 1)[0];
            if (debugConfig.spawnQueue) {
                console.log(`Removed from spawn queue: ${JSON.stringify(removed)}`);
            }
            return removed;
        }
        return null;
    },

    /**
     * Adjusts the priorities of spawn requests based on room conditions.
     * Currently, it increases the priority of builder creeps if construction sites exist in the room.
     * 
     * @param {Room} room - The room to adjust priorities for.
     */
    adjustPriorities(room) {
        if (debugConfig.spawnQueue) console.log(`Adjusting priorities for room: ${room.name}`);
        for (const spawnRequest of this.queue) {
            if (spawnRequest.room === room.name && spawnRequest.category === 'builder' && room.find(FIND_CONSTRUCTION_SITES).length > 0) {
                spawnRequest.priority = 5; // Higher priority for builders if construction sites exist
            }
        }
        this.queue.sort((a, b) => a.priority - b.priority);
    },

    /**
     * Processes the spawn queue for a given spawn structure.
     * Attempts to spawn the next creep in the queue if enough energy is available.
     * 
     * @param {StructureSpawn} spawn - The spawn to process the queue for.
     */
    processQueue(spawn) {
        if (!spawn.spawning) {
            const nextSpawn = this.getNextSpawn(spawn.id);
            if (nextSpawn && spawn.room.energyAvailable >= nextSpawn.energyRequired) {
                const { category, bodyParts, memory, requestId } = nextSpawn;
                const newName = `${category}_${Game.time}`;
                if (debugConfig.spawnQueue) console.log(`Attempting to spawn ${newName} with body parts: ${JSON.stringify(bodyParts)}`);
                const result = spawn.spawnCreep(bodyParts, newName, { memory });
                if (result === OK) {
                    if (debugConfig.spawnQueue) console.log(`Spawning new ${category}: ${newName}`);
                    this.removeSpawnFromQueue(requestId);
                    require('manager.demand').evaluateRoomNeeds(spawn.room); // Reevaluate room needs after each spawn
                } else {
                    if (debugConfig.spawnQueue) console.log(`Failed to spawn ${category}: ${result}`);
                }
            }
        }
    },
};

module.exports = spawnQueue;