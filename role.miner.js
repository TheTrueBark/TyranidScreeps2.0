const roleMiner = {
    run: function(creep) {
        if (creep.memory.sourceId) {
            const source = Game.getObjectById(creep.memory.sourceId);

            if (source) {
                if (creep.pos.isNearTo(source)) {
                    creep.harvest(source);
                } else {
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            } else {
                console.log(`Miner ${creep.name} cannot find source with ID ${creep.memory.sourceId}`);
            }
        } else {
            console.log(`Miner ${creep.name} has no source assigned.`);
        }
    }
};

module.exports = roleMiner;
