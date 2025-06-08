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
- **Builders** – Construction sites are prioritised by type. Extensions,
  containers and roads request up to four builders per site (maximum twelve).
  Other sites spawn two builders each with the same overall cap. Builders keep
  their assigned construction site until it is completed and remain near the
  location while waiting for energy deliveries. While working they also collect
  dropped energy or withdraw from nearby containers to minimise idle time.
  Builders start working as soon as some energy is carried so partially filled
  workers no longer idle.

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
