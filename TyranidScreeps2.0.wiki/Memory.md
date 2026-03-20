# 🗄️ Memory Layout

This file documents the persistent memory schema used by Tyranid Screeps.  All modules interact with memory through these namespaces.  Each module owns its branch and is responsible for migrations when the schema version changes.

Codex annotations such as `@codex-owner` and `@codex-path` appear throughout this
document and the source. They specify which module maintains a memory branch and
where it resides. The mapping is also captured in `memory.schemas.js` for
automated reference generation.

## Schema Versions

`Memory.hive.version` tracks the current hive schema.  `memory.migrations.js`
defines `MEMORY_VERSION` and migration steps applied whenever the stored version
is lower.  Version `2` adds a demand namespace.

```javascript
Memory.hive = {
  version: 2,
  clusters: {
    [clusterId]: {
      meta: {},
      colonies: {
        [colonyId]: {
          meta: {},
          creeps: {},
          structures: {},
          tasks: {},
        }
      }
    }
  }
};
```

`manager.memory.js` ensures this layout exists via `initializeHiveMemory(clusterId, colonyId)`.
The `meta` section may track additional data. Base distributors store their
assigned creep name here:

```javascript
Memory.hive.clusters['W1N1'].colonies['W1N1'].meta = {
  distributor: 'D1'
};
```

## Module Ownership

- **memoryManager** – owns `Memory.hive` and `Memory.rooms`.
- **HTM** – stores task queues under `Memory.htm`.
- **spawnQueue** – uses `Memory.spawnQueue` and `Memory.nextSpawnRequestId`.
- **demand module** – stores delivery metrics under `Memory.demand`.
- **logger/statsConsole** – maintain `Memory.stats`.
- **main** – user toggles stored under `Memory.settings`.
- **hive.roles** – evaluation timestamps in `Memory.roleEval`.
- **hiveTravel** – hostile room data in `Memory.empire`.

Modules must only modify their own branches.

## Initialization Defaults

Room initialization populates `Memory.rooms[roomName]` with:

```javascript
{
  miningPositions: {},
  reservedPositions: {},
  restrictedArea: [],
  controllerUpgradeSpots: 0
}
```

Cluster and colony memory follow the defaults in `manager.memory.js`.

### Mining Positions

@codex-owner manager.room
@codex-path Memory.rooms[roomName].miningPositions

Each source stores possible mining spots and the travel time from the spawn.

```javascript
Memory.rooms['W1N1'].miningPositions['src1'] = {
  x: 10,
  y: 20,
  distanceFromSpawn: 15,
  positions: {
    best1: { x: 11, y: 20, roomName: 'W1N1', reserved: false },
    best2: null,
    best3: null,
  },
};
```

`distanceFromSpawn` is used by the lifecycle predictor to schedule miner replacements.

## Adding New Schemas

When a module requires persistent storage it should register its schema and version in `memory.schemas.js` so documentation can be generated automatically.  Migration functions can read `Memory.hive.version` to upgrade data structures.
The registry is a simple object mapping keys to `{ version, owner }` pairs.  Codex uses this file to produce the table of memory layouts.

When the hive starts, `initializeHiveMemory` checks `Memory.hive.version` and
runs any migrations registered in `memory.migrations.js`. Each migration updates
older layouts so the AI can evolve without wiping persistent data.

### Spawn Queue

@codex-owner spawnQueue
@codex-path Memory.spawnQueue
@codex-version 1

`Memory.spawnQueue` holds pending creep requests. Each entry is an object:

```javascript
{
  requestId: 'time-counter',
  category: 'miner',
  room: 'W1N1',
  bodyParts: [WORK, MOVE],
  memory: { role: 'miner' },
  spawnId: '5abc123',
  ticksToSpawn: 0,
  energyRequired: 300,
  priority: 2
}
```

`Memory.nextSpawnRequestId` increments each tick to ensure unique ids. Requests
are sorted by `priority` and `ticksToSpawn` when processed by
`manager.spawnQueue`.

### Miner Lifecycle Memory

Expected creep memory for miners spawned by the lifecycle predictor:

```javascript
memory: {
  role: 'miner',
  assignment: {
    sourceId: '...',
    containerId: '...',
    pos: { x: 12, y: 25, roomName: 'W1N1' }
  },
  spawnedBy: 'lifecyclePredictor',
  originCreep: 'Creep1234'
}
```

