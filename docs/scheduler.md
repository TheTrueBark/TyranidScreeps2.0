# ⏱️ Scheduler

The scheduler coordinates recurring actions and event driven tasks. It ensures modules run at the right time and with proper isolation.

## Task Types

- **interval** – runs every `N` ticks. Useful for housekeeping jobs.
- **event** – triggered via `scheduler.triggerEvent(name, data)` when something important happens.
- **once** – executed a single time then removed.

Tasks can also be flagged as `highPriority` so they execute before normal tasks each tick.

Tasks may specify `minBucket` to delay execution until the CPU bucket is above a certain value. This allows optional logic to throttle itself when the colony is CPU starved.

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
