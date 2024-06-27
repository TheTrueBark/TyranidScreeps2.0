const debugConfig = require("console.debugLogs");

const roleMiner = {
    run: function(creep) {
        if (creep.memory.sourceId) {
            const source = Game.getObjectById(creep.memory.sourceId);

            if (source) {
                if (debugConfig.roleMiner) {
                    console.log(`Miner ${creep.name} found source with ID ${creep.memory.sourceId}`);
                }

                if (creep.pos.isNearTo(source)) {
                    if (debugConfig.roleMiner) {
                        console.log(`Miner ${creep.name} is near the source and is harvesting.`);
                    }
                    creep.harvest(source);
                } else {
                    if (debugConfig.roleMiner) {
                        console.log(`Miner ${creep.name} is moving towards the source.`);
                    }
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            } else {
                if (debugConfig.roleMiner) {
                    console.log(`Miner ${creep.name} cannot find source with ID ${creep.memory.sourceId}`);
                }
            }
        } else {
            if (debugConfig.roleMiner) {
                console.log(`Miner ${creep.name} has no source assigned.`);
            }
        }
    }
};

module.exports = roleMiner;
