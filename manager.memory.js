const memoryManager = {
    /**
     * Initializes the room memory with default values.
     * @param {Room} room - The room object to initialize memory for.
     */
    initializeRoomMemory: function(room) {
        if (!Memory.rooms) {
            Memory.rooms = {};
        }
        if (!Memory.rooms[room.name]) {
            Memory.rooms[room.name] = {
                miningPositions: {},
                reservedPositions: {}
            };
        }
    },

    /**
     * Cleans up reserved positions in the room memory.
     */
    cleanUpReservedPositions: function() {
        for (const roomName in Memory.rooms) {
            if (Memory.rooms[roomName].reservedPositions) {
                for (const pos in Memory.rooms[roomName].reservedPositions) {
                    if (!Game.creeps[Memory.rooms[roomName].reservedPositions[pos]]) {
                        delete Memory.rooms[roomName].reservedPositions[pos];
                    }
                }
            }
        }
    },

    /**
     * Assigns a mining position to a creep.
     * @param {Object} creepMemory - The memory object of the creep.
     * @param {Room} room - The room object where the mining position is assigned.
     * @returns {boolean} - True if a mining position was assigned, false otherwise.
     */
    assignMiningPosition: function(creepMemory, room) {
        if (!creepMemory || !creepMemory.source) {
            console.log("Error: Creep memory or source is undefined in assignMiningPosition");
            return false;
        }

        const sourceId = creepMemory.source;
        if (!Memory.rooms[room.name].miningPositions[sourceId]) {
            return false;
        }

        const positions = Memory.rooms[room.name].miningPositions[sourceId].positions;
        for (const key in positions) {
            const position = positions[key];
            if (position && !position.reserved) {
                position.reserved = true;
                creepMemory.miningPosition = position;
                return true;
            }
        }

        return false;
    }
};

module.exports = memoryManager;