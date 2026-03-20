# 🗺 System Overview

This document maps the main subsystems of the Tyranid Screeps AI and how they interact.

| Subsystem | Description | Docs |
|-----------|-------------|------|
| **Scheduler** | Orchestrates recurring jobs and event reactions. | [Scheduler](./Scheduler.md) |
| **HTM** | Hierarchical Task Manager that stores and executes tasks. | [Tasks](./Tasks.md) |
| **Memory Manager** | Maintains versioned memory layout and migrations. | [Memory](./Memory.md) |
| **HiveMind** | Strategic layer queuing tasks based on game state. | [HiveMind](./HiveMind.md) |
| **Spawn Queue** | Buffers creep spawn requests for processing. | [Spawn Queue](./Spawn-Queue.md) |
| **Demand Tracker** | Records energy demand and delivery metrics. | section in [Memory](./Memory.md) |
| **HiveTravel** | Pathing helper storing hostile rooms under `Memory.empire`. | part of [Memory](./Memory.md) |
| **Logger / Stats** | Aggregates logs and telemetry in `Memory.stats` for the in-game runtime and the external dashboard. | [Logger](./Logger.md) |
| **Layout Planner** | Runs theoretical base planning, candidate evaluation, replay refinement, and persistence into `basePlan`. | [Layout Planner](./Layout-Planner.md) |
| **Winner Selection** | Standalone heuristic module for hard rejects, penalties, tie-breaks, and finalist rerank config under `Memory.settings.layoutWinnerSelection`. | [Layout Planner](./Layout-Planner.md) |

```text
Scheduler -> HiveMind -> HTM -> Spawn Queue -> Spawn Manager -> Creeps
                \-> Demand Tracker ----/
```

Use the global `debug` helpers to inspect the current schedule (`debug.showSchedule()`),
active tasks (`debug.showHTM()`), and memory schema versions (`debug.memoryStatus()`).

## Operator Surfaces

- `Memory.stats` is the durable telemetry source inside the Screeps runtime.
- The external dashboard at `https://github.com/TheTrueBark/Dashboard` is the
  primary place for operational graphs and log review.
- The old ASCII console dashboard remains available only as an optional manual
  view and is disabled by default.
