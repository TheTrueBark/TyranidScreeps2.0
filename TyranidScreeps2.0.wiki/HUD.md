# HUD Layout Progress

If `Memory.settings.debugLayoutProgress` is `true`, the layout planner and building manager
log cluster progress every 1000 ticks. Example console line:

```text
[cluster] W1N1:extCluster1 3/5
```

This indicates three of the five planned structures in `extCluster1` have been built.

## Spawn & Task Panels

- The left HUD column displays spawn energy status, current queue entries, and overall room energy availability. The panel is shown by default (`Memory.settings.showSpawnQueueHud = true`).
- The right column hosts the Task Board with two task sections: `Tasks Planned` (queued, unclaimed work) and `Tasks In Progress` (claimed tasks with `claimedUntil > Game.time`), followed by energy logistics summaries. This keeps spawn demand visible while remaining unobtrusive on the edge of the room view.
- The right column also shows `Spawn Limits` so role caps and manual overrides are visible while debugging economy behavior.
- Reservations for spawn energy update in real time so the board reflects energy in transit; once the spawn is full the entry shows as fully reserved instead of queueing new haulers.

## Overlay Modes (Simple Control)

Use one command to switch rendering profile:

- `visual.overlayMode('off')`: disables all HUD/layout/HTM overlays.
- In `off` mode, render intents are also suppressed (`INTENT_RENDER_HUD` / `INTENT_SYNC_OVERLAY` are not queued and complete immediately if already queued).
- `visual.overlayMode('normal')`: regular HUD behavior.
- `visual.overlayMode('debug')`: debug-only overlays (HTM/debug panels only).

## Runtime Modes

- `visual.runMode('live')`: normal bot execution.
- `visual.runMode('theoretical')`: planner-focused theoretical mode.
- `visual.runMode('maintenance')`: strict minimal CPU-debug mode (no live/planner/HTM execution, no overlays).

For a clean reboot directly into maintenance:

- `startFresh({ maintenanceMode: true })`

## Runtime CPU Controls

Use these commands to tune idle CPU behavior while keeping HUD semantics predictable:

- `visual.idleGating(1|0)`:
  - `1`: live mode can take idle fast-path when no work is detected.
  - `0`: disable idle fast-path (always run active live path).
- `visual.planningHeartbeat(1|0, ticks?)`:
  - enables/disables planning heartbeat safety ticks.
  - default cadence is 50 ticks in aggressive policy.
- `visual.cpuPolicy('aggressive'|'balanced'|'conservative')`:
  - applies preset bucket stop/throttle thresholds.
- `visual.runtimeExplain()`:
  - prints current runtime state and reason (`idle`/`active`, heartbeat/manual trigger, etc.).
- `visual.memHack(1|0|'status')`:
  - toggles Memory parse-cache optimization and reports hit/miss stats.
- `visual.memTrimNow(room?)`:
  - prunes theoretical planner memory for one room or all rooms.
- `visual.memoryFootprint(room?)`:
  - shows raw memory bytes plus per-room candidate/pipeline counts.
- `visual.layoutHudOffset(value|'status')`:
  - moves the planning HUD block (Checklist/Candidates/Eval) vertically.
  - default offset is `3.2` (down from top edge).

## Theoretical Recovery

- Phase-4 self-recovery is active for stuck theoretical runs.
- Trigger: `running` pipeline, no active candidate, incomplete results, unchanged for >50 ticks.
- Action: mark run stale and auto-requeue exactly one phase-4 retry for the same `runId`.
- State is visible under `Memory.rooms[room].intentState.recovery`.

## HTM Profiling Overlay (Topbound)

The HTM overlay is profiler-driven and renders native `screeps-profiler` output rows.

Displayed structure:

- `Profiler Overlay - <sum shown rows> CPU`
- `Mode: global|drilldown  Filter: <name|none>`
- `<rank>. <functionName>`
- `|-> Calls <n>  CPU <time>  Avg <avg>`

Source of truth:

- `Game.profiler.output(...)` only (raw profiler table)

Formatting:

- absolute CPU values (not percent)
- decimal comma and 2 decimals (`1,23 CPU`)

Behavior:

- `visual.htmOverlay(1)` shows overlay and queues `Game.profiler.background(...)`.
- `visual.htmOverlay(0)` hides overlay and stops only overlay-owned profiler session.
- `visual.profiler('on'|'off')` remains the master manual switch.
- `visual.overlayMode('off')` is a hard visual gate:
  - no HUD/layout/overlay rendering work
  - no `INTENT_RENDER_HUD` / `INTENT_SYNC_OVERLAY` production

### Profiler Commands (Console)

- Reset profiler data:
  - `visual.profiler('reset')`
  - if needed hard-disable + reset next tick: `visual.profiler('off')`

- Set filter for HTM profiler overlay (drilldown):
  - `visual.profilerOverlayFilter('runtime:manager.htm.run')`
  - `visual.profilerOverlayMode('drilldown')`

- Clear filter / back to global:
  - `visual.profilerOverlayFilter('')`
  - `visual.profilerOverlayMode('global')`

### Layout CPU Toggles

- Road RCL labels (can be expensive on dense road networks):
  - `visual.roadRclLabels(1)` enable
  - `visual.roadRclLabels(0)` disable (default)

- HUD calculation cache (reuses computed HUD rows until fingerprints change):
  - `visual.hudCalcCache(1)` enable (default)
  - `visual.hudCalcCache(0)` disable

- Layout visualizer calculation cache:
  - Candidate/checklist/legend source data is fingerprint-cached per room.
  - Rendering still happens each tick, but expensive overlay calculations only refresh on state changes.
