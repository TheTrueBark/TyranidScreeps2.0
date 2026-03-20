# Dynamic Base-Building Algorithm: Complete Implementation Specification

**Version:** 2.0  
**Target System:** TyranidScreeps2.0  
**Integration Points:** `planner.buildCompendium.js`, `manager.memory.js`, `manager.hud.js`, `layoutPlanner.js`

---

## Executive Summary

**Manual verification checklist:** `TyranidScreeps2.0.wiki/Baseplanner-Manual-Verification-Checklist.md`

This specification describes a fully dynamic Screeps baseplanner. Instead of
using fixed stamps, each room is evaluated by topology, spawn candidates are
scored through weighted metrics, and a full RCL-aware plan (`RCL1 -> RCL8`) is
generated from that result.

### Core goals

- Multi-candidate spawn evaluation with weighted factors
- Use of distance transform from `algorithm.distanceTransform.js`
- Flood fill for core proximity and placement priority
- Min-cut-based rampart envelopes
- Checkerboard extension and road fields
- Lab constraint solving (range-2 rule)
- Tower coverage optimization
- Full memory, HUD, and build-queue integration

---

## Delivery Scope Note

The current delivery across Phases 1-3 is intentionally a **functional first
implementation**:

- complete planner flow through `buildQueue` emission
- modular algorithm building blocks
- practical debugability for manual verification

The following follow-up work remains explicitly planned once every phase is in
place:

1. **Production-grade min-cut:** now implemented as a flow-based vertex min-cut
   with node splitting, max-flow, cut extraction, and continuity bridging.
2. **Barrier robustness:** further validation of connected defensive envelopes
   on difficult map and exit geometries.
3. **Profiling hardening:** tighter CPU and bucket guarantees for full replans
   and edge cases.

## Runtime Prerequisites (2026-02 Update)

For reproducible baseplanner behavior, use these runtime principles:

1. Run planner verification primarily in `visual.runMode('theoretical')`.
2. Control overlay cost explicitly:
   - `visual.overlayMode('debug')` for visual analysis
   - `visual.overlayMode('off')` for CPU/pipeline measurement only
3. Runtime uses idle gating plus HTM budget policy, and expensive planner work
   is intent-driven.
4. MemHack is enabled by default to reduce memory parse overhead.
5. Theoretical memory is compacted after completed or stale runs (top candidates
   plus the last retained run).

These conditions are part of the target architecture and should be respected
during manual verification.

## 1) Game Mechanics Reference

### 1.1 RCL limits

- Extensions RCL2-RCL8: `5 / 10 / 20 / 30 / 40 / 50 / 60`
- Towers: `0 / 1 / 1 / 2 / 2 / 3 / 6`
- Spawns: `1 / 1 / 1 / 1 / 1 / 2 / 3`
- Links: `0 / 0 / 0 / 2 / 3 / 4 / 6`
- Labs: `0 / 0 / 0 / 0 / 3 / 6 / 10`
- Storage: from RCL4
- Terminal: from RCL6
- Factory: RCL7+
- Observer / Power Spawn / Nuker: RCL8
- Containers: maximum 5
- Ramparts / walls: from RCL2 (2500 structures)

### 1.2 Movement and fatigue

- Formula: `F = 2 * (W * K - M)`
- Terrain factors: road `0.5`, plain `1.0`, swamp `5.0`
- Important rule: a road on swamp removes the swamp movement penalty
- Ticks per tile: `ceil(K * W / M)`

### 1.3 CostMatrix

- `0`: terrain default
- `1-254`: custom cost
- `>=255`: impassable
- Values replace terrain costs rather than stacking on top
- Standard road-planning costs: `plainCost: 1`, `swampCost: 5`

### 1.4 Tower damage

- Base damage `600`, full value through range 5
- Falloff to `150` by range 20
- Practical approximation: about `30` less damage per tile from range 5 to 20

### 1.5 Links

- Transfer loss: `ceil(amount * 0.03)`
- Cooldown equals distance in tiles
- Capacity: `800`

### 1.6 Labs

- Every reaction lab must stay within range 2 of both source labs
- Ideal RCL8 setup: 2 source labs + 8 reaction labs = 10 total

### 1.7 Spawn and boundary rules

