const taskRegistry = require('./taskRegistry');

// Register common HTM tasks with metadata so the docs can reference them.

taskRegistry.register('spawnMiner', {
  owner: 'spawnManager',
  priority: 1,
  ttl: 20,
  trigger: { type: 'condition', conditionFn: 'hive.roles.evaluateRoom' },
});

taskRegistry.register('spawnHauler', {
  owner: 'spawnManager',
  priority: 1,
  ttl: 20,
  trigger: { type: 'condition', conditionFn: 'demand.analyse' },
});

taskRegistry.register('spawnBootstrap', {
  owner: 'spawnManager',
  priority: 0,
  ttl: 20,
  trigger: { type: 'condition', conditionFn: 'hivemind.spawn.bootstrap' },
});

taskRegistry.register('acquireMiningData', {
  owner: 'roomManager',
  priority: 2,
  ttl: 20,
  trigger: { type: 'event', eventName: 'missingMiningData' },
});

taskRegistry.register('buildSite', {
  owner: 'buildingManager',
  priority: 1,
  ttl: 50,
  trigger: { type: 'event', eventName: 'newConstruction' },
});

taskRegistry.register('BUILD_LAYOUT_PART', {
  owner: 'buildingManager',
  priority: 1,
  ttl: 200,
  trigger: { type: 'condition', conditionFn: 'layoutAvailable' },
});

taskRegistry.register('BUILD_CLUSTER', {
  owner: 'layoutPlanner',
  priority: 4,
  ttl: 1500,
  trigger: { type: 'condition', conditionFn: 'layoutAvailable' },
});

taskRegistry.register('repairEmergency', {
  owner: 'buildingManager',
  priority: 1,
  ttl: 30,
  trigger: { type: 'condition', conditionFn: 'structureDecayCritical' },
});

taskRegistry.register('upgradeController', {
  owner: 'hivemind.spawn',
  priority: 3,
  ttl: 50,
  trigger: { type: 'event', eventName: 'roleUpdate' },
});

taskRegistry.register('deliverEnergy', {
  owner: 'energyRequests',
  priority: 2,
  ttl: 30,
  trigger: { type: 'condition', conditionFn: 'structureNeedsEnergy' },
});

taskRegistry.register('DELIVER_BASE_ENERGY', {
  owner: 'role.baseDistributor',
  priority: 2,
  ttl: 30,
});

taskRegistry.register('defendRoom', {
  owner: 'hivemind.spawn',
  priority: 1,
  ttl: 20,
  trigger: { type: 'event', eventName: 'hostilesDetected' },
});

taskRegistry.register('SCOUT_ROOM', {
  owner: 'hiveGaze',
  priority: 5,
  ttl: 500,
  trigger: { type: 'condition', conditionFn: 'hiveGaze.evaluateExpansionVision' },
});

taskRegistry.register('REMOTE_SCORE_ROOM', {
  owner: 'hiveGaze',
  priority: 4,
  ttl: 500,
});

taskRegistry.register('REMOTE_MINER_INIT', {
  owner: 'hiveGaze',
  priority: 2,
  ttl: 500,
});

taskRegistry.register('RESERVE_REMOTE_ROOM', {
  owner: 'hiveGaze',
  priority: 3,
  ttl: 500,
});

module.exports = taskRegistry;
