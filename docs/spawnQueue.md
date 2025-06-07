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
  energyRequired: 300
}
```

`requestId` combines the current tick with an incrementing counter to ensure uniqueness. The queue is sorted by `ticksToSpawn`, so older or urgent entries spawn first.

## Processing

Use `spawnQueue.processQueue(spawn)` each tick. It checks energy and spawns the next request when possible.

## Adding requests

```
spawnQueue.addToQueue('miner', room.name, body, { role: 'miner' }, spawn.id);
```

Requests can include a `ticksToSpawn` delay, allowing future scheduling.

### Positional memory requirements

If a request includes `memory.miningPosition` or `memory.sourcePosition`, the
object **must** contain a `roomName` field. Requests missing the room name are
rejected by `spawnQueue.addToQueue` to avoid undefined behavior during spawn
processing.

## Clearing a room queue

In panic situations the HiveMind may purge all pending requests for a room. Use
`spawnQueue.clearRoom(roomName)` to remove every queued entry belonging to that
room.
