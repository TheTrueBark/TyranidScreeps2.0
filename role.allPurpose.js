const statsConsole = require("console.console");
const memoryManager = require("manager.memory");

const roleAllPurpose = {
    run: function(creep) {
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            creep.say('🔄 collect');
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
            creep.say('⚡ transfer');
        }
    
        const pos = creep.memory.miningPosition;
        if (!pos) {
            memoryManager.assignMiningPosition(creep);
        }
    
        if (creep.memory.working) {
            // Prioritize filling extensions, then spawn
            const extensions = creep.room.find(FIND_STRUCTURES, {
                filter: structure => structure.structureType === STRUCTURE_EXTENSION && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
    
            const spawn = creep.room.find(FIND_MY_SPAWNS, {
                filter: structure => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            })[0];
    
            if (extensions.length > 0) {
                if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.registerMove(extensions[0].pos);
                }
            } else if (spawn) {
                if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.registerMove(spawn.pos);
                }
            } else if (creep.room.controller.level >= 2) {
                const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
                if (constructionSites.length > 0) {
                    if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE) {
                        creep.registerMove(constructionSites[0].pos);
                    }
                } else {
                    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                        creep.registerMove(creep.room.controller.pos);
                    }
                }
            }
        } else {
            const source = Game.getObjectById(creep.memory.source);
            if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
                const target = new RoomPosition(pos.x, pos.y, creep.room.name);
                creep.registerMove(target);
            }
        }
    },

    onDeath: function(creep) {
        memoryManager.releaseMiningPosition(creep);
    }
};

module.exports = roleAllPurpose;
