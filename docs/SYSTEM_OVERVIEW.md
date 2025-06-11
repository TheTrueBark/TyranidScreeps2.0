# 🗺 System Overview

This document maps the main subsystems of the Tyranid Screeps AI and how they interact.

| Subsystem | Description | Docs |
|-----------|-------------|------|
| **Scheduler** | Orchestrates recurring jobs and event reactions. | [Scheduler](./scheduler.md) |
| **HTM** | Hierarchical Task Manager that stores and executes tasks. | [Tasks](./tasks.md) |
| **Memory Manager** | Maintains versioned memory layout and migrations. | [Memory](./memory.md) |
| **HiveMind** | Strategic layer queuing tasks based on game state. | [HiveMind](./hivemind.md) |
| **Spawn Queue** | Buffers creep spawn requests for processing. | [Spawn Queue](./spawnQueue.md) |
| **Demand Tracker** | Records energy demand/delivery metrics. | section in [Memory](./memory.md) |
| **HiveTravel** | Pathing helper storing hostile rooms under `Memory.empire`. | part of [Memory](./memory.md) |
| **Logger** | Aggregates stats and console output in `Memory.stats`. | [Logger](./logger.md) |

```
Scheduler -> HiveMind -> HTM -> Spawn Queue -> Spawn Manager -> Creeps
                \-> Demand Tracker ----/
```

Use the global `debug` helpers to inspect the current schedule (`debug.showSchedule()`),
active tasks (`debug.showHTM()`), and memory schema versions (`debug.memoryStatus()`).
