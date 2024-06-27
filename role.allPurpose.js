const statsConsole = require("console.console");
const memoryManager = require("manager.memory");
const pathfinderManager = require("manager.pathfinder");
const debugConfig = require("console.debugLogs");

const roleAllPurpose = {
    run: function(creep) {
        if (!creep.memory.desiredPosition) {
            creep.memory.desiredPosition = {};
        }
        if (!creep.memory.miningPosition) {
            creep.memory.miningPosition = {};
        }

        // Determine if the creep should be working or collecting
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            creep.say('🔄 collect');
            memoryManager.assignMiningPosition(creep);
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
            creep.say('⚡ transfer');
            memoryManager.releaseMiningPosition(creep);
        }

        // Action based on state
        if (creep.memory.working) {
            // Transferring state
            const extensions = creep.room.find(FIND_STRUCTURES, {
                filter: structure => structure.structureType === STRUCTURE_EXTENSION && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            const spawns = creep.room.find(FIND_MY_SPAWNS, {
                filter: structure => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (extensions.length > 0) {
                if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.memory.desiredPosition = extensions[0].pos;
                }
            } else if (spawns.length > 0) {
                if (creep.transfer(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.memory.desiredPosition = spawns[0].pos;
                }
            } else {
                const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
                if (constructionSites.length > 0) {
                    if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE) {
                        creep.memory.desiredPosition = constructionSites[0].pos;
                    }
                } else {
                    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                        creep.memory.desiredPosition = creep.room.controller.pos;
                        creep.setWorkingArea(creep.room.controller.pos, 3);
                    }
                }
            }
        } else {
            // Collecting state
            const source = Game.getObjectById(creep.memory.source);
            if (source) {
                const pos = creep.memory.miningPosition;
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.memory.desiredPosition = new RoomPosition(pos.x, pos.y, creep.room.name);
                }
            } else {
                memoryManager.assignMiningPosition(creep);
            }
        }

        if (debugConfig.roleAllPurpose) {
            console.log(`Creep ${creep.name} desired position: ${JSON.stringify(creep.memory.desiredPosition)}`);
        }

        const nextPosition = pathfinderManager.calculateNextPosition(creep, creep.memory.desiredPosition);
        if (nextPosition) {
            if (debugConfig.roleAllPurpose) {
                console.log(`Movement ${creep.name} to position (${nextPosition.x}, ${nextPosition.y})`);
            }
            creep.registerMove(nextPosition);
        } else {
            if (debugConfig.roleAllPurpose) {
                console.log(`Creep ${creep.name} has no valid next position`);
            }
        }
    },

    onDeath: function(creep) {
        memoryManager.releaseMiningPosition(creep);
    }
};

module.exports = roleAllPurpose;
