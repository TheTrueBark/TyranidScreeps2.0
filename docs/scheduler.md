# ⏱️ Scheduler

The scheduler coordinates recurring actions and event driven tasks. It ensures modules run at the right time and with proper isolation.

## Task Types

- **interval** – runs every `N` ticks. Useful for housekeeping jobs.
- **event** – triggered via `scheduler.triggerEvent(name, data)` when something important happens.
- **once** – executed a single time then removed.

Tasks can also be flagged as `highPriority` so they execute before normal tasks each tick.

Tasks may specify `minBucket` to delay execution until the CPU bucket is above a certain value. This allows optional logic to throttle itself when the colony is CPU starved.

### Trigger Interface

Both scheduler jobs and HTM tasks use the same trigger description:

```javascript
{ type: 'interval', interval: 5 }
{ type: 'event', eventName: 'roleUpdate' }
{ type: 'once', tickAt: Game.time + 10 }
```

This structure is documented via `@codex-trigger` annotations on every job.

## Registering Tasks

```javascript
const scheduler = require('scheduler');

scheduler.addTask('logCpu', 5, cpuLogger, { highPriority: true });
scheduler.addTask('newRoom', 0, analyseRoom, { event: 'roomSeen' });
scheduler.addTask('htmRun', 1, () => htm.run());
```

## Execution Cycle

1. High priority tasks run if their timer is due.
2. Regular interval tasks run next.
3. Any triggered events are processed in FIFO order.

One time tasks are removed after execution. You can force a task to run next tick with `requestTaskUpdate(name)` or run it immediately using `runTaskNow(name)`.

Use `removeTask(name)` to cancel a task entirely or `updateTask(name, interval)` to change its schedule.

Calling `scheduler.listTasks()` returns a summary of upcoming executions which can be printed periodically via `scheduler.logTaskList()`.
`debug.showSchedule()` prints the same information on demand along with memory schema status.

### Role Evaluation Events

The `roleUpdate` event triggers the `hive.roles` module to re-evaluate a room's
workforce. Events are fired when creeps spawn or die, when construction sites
change or when the controller level increases.

## Registered Jobs

The main loop registers several core jobs which drive the colony:

| Job Name             | Interval/Event | Owner Module        | Description |
|----------------------|----------------|--------------------|-------------|
| `initializeRoomMemory` | once          | `main`             | Prepares room and hive memory on tick 0. |
| `clearMemory`        | 100 ticks      | `main`             | Removes dead creep memory. |
| `updateHUD`          | 5 ticks        | `main`             | Draws HUD visuals. |
| `layoutPlanningInit` | event `roomOwnershipEstablished` (once) | `layoutPlanner` | Initialize base layout when a room is claimed. |
| `ensureLayoutPlan` | 20 ticks | `layoutPlanner` | Verify each owned room has a layout plan. |
| `dynamicLayout` | 100 ticks | `layoutPlanner` | Populate dynamic layout and queue cluster tasks. |
| `buildInfrastructure`| every tick     | `buildingManager`  | Places construction sites when needed. |
| `hivemind`           | 1 tick         | `hivemind`         | Evaluates strategy and queues HTM tasks. |
| `energyDemand`       | 1000 ticks     | `demand`           | Updates delivery stats. |
| `roleUpdateEvent`    | event `roleUpdate` | `main`        | Triggers role evaluation on spawn/death. |
| `roleUpdateFallback` | 50 ticks       | `main`             | Periodic role evaluation when bucket high. |
| `htmRun`             | 1 tick         | `htm`              | Processes HTM task queues. |
| `consoleDisplay`     | 5 ticks        | `console.console`  | Prints stats and logs to console. |
| `purgeLogs`          | 250 ticks      | `memoryManager`    | Clears aggregated log counts. |
| `predictMinerLifecycles` | 25 ticks | `lifecyclePredictor` | Queues miner replacements before death. |
| `predictHaulerLifecycle` | 25 ticks | `haulerLifecycle` | Queues hauler replacements before death. |
| `verifyMiningReservations` | 10 ticks | `memoryManager`    | Frees reserved mining spots from dead creeps. |
| `htmCleanup`         | 50 ticks       | `htm`              | Removes memory for dead creeps. |
| `showScheduled`      | 50 ticks       | `scheduler`        | Optional debug output of task list. |

Use `scheduler.listTasks()` to see current timers and next execution tick for each job.

`consoleDisplay` only executes when the CPU bucket exceeds 1000 thanks to its `minBucket` setting. Likewise `showScheduled` respects `Memory.settings.showTaskList` before printing.

## Codex Metadata

Scheduler jobs are annotated in the source with `@codex-scheduler-task` and
`@codex-trigger` comments. These tags capture ownership and trigger details so
documentation can be automatically generated.

Example entry:

```javascript
scheduler.addTask('htmRun', 1, () => htm.run()); // @codex-owner htm @codex-trigger {"type":"interval","interval":1}
```