Spawn queue entries created by this system include metadata:

```javascript
{
  role: 'miner',
  room: 'W1N1',
  memory: { /* see above */ },
  assignment: { sourceId, pos },
  origin: 'lifecyclePredictor',
  priority: spawnManager.PRIORITY_HIGH
}
```

### Hauler Lifecycle Memory

Haulers scheduled by the lifecycle predictor clone the original creep memory and
record spawn timing expectations:

```javascript
memory: {
  role: 'hauler',
  assignment: {
    routeId: 'r1',
    sourceId: 'src',
    destId: 'storage',
    pickupId: 'container123',
    pickupPos: { x: 12, y: 25, roomName: 'W1N1' }
  },
  spawnedBy: 'lifecyclePredictor',
  originCreep: 'Hauler1234',
  originDeathTick: 123456
}
```

Spawn queue entries mirror this memory and include `origin: 'lifecyclePredictor'`
alongside the `assignment` route id.

### Energy Demand Tracking

@codex-owner hivemind.demand
@codex-path Memory.demand
@codex-version 1

Tracks how much energy structures request and how much creeps deliver. Layout:

```javascript
Memory.demand = {
  rooms: {
    [roomName]: {
      requesters: { [id]: { lastEnergyRequested, deliveries, averageRequested } },
      deliverers: { [name]: { role, deliveries, averageEnergy } },
      totals: { demand: 0, supply: 0, demandRate: 0, supplyRate: 0 },
      runNextTick: false
    }
  },
  globalTotals: { demand: 0, supply: 0, demandRate: 0, supplyRate: 0 }
};
```

The demand module updates these metrics every tick and decides when additional
haulers should be spawned.

### Manual Spawn Limits

@codex-owner hive.roles
@codex-path Memory.rooms[roomName].manualSpawnLimits

`manualSpawnLimits` allows per-room overrides for desired creep counts.
Each role key can be a number or the string `'auto'`. `'auto'` (the default)
means the evaluator calculates the limit normally. Any numeric value overrides
the dynamic result. The console displays the manual limit alongside each role.

```javascript
Memory.rooms['W1N1'].manualSpawnLimits = { builders: 'auto', miners: 2 };
```

## Theoretical Layout Retention

The theoretical planner now prunes memory aggressively after completed/stale runs:

- Keeps only top candidate rows (plus explicitly selected overlay candidate when needed).
- Keeps only compact candidate plan fields for retained entries.
- Compacts completed `layout.theoretical` payloads down to HUD/overlay essentials.
- Stores compact base-plan planner debug summaries instead of duplicate full preview arrays.
- Keeps only one compact latest `pipelineRuns` entry per room.
- Stores last prune summary under `Memory.rooms[room].layout.memTrimLast`.
- Live runtime performs additional automatic hygiene:
  - checks memory pressure every 25 ticks,
  - warns around `1.5 MB`,
  - trims only safe, non-active planner branches around `1.8 MB`,
  - runs an `ownedOnly` safe sweep around `1.95 MB`,
  - and performs a periodic safe sweep every 500 ticks.
- `Memory.stats.tickPipeline` keeps only the latest 60 committed ticks.
- `Memory.stats.memoryBreakdown` stores a compact size snapshot every 100 ticks, highlighting heavy branches such as `stats.tickPipeline.byTick`, top-level memory roots, and the largest room-local branches.
- the breakdown also keeps the heaviest individual `stats.tickPipeline.byTick` entries so bloated single-tick snapshots are visible.

Manual inspection helpers:

- `visual.memoryFootprint(room?)` for a quick planner-focused room overview.
- `visual.memoryBreakdown()` to force-refresh the stored breakdown.
- `visual.memoryBreakdown('cached')` to read the last captured snapshot without recomputing it.
- `visual.memoryBreakdownReport()` to print a shareable multi-line report into the Screeps console.
- `visual.memoryBreakdownReport('cached')` to reprint the last stored report source without recomputing it.

This reduces persistent memory bloat and helps lower idle CPU from memory parse/serialize overhead.

Each hauler route stores rolling averages under `Memory.demand.routes`:

