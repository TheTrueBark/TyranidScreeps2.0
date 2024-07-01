const debugConfig = require("console.debugLogs");

const demandManager = {
    /**
     * Sets the inDemand state for a room based on the current needs.
     * @param {Room} room - The room to evaluate.
     */
    evaluateRoomNeeds(room) {
        const allPurposeCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'allPurpose' && creep.room.name === room.name).length;
        const miners = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner' && creep.room.name === room.name).length;
        const haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room.name === room.name).length;
        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.room.name === room.name).length;

        const sources = room.find(FIND_SOURCES);
        const requiredMiners = sources.length * 3; // 3 miners per source

        let inDemand = 'none';

        if (allPurposeCreeps === 0) {
            inDemand = 'allPurpose';
        } else if (miners < requiredMiners) {
            inDemand = miners % 2 === 0 ? 'miner' : 'hauler';
        } else if (haulers < 6) { // Set maximum number of haulers
            inDemand = 'hauler';
        } else if (upgraders < 2) { // Adjust this number as needed
            inDemand = 'upgrader';
        }

        Memory.rooms[room.name].inDemand = inDemand;

        if (debugConfig.demandManager) console.log(`Updated inDemand for room ${room.name}: ${inDemand}`);
    }
};

module.exports = demandManager;