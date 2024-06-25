const statsConsole = require("statsConsole");

const spawnManager = {
    spawnAllPurposeCreeps: function(spawn) {
        const room = spawn.room;
        const sources = room.find(FIND_SOURCES);

        // Count current all-purpose creeps
        const allPurposeCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === 'allPurpose');

        // Determine the required number of all-purpose creeps (mining + hauling)
        const requiredAllPurposeCreeps = sources.length * 2; // 1 miner and 1 hauler per source

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
        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
        if (upgraders.length < 2) { // Adjust the number as needed
            const newName = 'Upgrader' + Game.time;
            const result = spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'upgrader' } });
            if (result === OK) {
                statsConsole.log("Spawning new upgrader: " + newName, 6);
            }
        }
    },
    spawnMinerCreeps: function(spawn) {
        const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner');
        if (miners.length < 3) { // Adjust the number as needed
            const newName = 'Miner' + Game.time;
            const result = spawn.spawnCreep([WORK, WORK, CARRY, MOVE], newName, { memory: { role: 'miner' } });
            if (result === OK) {
                statsConsole.log("Spawning new miner: " + newName, 6);
            }
        }
    },
    buildInfrastructure: function(room) {
        if (room.controller.level >= 2) {
            const sources = room.find(FIND_SOURCES);
            for (const source of sources) {
                // Queue construction of containers near sources
                const containerSite = source.pos.findClosestByPath(FIND_CONSTRUCTION_SITES, {
                    filter: (site) => site.structureType === STRUCTURE_CONTAINER
                });
                if (!containerSite) {
                    source.pos.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }

            // Queue construction of extensions near the spawn
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            if (spawn) {
                const extensionSites = room.find(FIND_CONSTRUCTION_SITES, {
                    filter: (site) => site.structureType === STRUCTURE_EXTENSION
                });
                if (extensionSites.length < 5) {
                    for (let i = 0; i < 5; i++) {
                        const closestStructure = spawn.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                            filter: { structureType: STRUCTURE_EXTENSION }
                        });

                        if (closestStructure && closestStructure.pos) {
                            const position = closestStructure.pos;
                            position.createConstructionSite(STRUCTURE_EXTENSION);
                        } else {
                            statsConsole.log("Could not find a valid position to create an extension site", 6);
                        }
                    }
                }
            }
        }
    }
};

module.exports = spawnManager;
