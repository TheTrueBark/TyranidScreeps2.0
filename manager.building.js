const roomPlanner = require("planner.room");
const statsConsole = require("console.console");

const buildingManager = {
    cacheBuildableAreas: function(room) {
        const sources = room.find(FIND_SOURCES);
        const buildableAreas = {};

        for (const source of sources) {
            const positions = roomPlanner.findMiningPositions(room)[source.id];
            buildableAreas[source.id] = positions;
        }

        room.memory.buildableAreas = buildableAreas;
        room.memory.lastCacheUpdate = Game.time;
    },

    shouldUpdateCache: function(room) {
        if (!room.memory.buildableAreas) {
            return true; // Initial cache creation
        }

        const lastCacheUpdate = room.memory.lastCacheUpdate || 0;
        const ticksSinceLastUpdate = Game.time - lastCacheUpdate;
        const controllerLevel = room.controller.level;
        const lastControllerLevel = room.memory.lastControllerLevel || 0;

        // Update if controller level changed or if it's been more than 1000 ticks
        if (controllerLevel !== lastControllerLevel || ticksSinceLastUpdate > 1000) {
            room.memory.lastControllerLevel = controllerLevel;
            return true;
        }

        return false;
    },

    buildInfrastructure: function(room) {
        if (this.shouldUpdateCache(room)) {
            this.cacheBuildableAreas(room);
            statsConsole.log(`Recalculated buildable areas for room ${room.name}`, 6);
        }

        if (room.controller.level >= 2) {
            const sources = room.find(FIND_SOURCES);
            for (const source of sources) {
                const positions = room.memory.buildableAreas[source.id];
                if (positions.length > 0) {
                    const containerPos = new RoomPosition(positions[0].x, positions[0].y, room.name); // Ensure it's a RoomPosition object
                    const containerSite = containerPos.lookFor(LOOK_CONSTRUCTION_SITES).filter(site => site.structureType === STRUCTURE_CONTAINER);
                    const containerStructure = containerPos.lookFor(LOOK_STRUCTURES).filter(struct => struct.structureType === STRUCTURE_CONTAINER);
                    if (containerSite.length === 0 && containerStructure.length === 0) {
                        room.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
                        statsConsole.log(`Queued container construction at ${containerPos}`, 6);
                    }
                }
            }

            const spawn = room.find(FIND_MY_SPAWNS)[0];
            if (spawn) {
                const extensionSites = room.find(FIND_CONSTRUCTION_SITES, {
                    filter: (site) => site.structureType === STRUCTURE_EXTENSION
                });

                const extensions = room.find(FIND_MY_STRUCTURES, {
                    filter: (structure) => structure.structureType === STRUCTURE_EXTENSION
                });

                if (extensions.length + extensionSites.length < 5) {
                    const positions = [
                        { x: -2, y: -2 },
                        { x: -2, y: 2 },
                        { x: 2, y: -2 },
                        { x: 2, y: 2 },
                        { x: -3, y: 0 },
                        { x: 3, y: 0 },
                        { x: 0, y: -3 },
                        { x: 0, y: 3 }
                    ];

                    for (let i = 0; i < positions.length; i++) {
                        const pos = new RoomPosition(spawn.pos.x + positions[i].x, spawn.pos.y + positions[i].y, room.name);
                        const structuresAtPos = pos.lookFor(LOOK_STRUCTURES);
                        const constructionSitesAtPos = pos.lookFor(LOOK_CONSTRUCTION_SITES);

                        if (structuresAtPos.length === 0 && constructionSitesAtPos.length === 0) {
                            const result = pos.createConstructionSite(STRUCTURE_EXTENSION);
                            if (result === OK) {
                                statsConsole.log(`Queued extension construction at ${pos}`, 6);
                                break;
                            } else {
                                statsConsole.log(`Failed to queue extension construction at ${pos} with error ${result}`, 6);
                            }
                        }
                    }
                }
            }
        }
    }
};

module.exports = buildingManager;
