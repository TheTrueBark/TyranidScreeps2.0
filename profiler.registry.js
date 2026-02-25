'use strict';

const MODULES = [
  { path: './algorithm.checkerboard', label: 'algorithm.checkerboard' },
  { path: './algorithm.distanceTransform', label: 'algorithm.distanceTransform' },
  { path: './algorithm.floodFill', label: 'algorithm.floodFill' },
  { path: './algorithm.minCut', label: 'algorithm.minCut' },
  { path: './console.ascii-chart', label: 'console.ascii-chart' },
  { path: './console.console', label: 'console.console' },
  { path: './console.debugLogs', label: 'console.debugLogs' },
  { path: './console.geohash', label: 'console.geohash' },
  { path: './constructionBlocker', label: 'constructionBlocker' },
  { path: './creep.lifecycle', label: 'creep.lifecycle' },
  { path: './debug.incident', label: 'debug.incident' },
  { path: './debug.introspection', label: 'debug.introspection' },
  { path: './debug.savestate', label: 'debug.savestate' },
  { path: './haulerLifecycle', label: 'haulerLifecycle' },
  { path: './hive.roles', label: 'hive.roles' },
  { path: './hiveMind.lifecycle', label: 'hiveMind.lifecycle' },
  { path: './layoutPlanner', label: 'layoutPlanner' },
  { path: './layoutVisualizer', label: 'layoutVisualizer' },
  { path: './logger', label: 'logger' },
  { path: './manager.basePlanValidation', label: 'manager.basePlanValidation' },
  { path: './manager.building', label: 'manager.building' },
  { path: './manager.demand', label: 'manager.demand' },
  { path: './manager.dna', label: 'manager.dna' },
  { path: './manager.energyRequests', label: 'manager.energyRequests' },
  { path: './manager.hiveGaze', label: 'manager.hiveGaze' },
  { path: './manager.hiveTravel', label: 'manager.hiveTravel' },
  { path: './manager.hivemind', label: 'manager.hivemind' },
  { path: './manager.hivemind.demand', label: 'manager.hivemind.demand' },
  { path: './manager.hivemind.spawn', label: 'manager.hivemind.spawn' },
  { path: './manager.htm', label: 'manager.htm' },
  { path: './manager.hud', label: 'manager.hud' },
  { path: './manager.intentPipeline', label: 'manager.intentPipeline' },
  { path: './manager.maintenance', label: 'manager.maintenance' },
  { path: './manager.memory', label: 'manager.memory' },
  { path: './manager.room', label: 'manager.room' },
  { path: './manager.spawn', label: 'manager.spawn' },
  { path: './manager.spawnQueue', label: 'manager.spawnQueue' },
  { path: './manager.stamps', label: 'manager.stamps' },
  { path: './manager.towers', label: 'manager.towers' },
  { path: './manager.traffic', label: 'manager.traffic' },
  { path: './manager.visualizer', label: 'manager.visualizer' },
  { path: './memory.assimilation', label: 'memory.assimilation' },
  { path: './memory.migrations', label: 'memory.migrations' },
  { path: './memory.schemas', label: 'memory.schemas' },
  { path: './memory.terrain', label: 'memory.terrain' },
  { path: './planner.baseplannerFoundation', label: 'planner.baseplannerFoundation' },
  { path: './planner.buildCompendium', label: 'planner.buildCompendium' },
  { path: './planner.room', label: 'planner.room' },
  { path: './role.baseDistributor', label: 'role.baseDistributor' },
  { path: './role.builder', label: 'role.builder' },
  { path: './role.hauler', label: 'role.hauler' },
  { path: './role.miner', label: 'role.miner' },
  { path: './role.remoteMiner', label: 'role.remoteMiner' },
  { path: './role.reservist', label: 'role.reservist' },
  { path: './role.scout', label: 'role.scout' },
  { path: './role.upgrader', label: 'role.upgrader' },
  { path: './role.worker', label: 'role.worker' },
  { path: './scheduler', label: 'scheduler' },
  { path: './startFresh', label: 'startFresh' },
  { path: './taskDefinitions', label: 'taskDefinitions' },
  { path: './taskRegistry', label: 'taskRegistry' },
  { path: './utils.energy', label: 'utils.energy' },
  { path: './utils.energyReserve', label: 'utils.energyReserve' },
  { path: './utils.movement', label: 'utils.movement' },
  { path: './utils.quotes', label: 'utils.quotes' },
  { path: './visualize.stamp', label: 'visualize.stamp' },
];

function registerOne(profiler, mod, label) {
  if (!mod) return false;
  if (typeof mod === 'function') {
    profiler.registerFN(mod, `module:${label}`);
    return true;
  }
  if (typeof mod === 'object') {
    profiler.registerObject(mod, `module:${label}`);
    return true;
  }
  return false;
}

function registerAllProfilerModules(profiler) {
  const result = { registered: 0, failed: [] };
  for (const entry of MODULES) {
    try {
      const mod = require(entry.path);
      if (registerOne(profiler, mod, entry.label)) {
        result.registered += 1;
      }
    } catch (err) {
      result.failed.push({ module: entry.label, error: String(err) });
    }
  }
  return result;
}

module.exports = {
  registerAllProfilerModules,
  TOTAL_MODULES: MODULES.length,
};