- A spawn needs at least one free neighbor
- No non-road / non-rampart structures on the exit border (`x/y = 0 or 49`)

---

## 2) Spawn Position Evaluation System

### 2.1 Prerequisites

- [x] Distance transform available (`algorithm.distanceTransform.js`)
- [x] Terrain, sources, mineral, and controller readable
- [x] Exit tiles identifiable

**Status (2026-02, Phase 1 completed):**

- Foundation scaffolding was extracted into `planner.baseplannerFoundation.js`
  from earlier inspiration code in `planner.buildCompendium.js`.
- It contains utility math (`chebyshev`, `manhattan`, `clamp01`, `mean`) plus
  terrain/exit preprocessing (`buildTerrainMatrices`, `ensureDistanceTransform`).
- `planner.buildCompendium.js` now uses this foundation directly for spawn
  candidate evaluation and anchor-plan generation.
- Debugging was extended with phase windows
  (`layoutPlanningDebugPhaseFrom/To`), selective recalculation scopes
  (`layoutPlanningRecalcScope`), and a flood-depth visual
  (`layoutOverlayView = floodDepth`).

### 2.2 Weighted scoring

Form: `score = Σ(w_i * normalize(f_i))`

**Factors and weights**

- controllerDist: `-2.6`
- avgSourceDist: `-0.65`
- mineralDist: `-0.2`
- dtValue: `+1.4`
- exitDist: `+0.8`
- exitDistPenalty (<5): `-4.2`
- terrainQuality: `+0.8`
- symmetry: `+0.3`
- defenseRampart: `+0.9`
- defenseStandoff: `+1.1`

### 2.3 Candidate pipeline

1. Iterate tiles `1..48`
2. Hard filter: `DT >= 3`, not swamp/wall, `exitDist >= 5`
3. Compute weighted score
4. Sort by score
5. Keep top N (default 5)
6. Persist under `Memory.rooms[roomName].spawnCandidates`

### 2.4 Implementation status

- [ ] `evaluateSpawnPosition`
- [ ] `chebyshev`, `pathDistance`, `normalize`, `standardDeviation`
- [ ] `estimateRampartEfficiency`, `estimateStandoffDistance`
- [ ] `findTopSpawnCandidates(room, N=5)`
- [ ] Console helper `evaluateSpawns('W7N3')`

---

## 3) Core Algorithms

### 3.1 Distance transform

- Status: implemented in `algorithm.distanceTransform.js`

### 3.2 Flood fill

- BFS from the spawn core returning a distance matrix
- Lower distance means higher placement priority
- [x] `algorithm.floodFill.js`
- [x] Combined with walkability matrices
- [x] Supports weighted expansion and optional 4-way movement for swamp-heavy
  debugging

### 3.3 Min-cut (Edmonds-Karp style target)

- Goal: minimal rampart line between core and exits
- Graph uses tile node splitting
- Tile weights: swamps cost more, walls are not cuttable
- [x] `algorithm.minCut.js` as a flow-based vertex min-cut implementation
- [x] Max-flow plus cut extraction
- [x] Continuous barrier verification through post-cut continuity bridging

### 3.4 Checkerboard

- White/black pattern via `(x + y) % 2`
- Extensions on one color, roads on the other
- [x] Extension-pattern generator
- [x] Road-pattern generator
- [x] Optional `cluster3` Harabi grid for more walkable build fields

---

## 4) Dynamic Placement Algorithm

### 4.1 Guiding principles

1. Core first
2. No retroactive shifts
3. Strict constraint validation
4. RCL-aware build order

### 4.2 Core cluster (5x5)

- Spawn (origin)
- Storage (adjacent)
- Terminal (adjacent to storage)
- Hub link (adjacent to storage and terminal)
- Factory + Power Spawn near the hub
- Goal: one hub creep can service central structures from range 1

### 4.3 Controller zone

- Container in range 1 to the controller
- Link in range 2 with line-of-sight to the hub link
- Upgrade spots collected in range 3

### 4.4 Source stations

- Per source: container on the path toward storage and adjacent to the source
- Link adjacent to the container and at most range 2 to the source
- Integrates with `Memory.rooms[room].miningPositions`

### 4.5 Extensions

