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
