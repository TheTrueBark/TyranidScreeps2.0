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
const scheduler = require("scheduler");
const logger = require("./logger");
const htm = require("manager.htm");
const hivemind = require("manager.hivemind");

// Initialize the traffic manager
trafficManager.init();

let myStats = [];
global.visualizeDT = false;

global.visual = {
  DT: function (toggle) {
    if (toggle === 1) {
      visualizeDT = true;
      console.log("Distance Transform Visualization: ON");
    } else if (toggle === 0) {
      visualizeDT = false;
      console.log("Distance Transform Visualization: OFF");
    } else {
      console.log("Usage: visual.DT(1) to show, visual.DT(0) to hide");
    }
  },
};

global.debug = {
  toggle(module, state) {
    if (logger.toggle(module, state)) {
      console.log(`Debug for ${module} ${state ? "enabled" : "disabled"}`);
    } else {
      console.log(`Module ${module} not found in debug configuration`);
    }
  },
  config: logger.getConfig,
};

// High priority initialization tasks - run once at start of tick 0
scheduler.addTask(
  "initializeRoomMemory",
  0,
  () => {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      memoryManager.initializeRoomMemory(room);
      // Ensure hierarchical memory structure is prepared
      memoryManager.initializeHiveMemory(room.name, room.name);
    }
  },
  { highPriority: true, once: true },
);

scheduler.addTask("clearMemory", 100, () => {
  for (let name in Memory.creeps) {
    if (!Game.creeps[name]) {
      logger.log("memory", `Clearing memory of dead creep: ${name}`, 2);
      delete Memory.creeps[name];
    }
  }
});

scheduler.addTask("updateHUD", 5, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];

    // Distance Transform Calculation and Visualization
    if (visualizeDT) {
      const dist = distanceTransform.distanceTransform(room);
      distanceTransform.visualizeDistanceTransform(roomName, dist);
    }
  }
});

scheduler.addTask("pathfinderCache", 200, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    pathfinderManager.updateCache(room);
  }
});

// Add on-demand building manager task
scheduler.addTask("buildInfrastructure", 0, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    buildingManager.buildInfrastructure(room);
  }
});

// Decision making layer feeding tasks into HTM
scheduler.addTask("hivemind", 1, () => {
  hivemind.run();
});

// Core HTM execution task
scheduler.addTask("htmRun", 1, () => {
  htm.run();
});

module.exports.loop = function () {
  const startCPU = Game.cpu.getUsed();

  scheduler.run();

  const initCPUUsage = Game.cpu.getUsed() - startCPU;
  const totalCPUUsage = initCPUUsage;

  // Initialize CPU usage variables
  let CreepsCPUUsage = 0;
  let CreepManagersCPUUsage = 0;
  let towersCPUUsage = 0;
  let linksCPUUsage = 0;
  let SetupRolesCPUUsage = 0;
  let statsCPUUsage = 0;

  // Run room managers
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    spawnManager.run(room);
    roomManager.scanRoom(room);
  }

  const roomManagersCPUUsage = Game.cpu.getUsed() - totalCPUUsage;
  CreepManagersCPUUsage = roomManagersCPUUsage;

  // Run creep roles
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const creepStartCPU = Game.cpu.getUsed();

    if (creep.memory.role === "allPurpose") {
      roleAllPurpose.run(creep);
    } else if (creep.memory.role === "upgrader") {
      roleUpgrader.run(creep);
    } else if (creep.memory.role === "miner") {
      roleMiner.run(creep);
    } else if (creep.memory.role === "builder") {
      roleBuilder.run(creep);
    } else if (creep.memory.role === "hauler") {
      roleHauler.run(creep);
    }

    CreepsCPUUsage += Game.cpu.getUsed() - creepStartCPU;
  }

  // Run late tick management
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    hudManager.createHUD(room);
    trafficManager.run(room);
  }

  const lateTickCPUUsage =
    Game.cpu.getUsed() -
    (totalCPUUsage + CreepManagersCPUUsage + CreepsCPUUsage);
  towersCPUUsage = lateTickCPUUsage;
  linksCPUUsage = lateTickCPUUsage;
  SetupRolesCPUUsage = lateTickCPUUsage;
  statsCPUUsage = lateTickCPUUsage;

  myStats = [
    ["Creep Managers", CreepManagersCPUUsage],
    ["Towers", towersCPUUsage],
    ["Links", linksCPUUsage],
    ["Setup Roles", SetupRolesCPUUsage],
    ["Creeps", CreepsCPUUsage],
    ["Init", initCPUUsage],
    ["Stats", statsCPUUsage],
    ["Total", totalCPUUsage],
  ];

  statsConsole.run(myStats);

  if (totalCPUUsage > Game.cpu.limit) {
    statsConsole.log(
      "Tick: " +
        Game.time +
        "  CPU OVERRUN: " +
        Game.cpu.getUsed().toFixed(2) +
        "  Bucket:" +
        Game.cpu.bucket,
      5,
    );
  }

  if (Game.time % 5 === 0) {
    console.log(statsConsole.displayHistogram());
    console.log(statsConsole.displayStats());
    console.log(statsConsole.displayLogs());
    let drawTime = Game.cpu.getUsed() - totalCPUUsage;
    console.log("Time to Draw: " + drawTime.toFixed(2));
  }
};
