# Tyranid Screeps 2.0

## Overview

This project targets the Screeps runtime which implements **ECMAScript 5.1**. Modern
ES6+ features such as arrow functions or object spread are not available in-game.
All code should remain compatible with ES5.1.

Tyranid Screeps mimics a hierarchical swarm. Each module acts like a different
organism in the hive:

- **Scheduler** – central nervous system orchestrating tasks and events
- **Hierarchical Memory** – data storage structured as Hive → Cluster → Colony → Creep
- **Logging** – colorised and severity‑based output drawn by `console.console.js`
- **Spawn Manager** – plans and queues creeps according to demand
- **Hierarchical Task Management** – adaptive objectives from hive down to single creep (`manager.htm.js`), supports task quantities and claim cooldowns
- **HiveMind** – modular decision layer that queues HTM tasks; a subconscious
  triggers modules like the spawn planner on demand
- **Hive's Gaze** – scans the map for threats and opportunities
- **Movement System** – pathing via HiveTravel (Traveler library)
- **Console Stats** – ASCII dashboard for CPU and room status
- **DNA Builder** – generates creep bodies based on room energy

The system is modular, reactive and geared towards expansion.

### Stabilization status (critical gate)

Recent sweep results before expansion/combat work:
- Reservist correctness hardening shipped: reservists now fail-safe when `targetRoom` is missing.
- Scout correctness hardening shipped: scout low-TTL requeue logic now initializes `Memory.rooms` defensively.
- Regression coverage added for both cases in `test/roleReservist.test.js` and `test/roleScout.test.js`.
- Reservist templates now correctly use CLAIM/MOVE for reservation missions.
- Reservists now travel into controller range and keep reserving instead of suiciding after the first successful attempt.
- Scout planning now fans out per-exit target and task claims are bound to exact task ids to avoid decrementing the wrong task.

The corresponding critical roadmap blocker has been completed and moved out of the active blocker list.

## Logging system

Logs are handled through `console.console.js` and should be written using the
`logger` module. Messages are color coded and accept a severity level from 0–5.
Repeated messages are aggregated into a single entry which escalates in severity
and expires automatically after roughly 30 ticks.

### Usage
```javascript
const logger = require('./logger');
logger.log('spawnManager', 'Spawning creep failed', 3);
```

Logging for each module can be toggled from the game console:
```
debug.toggle('spawnManager', true); // enable
```
Current settings can be inspected via `debug.config()`.

## Preview CPU metrics

In `buildPreviewOnly` / theoretical mode the ASCII console is rendered directly
from the main loop every 5 ticks (bucket >= 1000), so CPU and bucket telemetry
remain visible even when live scheduler branches are bypassed.
Theoretical HUD/overlay drawing is called every tick in preview mode.

`statsConsole.run()` now includes intent-pipeline CPU rows:

- `Domain Planning` - CPU used by Phase C planning (event snapshot -> domain queue -> intents)
- `Intent HTM` - CPU used by HTM Phase D execution (`htm.runScheduled()`)
- `Preview HUD` - CPU used to render theoretical HUD + overlays each tick
- `Intent Scan` - summed `INTENT_SCAN_ROOM` handler CPU for current tick
- `Intent Eval` - summed `INTENT_EVALUATE_ROOM_VALUE` handler CPU
- `Intent Plan` - summed `INTENT_PLAN_PHASE_*` handler CPU
- `Intent Sync` - summed `INTENT_SYNC_OVERLAY` handler CPU
- `Intent HUD` - summed `INTENT_RENDER_HUD` handler CPU
- `Intent Other` - summed CPU of any other `INTENT_*` handlers

The per-intent sums are aggregated from `Memory.stats.taskLogs` entries written
by HTM (`tick == Game.time`).

## Tick Pipeline (A-E)

Main loop execution is fixed into deterministic phases:

- `A Bootstrap`: compute soft budget (`softBudget`) and bucket mode (`LOW_BUCKET|NORMAL|BURST`).
- `B Snapshot`: build a read-only room/creep snapshot and collect validation events.
- `C Planning`: domain queue planning (`critical|realtime|background|burstOnly`) with budget gates.
- `D Execution`: run scheduler + HTM execution with hard-stop headroom.
- `E Commit`: persist consolidated phase stats to `Memory.stats.tickPipeline`.

HTM execution is no longer scheduled as a standalone interval task (`htmRun`).
It is executed explicitly inside Phase D, making queue/budget behavior reproducible per tick.

### Runtime CPU Policy (Idle Gating + Throttling)

Live runtime now supports aggressive idle gating and bucket-aware throttling:

- `enableIdleGating` (default `true`): if no active work is detected, the tick takes an idle fast-path.
- `enablePlanningHeartbeat` (default `true`) + `planningHeartbeatTicks` (default `50`): optional lightweight planning safety pulse.
- CPU policy thresholds:
  - `cpu.stopAt`: hard gate per pipeline (`critical`, `realtime`, `background`, `burstOnly`)
  - `cpu.throttleAt`: soft throttle thresholds
  - `cpu.emergencyBrakeRatio` (default `0.85` of `Game.cpu.tickLimit`)

Idle fast-path in live mode runs only minimal maintenance + telemetry + commit, and skips full snapshot/planning/scheduler/HTM role execution unless wake-up conditions are present.

### HTM Overlay (Topbound)

The room visual includes a top-centered profiler overlay (`showHtmOverlay`, default ON)
that renders native screeps-profiler rows:

- `Profiler Overlay - <sum shown rows> CPU`
- `Mode: global|drilldown  Filter: <name|none>`
- `<rank>. <functionName>`
- `|-> Calls <n>  CPU <time>  Avg <avg>`

Formatting:

- CPU values are absolute Screeps CPU units (not percentages).
- Overlay values are rounded to 2 decimals and displayed with decimal comma (for example `1,27 CPU`).

Data source:

- `Game.profiler.output(...)` (raw profiler output).
- No primary dependency on `taskLogs` or per-tick HTM aggregation for overlay totals.

#### Full Codebase Profiling Coverage

When profiler mode is enabled (`visual.profiler('on')`), the runtime monkey-patches Screeps
prototypes once and registers additional project code via `profiler.registry.js`:

- module object exports via `registerObject(...)`
- module function exports via `registerFN(...)`
- runtime objects like `global.visual`, `manager.htm`, `manager.hud`, and `scheduler`

Registration failures are captured in `Memory.stats.profilerRegistry` and do not crash the loop.

Toggle in console:

- `visual.runMode('live'|'theoretical'|'maintenance')` - switch runtime pipeline mode
- `startFresh({ maintenanceMode: true })` - wipe memory and boot into strict maintenance mode
- `visual.idleGating(1|0)` - enable/disable live idle fast-path
- `visual.planningHeartbeat(1|0, ticks?)` - enable/disable planning heartbeat and optionally set cadence
- `visual.cpuPolicy('aggressive'|'balanced'|'conservative')` - apply predefined stop/throttle thresholds
- `visual.runtimeExplain()` - print why current tick is running idle or active path
- `visual.memHack(1|0|'status')` - toggle or inspect Memory parse-cache optimization
- `visual.memTrimNow(room?)` - prune theoretical layout memory (top candidates + latest run only)
- `visual.memoryFootprint(room?)` - inspect memory-heavy layout branches and raw bytes
- `visual.htmOverlay(1)` - show HTM profiler overlay and queue `Game.profiler.background(...)`
- `visual.htmOverlay(0)` - hide HTM profiler overlay and stop overlay-owned profiling session
- `visual.overlayMode('off'|'normal'|'debug')` - one-command overlay profile:
  - `off`: no HUD/layout/HTM overlay rendering and no `INTENT_RENDER_HUD` / `INTENT_SYNC_OVERLAY` queueing
  - `normal`: regular HUD behavior
  - `debug`: only HTM/debug overlays
