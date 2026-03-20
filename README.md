# Tyranid Screeps 2.0

## Overview

As of **March 20, 2026**, the live Screeps runtime for this project should still
be treated as **ECMAScript 5.1**. Until the announced **Node.js 24** migration
on **April 1, 2026** is confirmed live, runtime-critical code should remain
compatible with ES5.1.

Tyranid Screeps mimics a hierarchical swarm. Each module acts like a different
organism in the hive:

- **Scheduler** – central nervous system orchestrating tasks and events
- **Hierarchical Memory** – data storage structured as Hive → Cluster → Colony → Creep
- **Logging** – structured telemetry and optional console-facing output handled by `console.console.js`
- **Spawn Manager** – plans and queues creeps according to demand
- **Hierarchical Task Management** – adaptive objectives from hive down to single creep (`manager.htm.js`), supports task quantities and claim cooldowns
- **HiveMind** – modular decision layer that queues HTM tasks; a subconscious
  triggers modules like the spawn planner on demand
- **Hive's Gaze** – scans the map for threats and opportunities
- **Movement System** – pathing via HiveTravel (Traveler library)
- **Console Stats** – CPU/log telemetry storage for the runtime and the external Dashboard, with optional ASCII dashboard rendering
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

## Operations dashboard

Operational graphs and log review are now meant to live in the external
Dashboard repository:

`https://github.com/TheTrueBark/Dashboard`

The Screeps runtime still collects telemetry in `Memory.stats`, and the old
ASCII dashboard can still be enabled manually when needed. It is no longer the
default operator surface.

## Preview CPU metrics

In `buildPreviewOnly` / theoretical mode the CPU/log telemetry is still collected
from the main loop, but ASCII console rendering is now disabled by default.
Set `Memory.settings.consoleDisplayEnabled = true` if you explicitly want the
dashboard printed again.
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
- `startFresh({ theoreticalBuildingMode: true, extensionPattern: 'cluster3' })` - wipe memory and boot into theoretical planner mode with Harabi-style diagonal 2x2 road grid pattern, full winner materialization, and full defense planning
- `startFresh({ theoreticalBuildingMode: true, extensionPattern: 'cluster3', layoutPlanDumpDebug: true })` - same as above, plus opt-in planner dump debugging
- `startFresh({ rampartMincutMode: true })` - wipe memory and boot into a standalone rampart-debug overlay mode without the theoretical builder pipeline
- `rampartMincut('W1N1', '25,25')` - one-command version: boot standalone rampart mincut debug mode and immediately plan the protected XY
- `planRampartMincut('W1N1', '25,25', { rampartThickness: 3, noGoDepth: 2, dragonTeethThickness: 1 })` - plan a min-cut rampart shell for one protected XY with configurable shell thickness, checkerboard dragon teeth depth, and interior ranged-creep no-go depth
- `inspectRampartMincut('W1N1')` / `clearRampartMincut('W1N1')` - inspect or clear the standalone rampart debug payload
- `dumpRampartMincut('W1N1')` - print a paste-friendly debug dump with exit regions, exit-approach seeds, raw/canonical cut, final ramparts, dragon teeth, and no-go zone
- Full builder plans now consume the same rampart mincut output as their default shell source, relocate movable structures out of the returned no-go zone, and place protective ramparts over access roads that continue into that zone.
- `startFresh({ wipe: 'all' })` - explicit full top-level Memory wipe (no preserved settings)
- In Harabi `foundation` runtime, the `plan` overlay uses `RoomVisual` silhouettes for labs, ramparts, and late structure previews; ramparts use a filled outline with diagonal connectors, and green valid dots plus distance labels only appear when `Memory.settings.debugVisuals` is enabled.
- `layoutPlanDump('W1N1')` - print planner debug dump (big/small stamp counts, structure totals, and buildQueue entries) when debug flag is enabled
- Theoretical planner includes optional replay refinement between weighted evaluation and winner selection (Top-N seeds, local mutations, strict score-only acceptance).
- Winner selection now lives in `planner.winnerSelection.js` as a standalone heuristic module with strict reject/penalty/tie-break rules.
- In `harabi/full`, the theoretical planner now reranks the leading finalists on real full-plan materializations before persisting a winner, but uses the cheaper `estimate` defense pass during that rerank so practical road/rampart failures are caught without re-running expensive full minCut smoothing on every finalist.
- Foundation-stage candidates with hard structural failures like incomplete controller stamps, disconnected road nets, blocked spawn exits, or missing source-route anchors are now marked `selectionRejected` and cannot win the theoretical selection path.
- Winner-selection tuning now lives under `Memory.settings.layoutWinnerSelection` (`rerankTopN`, `rerankDefenseMode`, hard-reject prefixes, penalty buckets, tie-breakers).
- Source-link placement now adds a local transit/chokepoint penalty so links prefer side pockets over narrow corridor tiles when a through-road still needs to continue past the source area.
- Even before that final rerank, hard foundation-stage validation failures such as incomplete controller stamps, disconnected road nets, blocked spawn exits, or missing source-route anchors are now penalized during candidate selection so obviously broken seeds do not survive as “good” finalists.
- Persisted candidate/base-plan debug now also carries `selectionStage` and `selectionBreakdown`, and `layoutPlanDump` prints the final selection bucket summary.
- Single-exit defense planning now seeds the mincut from the actual exit opening center plus a short inward corridor, avoiding arbitrary storage-to-exit drift that could previously pull ramparts toward unrelated southern/eastern routes.
- Detailed planner rules and debug workflow are documented in [`TyranidScreeps2.0.wiki/Layout-Planner.md`](./TyranidScreeps2.0.wiki/Layout-Planner.md).
- `visual.layoutRefinement(1|0|'status')` - enable/disable replay refinement and inspect current budget/gate.
- `visual.layoutRefinementBudget(generations, variants, minBucket)` - tune replay generations, variants per generation, and bucket gate.
- `Memory.settings.layoutPlanningMode = 'theoretical'; Memory.settings.layoutExtensionPattern = 'cluster3';` - run the 3x3-cluster theoretical planner with Harabi stamps via the Top-N candidate HTM pipeline (bucket-aware)
- `visual.idleGating(1|0)` - enable/disable live idle fast-path
- `visual.planningHeartbeat(1|0, ticks?)` - enable/disable planning heartbeat and optionally set cadence
- `visual.cpuPolicy('aggressive'|'balanced'|'conservative')` - apply predefined stop/throttle thresholds
- `visual.runtimeExplain()` - print why current tick is running idle or active path
- `visual.memHack(1|0|'status')` - toggle or inspect Memory parse-cache optimization
- `visual.memTrimNow(room?)` - prune theoretical layout memory (top candidates + latest run only, compact completed theoretical overlays/basePlan debug, and strip non-selected candidate plans down to summary data)
- `visual.memoryFootprint(room?)` - inspect memory-heavy layout branches and raw bytes
- `visual.memoryBreakdown()` - capture a size breakdown by major memory branch; `visual.memoryBreakdown('cached')` returns the latest stored snapshot
- `visual.memoryBreakdownReport()` - print a shareable multi-line memory report to the Screeps console; `visual.memoryBreakdownReport('cached')` reprints the latest stored snapshot without recomputing it
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
- CPU telemetry continues to be collected via `statsConsole`; ASCII console output stays disabled by default unless `Memory.settings.consoleDisplayEnabled = true`

