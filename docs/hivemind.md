# 👁️ HiveMind

The HiveMind module serves as the brain of the swarm. It examines the current
state of each owned room and queues tasks into the Hierarchical Task Management
(HTM) system. Logic is split into **modules** so each concern can evaluate
independently.

## Responsibilities

- Analyse rooms for threats or opportunities
- Push colony level tasks such as `defendRoom` or `upgradeController`
- Queue spawn orders for the `spawnManager`, including panic bootstrap tasks
- Keep logic isolated from task execution by delegating to HTM

## Example Usage
```javascript
const hivemind = require('manager.hivemind');
scheduler.addTask('hivemind', 1, () => hivemind.run());
```

This lightweight decision layer can be expanded with more complex strategies
over time. The default `spawn` module handles panic bootstrap and miner
evaluation. A small “subconscious” checks each tick and only runs a module when
its queue is empty.

## Modules

- **spawn** – Maintains the workforce. Miners are requested based on available
  mining spots and work parts (typically three per source at RCL1). Haulers are
  requested in a 1:1 ratio with other roles early on and taper to 1:2 as the
  colony grows. Upgraders and builders are now evaluated by `hive.roles.js` which
  monitors controller containers and construction sites. When no creeps remain
  the queue is purged and a bootstrap worker is scheduled so the colony can
  recover. The module enforces a strict initial order at RCL1: a
  minimal miner followed by a hauler must be spawned before other
  roles are considered.
- **lifecycle** – Runs every 25 ticks via the scheduler to queue miner replacements before the current
  miner expires using precomputed travel times. A second module predicts hauler
  replacements using average roundtrip durations and only queues a new hauler
  when demand persists and no other replacement is scheduled for the same
  route.
- **demand** – Tracks energy deliveries. When the combined
  `demandRate` for requesters exceeds the current `supplyRate` the Hive
  automatically queues enough haulers to close the gap. Delivery statistics are
  stored per-room under `Memory.demand.rooms` along with aggregate `totals`
  for outstanding demand and current delivery supply. Global totals are now
  calculated purely as the sum of each room's metrics. Each requester and
  deliverer tracks the last energy amount and time for deliveries so average
  energy-per-tick rates can be calculated. Miners still record supply events but
  the `supplyRate` only reflects hauler performance so early deposits do not
  inflate delivery capacity. Stale entries are removed by comparing to `Game.creeps`
  before demand is calculated, and outstanding energy requests are summed so
  `totals.demand` reflects the true workload. Hauler spawns are throttled to
  avoid spam. The module migrates legacy flat layouts automatically. It only
  runs when flagged by a completed delivery but maintains these totals every
  tick so other systems can react without recalculating.
  Modules can be added later for building, defense or expansion logic.
  The HiveMind also orders basic infrastructure:
  - Containers are planned as soon as the room is claimed (RCL1).
  - Extensions begin construction when the controller reaches RCL2.
  - Extension sites are placed in plus-shaped stamps around the spawn for
    maximum accessibility.
  - Source containers are prioritized before extensions, followed by controller
    containers.
  - Mining positions are freed when miners approach expiry so replacements
    can claim the same spot. Any leftover reservations are cleared when
    miners die.
  - Restricted tiles around the spawn are stored in room memory so creeps avoid
    blocking it.

## Failsafe Memory Initialization

After a respawn or unexpected memory wipe the HiveMind may lack the data needed
to plan tasks. When required sections such as `rooms` or `hive` are missing it
logs a severity 5 message and schedules a one-time high priority task to
recreate the baseline memory. The room is rescanned and HiveMind evaluations
resume on the following tick.
