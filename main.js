const statsConsole = require("statsConsole");
const roomManager = require("roomManager");
const spawnManager = require("spawnManager");
const buildingManager = require("buildingManager");
const roomPlanner = require("roomPlanner");
const roleAllPurpose = require("role.allPurpose");
const roleUpgrader = require("role.upgrader");
const roleMiner = require("role.miner");
const roleBuilder = require("role.builder");
const roleHauler = require("role.hauler");
const distanceTransform = require("distanceTransform");
const hudManager = require("hudManager");
const stampManager = require("stampManager");

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

function cleanMemory() {
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            console.log(`Clearing memory of dead creep: ${name}`);
            delete Memory.creeps[name];
        }
    }
}

module.exports.loop = function () {
    cleanMemory(); // Call the clean memory function at the beginning of the loop

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
        roomManager.scanRoom(room);
        buildingManager.buildInfrastructure(room);

        // Distance Transform Calculation and Visualization
        if (visualizeDT) {
            const dist = distanceTransform.distanceTransform(room);
            distanceTransform.visualizeDistanceTransform(roomName, dist);
        }

        // Create HUD
        hudManager.createHUD(room);

    }

    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];
        spawnManager.spawnAllPurposeCreeps(spawn);
        spawnManager.spawnMinerCreeps(spawn);
        spawnManager.spawnHaulerCreeps(spawn);
        spawnManager.spawnBuilderCreeps(spawn);
        spawnManager.spawnUpgraderCreeps(spawn);
        spawnManager.planNextMiner(spawn);
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
};
