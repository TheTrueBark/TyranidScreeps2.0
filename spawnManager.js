const statsConsole = require("statsConsole");

const spawnManager = {
    spawnAllPurposeCreeps: function(spawn) {
        const room = spawn.room;
        const creepsInRoom = _.filter(Game.creeps, creep => creep.room.name === room.name);

        if (creepsInRoom.length < 5) {
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
    }
};

module.exports = spawnManager;
