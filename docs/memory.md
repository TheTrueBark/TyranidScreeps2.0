# 🗄️ Memory Layout

This file documents the persistent memory schema used by Tyranid Screeps.  All modules interact with memory through these namespaces.  Each module owns its branch and is responsible for migrations when the schema version changes.

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

### Creep Fallback State

@codex-owner role.allPurpose
@codex-path creep.memory.fallbackReason

All-purpose creeps temporarily record fallback information when required
room data is missing. These fields are cleared once normal behaviour resumes.

```javascript
creep.memory.fallbackReason = 'missingMiningData';
creep.memory.fallbackSince = Game.time;
```

### Controller Upgrade Spots

@codex-owner manager.room
@codex-path Memory.rooms[roomName].controllerUpgradeSpots

Number of walkable tiles within range 3 of the controller. Used to cap dedicated
upgraders.


### Base Layout Plan

@codex-owner layoutPlanner
@codex-path Memory.rooms[roomName].baseLayout

Each room stores its construction plan under `baseLayout`. The object
contains the `anchor` position (usually the first spawn) and lists of
absolute coordinates for every stamped structure. Each entry includes
the `rcl` when the structure becomes available as well as metadata
about the `structureType` and `origin` of the stamp.

```javascript
Memory.rooms['W1N1'].baseLayout = {
  anchor: { x: 25, y: 25 },
  stamps: {
    extension: [
      { x: 26, y: 25, rcl: 2, structureType: STRUCTURE_EXTENSION, origin: 'starterStamp' }
    ],
    road: [
      { x: 25, y: 24, rcl: 1, structureType: STRUCTURE_ROAD, origin: 'starterStamp' }
    ],
    tower: [
      { x: 27, y: 25, rcl: 3, structureType: STRUCTURE_TOWER, origin: 'starterStamp' }
    ],
  },
  layoutUpgraded: false
};
```

`restructureAtRCL` is flagged when the controller reaches level 6 so the
planner can generate a new layout.