- `visual.taskProfiling(1)` - enable scheduler/HTM profiling writes (default OFF)
- `visual.taskProfiling(0)` - disable scheduler/HTM profiling writes
- `visual.profilingDump(tick?)` - print raw `Game.profiler.output(...)` snapshot to console
- `visual.profilingExplain(tick?)` - print top raw profiler functions from `Memory.profiler.map`
- `visual.htmLastLog(count?, tick?)` - print latest raw HTM profiling entries (`HTM::...`) for debugging

Maintenance mode (`visual.runMode('maintenance')`) runs strict minimal runtime only:
- no scheduler/live/planner/HTM execution
- no creep role loops
- no HUD/layout rendering
- CPU telemetry remains visible via `statsConsole` and ASCII console every 5 ticks

Memory optimization defaults:
- `Memory.settings.enableMemHack` is enabled by default.
- theoretical planner memory is pruned to top candidates and a compact latest run summary.

Theoretical planning phase-4 recovery:
- if a run is `running` with no active candidate and incomplete results for over 50 ticks,
  the run is marked `stale` and one phase-4 auto-retry intent is re-queued.
- Recovery metadata is tracked in `Memory.rooms[room].intentState.recovery`.

## Screeps Profiler Integration

The project now includes [`screeps-profiler`](https://github.com/screepers/screeps-profiler)
as a local module (`screeps.profiler.js`) and can be enabled at runtime.

### Runtime Commands

- `visual.profiler('on')` - enable profiler wrapping (independent of overlay visibility)
- `visual.profiler('off')` - disable profiler wrapping and queue one reset
- `visual.profiler('status')` - show profiler state
- `visual.profiler('stream', ticks?, filter?)` - stream live profile output
- `visual.profiler('profile', ticks?, filter?)` - run finite profile and print summary at end
- `visual.profiler('output', limit?)` - print current profiling table manually
- `visual.profiler('reset')` - clear profiler memory
- `visual.profiler('restart')` - restart active profiling mode
- `visual.profiler('background', filter?)` - continuous background profiling
- `visual.profilerCoverage()` - show registered profiler module/runtime coverage

Notes:

- HTM overlay uses native `Game.profiler.output(...)` rows as CPU truth.
- CPU numbers are absolute Screeps CPU (not percentages).
- `output` includes `calls`, `time`, and `avg` per function, sorted by total CPU.

## Roadmap

Below is a high-level checklist tracking progress. Priority ranges from 1 (low) to 5 (high).

### Grundlegende Bausteine
- [x] **Scheduler** – Task orchestration (`scheduler.js`) – Prio 4
- [x] **Memory Manager** – Rigid hive layout (`manager.memory.js`) – Prio 4
- [x] **Logging** – Severity & toggles (`console.console.js`, `logger.js`) – Prio 5

### Produktion & Einheiten
- [ ] **Spawn Manager** – Queue and planning (`manager.spawn.js`, `manager.spawnQueue.js`) – Prio 4
- [ ] **Hierarchical Task Management** – Adaptive tasks across hive – Prio 5
- [ ] **Hive's Gaze** – Map awareness outside own rooms – Prio 3

### Bewegung & Wegfindung
- [x] **HiveTravel Integration** – Improve pathing (`manager.hiveTravel.js`) – Prio 3

### Überwachung & Visualisierung
- [x] **Console Stats** – CPU and room dashboard (`console.console.js`) – Prio 3
- [ ] **Agents** – Assimilation, Garbage, Efficiency – Prio 2

Next step: focus on the hierarchical task system so the scheduler can trigger colony and creep level tasks dynamically.

## Documentation
- [Project Wiki](./TyranidScreeps2.0.wiki/Home.md) - architecture and system guides
- [Roadmap](./ROADMAP.md)
