const statsConsole = require("console.console");
require("./RoomVisual");
const roomManager = require("manager.room");
const spawnManager = require("manager.spawn");
const buildingManager = require("manager.building");
const layoutPlanner = require('./layoutPlanner');
const roomPlanner = require("planner.room");
const roleUpgrader = require("role.upgrader");
const roleMiner = require("role.miner");
const roleBuilder = require("role.builder");
const roleHauler = require("role.hauler");
const roleRemoteMiner = require('./role.remoteMiner');
const roleReservist = require('./role.reservist');
const roleBaseDistributor = require('./role.baseDistributor');
const distanceTransform = require("algorithm.distanceTransform");
const hudManager = require("manager.hud");
const stampManager = require("manager.stamps");
const memoryManager = require("manager.memory");
const spawnQueue = require("manager.spawnQueue");
const hiveTravel = require("manager.hiveTravel");
const towerManager = require('./manager.towers');
const scheduler = require("scheduler");
const { ONCE } = require("scheduler");
const logger = require("./logger");
const introspect = require('./debug.introspection');
require('./taskDefinitions');
const htm = require("manager.htm");
const hivemind = require("manager.hivemind");
const lifecycle = require('./hiveMind.lifecycle');
const haulerLifecycle = require('./haulerLifecycle');
const movementUtils = require("./utils.movement");

const energyDemand = require("./manager.hivemind.demand");
const hiveRoles = require('./hive.roles');
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
if (Memory.settings.energyLogs === undefined) {
  Memory.settings.energyLogs = false;
}
if (Memory.settings.debugHiveGaze === undefined) {
  Memory.settings.debugHiveGaze = false;
}
if (Memory.settings.debugVisuals === undefined) {
  Memory.settings.debugVisuals = false;
}
if (Memory.settings.enableTowerRepairs === undefined) {
  Memory.settings.enableTowerRepairs = true;
}
if (Memory.settings.energyLogs) {
  logger.toggle('energyRequests', true);
  logger.toggle('demandManager', true);
} else {
  logger.toggle('energyRequests', false);
  logger.toggle('demandManager', false);
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
  showHTM() {
    introspect.printHTMTasks();
  },
  showSchedule() {
    introspect.printSchedulerJobs();
  },
  memoryStatus() {
    introspect.printMemoryStatus();
  },
  setSpawnLimit(room, role, amount = 'auto') {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room]) Memory.rooms[room] = {};
    if (!Memory.rooms[room].manualSpawnLimits)
      Memory.rooms[room].manualSpawnLimits = {};

    if (amount === 'auto') {
      delete Memory.rooms[room].manualSpawnLimits[role];
      statsConsole.log(
        `Manual spawn limit for ${role} in ${room} reset to auto`,
        2,
      );
    } else {
      Memory.rooms[room].manualSpawnLimits[role] = amount;
      statsConsole.log(
        `Manual spawn limit for ${role} in ${room} set to ${amount}`,
        2,
      );
    }
  },
};

const startFresh = require('./startFresh');
global.startFresh = startFresh;


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
); // @codex-owner main @codex-trigger once

scheduler.addTask("clearMemory", 100, () => {
  const roleMap = {
    upgrader: roleUpgrader,
    miner: roleMiner,
    builder: roleBuilder,
    hauler: roleHauler,
    remoteMiner: roleRemoteMiner,
    reservist: roleReservist,
  };
  let removed = false;
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
      energyDemand.cleanupCreep(name);
      delete Memory.creeps[name];
      if (Memory.htm && Memory.htm.creeps && Memory.htm.creeps[name]) {
        delete Memory.htm.creeps[name];
      }
      removed = true;
    }
  }
  if (removed) scheduler.triggerEvent('roleUpdate', {});
}); // @codex-owner main @codex-trigger {"type":"interval","interval":100}


scheduler.addTask("updateHUD", 1, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];

    // Distance Transform Calculation and Visualization
    if (visualizeDT) {
      const dist = distanceTransform.distanceTransform(room);
      distanceTransform.visualizeDistanceTransform(roomName, dist);
    }
  }
}); // @codex-owner main @codex-trigger {"type":"interval","interval":1}

// Initialize layout plan when a room is claimed
scheduler.addTask({
  name: 'layoutPlanningInit',
  type: ONCE,
  event: 'roomOwnershipEstablished',
  fn: (data) => layoutPlanner.plan(data.roomName),
});

// Ensure each owned room has a layout plan
scheduler.addTask('ensureLayoutPlan', 20, () => {
  for (const roomName in Game.rooms) {
    layoutPlanner.ensurePlan(roomName);
  }
}); // @codex-owner layoutPlanner @codex-trigger {"type":"interval","interval":20}

// Periodically populate dynamic layouts for owned rooms
scheduler.addTask('dynamicLayout', 100, () => {
  for (const roomName in Game.rooms) {
    layoutPlanner.populateDynamicLayout(roomName);
  }
}); // @codex-owner layoutPlanner @codex-trigger {"type":"interval","interval":100}

// Add on-demand building manager task
scheduler.addTask("buildInfrastructure", 0, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    buildingManager.buildInfrastructure(room);
  }
}); // @codex-owner buildingManager @codex-trigger {"type":"interval","interval":0}

