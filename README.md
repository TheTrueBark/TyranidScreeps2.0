# Tyranid Screeps 2.0

## Overview

Tyranid Screeps mimics a hierarchical swarm. Each module acts like a different
organism in the hive:

- **Scheduler** – central nervous system orchestrating tasks and events
- **Hierarchical Memory** – data storage structured as Hive → Cluster → Colony → Creep
- **Logging** – colorised and severity‑based output drawn by `console.console.js`
- **Spawn Manager** – plans and queues creeps according to demand
- **Task Management** – adaptive objectives from hive down to single creep
- **Hive's Gaze** – scans the map for threats and opportunities
- **Movement System** – pathing via Traveler 2.0
- **Console Stats** – ASCII dashboard for CPU and room status

The system is modular, reactive and geared towards expansion.

## Logging system

Logs are handled through `console.console.js` and should be written using the
`logger` module. Messages are color coded and accept a severity level from 0–5.
Repeated messages automatically escalate in severity.

### Usage
```javascript
const logger = require('./logger');
logger.log('spawnManager', 'Spawning creep failed', 3);
```

Logging for each module can be toggled from the game console:
```
debug.toggle('spawnManager', true); // enable
```
Current settings can be inspected via `debug.config()`.
