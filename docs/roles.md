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
- **Haulers** – Deliver energy to structures and containers. Once a hauler
  deposits into a container it will never withdraw from that same container,
  preventing pointless pickup loops.
  Haulers also relocate to an open tile near the spawn after depositing when
  the drop location is within the restricted area so they never idle on those
  reserved spots.
- **Remote Miners** – Travel to pre-assigned coordinates in remote rooms and
  harvest until death. They keep mining positions reserved via memory.
- **Reservists** – Lightweight creeps that reserve a remote controller and sign
  it with a Tyranid-themed message before expiring.

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
