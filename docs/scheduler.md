# ⏱️ Scheduler

The scheduler coordinates recurring actions and event driven tasks. It ensures modules run at the right time and with proper isolation.

## Task Types

- **interval** – runs every `N` ticks. Useful for housekeeping jobs.
- **event** – triggered via `scheduler.triggerEvent(name, data)` when something important happens.
- **once** – executed a single time then removed.

Tasks can also be flagged as `highPriority` so they execute before normal tasks each tick.

## Registering Tasks

```javascript
const scheduler = require('scheduler');

scheduler.addTask('logCpu', 5, cpuLogger, { highPriority: true });
scheduler.addTask('newRoom', 0, analyseRoom, { event: 'roomSeen' });
```

## Execution Cycle

1. High priority tasks run if their timer is due.
2. Regular interval tasks run next.
3. Any triggered events are processed in FIFO order.

One time tasks are removed after execution. You can force a task to run next tick with `requestTaskUpdate(name)` or run it immediately using `runTaskNow(name)`.
