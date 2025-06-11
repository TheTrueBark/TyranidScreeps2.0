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

Past executions can be inspected under `Memory.stats.taskLogs` when a module chooses to record them.

### Composite Tasks

Tasks may reference a parent task and maintain a list of subtasks. This allows
complex objectives to be broken into smaller steps while maintaining a tree
structure.

```javascript
htm.addColonyTask(
  'W1N1',
  'buildExtensions',
  {},
  2,
  50,
  1,
  'buildingManager',
  {},
  { parentTaskId: '123', subtaskIds: ['123-1', '123-2'] },
);
```

The HTM does not currently enforce parent/child relationships but the fields are
available for future visualisation and debugging tools.


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