```javascript
Memory.demand.routes[routeId] = {
  avgRoundTrip: 47,
  roundTripCount: 3,
  activeHaulers: ['H1'],
  totals: { demand: 0 },
  assignmentInfo: {
    sourceId: 'src',
    destId: 'storage',
    pickupId: 'container123',
    pickupPos: { x: 12, y: 25, roomName: 'W1N1' },
    type: 'remotePull'
  }
};
```

### Energy Reserves

@codex-owner role.hauler
@codex-path Memory.energyReserves

Tracks observed energy sources and depots along with the swarm roles that may
interact with them. Each key is a resource or structure id and the value
includes the currently reserved energy plus metadata describing who may
withdraw from or deposit into that location.

```javascript
Memory.energyReserves[sourceId] = {
  reserved: 100,        // energy promised to creeps
  available: 400,       // most recently observed energy on the target
  type: 'harvestContainer', // or miningDrop, friendlyCombatDrop, hostileDeathDrop, etc
  haulersMayWithdraw: true,
  haulersMayDeposit: false,
  buildersMayWithdraw: true,
  buildersMayDeposit: false,
  flaggedForRemoval: false, // set when cleanup sees an empty target; cleared on next observation
  removalFlaggedAt: null,   // tick recorded when flagged; null once active again
};
```

`memoryManager.cleanUpEnergyReserves` now marks empty or missing targets for
removal on the first pass by setting `flaggedForRemoval`. If the entry is still
invalid the next time the garbage collector runs the entry is deleted. This
prevents rapid churn when resource counts briefly hit zero.

`Memory.energyReserveEvents` records recent friendly and hostile deaths so
reserve descriptors can tag energy as `friendlyCombatDrop`, `friendlyLifespanDrop`
or `hostileDeathDrop`. The observer tracks creep vitals each tick and remembers
new tombstones to avoid classifying stale combat zones as safe.

### Runtime Settings

@codex-owner main
@codex-path Memory.settings
@codex-version 1

Stores toggles for optional features such as HUD visuals, scheduler task
listing, and verbose energy logging.
Example:

```javascript
Memory.settings = {
  enableVisuals: true,
  showTaskList: false,
  energyLogs: false,
  debugHiveGaze: false,
  debugBuilding: false,      // log build results and draw visual overlays
  debugLayoutProgress: false // log layout progress every 1000 ticks
  debugVisuals: false,       // draw role and tower debug icons
  enableTowerRepairs: true   // allow towers to repair when bucket is high
};
```

### Role Evaluation

@codex-owner hive.roles
@codex-path Memory.roleEval
@codex-version 1

Used to throttle automatic role evaluation when CPU is scarce.

```javascript
Memory.roleEval = { lastRun: 0 };
```

### Empire Data

@codex-owner hiveTravel
@codex-path Memory.empire
@codex-version 1

Legacy storage for hostile room information used by the pathing system.

```javascript
Memory.empire = {
  hostileRooms: { [roomName]: true }
};
```

### Statistics

@codex-owner logger
@codex-path Memory.stats
@codex-version 1

Console, dashboard, and task-execution telemetry is aggregated here.
`Memory.stats.taskLogs` keeps the most recent task executions.

The external operator surface is expected to be the Dashboard at
`https://github.com/TheTrueBark/Dashboard`, while `Memory.stats` remains the
authoritative in-game storage branch.

Lifecycle-based miner stats are recorded under:

```javascript
Memory.stats.lifecyclePrediction.miner = {
  replacedOnTime: 0,
  replacedLate: 0,
  energyMissedEstimate: 0,
};
```

Hauler replacement accuracy is stored under:

```javascript
Memory.stats.haulerSpawnTiming = {
  late: 0,
  early: 0,
  perfect: 0,
  history: []
};
```

### Expansion Vision Timestamp

@codex-owner hiveGaze
@codex-path Memory.hive.expansionVisionLastCheck

Last game tick when HiveGaze evaluated exits and queued scout tasks.

### Mining Route Cache

@codex-owner hiveGaze
@codex-path Memory.rooms[roomName].miningRoutes

Each source stores the path length from the spawn used by lifecycle
prediction and remote logistics.

```javascript
Memory.rooms['W1N1'].miningRoutes['src1'] = {
  pathLength: 15,
  lastCalculated: 12345
};
```

### Scout Retirement Flag

@codex-owner role.scout
@codex-path creep.memory.retiring

Indicates a scout has re-queued its task due to low TTL and is
returning to base for recycling.

