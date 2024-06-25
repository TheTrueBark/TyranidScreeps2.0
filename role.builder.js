const statsConsole = require("statsConsole");

const roleBuilder = {
    run: function(creep) {
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            creep.say('🔄 collect');
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
            creep.say('🚧 build');
        }

        if (creep.memory.working) {
            const constructionSite = creep.room.find(FIND_CONSTRUCTION_SITES, {
                filter: (site) => site.structureType === STRUCTURE_EXTENSION
            })[0];

            if (constructionSite) {
                if (creep.build(constructionSite) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(constructionSite, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            } else {
                // Switch to upgrader role if no construction sites
                if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }
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
};

module.exports = roleBuilder;