- Checkerboard plus flood-distance sorting
- RCL-compliant counts (`5, 10, 20, ... 60`)

### 4.6 Labs

- Find a connected area near the terminal
- Search for 2 source-lab positions enabling 8 reaction labs
- On failure: emit a warning and continue without labs

### 4.7 Towers

- Greedy placement maximizing minimum combined rampart DPS

### 4.8 Ramparts

- Min-cut as the base envelope plus extra protection on critical core structures

### 4.9 Road network

- Source ↔ storage
- Controller ↔ storage
- Mineral ↔ storage
- Exit roads
- Rampart service paths
- Standard path costs: `plain = 1`, `swamp = 5`

---

## 5) RCL Build Priorities

### Priority model

- Priority 1: spawn, extensions, storage (from RCL4)
- Priority 2: tower, link, terminal
- Priority 3: container, rampart, critical roads
- Priority 4+: labs, extractor, factory, observer, nuker by RCL

### Queue format

```js
Memory.rooms[roomName].buildQueue = [
  { type: 'extension', pos: { x: 25, y: 30 }, rcl: 2, priority: 1, built: false }
];
```

### Ordering

1. By RCL
2. By priority
3. By distance to the spawn

- [x] `generateBuildQueue(room, basePlan)` implemented as `buildQueueFromPlan(plan)`
- [x] `getNextBuild(room)` implemented as a helper in `planner.buildCompendium.js`
- [ ] Integration in `manager.building.js`

---

## 6) Multi-Layout Evaluation

### Weighted metrics

- avgExtDist (`0.14`)
- maxExtDist (`0.07`)
- minTowerDamage (`0.13`)
- rampartEff (`0.09`)
- roadEff (`0.02`)
- sourceDist (`0.07`)
- controllerDist (`0.15`)
- compactness (`0.04`)
- labQuality (`0.04`)
- hubQuality (`0.04`)
- rangedBuffer (`0.06`)
- logisticsCoverage (`0.10`)
- infraCost (`0.05`)

### Workflow

1. Generate top spawn candidates
2. Build a complete layout for each candidate
3. Evaluate every layout
4. Pick the best score
5. Persist the result under `Memory.rooms[room].basePlan`

- [x] `evaluateLayout(room, layout)` via `evaluateLayoutForRoom(roomOrName, layout)`
- [x] `generateCompleteLayout(room, spawnPos)`
- [x] `generateOptimalLayout(room)` via weighted candidate selection

### Winner Selection

Winner selection is now isolated in `planner.winnerSelection.js`.

- Hard rejects remain absolute exclusions
- Penalties are bucketed as critical / major / minor
- Tie-breaks are deterministic
- Finalists can be reranked against materialized `full` plans
- Tuning lives under `Memory.settings.layoutWinnerSelection`

This keeps layout generation and winner-selection heuristics independently
testable and easier to reason about.

---

## 7) Memory Integration

### Schema

`Memory.rooms[room].basePlan` contains:

- version
- generatedAt
- spawnPos
- `structures`
- `buildQueue`
- `evaluation`

Temporary planner state additionally includes:

- `spawnCandidates`
- theoretical pipeline state

### Manager API

- [ ] `initializeBasePlanMemory(room)`
- [ ] `storeBasePlan(roomName, plan)`
- [ ] `getBasePlan(roomName)`
- [ ] `markStructureBuilt(roomName, index)`
- [ ] `getNextStructureToBuild(roomName, currentRCL)`

---

## 8) HUD Visualization

### HUD blocks

- planning status (present / missing)
- spawn position
- build progress
- quality score
- next build item

### Overlay

- planned structures visualized by type through `RoomVisual`
- current RCL shown solid
- future RCL shown as transparent / outlined
- toggle target: `togglePlanVis(roomName)`

- [ ] `renderBasePlanningStatus(room, x, y)`
- [ ] `visualizePlannedStructures(room)`

---

## 9) Edge Cases and Validation

### Typical problem cases

- No 5x5 area available -> lower DT threshold
- Controller in a corner -> prioritize a minimal upgrade core
- One-source room -> adjust link distribution
- Swamp-heavy room -> prioritize critical roads
- Asymmetric / narrow corridors -> accept longer but more defensible ramparts

### Validation checks