```javascript
creep.memory.retiring = true;
```

### Scout Cooldown

@codex-owner hiveGaze
@codex-path Memory.rooms[roomName].scoutCooldownUntil

Rooms that have failed scouting multiple times will be skipped until this
timestamp. The cooldown prevents endless re-queuing of unreachable scout tasks.

### Scout Initialization Status

@codex-owner hiveGaze
@codex-path Memory.rooms[roomName].scoutInit

Tracks one-time scouting seeding per colony. When a room gains a spawn or the
hive respawns, `initializeScoutMemory` queues a low-priority job that seeds
adjacent rooms and captures baseline intel.

```javascript
Memory.rooms['W1N1'].scoutInit = {
  version: 1,
  completed: 12345,
};
```

### Scout Visibility Flag

@codex-owner hiveGaze
@codex-path Memory.rooms[roomName].scouted

Boolean marker indicating whether the room has been successfully scouted at
least once since initialization. Newly seeded rooms start as `false` and scouts
flip the flag to `true` when room intel is recorded.

### Terrain Snapshot

@codex-owner memoryManager
@codex-path Memory.rooms[roomName].terrainInfo

Compressed terrain payloads matching the savestate format. The blob stores a
50x50 tile matrix encoded with `plain=0`, `swamp=1`, and `wall=2` plus a wall
mask for quick distance-transform reuse.

```javascript
Memory.rooms['W1N1'].terrainInfo = {
  version: 1,
  compressed: '<LZString base64 payload>',
  generated: 12345,
  format: 'lz-base64-json',
};
```

### Remote Scoring

@codex-owner hiveGaze
@codex-path Memory.rooms[room].remoteScore
@codex-path Memory.rooms[room].sources[sourceId].score
@codex-path Memory.rooms[room].sources[sourceId].assignedPosition
@codex-path Memory.rooms[room].sources[sourceId].reservedBy
@codex-path Memory.hive.expansionTarget

Scores computed for remote mining targets are stored per room and per source.
`assignedPosition` and `reservedBy` track remote miner reservations. The room
with the highest `remoteScore` is kept under `Memory.hive.expansionTarget`.

### Remote Room Tracking

@codex-owner hiveGaze
@codex-path Memory.hive.claimedRemotes

Active remote rooms currently mined or reserved by the hive. Entries are added
when a remote miner is alive or a controller reservation exceeds 1000 ticks.
Rooms are removed once no miner is present and reservation time drops below
1000 ticks.

@codex-path Memory.rooms[room].reserveAttempts

Number of failed reservation attempts for a room. Resets on success.

@codex-path Memory.stats.remoteRooms[roomName]

Statistics for remote operations including miner and reservist spawn counts,
successes, and failures.

### Controller Upgrade Spots

@codex-owner manager.room
@codex-path Memory.rooms[roomName].controllerUpgradeSpots

Number of walkable tiles within range 3 of the controller. Used to cap dedicated
upgraders.


### Base Layout Plan

@codex-owner layoutPlanner
@codex-path Memory.rooms[roomName].layout

The layout planner generates a matrix of planned structures. Each tile
records the `structureType`, the `rcl` it unlocks, and reservation data.

```javascript
Memory.rooms['W1N1'].layout = {
  planVersion: 1,
  baseAnchor: { x: 25, y: 25 },
  matrix: {
    26: {
      25: {
        structureType: STRUCTURE_EXTENSION,
        rcl: 2
      }
    }
  },
  reserved: {
    26: { 25: true }
  },
  roadMatrix: {
    26: { 26: { rcl: 1 } }
  },
  mode: 'theoretical',
  theoreticalPipeline: {
    runId: 'W1N1:12345',
    status: 'running',
    candidateCount: 5,
    activeCandidateIndex: 1,
    bestCandidateIndex: null,
    candidates: [/* pre-score candidates */],
    results: {/* weighted score results by index */}
  },
  theoreticalCandidatePlans: {
    0: { anchor: { x: 25, y: 24 }, placements: [/* selected/displayed candidate plan */], weightedScore: 0.81, compacted: false },
    1: { anchor: { x: 24, y: 26 }, structureCounts: { road: 88, extension: 60 }, weightedScore: 0.79, compacted: true }
  },
  currentDisplayCandidateIndex: 0,
  theoretical: {
    compacted: true,
    selectedCandidateIndex: 2,
    currentlyViewingCandidate: 0,
    selectedWeightedScore: 0.847,
    candidates: [/* compact candidate comparison rows for overlays */],
    checklist: { stages: [/* Candidate Scan -> Persist Overlay */] },
    sourceContainers: [{ x: 12, y: 14 }, { x: 36, y: 33 }],
    generatedAt: 12350
  },
  rebuildLayout: false,
  status: {
    clusters: {
      extCluster1: { built: 3, total: 5, complete: false }
    }
    structures: {
      extension: { built: 8, total: 10 },
      tower: { built: 1, total: 1 }
    }
  }
};
```

