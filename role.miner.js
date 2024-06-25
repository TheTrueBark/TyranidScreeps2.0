const statsConsole = require("statsConsole");

const roleMiner = {
    run: function(creep) {
        if (!creep.memory.mining) {
            creep.memory.mining = false;
        }

        if (!creep.memory.sourceId) {
            const sources = creep.room.find(FIND_SOURCES);
            let availableSource = null;
            for (const source of sources) {
                const minersAssigned = _.filter(Game.creeps, (c) => c.memory.role === 'miner' && c.memory.sourceId === source.id);
                if (minersAssigned.length < 2) { // Adjust this number based on how many miners you want per source
                    availableSource = source;
                    break;
                }
            }
            if (availableSource) {
                creep.memory.sourceId = availableSource.id;
                creep.memory.mining = true;
                statsConsole.log(`${creep.name} reserving source ${availableSource.id}`, 6);
            } else {
                statsConsole.log(`${creep.name} could not find an available source to reserve`, 6);
            }
        }

        if (creep.memory.mining && creep.memory.sourceId) {
            const source = Game.getObjectById(creep.memory.sourceId);
            if (source) {
                const harvestResult = creep.harvest(source);
                if (harvestResult === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                } else if (harvestResult === OK) {
                    statsConsole.log(`${creep.name} is mining at source ${creep.memory.sourceId}`, 6);
                } else {
                    statsConsole.log(`${creep.name} failed to mine at source ${creep.memory.sourceId} with error ${harvestResult}`, 6);
                }
            } else {
                statsConsole.log(`${creep.name} cannot find source with id ${creep.memory.sourceId}`, 6);
                creep.memory.sourceId = null; // Clear the invalid source ID
            }
        }

        if (!creep.memory.mining) {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType === STRUCTURE_SPAWN ||
                        structure.structureType === STRUCTURE_EXTENSION ||
                        structure.structureType === STRUCTURE_CONTAINER) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffffff' } });
                } else if (creep.transfer(targets[0], RESOURCE_ENERGY) === OK) {
                    creep.memory.mining = true; // Reset mining after delivering energy
                }
            } else {
                creep.moveTo(Game.spawns['Spawn1'], { visualizePathStyle: { stroke: '#ffffff' } });
            }
        }
    }
};

module.exports = roleMiner;
