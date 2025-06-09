# 🐜 Hive Roles Evaluation

`hive.roles.js` dynamically determines workforce needs for each owned room. The module
calculates miners, upgraders and builders then queues spawn tasks in the HTM.
Haulers remain governed by the energy demand module.

## Behaviour

 - **Miners** – Each source is analysed for open mining positions. Current miners
   and queued requests are counted and additional miners are requested until the
   source is saturated. Mining power is based on the miner DNA returned by
   `manager.dna` and capped at three creeps per source. Miners with at least five
   WORK parts automatically relocate onto the nearby container so they can empty
   the source without moving.
 - **Upgraders** – A single container two tiles from the controller anchors the
  upgrade position. Upgraders stand on or next to this container and withdraw
  energy before upgrading from range. When the container is missing the HiveMind
  still spawns one upgrader so progress never stalls.
 - **Builders** – Always fetch energy from nearby containers or dropped
   resources before requesting delivery. They select the highest priority
   construction site each tick (extensions first, then containers, then other
  structures) and build until empty. Each builder stores its assigned
  construction site's id in `creep.memory.mainTask` so it will return after
  refueling. Builders begin working as soon as they carry any energy. At least
  two haulers must exist before additional builders are spawned. The desired
  number of builders is also capped by RCL: 2 at RCL1, 4 at RCL2 and 8 from
  RCL3 onward.

The module updates `Memory.roleEval.lastRun` so a fallback task can throttle
itself when CPU is scarce.

## Triggers

Role evaluation runs whenever:

- A creep is spawned or a dead creep is removed from memory.
- Construction sites are created or removed.
- The controller level of a room changes.
- As a fallback every 50 ticks when the CPU bucket is above 9800.

The scheduler listens for the `roleUpdate` event to invoke the evaluator on the
appropriate room.
