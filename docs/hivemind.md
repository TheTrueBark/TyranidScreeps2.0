# 👁️ HiveMind

The HiveMind module serves as the brain of the swarm. It examines the current
state of each owned room and queues tasks into the Hierarchical Task Management
(HTM) system.

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
over time. It currently also performs a basic spawn evaluation: if a colony
has no creeps the HiveMind queues a `spawnBootstrap` task. It will also request
enough miner creeps for each energy source in the room.
