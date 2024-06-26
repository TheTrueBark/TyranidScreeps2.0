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
    },

    checkAndAddToQueue(spawn, room) {
        const availableEnergy = spawn.room.energyAvailable;
        if (debugConfig.spawnManager) console.log(`Available energy in room ${room.name}: ${availableEnergy}`);

        if (room.controller.level < 2) {
            const totalAvailablePositions = Memory.rooms[room.name].totalAvailableMiningPositions + 2;
            const allPurposeCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'allPurpose' && creep.room.name === room.name).length;

            if (debugConfig.spawnManager) {
                console.log(`Total available positions: ${totalAvailablePositions}`);
                console.log(`Current allPurpose creeps: ${allPurposeCreeps}`);
            }

            if (allPurposeCreeps < totalAvailablePositions) {
                if (debugConfig.spawnManager) console.log(`Adding allPurpose creep to spawn queue in room ${room.name}`);
                const bodyParts = bodyPartManager.calculateBodyParts('allPurpose', availableEnergy);
                spawnQueue.addToQueue(10, 'allPurpose', bodyParts, { role: 'allPurpose' });
            }
        } else {
            // Logic for adding other roles to the queue when RCL is 2 or above
        }
    },

    processSpawnQueue(spawn) {
        if (debugConfig.spawnManager) console.log(`Processing spawn queue for ${spawn.name}`);
        if (!spawn.spawning) {
            const nextSpawn = spawnQueue.getNextSpawn();
            if (nextSpawn) {
                if (debugConfig.spawnManager) console.log(`Next spawn: ${JSON.stringify(nextSpawn)}`);
                const { role, bodyParts, memory } = nextSpawn;
                const newName = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
                if (debugConfig.spawnManager) console.log(`Attempting to spawn ${newName} with body parts: ${bodyParts}`);
                const result = spawn.spawnCreep(bodyParts, newName, { memory });
                if (result === OK) {
                    if (debugConfig.spawnManager) console.log(`Spawning new ${role}: ${newName}`);
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
