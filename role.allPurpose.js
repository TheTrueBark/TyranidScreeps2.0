const memoryManager = require("manager.memory");
const pathfinderManager = require("manager.pathfinder");
const debugConfig = require("console.debugLogs");

const roleAllPurpose = {
    run: function(creep) {
        if (!creep.memory.desiredPosition) {
            creep.memory.desiredPosition = {};
        }
        if (!creep.memory.sourcePosition) {
            creep.memory.sourcePosition = {};
        }

        // Determine if the creep should be working or collecting
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            creep.say('🔄 collect');
            if (debugConfig.roleAllPurpose) {
                console.log(`Creep ${creep.name} switching to collecting state.`);
            }
            memoryManager.releaseMiningPosition(creep);
            memoryManager.assignMiningPosition(creep);
            this.setSourcePosition(creep);
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
            creep.say('⚡ transfer');
            if (debugConfig.roleAllPurpose) {
                console.log(`Creep ${creep.name} switching to transferring state.`);
            }
            memoryManager.releaseMiningPosition(creep);
            delete creep.memory.miningPosition;
        }

        if (creep.memory.working) {
            this.performTransfer(creep);
        } else {
            this.performCollect(creep);
        }

        const nextPosition = pathfinderManager.calculateNextPosition(creep, creep.memory.desiredPosition);
        if (nextPosition) {
            creep.registerMove(nextPosition);
        }
    },

    setSourcePosition: function(creep) {
        const source = Game.getObjectById(creep.memory.source);
        if (source) {
            creep.memory.sourcePosition = {
                x: source.pos.x,
                y: source.pos.y,
                roomName: source.pos.roomName
            };
        }
    },

    performTransfer: function(creep) {
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: structure => (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN) && 
                                  structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });

        if (targets.length > 0) {
            if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.memory.desiredPosition = targets[0].pos;
            }
        } else {
            const target = creep.room.controller;
            if (creep.upgradeController(target) === ERR_NOT_IN_RANGE) {
                creep.memory.desiredPosition = target.pos;
            }
        }
    },

    performCollect: function(creep) {
        // Check for dropped energy first
        const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 50
        });
    
        if (droppedEnergy) {
            if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.memory.desiredPosition = droppedEnergy.pos;
                creep.registerMove(droppedEnergy.pos);
            }
            return;
        }
    
        // If no dropped energy, move to assigned mining position
        if (!creep.memory.miningPosition || !creep.memory.miningPosition.x) {
            if (!memoryManager.assignMiningPosition(creep)) {
                return;
            }
        }
    
        const miningPos = creep.memory.miningPosition;
        if (!creep.pos.isEqualTo(miningPos.x, miningPos.y)) {
            creep.memory.desiredPosition = new RoomPosition(miningPos.x, miningPos.y, miningPos.roomName);
            creep.registerMove(miningPos);
        } else {
            const sourcePos = creep.memory.sourcePosition;
            if (sourcePos && sourcePos.x !== undefined && sourcePos.y !== undefined && sourcePos.roomName) {
                const source = new RoomPosition(sourcePos.x, sourcePos.y, sourcePos.roomName).findClosestByRange(FIND_SOURCES);
                const harvestResult = creep.harvest(source);
                if (harvestResult === OK) {
                    if (debugConfig.roleAllPurpose) {
                        console.log(`Creep ${creep.name} harvesting from source at (${source.pos.x}, ${source.pos.y})`);
                    }
                } else if (harvestResult !== ERR_NOT_ENOUGH_RESOURCES && harvestResult !== ERR_NOT_IN_RANGE) {
                    if (debugConfig.roleAllPurpose) {
                        console.log(`Creep ${creep.name} failed to harvest source with result ${harvestResult}`);
                    }
                }
            } else {
                this.setSourcePosition(creep);
            }
        }
    },

    onDeath: function(creep) {
        memoryManager.releaseMiningPosition(creep);
    }
};

module.exports = roleAllPurpose;
