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
  assignment: { routeId: 'r1', sourceId: 'src', destId: 'storage' },
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

Each hauler route stores rolling averages under `Memory.demand.routes`:

```javascript
Memory.demand.routes[routeId] = {
  avgRoundTrip: 47,
  roundTripCount: 3,
  activeHaulers: ['H1'],
  totals: { demand: 0 },
  assignmentInfo: { sourceId: 'src', destId: 'storage', type: 'remotePull' }
};
```

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

Console and task execution metrics are aggregated here.
`Memory.stats.taskLogs` keeps the most recent task executions.

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

### Creep Fallback State

@codex-owner role.allPurpose
@codex-path creep.memory.fallbackReason

All-purpose creeps temporarily record fallback information when required
room data is missing. These fields are cleared once normal behaviour resumes.

```javascript
creep.memory.fallbackReason = 'missingMiningData';
creep.memory.fallbackSince = Game.time;
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
        rcl: 2,
        planned: true,
        plannedBy: 'layoutPlanner',
        blockedUntil: 20500
      }
    }
  },
  reserved: {
    26: { 25: true }
  },
  roadMatrix: {
    26: { 26: { planned: true, rcl: 1, plannedBy: 'layoutPlanner' } }
  },
  rebuildLayout: false
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

Tiles listed under `reserved` are blocked from other planners. Future
versions may include `blockedUntil` timestamps for temporary holds.

`roadMatrix` mirrors the structure matrix but tracks planned road tiles.

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
