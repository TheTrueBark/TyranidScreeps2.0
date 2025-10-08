# 🐜 Hive Roles Evaluation

`hive.roles.js` dynamically determines workforce needs for each owned room. The module
calculates miners, upgraders and builders then queues spawn tasks in the HTM.
Haulers remain governed by the energy demand module.

## Behaviour

 - **Miners** – Each source is analysed for open mining positions. Current miners
   and queued requests are counted and additional miners are requested until the
   source is saturated. Mining power is based on the miner DNA returned by
   `manager.dna`. The required miner count is calculated from the available
   positions and WORK parts – typically a single 5&nbsp;WORK miner can fully
   saturate a standard source. The miner count for each source never exceeds the
   number of available spots and is capped at five miners. Miners with at least
   five WORK parts automatically relocate onto the nearby container so they can
   empty the source without moving.
 - **Upgraders** – Simplified workers that gather the closest available energy
   on their own and then move within range&nbsp;3 of the controller to upgrade
   it. They no longer rely on assigned containers or hauler deliveries but
   simply harvest, withdraw or pickup whichever energy source is nearest.
- **Builders** – Limited to six per colony with a soft cap of two builders per
   construction site. Builder spawns are prioritised before upgraders so
   construction continues smoothly. Builders grab energy from containers holding
   at least 500 energy, then dropped energy or harvest if needed. When no build
   or emergency repair task is available they upgrade the controller as a
   fallback.
- **Haulers** – Deliver energy to structures and containers. They compute a pickup route that fills their carry in the fewest Traveler steps, cache the plan, and only re-evaluate when a pickup fails.
  Each waypoint reserves the expected energy so parallel haulers do not double-book the same pile, and the Traveler room callback blocks spawn aprons and mining tiles unless the creep is actively delivering to a spawn.
  After unloading they relocate to a dedicated idle slot outside the restricted ring so the spawn apron stays clear.
- **Scouts** – Traverse rooms up to two hops from the colony, logging sources, structures, exits, and hostile presence into memory while respecting the shared obstacle matrix for spawn aprons and mining tiles.
- **Base Distributor** – Small courier active once storage is built. Pulls energy
  only from storage and keeps spawns, extensions and towers supplied.
- **Remote Miners** – Travel to pre-assigned coordinates in remote rooms and
  harvest until death. They keep mining positions reserved via memory.
- **Reservists** – Lightweight creeps that reserve a remote controller and sign
  it with a Tyranid-themed message before expiring.

The module updates `Memory.roleEval.lastRun` so a fallback task can throttle
itself when CPU is scarce.

### Manual Limits

Set `Memory.rooms[roomName].manualSpawnLimits` to override miner, builder or
upgrader counts for a room. Each value may be `'auto'` (use the calculated
limit) or a number to enforce. The console displays these values and the
evaluator won't request additional creeps beyond the manual limits.

## Triggers

Role evaluation runs whenever:

- A creep is spawned or a dead creep is removed from memory.
- Construction sites are created or removed.
- The controller level of a room changes.
- As a fallback every 50 ticks when the CPU bucket is above 9800.

The scheduler listens for the `roleUpdate` event to invoke the evaluator on the
appropriate room.