- core adjacency rules
- controller container in range 1
- reaction labs in range 2 to both source labs
- extension count per RCL
- overlap checks
- boundary rule (no build on exit border except road/rampart)
- rampart connectivity

- [x] `validateBasePlan(room, plan)` in `manager.basePlanValidation.js`
- [x] validation failure handling and persisted `basePlan.validationRecovery`
- [x] overlap and queue consistency checks
- [x] extension RCL-cap normalization
- [x] controller container validation
- [x] lab constraint validation
- [x] rampart connectivity validation
- [x] `validateBasePlan` records `durationMs` for runtime profiling

---

## 10) Implementation Phases

### Phase 1 - Foundation

- utility math plus terrain / exit basics
- `planner.room.js` scaffolding

### Phase 2 - Core Algorithms

- flood fill
- min-cut
- checkerboard placement

### Phase 3 - Placement System

**Status (2026-02):** placement is active in `planner.buildCompendium.js`
(core/controller/source/lab/tower/rampart/road) and already emits
buildQueue-ready output.

### Phase 4 - Evaluation and Selection

- 13 metrics plus multi-candidate selection

### Phase 5 - Memory and HUD

- persistence, HUD, overlay

**Status (2026-02 / 2026-03):**

- `layoutPlanner.js` persists the winner under `Memory.rooms[room].basePlan`
- `planner.winnerSelection.js` encapsulates hard rejects, penalty buckets,
  deterministic tie-breaks, and the `full` finalist rerank
- `manager.hud.js` shows baseplan status, spawn position, score, and next queue item
- `manager.building.js` consumes `basePlan.buildQueue` before legacy layout data

### Phase 6 - Validation and Hardening

- edge-case validation
- performance targets
- end-to-end construction integration

### Manual planner mode

Settings in `Memory.settings`:

- `layoutPlanningManualMode` (`true|false`): if `true`, the theoretical planner
  does not start automatically and waits for explicit initialization.
- `layoutPlanningMode` should be `'theoretical'` and is managed through
  `visual.layoutManualMode(1)` / `visual.layoutInitializePhase(...)`.

Debug commands:

- `visual.layoutManualMode(1|0)` to toggle manual planner mode
- `visual.layoutInitializePhase(roomName, phaseTo, phaseFrom=1)` to start a
  manual phase calculation

Baseplanner phase mapping to internal debug phases:

- Base Phase 1 -> internal `1..3` (foundation)
- Base Phase 2 -> internal `4..4` (algorithm setup)
- Base Phase 3 -> internal `5..7` (placement)
- Base Phase 4 -> internal `8..9` (scoring + winner selection)
- Base Phase 5/6 -> internal `10..10` (persist / integration / validation-near)

Examples:

- "Nothing calculated yet, initialize through Phase 4":
  `visual.layoutInitializePhase('W1N1', 4, 1)`
- "Already in Phase 4, rerun only 3..4":
  `visual.layoutInitializePhase('W1N1', 4, 3)`

---

## Integration Points

- `planner.buildCompendium.js` - harmonize spawn scoring and weights
- `manager.memory.js` - extend the BasePlan API
- `manager.hud.js` - plan status and overlay
- `manager.building.js` - queue consumption (`getNextStructureToBuild`)
- `layoutPlanner.js` - integrate or replace the older dynamic system
- `memory.schemas.js` - document schema changes
- `main.js` - HUD and overlay calls

---

## Performance Targets

- Distance transform: `< 50 ms`
- Flood fill: `< 30 ms`
- Spawn evaluation (all tiles): `< 2 s`
- Min-cut: `< 3 s`
- Full layout generation: `< 5 s`
- 5-candidate workflow: `< 30 s`

If these are exceeded:

- inspect CPU profiles via `Game.cpu.getUsed()`
- optimize hot paths
- cache distance-transform / terrain work
- shrink search space when needed

---

## Operational Commands (target picture)

```js
global.planRoom(roomName)
global.evaluateSpawns(roomName)
global.togglePlanVis(roomName)
global.validatePlan(roomName)
global.nextBuild(roomName)
global.replanRoom(roomName)
```

---

## Source Reference

- Automating Base Planning in Screeps – A Step-by-Step Guide:
  https://sy-harabi.github.io/Automating-base-planning-in-screeps/
