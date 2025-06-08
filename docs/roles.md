# 🐜 Hive Roles Evaluation

`hive.roles.js` dynamically determines workforce needs for each owned room. The module
calculates miners, upgraders and builders then queues spawn tasks in the HTM.
Haulers remain governed by the energy demand module.

## Behaviour

- **Miners** – Each source is analysed for open mining positions. Current miners
  and queued requests are counted and additional miners are requested until the
  source is saturated. Mining power is based on the miner DNA returned by
  `manager.dna` and capped at three creeps per source.
- **Upgraders** – Containers within three tiles of the controller dictate the
  desired number of upgraders (four per container).
- **Builders** – Construction sites are prioritised by type. Extensions,
  containers and roads request up to four builders per site (maximum eight).
  Other sites spawn two builders each with the same overall cap. Builders keep
  their assigned construction site until it is completed and remain near the
  location while waiting for energy deliveries. When out of energy they either
  request a hauler or fetch nearby drops before returning to the site, reducing
  wandering.

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
