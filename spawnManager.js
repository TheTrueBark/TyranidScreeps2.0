const statsConsole = require("statsConsole");
const buildingManager = require("buildingManager");
const roomPlanner = require("roomPlanner");

const spawnManager = {
    minerQueue: [],

    spawnAllPurposeCreeps: function(spawn) {
        const room = spawn.room;
        const sources = room.find(FIND_SOURCES);

        // Count current all-purpose creeps
        const allPurposeCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'allPurpose');
        const miners = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner');

        // Determine the required number of all-purpose creeps (mining + hauling)
        let requiredAllPurposeCreeps = sources.length * 2; // 1 miner and 1 hauler per source

        // If no miners are available, increase the number of all-purpose creeps needed
        if (miners.length === 0) {
            requiredAllPurposeCreeps = sources.length * 3; // 2 miners and 1 hauler per source
        }

        // Spawn all-purpose creeps until we have the required number
        if (allPurposeCreeps.length < requiredAllPurposeCreeps) {
            const newName = 'AllPurpose' + Game.time;
            const result = spawn.spawnCreep([WORK, CARRY, MOVE, MOVE], newName, { memory: { role: 'allPurpose' } });
            if (result === OK) {
                statsConsole.log("Spawning new all-purpose creep: " + newName, 6);
            }
        }
    },
    spawnUpgraderCreeps: function(spawn) {
        const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner');
        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');

        // Only spawn upgraders if there are miners available
        if (miners.length > 0 && upgraders.length < 2) { // Adjust the number as needed
            const newName = 'Upgrader' + Game.time;
            const result = spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'upgrader' } });
            if (result === OK) {
                statsConsole.log("Spawning new upgrader: " + newName, 6);
            }
        }
    },
    spawnMinerCreeps: function(spawn) {
        const sources = spawn.room.find(FIND_SOURCES);
        const energyCapacityAvailable = spawn.room.energyCapacityAvailable;

        for (const source of sources) {
            const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner' && creep.memory.sourceId === source.id);
            const miningPositions = roomPlanner.findMiningPositions(spawn.room);

            const requiredWorkParts = Math.ceil(source.energyCapacity / 300); // 300 energy per tick
            const currentWorkParts = _.sum(miners, (miner) => _.filter(miner.body, { type: WORK }).length);

            if (currentWorkParts < requiredWorkParts) {
                const bodyParts = this.calculateMinerBodyParts(energyCapacityAvailable, requiredWorkParts - currentWorkParts);

                // Add miner to queue if it isn't already there
                if (!this.minerQueue.some(q => q.sourceId === source.id && _.isEqual(q.bodyParts, bodyParts))) {
                    this.minerQueue.push({ sourceId: source.id, bodyParts: bodyParts });
                    statsConsole.log(`Queued new miner for source ${source.id}`, 6);
                }
            }
        }

        // Check if we can spawn a miner from the queue
        if (this.minerQueue.length > 0) {
            const minerToSpawn = this.minerQueue[0];
            if (spawn.spawnCreep(minerToSpawn.bodyParts, 'Miner' + Game.time, { memory: { role: 'miner', sourceId: minerToSpawn.sourceId } }) === OK) {
                statsConsole.log(`Spawning miner for source ${minerToSpawn.sourceId}`, 6);
                this.minerQueue.shift(); // Remove the miner from the queue
            }
        }
    },
    spawnBuilderCreeps: function(spawn) {
        const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner');
        const builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');

        // Only spawn builders if there are miners available
        if (miners.length > 0 && builders.length < 2) { // Adjust the number as needed
            const newName = 'Builder' + Game.time;
            const result = spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'builder' } });
            if (result === OK) {
                statsConsole.log("Spawning new builder: " + newName, 6);
            }
        }
    },
    calculateMinerBodyParts: function(energyCapacityAvailable, requiredWorkParts) {
        let bodyParts = [];
        let energyUsed = 0;
        let workParts = 0;

        while (energyUsed + 100 <= energyCapacityAvailable && workParts < requiredWorkParts) { // 100 for WORK
            bodyParts.push(WORK);
            energyUsed += 100;
            workParts += 1;
        }

        // Add one MOVE part
        if (energyUsed + 50 <= energyCapacityAvailable) {
            bodyParts.push(MOVE);
            energyUsed += 50;
        }

        return bodyParts;
    }
};

module.exports = spawnManager;
