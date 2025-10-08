# Savestate System

> @codex-owner debugSavestate
>
> @codex-path Memory.debug.savestates
>
> @codex-path Memory.settings.allowSavestateRestore

The savestate system captures a compressed snapshot of the Tyranid hive mind so
that difficult bugs can be reproduced offline or with Codex assistance. Each
snapshot is serialized as JSON and compressed with `LZString.compressToBase64`.
The resulting string is stored at `Memory.debug.savestates[stateId]`.

## Runtime Flags

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `Memory.settings.allowSavestateRestore` | `boolean` | `false` | Must be toggled to `true` before calling `debug.restoreSavestate`. Prevents accidental restores during production ticks. |

## Savestate Index (`Memory.debug.savestates`)

Each entry is a plain object with the following fields:

| Field | Type | Description |
| --- | --- | --- |
| `tick` | `number` | Original `Game.time` when the snapshot was recorded. |
| `created` | `number` | Tick when the savestate entry was written (may differ if queued). |
| `version` | `number` | Serialization schema version, currently `1`. |
| `note` | `string \| null` | Optional human-readable annotation. |
| `compressed` | `string` | Base64-encoded, LZString-compressed JSON payload described below. |

## Snapshot Payload Schema

The decoded payload expands into an object with the following structure:

```json
{
  "version": 1,
  "note": "human readable context",
  "metadata": {
    "time": 1234567,
    "shard": "shard3",
    "cpu": { "bucket": 10000, "limit": 20, "tickLimit": 500, "used": 5.12 },
    "gcl": { "level": 6, "progress": 12345, "progressTotal": 54321 },
    "gpl": { "level": 3, "progress": 2500, "progressTotal": 6000 }
  },
  "memory": {
    "raw": "string from RawMemory.get()"
  },
  "spawnQueue": {
    "queue": [ /* full queue state */ ],
    "summary": [
      {
        "requestId": "123-0",
        "category": "hauler",
        "room": "W1N1",
        "priority": 50,
        "ticksToSpawn": 0,
        "parentTaskId": "colony@alpha",
        "parentTick": 1234500,
        "subOrder": 1,
        "enqueuedTick": 1234500
      }
    ],
    "nextRequestId": 42
  },
  "htm": {
    "hive": [ /* hive level task array */ ],
    "clusters": { "clusterId": [ /* task array */ ] },
    "colonies": { "colonyId": [ /* task array */ ] },
    "creeps": { "creepName": [ /* task array */ ] }
  },
  "creeps": {
    "memory": { "CreepName": { /* raw creep memory */ } },
    "summary": {
      "CreepName": {
        "role": "hauler",
        "taskId": "task-123",
        "task": { "name": "deliverEnergy", "target": "spawn1" },
        "colony": "W1N1"
      }
    }
  },
  "empire": {
    "hive": {
      "version": 2,
      "clusters": {
        "W1N1": { "meta": {"rcl": 6}, "colonies": ["W1N1"] }
      },
      "colonies": {
        "W1N1": {
          "clusterId": "W1N1",
          "meta": {"status": "core"},
          "creeps": ["Hauler1"],
          "structures": ["spawn"]
        }
      },
      "meta": { }
    },
    "roomOwnership": {
      "W1N1": { "owner": "Tyranid", "colony": "W1N1", "cluster": "W1N1" }
    },
    "expansionTargets": ["W2N1"]
  },
  "rooms": {
    "W1N1": {
      "layout": { /* planner output */ },
      "structures": { /* cached structure metadata */ }
    }
  },
  "debug": {
    "savestates": { /* savestate index captured when snapshot recorded */ }
  }
}
```

## Console Helpers

Four helpers are mounted under `global.debug`:

- `debug.saveSavestate(id, note?)`
- `debug.restoreSavestate(id, { force?: boolean })`
- `debug.listSavestates()`
- `debug.inspectSavestate(id)`

All helpers rely on the `debugSavestate` module and respect the
`allowSavestateRestore` guard. `restoreSavestate` logs a confirmation message via
`statsConsole.log` when a state is applied.

## Automation Hooks

Any module may queue a snapshot by calling `debug.saveSavestate("reason")`.
Common triggers include:

- Emergency scheduler fallbacks
- `Game.cpu.bucket < 2000`
- Critical task failures

Snapshots are lightweight (LZString-compressed) and suitable for persisting in
Memory for manual download or remote inspection.