Tiles listed under `reserved` are blocked from other planners.

`roadMatrix` mirrors the structure matrix but tracks planned road tiles.

In theoretical mode the planner also stores:

- `theoreticalPipeline` for in-flight HTM candidate tasks (`PLAN_LAYOUT_CANDIDATES` + `PLAN_LAYOUT_CANDIDATE`).
- `theoreticalPipeline.activeCandidateIndex` marks the candidate currently being processed.
- in `harabi/full`, the pipeline reranks the leading candidates once more on real full-materialized plans before winner selection; that rerank intentionally uses the cheaper `estimate` defense pass so `theoreticalPipeline.results[*].weightedScore` reflects practical full-plan penalties without re-running the heaviest minCut smoothing on every finalist.
- candidate-stage scores already include penalties for hard foundation validation failures (for example incomplete controller stamps, disconnected road nets, blocked spawn exits, or missing source-route anchors), so broken seeds are pushed down before the finalist rerank ever starts.
- if a candidate hits those hard foundation failures, the planner now persists it as `selectionRejected: true` with `hardRejectFlags`, and winner selection skips it entirely instead of merely accepting a worse score.
- candidate rows and persisted winner debug now also retain `selectionStage` plus `selectionBreakdown` (raw score, applied penalty, bucket counts, matched flags, tie-break snapshot) so score changes remain explainable after compaction.
- source-link candidate selection also retains enough debug state in candidate validation and logistics snapshots to explain why a side-pocket link beat a closer corridor tile in a chokepoint room.
- `theoreticalCandidatePlans` keeps explicitly requested overlay candidates renderable and compacts the persisted winner down to score/debug summaries (`compacted: true`) once `basePlan` already covers the final layout.
- `currentDisplayCandidateIndex` stores which candidate is currently rendered in the building overlay.
- completed `theoretical` payloads are compacted to HUD/overlay essentials; heavy arrays like distance maps, flood tiles, and duplicate preview placements are dropped after persistence.
- `theoretical.candidates` keeps compact score rows for overlay debugging.
- `theoretical.fullSelectionRerank` and `basePlan.plannerDebug.fullSelectionRerank` summarize that last rerank pass (defense mode used, how many finalists were reranked, which candidate won, and how much validation penalty each finalist took).
- `basePlan.plannerDebug.selectionBreakdown` mirrors the final chosen winner evaluation so `layoutPlanDump` can print the last applied winner-selection buckets without reconstructing them from raw validation strings.
- `theoretical.checklist` for stage-progress display (`X`, `n/5`, `✔`).
- persisted `basePlan` keeps a compact `buildQueue` for runtime/building consumers instead of duplicating a second full `structures` map; overlays and dumps can reconstruct counts from that queue.
- `basePlan.plannerDebug` keeps summary diagnostics for labs, structure ranking, refinement, and valid-structure counts instead of full duplicate placement arrays.
- `Memory.stats.tickPipeline` keeps the most recent 60 tick snapshots.

For the full intended selection and logistics rules, see [Layout Planner](./Layout-Planner.md).

Set `rebuildLayout` to `true` if you want the planner to wipe and
recalculate the layout on the next tick. It resets automatically after
running.

`status` tracks progress for each planned cluster. `built` counts completed
structures, `total` is the overall size and `complete` marks when the cluster
is done. The `structures` section provides overall build totals per structure
type so HUD overlays and planners can show remaining work.

The helper `constructionBlocker.isTileBlocked(roomName, x, y)` returns `true`
when a tile is reserved in the layout, preventing conflicting plans.
Tiles flagged with `invalid: true` are skipped permanently. The building manager
marks a tile invalid when a layout task attempts to build on unwalkable terrain.
