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
        const rcl = room.controller.level;
        const totalCreeps = _.filter(Game.creeps, (creep) => creep.room.name === room.name).length;
    
        // Spawn allPurpose creeps when RCL < 2 or as fallback if less than 3 creeps in total
        if (rcl < 2 || totalCreeps < 3) {
            const allPurposeCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'allPurpose' && creep.room.name === room.name).length;
            if (allPurposeCreeps < totalCreeps || totalCreeps < 3) {
                if (debugConfig.spawnManager) console.log(`Adding allPurpose creep to spawn queue in room ${room.name}`);
                const bodyParts = bodyPartManager.calculateBodyParts('allPurpose', availableEnergy);
                spawnQueue.addToQueue(10, 'allPurpose', bodyParts, { role: 'allPurpose' });
                return;
            }
        }
    
        if (rcl >= 2) {
            // Logic for spawning miners
            const miners = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner' && creep.room.name === room.name).length;
            const sources = room.find(FIND_SOURCES);
    
            sources.forEach(source => {
                const availablePositions = Memory.rooms[room.name].miningPositions[source.id].length;
                const workPartsPerTick = Math.floor(3000 / ENERGY_REGEN_TIME);
                const maxBodyParts = Math.min(Math.floor(availableEnergy / 100), Math.min(workPartsPerTick, Math.floor(50 / 3)));
                const minerCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner' && creep.memory.source === source.id).length;
    
                if (minerCreeps < availablePositions) {
                    if (debugConfig.spawnManager) console.log(`Adding miner creep to spawn queue in room ${room.name}`);
                    const bodyParts = bodyPartManager.calculateBodyParts('miner', availableEnergy);
                    spawnQueue.addToQueue(20, 'miner', bodyParts, { role: 'miner', source: source.id });
                }
            });
    
            // Logic for spawning haulers
            const haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room.name === room.name).length;
            const targetHaulers = Math.max(2, Math.ceil(miners * 3 / 1.5));
            if (haulers < targetHaulers) {
                if (debugConfig.spawnManager) console.log(`Adding hauler creep to spawn queue in room ${room.name}`);
                const bodyParts = bodyPartManager.calculateBodyParts('hauler', availableEnergy);
                spawnQueue.addToQueue(30, 'hauler', bodyParts, { role: 'hauler' });
            }
        }
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
