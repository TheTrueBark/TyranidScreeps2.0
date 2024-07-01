const memoryManager = require("manager.memory");
const bodyPartManager = require("manager.bodyParts");
const spawnQueue = require("manager.spawnQueue");
const demandManager = require("manager.demand");
const { calculateCollectionTicks } = require("utils.energy");
const debugConfig = require("console.debugLogs");

// Calculate the effective energy capacity excluding incomplete extensions
const calculateEffectiveEnergyCapacity = (room) => {
    let effectiveEnergyCapacity = room.energyCapacityAvailable;

    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: (site) => site.structureType === STRUCTURE_EXTENSION
    });

    if (constructionSites.length > 0) {
        const incompleteExtensions = constructionSites.length * EXTENSION_ENERGY_CAPACITY[room.controller.level];
        effectiveEnergyCapacity -= incompleteExtensions;
    }

    return effectiveEnergyCapacity;
};

const spawnManager = {
    /**
     * Main function called each tick to manage spawning in the given room.
     * @param {Room} room - The room object to manage spawning for.
     */
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

    /**
     * Checks the current state of the room and adds appropriate spawn requests to the queue.
     * @param {StructureSpawn} spawn - The spawn structure to add requests for.
     * @param {Room} room - The room object to check state for.
     */
    checkAndAddToQueue(spawn, room) {
        const availableEnergy = spawn.room.energyAvailable;
        const energyCapacityAvailable = calculateEffectiveEnergyCapacity(spawn.room); // Use the effective energy capacity
    
        // Evaluate room needs
        demandManager.evaluateRoomNeeds(room);
        const inDemand = Memory.rooms[room.name].inDemand;
    
        // Check if there are any creeps in the room
        const creepsInRoom = room.find(FIND_CREEPS);
    
        // Spawn based on demand
        switch (inDemand) {
            case 'allPurpose':
                if (creepsInRoom.length === 0) {
                    this.spawnAllPurpose(spawn, room, energyCapacityAvailable);
                }
                break;
            case 'miner':
                this.spawnMiner(spawn, room, energyCapacityAvailable);
                break;
            case 'hauler':
                this.spawnHauler(spawn, room, energyCapacityAvailable);
                break;
            case 'default':
                // Default logic, sort by tickID or other criteria as needed
                this.spawnDefault(spawn, room, energyCapacityAvailable);
                break;
            default:
                break;
        }
    },

    /**
     * Spawns an allPurpose creep with the appropriate body parts.
     * @param {StructureSpawn} spawn - The spawn structure to add requests for.
     * @param {Room} room - The room object to check state for.
     * @param {number} energyCapacityAvailable - The available energy capacity.
     */
    spawnAllPurpose(spawn, room, energyCapacityAvailable) {
        if (debugConfig.spawnManager) console.log(`Adding fallback allPurpose creep to spawn queue in room ${room.name}`);
        const bodyParts = bodyPartManager.calculateBodyParts('allPurpose', energyCapacityAvailable);
        spawnQueue.addToQueue('allPurpose', room.name, bodyParts, { role: 'allPurpose' }, spawn.id);
    },

    /**
 * Spawns a miner with the appropriate body parts based on the available energy.
 * @param {StructureSpawn} spawn - The spawn structure to add requests for.
 * @param {Room} room - The room object to check state for.
 * @param {number} energyCapacityAvailable - The available energy capacity.
 */
    spawnMiner(spawn, room, energyCapacityAvailable) {
        const sources = room.find(FIND_SOURCES);
        if (!Array.isArray(sources)) {
            console.log(`No sources found in room ${room.name}`);
            return;
        }
    
        sources.forEach(source => {
            if (!Memory.rooms || !Memory.rooms[room.name] || !Memory.rooms[room.name].miningPositions || !Memory.rooms[room.name].miningPositions[source.id]) {
                console.log(`Missing mining positions data for room ${room.name} and source ${source.id}`);
                return;
            }
    
            const availablePositions = Object.keys(Memory.rooms[room.name].miningPositions[source.id].positions).length;
            const minersAtSource = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner' && creep.memory.source === source.id).length;
    
            if (minersAtSource >= availablePositions) {
                console.log(`No available mining positions for source ${source.id} in room ${room.name}`);
                return;
            }
    
            let bodyParts;
            if (minersAtSource < 3) {
                bodyParts = [WORK, WORK, MOVE];
            } else if (minersAtSource < 2) {
                bodyParts = [WORK, WORK, WORK, MOVE];
            } else {
                bodyParts = [WORK, WORK, WORK, WORK, WORK, WORK, MOVE];
            }
    
            const creepMemory = { source: source.id };
            const miningPositionAssigned = memoryManager.assignMiningPosition(creepMemory, room);
    
            if (miningPositionAssigned) {
                const distanceToSpawn = spawn.pos.getRangeTo(Game.getObjectById(source.id).pos);
                const energyProducedPerTick = bodyParts.filter(part => part === WORK).length * HARVEST_POWER;
                const collectionTicks = calculateCollectionTicks(energyProducedPerTick);
    
                if (!spawnQueue.queue.some(req => req.memory.source === source.id && JSON.stringify(req.bodyParts) === JSON.stringify(bodyParts))) {
                    spawnQueue.addToQueue('miner', room.name, bodyParts, {
                        role: 'miner',
                        source: source.id,
                        miningPosition: creepMemory.miningPosition,
                        distanceToSpawn,
                        energyProducedPerTick,
                        collectionTicks
                    }, spawn.id);
                }
            }
        });
    },

    /**
     * Spawns a hauler with the appropriate body parts based on the available energy.
     * @param {StructureSpawn} spawn - The spawn structure to add requests for.
     * @param {Room} room - The room object to check state for.
     * @param {number} energyCapacityAvailable - The available energy capacity.
     */
    spawnHauler(spawn, room, energyCapacityAvailable) {
        const currentHaulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room.name === room.name).length;
        const queuedHaulers = spawnQueue.queue.filter(req => req.memory.role === 'hauler' && req.room === room.name).length;

        if (currentHaulers + queuedHaulers < 6) { // Maximum of 6 haulers
            const bodyParts = bodyPartManager.calculateBodyParts('hauler', energyCapacityAvailable);
            spawnQueue.addToQueue('hauler', room.name, bodyParts, { role: 'hauler' }, spawn.id);
            if (debugConfig.spawnManager) console.log(`Added hauler creep to spawn queue in room ${room.name}`);
        } else {
            if (debugConfig.spawnManager) console.log(`Maximum number of haulers reached for room ${room.name}`);
        }
    },

    spawnDefault(spawn, room, energyCapacityAvailable) {
        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.room.name === room.name).length;
        if (upgraders < 2) { // Adjust this number as needed
            const bodyParts = bodyPartManager.calculateBodyParts('upgrader', energyCapacityAvailable);
            spawnQueue.addToQueue('upgrader', room.name, bodyParts, { role: 'upgrader' }, spawn.id);
            if (debugConfig.spawnManager) console.log(`Added upgrader creep to spawn queue in room ${room.name}`);
        }
    },

    /**
     * Processes the spawn queue for a given spawn structure.
     * Attempts to spawn the next creep in the queue if enough energy is available.
     * @param {StructureSpawn} spawn - The spawn structure to process the queue for.
     */
    processSpawnQueue(spawn) {
        if (debugConfig.spawnManager) console.log(`Processing spawn queue for ${spawn.name}`);
        if (!spawn.spawning) {
            const nextSpawn = spawnQueue.getNextSpawn(spawn.id);  // Ensure this fetches the next spawn in the global queue for this spawn
            if (nextSpawn && spawn.room.energyAvailable >= nextSpawn.energyRequired) {
                if (debugConfig.spawnManager) console.log(`Next spawn: ${JSON.stringify(nextSpawn)}`);
                const { category, bodyParts, memory, requestId } = nextSpawn;
                const newName = `${category}_${Game.time}`;
                if (debugConfig.spawnManager) console.log(`Attempting to spawn ${newName} with body parts: ${JSON.stringify(bodyParts)}`);
                const result = spawn.spawnCreep(bodyParts, newName, { memory });
                if (result === OK) {
                    if (debugConfig.spawnManager) console.log(`Spawning new ${category}: ${newName}`);
                    spawnQueue.removeSpawnFromQueue(requestId);
                    demandManager.evaluateRoomNeeds(spawn.room); // Reevaluate room needs after each spawn
                } else {
                    if (debugConfig.spawnManager) console.log(`Failed to spawn ${category}: ${result}`);
                }
            } else {
                if (debugConfig.spawnManager) console.log(`Not enough energy to spawn: ${JSON.stringify(nextSpawn)}`);
            }
        } else {
            if (debugConfig.spawnManager) console.log(`${spawn.name} is currently spawning a creep`);
        }
    }
};

module.exports = spawnManager;