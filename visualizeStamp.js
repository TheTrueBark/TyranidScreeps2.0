const stampManager = require('stampManager');

module.exports.loop = function () {
    const roomName = 'W8N3'; // Replace with your room name
    const room = Game.rooms[roomName];
    
    if (!room.memory.spawnPos) {
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (spawn) {
            room.memory.spawnPos = { x: spawn.pos.x, y: spawn.pos.y };
        }
    }

    // Visualize the stamp with different rotations
    stampManager.visualizeStamp(room, room.controller.level, 0); // Default rotation
    stampManager.visualizeStamp(room, room.controller.level, 90); // 90° rotation
    stampManager.visualizeStamp(room, room.controller.level, 180); // 180° rotation
    stampManager.visualizeStamp(room, room.controller.level, 270); // 270° rotation

    // Save the stamp to memory (for future use)
    const initialStamp = stampManager.decodeStamp('...'); // Add your encoded stamp string here
    stampManager.saveStampToMemory(room, initialStamp);
};