// Lifecycle-based miner replacement
scheduler.addTask('predictMinerLifecycles', 25, () => {
  lifecycle.run();
}); // @codex-owner lifecyclePredictor @codex-trigger {"type":"interval","interval":25}

// Lifecycle-based hauler replacement
scheduler.addTask('predictHaulerLifecycle', 25, () => {
  haulerLifecycle.run();
}); // @codex-owner haulerLifecycle @codex-trigger {"type":"interval","interval":25}

// Periodic expansion vision check
scheduler.addTask('hiveGazeRefresh', 15000, () => {
  hivemind.evaluateExpansionVision();
}); // @codex-owner hiveGaze @codex-trigger {"type":"interval","interval":15000}

// Scout lifecycle management
scheduler.addTask('hiveGazeManageScouts', 10, () => {
  hivemind.manageScouts();
}); // @codex-owner hiveGaze @codex-trigger {"type":"interval","interval":10}

// Decision making layer feeding tasks into HTM
scheduler.addTask("hivemind", 1, () => {
  hivemind.run();
}); // @codex-owner hivemind @codex-trigger {"type":"interval","interval":1}

scheduler.addTask("energyDemand", 1000, () => {
  energyDemand.run();
}); // @codex-owner demand @codex-trigger {"type":"interval","interval":1000}

// React to creep deaths, spawns and construction updates
scheduler.addTask('roleUpdateEvent', 0, (data) => {
  if (data && data.room && Game.rooms[data.room]) {
    hiveRoles.evaluateRoom(Game.rooms[data.room]);
  } else {
    for (const rName in Game.rooms) {
      const r = Game.rooms[rName];
      if (r.controller && r.controller.my) hiveRoles.evaluateRoom(r);
    }
  }
}, { event: 'roleUpdate' }); // @codex-owner main @codex-trigger {"type":"event","eventName":"roleUpdate"}

// Fallback evaluation every 50 ticks when bucket high
scheduler.addTask('roleUpdateFallback', 50, () => {
  const last = Memory.roleEval ? Memory.roleEval.lastRun || 0 : 0;
  if (Game.cpu.bucket > 9800 && Game.time - last >= 50) {
    for (const rName in Game.rooms) {
      const r = Game.rooms[rName];
      if (r.controller && r.controller.my) hiveRoles.evaluateRoom(r);
    }
  }
}); // @codex-owner main @codex-trigger {"type":"interval","interval":50}
// Core HTM execution task
scheduler.addTask("htmRun", 1, () => {
  htm.run();
}); // @codex-owner htm @codex-trigger {"type":"interval","interval":1}

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
); // @codex-owner console.console @codex-trigger {"type":"interval","interval":5}

// Periodically purge console log counts to avoid memory bloat
scheduler.addTask('purgeLogs', 250, () => {
  memoryManager.purgeConsoleLogCounts();
}); // @codex-owner memoryManager @codex-trigger {"type":"interval","interval":250}

// Regularly validate mining reservations to free spots from dead creeps
scheduler.addTask('verifyMiningReservations', 10, () => {
  for (const roomName in Memory.rooms) {
    memoryManager.verifyMiningReservations(roomName);
  }
  // Also clean up legacy reservation entries
  memoryManager.cleanUpReservedPositions();
}); // @codex-owner memoryManager @codex-trigger {"type":"interval","interval":10}

// Periodically prune stale energy reservations and spawn requests
scheduler.addTask('cleanEnergyReserves', 50, () => {
  memoryManager.cleanUpEnergyReserves();
}); // @codex-owner memoryManager @codex-trigger {"type":"interval","interval":50}

scheduler.addTask('pruneSpawnQueue', 50, () => {
  spawnQueue.cleanUp();
}); // @codex-owner spawnQueue @codex-trigger {"type":"interval","interval":50}

scheduler.addTask('runTowers', 3, () => {
  towerManager.run();
}, { highPriority: true, minBucket: 5000 }); // @codex-owner towers @codex-trigger {"type":"interval","interval":3}

scheduler.addTask('checkStorageAndSpawnBaseDistributor', 25, () => {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    spawnManager.checkStorageAndSpawnBaseDistributor(room);
  }
}); // @codex-owner baseDistributor @codex-trigger {"type":"interval","interval":25}

// Cleanup stale HTM creep containers
scheduler.addTask('htmCleanup', 50, () => {
  htm.cleanupDeadCreeps();
}); // @codex-owner htm @codex-trigger {"type":"interval","interval":50}

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
); // @codex-owner scheduler @codex-trigger {"type":"interval","interval":50}

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

    if (creep.memory.role === "upgrader") {
      roleUpgrader.run(creep);
    } else if (creep.memory.role === "miner") {
      roleMiner.run(creep);
    } else if (creep.memory.role === "builder") {
      roleBuilder.run(creep);
    } else if (creep.memory.role === "hauler") {
      roleHauler.run(creep);
    } else if (creep.memory.role === 'baseDistributor') {
      roleBaseDistributor.run(creep);
    } else if (creep.memory.role === 'remoteMiner') {
      roleRemoteMiner.run(creep);
    } else if (creep.memory.role === 'reservist') {
      roleReservist.run(creep);
    }

    CreepsCPUUsage += Game.cpu.getUsed() - creepStartCPU;
  }

  // Ensure creeps vacate restricted spawn areas after running role logic
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    movementUtils.avoidSpawnArea(creep);
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
