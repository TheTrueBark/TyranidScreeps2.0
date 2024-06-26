const statsConsole = require("statsConsole");
const buildingManager = require("buildingManager");
const roomPlanner = require("roomPlanner");

const spawnManager = {
    minerQueue: [],

    spawnAllPurposeCreeps: function(spawn) {
        const room = spawn.room;

        // Count current all-purpose creeps
        const allPurposeCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'allPurpose');
        if (room.controller.level < 2 && allPurposeCreeps.length < 5) { // Adjust the number as needed
            const newName = 'AllPurpose' + Game.time;
            const result = spawn.spawnCreep([WORK, CARRY, MOVE, MOVE], newName, { memory: { role: 'allPurpose' } });
            if (result === OK) {
                statsConsole.log("Spawning new all-purpose creep: " + newName, 6);
            }
        }
    },

    spawnMinerCreeps: function(spawn) {
        const sources = spawn.room.find(FIND_SOURCES);
        const energyCapacityAvailable = spawn.room.energyCapacityAvailable;
    
        if (spawn.room.controller.level < 2) {
            return;
        }
    
        for (const source of sources) {
            const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner' && creep.memory.sourceId === source.id);
            const miningPositions = roomPlanner.findMiningPositions(spawn.room, source);
            const maxMiners = miningPositions.length;
    
            const requiredWorkParts = Math.ceil(source.energyCapacity / 300); // 300 energy per tick
            const currentWorkParts = _.sum(miners, (miner) => _.filter(miner.body, { type: WORK }).length);
            const minersNeeded = Math.min(maxMiners, Math.ceil(requiredWorkParts / 5)); // Each miner should ideally have 5 WORK parts
    
            if (miners.length < minersNeeded) {
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
            if (spawn.spawnCreep(minerToSpawn.bodyParts, 'Miner' + Game.time, { memory: { role: 'miner', sourceId: minerToSpawn.sourceId, spawnTime: Game.time } }) === OK) {
                statsConsole.log(`Spawning miner for source ${minerToSpawn.sourceId}`, 6);
                this.minerQueue.shift(); // Remove the miner from the queue
            }
        }
    }
    ,

    spawnHaulerCreeps: function(spawn) {
        const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner');
        const haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
        const energyCapacityAvailable = spawn.room.energyCapacityAvailable;
    
        // Ensure at least one hauler if there is at least one miner
        if (miners.length >= 1 && haulers.length < 1) {
            const bodyParts = this.calculateDynamicBodyParts(energyCapacityAvailable, { carry: true, move: true });
            const newName = 'Hauler' + Game.time;
            const result = spawn.spawnCreep(bodyParts, newName, { memory: { role: 'hauler' } });
            if (result === OK) {
                statsConsole.log("Spawning new hauler: " + newName, 6);
            }
        }
    
        // Ensure at least two haulers if there are at least two miners
        if (miners.length >= 2 && haulers.length < 2) {
            const bodyParts = this.calculateDynamicBodyParts(energyCapacityAvailable, { carry: true, move: true });
            const newName = 'Hauler' + Game.time;
            const result = spawn.spawnCreep(bodyParts, newName, { memory: { role: 'hauler' } });
            if (result === OK) {
                statsConsole.log("Spawning new hauler: " + newName, 6);
            }
        }
    
        // Maintain a ratio of 1 hauler per 3 miners
        if (miners.length > 2 && haulers.length < Math.ceil(miners.length / 3)) {
            const bodyParts = this.calculateDynamicBodyParts(energyCapacityAvailable, { carry: true, move: true });
            const newName = 'Hauler' + Game.time;
            const result = spawn.spawnCreep(bodyParts, newName, { memory: { role: 'hauler' } });
            if (result === OK) {
                statsConsole.log("Spawning new hauler: " + newName, 6);
            }
        }
    }
    ,
    

    spawnBuilderCreeps: function(spawn) {
        const haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
        const builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
        const energyCapacityAvailable = spawn.room.energyCapacityAvailable;

        // Only spawn builders if there are at least 2 haulers available
        if (haulers.length >= 2 && builders.length < 1) {
            const bodyParts = this.calculateDynamicBodyParts(energyCapacityAvailable, { work: true, carry: true, move: true });
            const newName = 'Builder' + Game.time;
            const result = spawn.spawnCreep(bodyParts, newName, { memory: { role: 'builder' } });
            if (result === OK) {
                statsConsole.log("Spawning new builder: " + newName, 6);
            }
        }
    },

    spawnUpgraderCreeps: function(spawn) {
        const builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
        const energyCapacityAvailable = spawn.room.energyCapacityAvailable;

        // Only spawn upgraders if there is at least one builder available and less than 4 upgraders
        if (builders.length >= 1 && upgraders.length < 4) {
            const bodyParts = this.calculateDynamicBodyParts(energyCapacityAvailable, { work: true, carry: true, move: true });
            const newName = 'Upgrader' + Game.time;
            const result = spawn.spawnCreep(bodyParts, newName, { memory: { role: 'upgrader' } });
            if (result === OK) {
                statsConsole.log("Spawning new upgrader: " + newName, 6);
            }
        }
    },

    calculateDynamicBodyParts: function(energyCapacityAvailable, partTypes) {
        let bodyParts = [];
        let energyUsed = 0;

        // Ensure at least one MOVE part if no parts added yet
        if (energyUsed + 50 <= energyCapacityAvailable && partTypes.move) {
            bodyParts.push(MOVE);
            energyUsed += 50;
        }

        while (energyUsed + 50 <= energyCapacityAvailable) {
            if (partTypes.work && energyUsed + 100 <= energyCapacityAvailable) {
                bodyParts.push(WORK);
                energyUsed += 100;
            }
            if (partTypes.carry && energyUsed + 50 <= energyCapacityAvailable) {
                bodyParts.push(CARRY);
                energyUsed += 50;
            }
            if (partTypes.move && energyUsed + 50 <= energyCapacityAvailable) {
                bodyParts.push(MOVE);
                energyUsed += 50;
            }
        }

        return bodyParts;
    },

    calculateMinerBodyParts: function(energyCapacityAvailable, requiredWorkParts) {
        let bodyParts = [];
        let energyUsed = 0;
        let workParts = 0;

        // Ensure at least one MOVE part
        if (energyUsed + 50 <= energyCapacityAvailable) {
            bodyParts.push(MOVE);
            energyUsed += 50;
        }

        while (energyUsed + 100 <= energyCapacityAvailable && workParts < requiredWorkParts) { // 100 for WORK
            bodyParts.push(WORK);
            energyUsed += 100;
            workParts += 1;
        }

        return bodyParts;
    },

    calculateTimeToSource: function(spawn, source) {
        const path = PathFinder.search(spawn.pos, { pos: source.pos, range: 1 }).path;
        let fatigue = 0;

        // Estimate fatigue based on the number of work parts and one move part
        for (const step of path) {
            fatigue += 2; // 1 fatigue for each WORK part, with 1 MOVE part
            if (fatigue > 1) {
                fatigue -= 1; // MOVE part reduces 1 fatigue each tick
            }
        }

        return path.length + Math.ceil(fatigue / path.length);
    },

    planNextMiner: function(spawn) {
        const sources = spawn.room.find(FIND_SOURCES);
        for (const source of sources) {
            const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner' && creep.memory.sourceId === source.id);
            if (miners.length > 0) {
                const miner = miners[0];
                const timeToSource = this.calculateTimeToSource(spawn, source);
                const timeToSpawn = miner.ticksToLive - timeToSource - 1; // Plan to spawn one tick before the miner reaches 0 ticksToLive

                if (timeToSpawn > 0) {
                    spawn.memory.nextMinerSpawn = Game.time + timeToSpawn;
                }
            }
        }
    }
};

module.exports = spawnManager;
