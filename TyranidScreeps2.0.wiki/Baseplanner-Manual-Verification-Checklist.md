# Baseplanner - Manual Verification Checklist (Phases and Algorithms)

This checklist is meant to drive a reproducible debug run.
Use it to isolate issues quickly, reproduce them, and compare later changes
against the same baseline.

---

## 0) Preparation

1. Make sure you are in a dedicated test session.
2. Pause the bot or switch into theoretical mode so live tasks do not interfere.
3. For reproducible CPU values, set runtime and overlay mode explicitly instead
   of mixing older toggles.

### Console setup (copy/paste)

```js
visual.runMode('theoretical');
visual.cpuPolicy('aggressive');
visual.overlayMode('debug'); // or 'off' for CPU-only measurement without draws
visual.memHack(1);
Memory.settings = Memory.settings || {};
Memory.settings.layoutPlanningManualMode = true;
Memory.settings.layoutPlanningTopCandidates = 5;
Memory.settings.layoutPlanningCandidatesPerTick = 1;
Memory.settings.layoutPlanningMaxCandidatesPerTick = 25;
Memory.settings.layoutPlanningDynamicBatching = true;
Memory.settings.layoutPlanningDebugPhaseFrom = 1;
Memory.settings.layoutPlanningDebugPhaseTo = 10;
Memory.settings.layoutPlanningRecalcScope = 'all';
```

### Optional clean start for planner debugging only

```js
startFresh({ theoreticalBuildingMode: true });
visual.cpuPolicy('aggressive');
visual.memHack(1);
```

---

## 1) Verify Manual Planner Mode and Phase Control

### A) Enable manual mode

```js
visual.layoutManualMode(1)
```

**Expected:** log confirms that manual planner mode is active.

### B) Initial run through Base Phase 4 (maps internally to phases 1..9)

```js
visual.layoutInitializePhase('W1N1', 4, 1)
```

Let 5-20 ticks run.

**Check:**

- `Memory.rooms['W1N1'].layout.theoreticalPipeline.status` is
  `paused_phase_9` or `completed`
- `Memory.rooms['W1N1'].layout.theoretical.selectedCandidateIndex` is set
- no exceptions in logs
- with `overlayMode('off')`, no render intents are created
  (`INTENT_RENDER_HUD` / `INTENT_SYNC_OVERLAY`)

### C) Recalculate only Base Phases 3..4

```js
visual.layoutInitializePhase('W1N1', 4, 3)
```

Let 5-20 ticks run again.

**Check:**

- rerun starts without a full reset
- candidate and evaluation data refresh correctly

---

## 2) Verify the Min-Cut Algorithm (flow + continuity)

### A) Overlay on candidates / evaluation

```js
visual.layoutView('candidates')
visual.layoutCandidate('selected')
```

### B) Inspect memory metadata

```js
const p = Memory.rooms['W1N1'].layout.theoreticalPipeline;
const t = Memory.rooms['W1N1'].layout.theoretical;
({
  pipelineStatus: p && p.status,
  selected: t && t.selectedCandidateIndex,
  continuityMeta: t && t.candidates && t.candidates.find(c => c.selected)?.weightedMetrics
})
```

### C) Expectation

- a cut exists and is visible / derivable as a rampart line
- no obviously disconnected rampart islands
- on difficult rooms, continuity bridging may legitimately show `bridgedTiles > 0`

---

## 3) Verify the Flood-Fill Algorithm

Weighted expansion and 4-way behavior are already covered by unit tests. Here
the goal is practical verification.

### A) Visual inspection

```js
visual.layoutView('floodDepth')
```

**Check:**

- flood depths look radially plausible
- no implausible jumps across walls

### B) On swamp-heavy rooms

- verify that placement is not unnaturally biased toward swamp corridors
- cross-check candidate ranking with `visual.layoutView('evaluation')`

---

## 4) Verify BasePlan Validation

### A) Validation object

```js
Memory.rooms['W1N1'].basePlan && Memory.rooms['W1N1'].basePlan.validation
```

### B) Recovery object

```js
Memory.rooms['W1N1'].basePlan && Memory.rooms['W1N1'].basePlan.validationRecovery
```

### C) Profiling field

```js
Memory.rooms['W1N1'].basePlan &&
Memory.rooms['W1N1'].basePlan.validation &&
Memory.rooms['W1N1'].basePlan.validation.checkedAt
```

`durationMs` comes from the validator result and should stay observable across
reruns.

### D) Expectation

- `validation` exists
- if there are warnings, `issues` are concrete
  (`lab-range-fail`, `rampart-connectivity-fail`, etc.)

---

## 5) Verify Building / HUD Integration

### A) HUD

- Base-plan block is visible
- It contains: status, spawn, score, validation (`ok` / `warn(N)`), next build

### B) BuildQueue consumption

