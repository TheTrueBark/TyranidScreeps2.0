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

taskRegistry.register('spawnStarterCouple', {
  owner: 'spawnManager',
  priority: 0,
  ttl: 50,
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

taskRegistry.register('PLAN_LAYOUT_CANDIDATES', {
  owner: 'layoutPlanner',
  priority: 0,
  ttl: 2000,
  trigger: { type: 'condition', conditionFn: 'theoreticalPlanning' },
});

taskRegistry.register('PLAN_LAYOUT_CANDIDATE', {
  owner: 'layoutPlanner',
  priority: 1,
  ttl: 2000,
  trigger: { type: 'condition', conditionFn: 'theoreticalPlanning' },
});

taskRegistry.register('INTENT_SCAN_ROOM', {
  owner: 'intentPipeline',
  priority: 1,
  ttl: 200,
  trigger: { type: 'event', eventName: 'roomOwnershipEstablished' },
});

taskRegistry.register('INTENT_EVALUATE_ROOM_VALUE', {
  owner: 'intentPipeline',
  priority: 1,
  ttl: 200,
});

for (let i = 1; i <= 10; i++) {
  taskRegistry.register(`INTENT_PLAN_PHASE_${i}`, {
    owner: 'intentPipeline',
    priority: 1,
    ttl: 400,
    trigger: { type: 'condition', conditionFn: `intentPhase${i}` },
  });
}

taskRegistry.register('INTENT_SYNC_OVERLAY', {
  owner: 'intentPipeline',
  priority: 1,
  ttl: 100,
});

taskRegistry.register('INTENT_RENDER_HUD', {
  owner: 'intentPipeline',
  priority: 1,
  ttl: 100,
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
