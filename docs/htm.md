# 🧠 Hierarchical Task Management

The HTM system breaks down objectives from the top level hive to individual creeps. Each layer can issue tasks to the level below it, forming a flexible chain of command.

## Levels

1. **Hive** – global strategy such as expansion or large scale attacks.
2. **Cluster** – group of rooms working together (main base plus remotes).
3. **Colony** – a single owned room managing local resources and defense.
4. **Creep** – execution unit taking orders and reporting results.

## Features

- Task priority with aging / decay so outdated plans are replaced.
- Scheduler integration ensures tasks run when expected.
- Logging of planned vs active tasks for easier debugging.
- Cache of attempted tasks to avoid redundant orders.

## Implementation

`manager.htm.js` keeps a memory structure under `Memory.htm` with tasks for each level. Tasks are plain objects:

```javascript
{
  name: 'taskName',
  data: {},
  priority: 1,
  ttl: 100,
  age: 0,
  amount: 1,
  manager: null,
  claimedUntil: 0,
}
```

Handlers can be registered via `htm.registerHandler(level, name, fn)` and are executed when `htm.run()` is called by the scheduler. Expired tasks are removed automatically.

Tasks are typically queued by the `HiveMind` module which inspects the current game state and decides which objectives should be tackled.

Example of adding a colony task:

```javascript
const htm = require('manager.htm');
htm.addColonyTask('W1N1', 'buildExtensions', { amount: 5 }, 2);
```

### Claiming tasks

Managers use `claimTask` once they pick up an order. The `amount` value is
decreased and the task is removed when it reaches zero. The call accepts an
additional `expectedTicks` parameter so the HiveMind can wait for long running
actions (like spawning) before re-issuing the task.

```javascript
// parameters: level, id, name, manager, baseCooldown, expectedTicks
htm.claimTask(htm.LEVELS.COLONY, 'W1N1', 'spawnMiner', 'spawnManager', 15, 150);
```

`claimedUntil` blocks the HiveMind from requeueing the same task for a few
ticks, preventing duplicate orders.

This flexible core allows modules to schedule work without direct coupling and provides the backbone of the hive mind.