```js
Memory.rooms['W1N1'].basePlan &&
Memory.rooms['W1N1'].basePlan.buildQueue &&
Memory.rooms['W1N1'].basePlan.buildQueue.slice(0, 5)
```

**Expected:**

- `manager.building.executeLayout` works exclusively from `basePlan.buildQueue`
  with no legacy matrix fallback
- if `visual.overlayMode('off')` is active, no HUD/layout rendering occurs even
  while the pipeline is running

---

## 6) Failure Snapshot Reference

If something looks wrong, capture it immediately:

```js
({
  tick: Game.time,
  room: 'W1N1',
  manualMode: Memory.settings.layoutPlanningManualMode,
  overlay: Memory.settings.layoutOverlayView,
  pipeline: Memory.rooms['W1N1'].layout && Memory.rooms['W1N1'].layout.theoreticalPipeline,
  theoretical: Memory.rooms['W1N1'].layout && Memory.rooms['W1N1'].layout.theoretical,
  basePlanValidation: Memory.rooms['W1N1'].basePlan && Memory.rooms['W1N1'].basePlan.validation,
  basePlanRecovery: Memory.rooms['W1N1'].basePlan && Memory.rooms['W1N1'].basePlan.validationRecovery,
})
```

This gives you a stable comparison snapshot for later debugging sessions.

---

## 7) Completion Criteria

An algorithm is considered complete when:

- unit tests are green
- the manual run is reproducible
- the corresponding roadmap / wiki marker was updated
- debug metadata is available so later failures can still be reconstructed

---

## 8) 10-Minute Smoke Test

If you only want a fast green/red pass:

1. **Enable manual mode and initialize**

```js
visual.layoutManualMode(1)
visual.layoutInitializePhase('W1N1', 4, 1)
```

**Expectation:** pipeline lands on `paused_phase_9` or `completed`, with no exceptions.

2. **BasePlan exists and validation is present**

```js
({
  hasBasePlan: !!(Memory.rooms['W1N1'].basePlan),
  validation: Memory.rooms['W1N1'].basePlan && Memory.rooms['W1N1'].basePlan.validation
})
```

**Expectation:** `hasBasePlan === true`, validation object exists.

3. **BuildQueue is not empty and next build is plausible**

```js
Memory.rooms['W1N1'].basePlan &&
Memory.rooms['W1N1'].basePlan.buildQueue &&
Memory.rooms['W1N1'].basePlan.buildQueue.slice(0, 3)
```

**Expectation:** early entries look plausible for the current RCL
(spawn / roads / extensions depending on phase and room state).

4. **Cross-check HUD**

- base-plan block shows status / score / validation / next build
- no contradictory legacy indicators remain in the HUD
- with `overlayMode('off')`, HUD stays hidden and verification happens only via
  memory / console

If these four checks pass, the core end-to-end path is stable.

---

## 9) Watch the Bootstrap-Base to Target-Base Transition

For the future transition plan where the first spawn starts in a temporary spot:

### Watch these signals

- Is the first spawn kept as a persistent target in `basePlan.buildQueue`, or
  merely tolerated as a bootstrap state?
- Starting at RCL 5/6, does a clear transition path appear
  (second spawn plus critical infrastructure first)?
- Does the queue stay deterministic after RCL upgrades, or does it flip-flop?

### Snapshot for strategy comparison (rush vs dual-mode)

```js
({
  tick: Game.time,
  rcl: Game.rooms['W1N1'] && Game.rooms['W1N1'].controller && Game.rooms['W1N1'].controller.level,
  spawns: (Game.rooms['W1N1'] && Game.rooms['W1N1'].find(FIND_MY_SPAWNS) || []).map(s => ({ id: s.id, x: s.pos.x, y: s.pos.y })),
  nextBuilds: Memory.rooms['W1N1'].basePlan && Memory.rooms['W1N1'].basePlan.buildQueue
    ? Memory.rooms['W1N1'].basePlan.buildQueue.filter(i => !i.built).slice(0, 8)
    : [],
  validation: Memory.rooms['W1N1'].basePlan && Memory.rooms['W1N1'].basePlan.validation
})
```

This lets you compare later whether a hard RCL5 rush path or a temporary
dual-mode transition is the cleaner implementation.

---

## 10) Runtime / Memory Quick Check

For stable baseplanner debugging under constrained CPU:

```js
JSON.stringify(visual.runtimeExplain(), null, 2)
```

```js
JSON.stringify(visual.memHack('status'), null, 2)
```

```js
JSON.stringify(visual.memoryFootprint('W1N1'), null, 2)
```

Expectation:

- runtime clearly reports `active` or `idle`
- MemHack shows `enabled=true` and ideally `mode='hit'`
- candidate and pipeline data stay compact after completion
  (top candidates plus latest run only)
