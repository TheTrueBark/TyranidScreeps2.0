const statsConsole = require("statsConsole");

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

        const miners = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner');

        if (creep.memory.working) {
            // Prioritize filling extensions first, then the spawn
            const extensions = creep.room.find(FIND_STRUCTURES, {
                filter: structure => structure.structureType === STRUCTURE_EXTENSION && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            const spawn = creep.room.find(FIND_MY_SPAWNS, {
                filter: structure => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            })[0];

            if (extensions.length > 0) {
                if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(extensions[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else if (spawn) {
                if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(spawn, { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else if (creep.room.controller.level >= 2) {
                const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
                if (constructionSites.length > 0) {
                    if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(constructionSites[0], { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                } else {
                    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                }
            } else {
                if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                }
            }
        } else {
            if (miners.length === 0) {
                // No miners available, so all-purpose creeps should mine
                const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
                if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            } else {
                const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                    filter: (resource) => resource.resourceType === RESOURCE_ENERGY
                });
                const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: (structure) => structure.structureType === STRUCTURE_CONTAINER && 
                        structure.store[RESOURCE_ENERGY] > 0
                });

                if (droppedEnergy) {
                    const highestEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
                        filter: (resource) => resource.resourceType === RESOURCE_ENERGY
                    }).sort((a, b) => b.amount - a.amount)[0];

                    if (creep.pickup(highestEnergy) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(highestEnergy, { visualizePathStyle: { stroke: '#ffaa00' } });
                    }
                } else if (container) {
                    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(container, { visualizePathStyle: { stroke: '#ffaa00' } });
                    }
                } else {
                    const miners = _.filter(Game.creeps, (c) => c.memory.role === 'miner');
                    if (miners.length > 0) {
                        const miner = creep.pos.findClosestByPath(miners);
                        if (miner) {
                            if (creep.pos.getRangeTo(miner) > 1) {
                                creep.moveTo(miner, { visualizePathStyle: { stroke: '#ffaa00' } });
                            }
                        }
                    }
                }
            }
        }
    }
};

module.exports = roleAllPurpose;
