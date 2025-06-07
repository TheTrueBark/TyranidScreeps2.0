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

- **spawn** – Handles panic bootstrap and miner demand. Queues miner and
  hauler tasks so hauler count automatically scales with available miners. When
  no creeps remain the module clears the spawn queue and schedules a bootstrap
  worker so the colony can recover.
  Modules can be added later for building, defense or expansion logic.
