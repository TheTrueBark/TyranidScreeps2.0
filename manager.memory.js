const memoryManager = {
    initializeRoomMemory(room) {
        if (!Memory.rooms) {
            Memory.rooms = {};
        }
        if (!Memory.rooms[room.name]) {
            Memory.rooms[room.name] = {};
        }
        const roomMemory = Memory.rooms[room.name];

        const sources = room.find(FIND_SOURCES);
        roomMemory.sources = sources.map(source => ({
            id: source.id,
            pos: source.pos
        }));

        roomMemory.miningPositions = {};

        let totalAvailablePositions = 0;
        for (const source of sources) {
            const availablePositions = this.calculateAvailablePositions(source);
            roomMemory.miningPositions[source.id] = availablePositions;
            totalAvailablePositions += availablePositions.length;
        }

        roomMemory.totalAvailableMiningPositions = totalAvailablePositions;
    },

    calculateAvailablePositions(source) {
        const positions = [];
        const terrain = new Room.Terrain(source.room.name);

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                if (x === 0 && y === 0) continue;

                const posX = source.pos.x + x;
                const posY = source.pos.y + y;

                if (terrain.get(posX, posY) !== TERRAIN_MASK_WALL) {
                    positions.push(new RoomPosition(posX, posY, source.room.name));
                }
            }
        }

        return positions;
    },

    assignMiningPosition(creep) {
        if (!creep.memory.source) {
            const sources = Memory.rooms[creep.room.name].sources;
            if (sources && sources.length > 0) {
                const source = sources[0];
                creep.memory.source = source.id;
            }
        }

        const source = Game.getObjectById(creep.memory.source);
        if (source) {
            const availablePositions = Memory.rooms[creep.room.name].miningPositions[source.id];
            for (const pos of availablePositions) {
                const key = `${creep.room.name}_${pos.x},${pos.y}`;
                if (!Memory.reservedPositions) Memory.reservedPositions = {};
                if (!Memory.reservedPositions[key]) {
                    Memory.reservedPositions[key] = creep.name;
                    creep.memory.miningPosition = { x: pos.x, y: pos.y };
                    creep.memory.desiredPosition = { x: pos.x, y: pos.y };
                    break;
                }
            }
        }
    },

    releaseMiningPosition(creep) {
        const pos = creep.memory.miningPosition;
        if (pos) {
            const key = `${creep.room.name}_${pos.x},${pos.y}`;
            if (Memory.reservedPositions[key] === creep.name) {
                delete Memory.reservedPositions[key];
            }
        }
    },

    cleanUpReservedPositions() {
        if (!Memory.reservedPositions) return;

        for (const key in Memory.reservedPositions) {
            const creepName = Memory.reservedPositions[key];
            if (!Game.creeps[creepName]) {
                delete Memory.reservedPositions[key];
            }
        }
    }
};

module.exports = memoryManager;
