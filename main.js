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
const memoryManager = require("manager.memory");
const hiveTravel = require("manager.hiveTravel");
const scheduler = require("scheduler");
const logger = require("./logger");
const htm = require("manager.htm");
const hivemind = require("manager.hivemind");

// HiveTravel installs travelTo on creeps

let myStats = [];
global.visualizeDT = false;

// Ensure persistent settings exist
if (!Memory.settings) Memory.settings = {};
if (Memory.settings.enableVisuals === undefined) {
  Memory.settings.enableVisuals = true;
}
if (Memory.settings.showTaskList === undefined) {
  Memory.settings.showTaskList = false;
}

global.visual = {
  DT: function (toggle) {
    if (toggle === 1) {
      visualizeDT = true;
      statsConsole.log("Distance Transform Visualization: ON", 2);
    } else if (toggle === 0) {
      visualizeDT = false;
      statsConsole.log("Distance Transform Visualization: OFF", 2);
    } else {
      statsConsole.log("Usage: visual.DT(1) to show, visual.DT(0) to hide", 3);
    }
  },
  overlay: function (toggle) {
    if (!Memory.settings) Memory.settings = {};
    if (toggle === 1) {
      Memory.settings.enableVisuals = true;
      statsConsole.log("HUD visuals: ON", 2);
    } else if (toggle === 0) {
      Memory.settings.enableVisuals = false;
      statsConsole.log("HUD visuals: OFF", 2);
    } else {
      statsConsole.log(
        "Usage: visual.overlay(1) to show, visual.overlay(0) to hide",
        3,
      );
    }
  },
};

global.debug = {
  toggle(module, state) {
    if (logger.toggle(module, state)) {
      statsConsole.log(
        `Debug for ${module} ${state ? "enabled" : "disabled"}`,
        2,
      );
    } else {
      statsConsole.log(`Module ${module} not found in debug configuration`, 3);
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
  const roleMap = {
    allPurpose: roleAllPurpose,
    upgrader: roleUpgrader,
    miner: roleMiner,
    builder: roleBuilder,
    hauler: roleHauler,
  };
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      const mem = Memory.creeps[name];
      const mod = roleMap[mem.role];
      if (mod && typeof mod.onDeath === 'function') {
        try {
          mod.onDeath({ name, memory: mem });
        } catch (e) {
          logger.log('memory', `onDeath error for ${name}: ${e}`, 4);
        }
      }
      logger.log('memory', `Clearing memory of dead creep: ${name}`, 2);
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

// Scheduled console drawing
scheduler.addTask(
  "consoleDisplay",
  5,
  () => {
    const start = Game.cpu.getUsed();
    console.log(statsConsole.displayHistogram());
    console.log(statsConsole.displayStats());
    console.log(statsConsole.displayLogs());
    const drawTime = Game.cpu.getUsed() - start;
    // Store draw time for displayStats instead of logging each tick
    if (!Memory.stats) Memory.stats = {};
    Memory.stats.consoleDrawTime = drawTime;
  },
  { minBucket: 1000 },
);

// Debug listing of scheduled tasks
scheduler.addTask(
  "showScheduled",
  50,
  () => {
    if (Memory.settings && Memory.settings.showTaskList) {
      scheduler.logTaskList();
    }
  },
  { minBucket: 0 },
);

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

  // drawing handled by scheduler
};
