const roleBuilder = {
    run: function(creep) {
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            creep.say('🔄 collect');
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
            creep.say('⚡ build/repair');
        }

        if (creep.memory.working) {
            const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (constructionSites.length > 0) {
                if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(constructionSites[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else {
                const structuresNeedingRepair = creep.room.find(FIND_STRUCTURES, {
                    filter: object => object.hits < object.hitsMax
                });

                structuresNeedingRepair.sort((a, b) => a.hits - b.hits);

                if (structuresNeedingRepair.length > 0) {
                    if (creep.repair(structuresNeedingRepair[0]) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(structuresNeedingRepair[0], { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                } else {
                    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                    }
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
                const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
                if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            }
        }
    }
};

module.exports = roleBuilder;
