const roomPlanner = require("roomPlanner");
const statsConsole = require("statsConsole");

const buildingManager = {
    buildInfrastructure: function(room) {
        if (room.controller.level >= 2) {
            const sources = room.find(FIND_SOURCES);
            for (const source of sources) {
                const positions = roomPlanner.findMiningPositions(room)[source.id];
                if (positions.length > 0) {
                    const containerPos = positions[0]; // Nearest position to the source
                    const containerSite = containerPos.lookFor(LOOK_CONSTRUCTION_SITES).filter(site => site.structureType === STRUCTURE_CONTAINER);
                    if (containerSite.length === 0) {
                        containerPos.createConstructionSite(STRUCTURE_CONTAINER);
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
