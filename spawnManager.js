const statsConsole = require("statsConsole");

const spawnManager = {
    spawnAllPurposeCreeps: function(spawn) {
        const room = spawn.room;
        const creepsInRoom = _.filter(Game.creeps, creep => creep.room.name === room.name);

        if (creepsInRoom.length < 5) {
            const newName = 'AllPurpose' + Game.time;
            const result = spawn.spawnCreep([WORK, CARRY, MOVE, MOVE], newName, {memory: {role: 'allPurpose'}});
            if (result === OK) {
                statsConsole.log("Spawning new all-purpose creep: " + newName, 6);
            }
        }
    }
};

module.exports = spawnManager;
