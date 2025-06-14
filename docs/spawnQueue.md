# 🐣 Spawn Queue

The spawn queue decouples creep requests from immediate spawning. Managers or HTM tasks push requests and each spawn processes its own queue.

## Request structure

```javascript
{
  requestId: 'time-counter',
  category: 'miner',
  room: 'W1N1',
  bodyParts: [WORK, WORK, MOVE],
  memory: { role: 'miner' },
  spawnId: '5abc123',
  ticksToSpawn: 0, // lower means sooner
  energyRequired: 300,
  priority: 2
}
```

`requestId` combines the current tick with an incrementing counter to ensure uniqueness. The queue is sorted by `priority` (lower is higher priority) and then `ticksToSpawn`, so urgent entries spawn first.

## Processing

Use `spawnQueue.processQueue(spawn)` each tick. It checks energy and spawns the next request when possible.

## Adding requests

```
spawnQueue.addToQueue('miner', room.name, body, { role: 'miner' }, spawn.id, 0, 2);
```

Requests can include a `ticksToSpawn` delay, allowing future scheduling.
The optional `priority` parameter (default `5`) lets high priority creeps spawn sooner.
An additional `options` object may define `parentTaskId`, `subOrder` and `parentTick` for subtask sorting.

### Positional memory requirements

If a request includes `memory.miningPosition` or `memory.sourcePosition`, the
object **must** contain a `roomName` field. Requests missing the room name are
rejected by `spawnQueue.addToQueue` to avoid undefined behavior during spawn
processing.

## Clearing a room queue

In panic situations the HiveMind may purge all pending requests for a room. Use
`spawnQueue.clearRoom(roomName)` to remove every queued entry belonging to that
room.

### Subtasks

HTM tasks may schedule multiple spawn requests as subtasks. For example
`spawnStarterCouple` spawns a miner and then a hauler. Each subtask results in a
normal spawn queue entry but the parent task is only completed once all
subtasks have finished. Queue sorting first compares the parent task tick and the `subOrder` value before falling back to priority.

### Memory Layout

@codex-owner spawnQueue
@codex-path Memory.spawnQueue
@codex-version 1

`Memory.spawnQueue` is an array containing the request objects shown above.
`Memory.nextSpawnRequestId` increments each tick to guarantee unique ids.
Requests are removed once the spawn succeeds or they are explicitly cleared.
