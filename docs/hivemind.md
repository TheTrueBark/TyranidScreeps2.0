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
  queued once miners exist and scale back as the room develops. A baseline
  upgrader is always ensured and builders are spawned when construction projects
  are detected. When no creeps remain the queue is purged and a bootstrap worker
  is scheduled so the colony can recover.
  Modules can be added later for building, defense or expansion logic.
  The HiveMind also orders basic infrastructure:
  - Containers are planned as soon as the room is claimed (RCL1).
  - Extensions begin construction when the controller reaches RCL2.
  - Mining positions are freed when miners approach expiry so replacements
    can claim the same spot. Any leftover reservations are cleared when
    miners or allPurpose creeps die.
