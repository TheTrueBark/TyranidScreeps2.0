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
- **Upgraders** – Containers two tiles from the controller dictate the
  desired number of upgraders (four per container). Upgraders stand at these
  containers or at a position two tiles from the controller, upgrading from
  range. Upgraders withdraw energy when adjacent to their container rather than
  only when positioned directly on top. When no containers are present the
  system still spawns one upgrader so progress never stalls.
 - **Builders** – Always fetch energy from nearby containers or dropped
   resources before requesting delivery. They select the highest priority
   construction site each tick (extensions first, then containers, then other
   structures) and build until empty. Builders begin working as soon as they
   carry any energy. At least two haulers must exist before additional builders
   are spawned.

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
