const roomManager = {
    scanRoom: function(room) {
        if (!Memory.rooms) {
            Memory.rooms = {};
        }
        if (!Memory.rooms[room.name]) {
            Memory.rooms[room.name] = {};
        }

        const sources = room.find(FIND_SOURCES);
        Memory.rooms[room.name].sources = sources.map(source => ({
            id: source.id,
            pos: source.pos,
            reservedBy: null
        }));
    }
};

module.exports = roomManager;
