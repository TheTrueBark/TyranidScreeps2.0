# ⚙️ HTM Tasks

This document lists common task types used by the Hierarchical Task Manager.  Tasks originate from HiveMind modules and are executed by managers or creeps via lifecycle hooks.

Each task object contains:

```javascript
{
  name: 'spawnMiner',
  data: {},
  priority: 1,  // lower runs first
  ttl: 100,     // expiration in ticks
  age: 0,
  amount: 1,
  manager: 'spawnManager',
  claimedUntil: 0,
  origin: { module: 'hive.roles', createdBy: 'evaluateRoom', tickCreated: 123 }
  parentTaskId: null,
  subtaskIds: [],
}
```

`origin` records which module queued the task, the function that created it and
the tick. This helps trace behaviour in the console or a future GUI.

## Default Lifecycle

1. **execute(data)** – main handler registered via `htm.registerHandler`.
2. **onSuccess(data)** – optional success hook.
3. **onFail(data, reason)** – optional failure hook.

Handlers may schedule subtasks or update memory.  Failed tasks are retried until `ttl` expires.

## Trigger Types

Tasks can specify when they should run using a trigger object in the
task registry:

```javascript
taskRegistry.register('upgradeController', {
  priority: 2,
  ttl: 50,
  trigger: { type: 'event', eventName: 'controllerUpgrade' },
});
```

- **tick** – processed every HTM run. You may provide `tickAt` to delay the
  first execution until a future tick.
- **event** – queued when `scheduler.triggerEvent(eventName)` is fired.
- **condition** – `conditionFn` is evaluated each HTM run and the task is
  queued when it returns `true`.

## Example Tasks

| Task Name        | Owner Module      | Default Priority | Purpose                         |
|------------------|------------------|-----------------|---------------------------------|
| `spawnMiner`     | `spawnManager`   | 1               | Request a miner in a colony.    |
| `spawnHauler`    | `spawnManager`   | 1               | Request a hauler creep.         |
| `upgradeController` | `hivemind.spawn` | 3             | Encourage controller upgrades.  |
| `deliverEnergy`  | `energyRequests` | 2               | Hauler delivery to a structure. |
| `defendRoom`     | `hivemind.spawn` | 1               | Spawn defenders on hostiles.    |
| `spawnBootstrap` | `spawnManager`   | 0               | Emergency worker when none exist. |
| `acquireMiningData` | `roomManager` | 2 | Rescan room to rebuild mining positions. |
| `buildSite` | `buildingManager` | 1 | Assign builders to a construction site. |
| `repairEmergency` | `buildingManager` | 1 | Repair structures close to decay. |
| `BUILD_LAYOUT_PART` | `buildingManager` | 1 | Construct next piece of the base layout. | @codex-owner buildingManager
| `BUILD_CLUSTER` | `layoutPlanner` | 4 | Schedule a group of structures to be built as a cluster. Includes `progress` and `complete` fields. | @codex-owner layoutPlanner
| `REMOTE_SCORE_ROOM` | `hiveGaze` | 4 | Evaluate remote sources and assign scores. |
| `REMOTE_MINER_INIT` | `hiveGaze` | 2 | Reserve a remote mining spot and spawn a miner. |
| `RESERVE_REMOTE_ROOM` | `hiveGaze` | 3 | Spawn a reservist to secure the controller. Tasks may be requeued automatically with origin `autoRetry`. |

### Registered Triggers

| Task              | Trigger                                        |
|-------------------|-----------------------------------------------|
| `spawnMiner`      | condition via `hive.roles` evaluation          |
| `spawnHauler`     | condition via energy demand analysis           |
| `spawnBootstrap`  | condition when no workers are present          |
| `upgradeController` | event `roleUpdate` or energy surplus check    |
| `defendRoom`      | event `hostilesDetected`                       |
| `deliverEnergy`   | condition when structure free capacity > 0     |
| `acquireMiningData` | event `missingMiningData`                     |
| `buildSite` | event `newConstruction` |
| `repairEmergency` | condition `structureDecayCritical` |

Past executions can be inspected under `Memory.stats.taskLogs` when a module chooses to record them.

### Composite Tasks

Tasks may reference a parent task and maintain a list of subtasks. This allows
complex objectives to be broken into smaller steps while maintaining a tree
structure. The layout planner queues a `BUILD_CLUSTER` task and then schedules
`BUILD_LAYOUT_PART` subtasks using the parent's cluster identifier.

```javascript
htm.addColonyTask(
  'W1N1',
  'BUILD_CLUSTER',
  { roomName: 'W1N1', clusterId: 'extCluster1', rcl: 2, structureType: STRUCTURE_EXTENSION },
  3,
  1500,
  1,
  'layoutPlanner',
  {},
  { parentTaskId: 'extCluster1' },
);

htm.addColonyTask(
  'W1N1',
  'BUILD_LAYOUT_PART',
  { roomName: 'W1N1', structureType: STRUCTURE_EXTENSION, x: 21, y: 12 },
  5,
  1000,
  1,
  'layoutPlanner',
  { parentTaskId: 'extCluster1' },
);
```

The HTM does not currently enforce parent/child relationships but the fields are
available for future visualisation and debugging tools.

`BUILD_CLUSTER` tasks are removed automatically once all of their
`BUILD_LAYOUT_PART` subtasks are completed. Each cluster task contains a
`progress` field like `"3/5"` and a boolean `complete` once finished.

`BUILD_LAYOUT_PART` tasks are executed by `buildingManager`. The manager checks
the room's controller level and current structure counts against
`CONTROLLER_STRUCTURES` before placing a construction site. If a structure is
already present at the target coordinates, the task is removed and the
corresponding entry in `Memory.rooms[room].layout.status.structures` is
incremented. Tasks stay queued until a site is placed or the structure exists.

When `Memory.settings.debugBuilding` is `true`, every task execution logs the
result to the console and draws a small overlay via `RoomVisual`:

```
[BUILD] Placed EXTENSION at (17, 24) in W1N1
[BUILD] Skipped TOWER at (20, 21): RCL limit reached
[BUILD] Cannot place SPAWN at (10, 10) in W1N1 — unwalkable terrain
```

A ✅ is drawn when a construction site is created, while ❌ marks skipped tasks
or invalid tiles. This helps diagnose layout problems and verify build progress.


### Task Registry

Metadata for each task type can be registered via `taskRegistry.register(name, meta)`.
This enables automated documentation and potential GUI visualisation.

Example:
```javascript
const taskRegistry = require('taskRegistry');
taskRegistry.register('spawnMiner', { priority: 1, ttl: 20, owner: 'spawnManager' });
```

`meta` may include `trigger` information and descriptive fields for documentation:

```javascript
taskRegistry.register('deliverEnergy', {
  priority: 2,
  ttl: 30,
  owner: 'energyRequests',
  trigger: { type: 'condition', conditionFn: needsEnergy },
});
```

Registered entries are exposed through `taskRegistry.registry` and may be exported to Codex docs.

## Codex Metadata

Tasks listed in this file are tagged in the source using `@codex-task` along with
`@codex-owner` and other annotations. These comments allow Codex to build
reference tables showing which module manages each task and the memory paths
involved.
