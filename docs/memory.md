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
  restrictedArea: []
}
```

Cluster and colony memory follow the defaults in `manager.memory.js`.

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

### Runtime Settings

@codex-owner main
@codex-path Memory.settings
@codex-version 1

Stores toggles for optional features such as HUD visuals or task listing.
Example:

```javascript
Memory.settings = {
  enableVisuals: true,
  showTaskList: false,
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

