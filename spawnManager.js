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
    spawnBuilderCreeps: function(spawn) {
        const builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
        if (builders.length < 2) { // Adjust the number as needed
            const newName = 'Builder' + Game.time;
            const result = spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'builder' } });
            if (result === OK) {
                statsConsole.log("Spawning new builder: " + newName, 6);
            }
        }
    },
    buildInfrastructure: function(room) {
        if (room.controller.level >= 2) {
            const sources = room.find(FIND_SOURCES);
            for (const source of sources) {
                // Queue construction of containers under sources
                const containerSite = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
                    filter: (site) => site.structureType === STRUCTURE_CONTAINER
                });
                if (!containerSite.length) {
                    source.pos.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }

            // Queue construction of extensions near the spawn
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            if (spawn) {
                const extensionSites = room.find(FIND_CONSTRUCTION_SITES, {
                    filter: (site) => site.structureType === STRUCTURE_EXTENSION
                });

                const extensions = room.find(FIND_MY_STRUCTURES, {
                    filter: (structure) => structure.structureType === STRUCTURE_EXTENSION
                });

                if (extensions.length + extensionSites.length < 5) { // Adjust the limit based on your needs
                    const positions = [
                        { x: -2, y: -2 },
                        { x: -2, y: 2 },
                        { x: 2, y: -2 },
                        { x: 2, y: 2 },
                        { x: -3, y: 0 },
                        { x: 3, y: 0 },
                        { x: 0, y: -3 },
                        { x: 0, y: 3 }
                    ];

                    for (let i = 0; i < positions.length; i++) {
                        const pos = new RoomPosition(spawn.pos.x + positions[i].x, spawn.pos.y + positions[i].y, room.name);
                        const structuresAtPos = pos.lookFor(LOOK_STRUCTURES);
                        const constructionSitesAtPos = pos.lookFor(LOOK_CONSTRUCTION_SITES);

                        if (structuresAtPos.length === 0 && constructionSitesAtPos.length === 0) {
                            const result = pos.createConstructionSite(STRUCTURE_EXTENSION);
                            if (result === OK) {
                                statsConsole.log(`Queued extension construction at ${pos}`, 6);
                                break;
                            } else {
                                statsConsole.log(`Failed to queue extension construction at ${pos} with error ${result}`, 6);
                            }
                        }
                    }
                }
            }
        }
    }
};

module.exports = spawnManager;
