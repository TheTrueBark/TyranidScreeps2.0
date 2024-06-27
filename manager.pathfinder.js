const debugConfig = require("console.debugLogs");

const managerPathfinder = {
    calculateNextPosition(creep, targetPos, costs) {
        if (!targetPos || targetPos.x === undefined || targetPos.y === undefined) {
            if (debugConfig.pathfinder) {
                console.log(`Invalid targetPos for creep ${creep.name}: ${JSON.stringify(targetPos)}`);
            }
            return null;
        }

        if (debugConfig.pathfinder) {
            console.log(`Creep ${creep.name} pathfinding from (${creep.pos.x}, ${creep.pos.y}) in room ${creep.room.name} to (${targetPos.x}, ${targetPos.y}) in room ${targetPos.roomName}`);
        }

        // Validate room name
        if (!Game.rooms[targetPos.roomName]) {
            if (debugConfig.pathfinder) {
                console.log(`Invalid room name: ${targetPos.roomName}`);
            }
            return null;
        }

        const rangeToTarget = creep.pos.getRangeTo(targetPos);
        if (rangeToTarget === 1) {
            if (debugConfig.pathfinder) {
                console.log(`Creep ${creep.name} is already within range 1 of the target position (${targetPos.x}, ${targetPos.y})`);
            }
            return { x: targetPos.x, y: targetPos.y };
        }

        const path = PathFinder.search(
            creep.pos, { pos: targetPos, range: 1 },
            {
                roomCallback: roomName => {
                    let costMatrix = new PathFinder.CostMatrix();
                    const room = Game.rooms[roomName];

                    if (!room) return costMatrix;

                    // Set costs for non-walkable construction sites
                    room.find(FIND_CONSTRUCTION_SITES).forEach(site => {
                        if (site.structureType !== STRUCTURE_ROAD &&
                            site.structureType !== STRUCTURE_CONTAINER &&
                            site.structureType !== STRUCTURE_RAMPART) {
                            costMatrix.set(site.pos.x, site.pos.y, 255);
                        }
                    });

                    // Set costs for non-walkable structures
                    room.find(FIND_STRUCTURES).forEach(structure => {
                        if (structure.structureType !== STRUCTURE_ROAD &&
                            structure.structureType !== STRUCTURE_CONTAINER &&
                            (structure.structureType !== STRUCTURE_RAMPART || !structure.my)) {
                            costMatrix.set(structure.pos.x, structure.pos.y, 255);
                        }
                    });

                    if (costs) {
                        for (let i = 0; i < 50; i++) {
                            for (let j = 0; j < 50; j++) {
                                costMatrix.set(i, j, costs.get(i, j));
                            }
                        }
                    }
                    return costMatrix;
                },
                plainCost: 2,
                swampCost: 10,
                maxOps: 5000,
                maxRooms: 1,
                heuristicWeight: 1.0
            }
        );

        if (path.incomplete) {
            if (debugConfig.pathfinder) {
                console.log(`Path incomplete for creep ${creep.name}, path: ${JSON.stringify(path.path)}`);
            }
            return null;
        } else {
            for (let i = 0; i < path.path.length; i++) {
                const nextPos = path.path[i];
                const range = creep.pos.getRangeTo(nextPos);
                if (debugConfig.pathfinder) {
                    console.log(`Creep ${creep.name} checking position (${nextPos.x}, ${nextPos.y}), range: ${range}`);
                }
                if (range === 1) {
                    return { x: nextPos.x, y: nextPos.y };
                }
            }
            if (debugConfig.pathfinder) {
                console.log(`No valid next step found in path for creep ${creep.name}`);
            }
            return null;
        }
    }
};

module.exports = managerPathfinder;
