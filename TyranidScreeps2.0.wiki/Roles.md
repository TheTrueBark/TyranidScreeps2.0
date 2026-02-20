# Hive Roles Evaluation

hive.roles.js dynamically determines workforce needs for each owned room. The module calculates miners plus a unified builder/upgrader worker pool, then queues spawn tasks in the HTM. Haulers remain governed by the energy demand module.

## Behaviour

- **Miners**  Each source is analysed for open mining positions. Current miners and queued requests are counted and additional miners are requested until the source is saturated. Mining power is based on the miner DNA returned by manager.dna. The required miner count is calculated from the available positions and WORK parts so the creep mix stays efficient.
- **Workers (Builders/Upgraders)**  Builders and upgraders now share a single spawn budget. hive.roles derives the ceiling from controller-adjacent tiles (hard cap) and by reserving at most 75% of the room's energy throughput as WORK parts. Every worker records a primary priority (builder or upgrader) but falls back to the other task whenever the primary job is idle. Construction sites are reserved globally so no more than three creeps chase the same structure, and the reservation persists while the worker refuels. Energy intake mirrors the hauler reservation system: workers reserve dropped resources, ruins, containers and even spawn stores before travelling so multiple creeps do not collide. There is always at least one primary upgrader to keep controller progress steady.
- **Haulers**  Deliver energy to structures and containers. When they accept a pickup task they forecast how much energy each candidate can accumulate before arrival (deriving miner throughput from active WORK parts and accounting for drop decay) and rank options by energy per travel tick instead of blindly following their assigned source. Multi-stop plans are cached but refreshed whenever the forecast drifts, and each waypoint reserves the full expected yield so other couriers do not double-book the same pile. If the energy is still en route they loiter at the pickup until the reservation is fulfilled or its wait window expires; after unloading they relocate to the dedicated idle slot outside the restricted ring so the spawn apron stays clear.
- **Scouts**  Traverse rooms up to two hops from the colony, logging sources, structures, exits and hostile presence into memory while respecting the shared obstacle matrix for spawn aprons and mining tiles.
- **Base Distributor**  Small courier active once storage is built. Pulls energy only from storage and keeps spawns, extensions and towers supplied.
- **Remote Miners**  Travel to pre-assigned coordinates in remote rooms and harvest until death. They keep mining positions reserved via memory.
- **Reservists**  Lightweight creeps that reserve a remote controller and sign it with a Tyranid-themed message and continue reserving until natural death unless a terminal failure occurs.

The module updates Memory.roleEval.lastRun so a fallback task can throttle itself when CPU is scarce.

### Manual Limits

Set Memory.rooms[roomName].manualSpawnLimits to override miner or worker counts for a room. Recognised keys are miners, workers, builders and upgraders. Historical builder/upgrader entries are still honoured but workers controls the combined pool. Each value may be 'auto' (use the calculated limit) or a number to enforce. The console displays these values and the evaluator will not request additional creeps beyond the manual limits.

## Triggers

Role evaluation runs whenever:

- A creep is spawned or a dead creep is removed from memory.
- Construction sites are created or removed.
- The controller level of a room changes.
- As a fallback every 50 ticks when the CPU bucket is above 9800.
- Use the `roleUpdate` event to invoke the evaluator on the appropriate room.
