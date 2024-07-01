const statsConsole = require("console.console");
const roomManager = require("manager.room");
const spawnManager = require("manager.spawn");
const buildingManager = require("manager.building");
const roomPlanner = require("planner.room");
const roleAllPurpose = require("role.allPurpose");
const roleUpgrader = require("role.upgrader");
const roleMiner = require("role.miner");
const roleBuilder = require("role.builder");
const roleHauler = require("role.hauler");
const distanceTransform = require("algorithm.distanceTransform");
const hudManager = require("manager.hud");
const stampManager = require("manager.stamps");
const trafficManager = require("manager.traffic");
const memoryManager = require("manager.memory");
const pathfinderManager = require("manager.pathfinder");

// Import scheduler
const scheduler = require('scheduler');

// Initialize the traffic manager
trafficManager.init();

let myStats = [];
global.visualizeDT = false;

global.visual = {
    DT: function(toggle) {
        if (toggle === 1) {
            visualizeDT = true;
            console.log("Distance Transform Visualization: ON");
        } else if (toggle === 0) {
            visualizeDT = false;
            console.log("Distance Transform Visualization: OFF");
        } else {
            console.log("Usage: visual.DT(1) to show, visual.DT(0) to hide");
        }
    }
};

// Add high priority one-time tasks
scheduler.addTask('initializeRoomMemory', 600, () => {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        memoryManager.initializeRoomMemory(room);
    }
}, true);

scheduler.addTask('clearMemory', 100, () => {
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            console.log(`Clearing memory of dead creep: ${name}`);
            delete Memory.creeps[name];
        }
    }
});

scheduler.addTask('updateHUD', 5, () => {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        // Distance Transform Calculation and Visualization
        if (visualizeDT) {
            const dist = distanceTransform.distanceTransform(room);
            distanceTransform.visualizeDistanceTransform(roomName, dist);
        }
    }
});

scheduler.addTask('pathfinderCache', 200, () => {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        pathfinderManager.updateCache(room);
    }
});

// Add on-demand building manager task
scheduler.addTask('buildInfrastructure', 0, () => {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        buildingManager.buildInfrastructure(room);
    }
});

module.exports.loop = function () {
    scheduler.run();

    // Run stats console
    let totalCPUUsage = Game.cpu.getUsed();
    let initCPUUsage = 0;
    let CreepManagersCPUUsage = 0;
    let towersCPUUsage = 0;
    let linksCPUUsage = 0;
    let SetupRolesCPUUsage = 0;
    let CreepsCPUUsage = 0;
    let statsCPUUsage = 0;

    myStats = [
        ["Creep Managers", CreepManagersCPUUsage],
        ["Towers", towersCPUUsage],
        ["Links", linksCPUUsage],
        ["Setup Roles", SetupRolesCPUUsage],
        ["Creeps", CreepsCPUUsage],
        ["Init", initCPUUsage],
        ["Stats", statsCPUUsage],
        ["Total", totalCPUUsage]
    ];

    statsConsole.run(myStats);

    if (totalCPUUsage > Game.cpu.limit) {
        statsConsole.log("Tick: " + Game.time + "  CPU OVERRUN: " + Game.cpu.getUsed().toFixed(2) + "  Bucket:" + Game.cpu.bucket, 5);
    }

    if (Game.time % 5 === 0) {
        console.log(statsConsole.displayHistogram());
        console.log(statsConsole.displayStats());
        console.log(statsConsole.displayLogs());
        let drawTime = Game.cpu.getUsed() - totalCPUUsage;
        console.log("Time to Draw: " + drawTime.toFixed(2));
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        spawnManager.run(room);

        // Other room-related logic...
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role === 'allPurpose') {
            roleAllPurpose.run(creep);
        } else if (creep.memory.role === 'upgrader') {
            roleUpgrader.run(creep);
        } else if (creep.memory.role === 'miner') {
            roleMiner.run(creep);
        } else if (creep.memory.role === 'builder') {
            roleBuilder.run(creep);
        } else if (creep.memory.role === 'hauler') {
            roleHauler.run(creep);
        }
    }

    // Combined room manager
    if (Game.time % 10 === 0) {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            roomManager.scanRoom(room);
        }
    }

    // Late tick management
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        // Create HUD
        hudManager.createHUD(room);

        // Run Traffic Management
        trafficManager.run(room);
    }
};
