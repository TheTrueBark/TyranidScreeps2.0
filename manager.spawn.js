const memoryManager = require("manager.memory");
const bodyPartManager = require("manager.bodyParts");
const spawnQueue = require("manager.spawnQueue");
const debugConfig = require("console.debugLogs");

const spawnManager = {
    run(room) {
        if (debugConfig.spawnManager) console.log(`Running spawnManager for room: ${room.name}`);
        
        if (Game.cpu.bucket === 10000) {
            if (debugConfig.spawnManager) console.log(`CPU bucket is full, initializing room memory for ${room.name}`);
            memoryManager.initializeRoomMemory(room);
            memoryManager.cleanUpReservedPositions();
        }

        const spawns = room.find(FIND_MY_SPAWNS);
        for (const spawn of spawns) {
            this.checkAndAddToQueue(spawn, room);
            this.processSpawnQueue(spawn);
        }

        // Adjust priorities dynamically
        spawnQueue.adjustPriorities(room);
    },

    checkAndAddToQueue(spawn, room) {
        const availableEnergy = spawn.room.energyAvailable;
        const energyCapacityAvailable = spawn.room.energyCapacityAvailable;
        const rcl = room.controller.level;
        const totalCreeps = _.filter(Game.creeps, (creep) => creep.room.name === room.name).length;
        const allPurposeCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'allPurpose' && creep.room.name === room.name).length;
        const miners = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner' && creep.room.name === room.name).length;
        const haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room.name === room.name).length;
        const totalAvailableMiningPositions = Memory.rooms[room.name].totalAvailableMiningPositions;

        // Logging the initial state
        if (debugConfig.spawnManager) {
            console.log(`Room: ${room.name}`);
            console.log(`RCL: ${rcl}`);
            console.log(`Total Creeps: ${totalCreeps}`);
            console.log(`AllPurpose Creeps: ${allPurposeCreeps}`);
            console.log(`Miners: ${miners}`);
            console.log(`Haulers: ${haulers}`);
            console.log(`Total Available Mining Positions: ${totalAvailableMiningPositions}`);
        }

        // Spawn allPurpose creep if no creeps are present
        if (totalCreeps === 0 && allPurposeCreeps === 0) {
            if (debugConfig.spawnManager) console.log(`Adding bootstrap allPurpose creep to spawn queue in room ${room.name}`);
            const bodyParts = bodyPartManager.calculateBodyParts('allPurpose', energyCapacityAvailable);
            spawnQueue.addToQueue(1, 'allPurpose', bodyParts, { role: 'allPurpose' });
            return;
        }

        // Logic for spawning miners
        const sources = room.find(FIND_SOURCES);
        let totalMinersNeeded = 0;

        sources.forEach(source => {
            const availablePositions = Memory.rooms[room.name].miningPositions[source.id].length;
            const minerCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner' && creep.memory.source === source.id).length;

            // Calculate the best possible miner configuration
            const bestMinerBodyParts = bodyPartManager.calculateBodyParts('miner', energyCapacityAvailable);
            const workParts = bestMinerBodyParts.filter(part => part === WORK).length;
            const sourceCapacity = source.energyCapacity;
            const ticksToRegenerate = ENERGY_REGEN_TIME;
            const maxMinersForSource = Math.ceil(sourceCapacity / (workParts * HARVEST_POWER * ticksToRegenerate));

            const maxMiners = Math.min(availablePositions, maxMinersForSource);
            totalMinersNeeded += maxMiners;

            if (debugConfig.spawnManager) {
                console.log(`Source ID: ${source.id}`);
                console.log(`Available Positions: ${availablePositions}`);
                console.log(`Current Miners: ${minerCreeps}`);
                console.log(`Best Miner Body Parts: ${JSON.stringify(bestMinerBodyParts)}`);
                console.log(`Work Parts: ${workParts}`);
                console.log(`Source Capacity: ${sourceCapacity}`);
                console.log(`Max Miners for Source: ${maxMinersForSource}`);
                console.log(`Max Miners: ${maxMiners}`);
                console.log(`Total Miners Needed: ${totalMinersNeeded}`);
            }

            if (minerCreeps < maxMiners) {
                if (debugConfig.spawnManager) console.log(`Adding miner creep to spawn queue for source ${source.id} in room ${room.name}`);
                const bodyParts = bodyPartManager.calculateBodyParts('miner', energyCapacityAvailable);
                spawnQueue.addToQueue(10, 'miner', bodyParts, { role: 'miner', source: source.id }); // Adjusted priority for miners
            }
        });

        // Ensure total miners do not exceed totalAvailableMiningPositions
        if (miners < totalAvailableMiningPositions && miners < totalMinersNeeded) {
            if (debugConfig.spawnManager) console.log(`Adding miner creep to spawn queue to meet total mining positions in room ${room.name}`);
            const bodyParts = bodyPartManager.calculateBodyParts('miner', energyCapacityAvailable);
            spawnQueue.addToQueue(10, 'miner', bodyParts, { role: 'miner' }); // Adjusted priority for miners
        }

        // Logic for spawning haulers
        const targetHaulers = Math.max(2, Math.ceil(miners * 3 / 1.5));
        if (haulers < targetHaulers) {
            if (debugConfig.spawnManager) console.log(`Adding hauler creep to spawn queue in room ${room.name}`);
            const bodyParts = bodyPartManager.calculateBodyParts('hauler', energyCapacityAvailable);
            if (debugConfig.spawnManager) {
                console.log(`Calculated body parts for hauler: ${JSON.stringify(bodyParts)}`);
            }
            spawnQueue.addToQueue(15, 'hauler', bodyParts, { role: 'hauler' }); // Adjust priority as needed
        }

        // Add logic for other specialized creeps (upgraders, builders, etc.) as needed
    },

    processSpawnQueue(spawn) {
        if (debugConfig.spawnManager) console.log(`Processing spawn queue for ${spawn.name}`);
        if (!spawn.spawning) {
            const nextSpawn = spawnQueue.getNextSpawn();  // Ensure this fetches the next spawn in the global queue
            if (nextSpawn) {
                if (debugConfig.spawnManager) console.log(`Next spawn: ${JSON.stringify(nextSpawn)}`);
                const { role, bodyParts, memory } = nextSpawn;
                const newName = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
                if (debugConfig.spawnManager) console.log(`Attempting to spawn ${newName} with body parts: ${JSON.stringify(bodyParts)}`);
                const result = spawn.spawnCreep(bodyParts, newName, { memory });
                if (result === OK) {
                    if (debugConfig.spawnManager) console.log(`Spawning new ${role}: ${newName}`);
                    spawnQueue.removeSpawnFromQueue();  // Ensure this removes the spawned creep from the global queue
                } else {
                    if (debugConfig.spawnManager) console.log(`Failed to spawn ${role}: ${result}`);
                }
            }
        } else {
            if (debugConfig.spawnManager) console.log(`${spawn.name} is currently spawning a creep`);
        }
    }
};

module.exports = spawnManager;