Memory optimization defaults:
- `Memory.settings.enableMemHack` is enabled by default.
- completed theoretical planner state is now stored in compact form: heavy debug maps move out of `layout.theoretical`, base-plan debug keeps summary data, and non-selected candidate plans shed heavy placement arrays after pruning.
- persisted `basePlan` memory keeps a compact queue-only representation for runtime/building use instead of duplicating the full `structures` map, and the selected winner candidate is also compacted once `basePlan` already covers that layout unless you explicitly pin that candidate overlay.
- normal runtime now runs automatic memory hygiene:
  - checks raw memory pressure every 25 ticks,
  - warns from about `1.5 MB`,
  - auto-trims safe planner memory from about `1.8 MB`,
  - runs an `ownedOnly` safe sweep from about `1.95 MB`,
  - also runs a periodic safe sweep every 500 ticks.
- a compact `Memory.stats.memoryBreakdown` snapshot is refreshed automatically every 100 ticks so large branches like `stats.tickPipeline.byTick` are visible without manual profiling.
- `visual.memoryBreakdownReport()` also prints the heaviest individual `stats.tickPipeline.byTick` ticks so oversized per-tick snapshots are easy to spot.
- `Memory.stats.tickPipeline` now keeps only the most recent 60 committed ticks.

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

### Core Foundations
- [x] **Scheduler** – Task orchestration (`scheduler.js`) – Priority 4
- [x] **Memory Manager** – Rigid hive layout (`manager.memory.js`) – Priority 4
- [x] **Logging** – Severity & toggles (`console.console.js`, `logger.js`) – Priority 5

### Production and Units
- [ ] **Spawn Manager** – Queue and planning (`manager.spawn.js`, `manager.spawnQueue.js`) – Priority 4
- [ ] **Hierarchical Task Management** – Adaptive tasks across hive – Priority 5
- [ ] **Hive's Gaze** – Map awareness outside own rooms – Priority 3

### Movement and Pathing
- [x] **HiveTravel Integration** – Improve pathing (`manager.hiveTravel.js`) – Priority 3

### Observability and Visuals
- [x] **Console Stats** – CPU and room dashboard (`console.console.js`) – Priority 3
- [ ] **Agents** – Assimilation, Garbage, Efficiency – Priority 2

Next step: focus on the hierarchical task system so the scheduler can trigger colony and creep level tasks dynamically.

## Documentation
- [Project Wiki](./TyranidScreeps2.0.wiki/Home.md) - architecture and system guides
- [Operations Dashboard](https://github.com/TheTrueBark/Dashboard) - external operator-facing telemetry and graphs
- [Roadmap](./ROADMAP.md)
