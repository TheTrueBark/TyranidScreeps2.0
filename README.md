# Tyranid Screeps 2.0

## Overview

This project targets the Screeps runtime which implements **ECMAScript 5.1**. Modern
ES6+ features such as arrow functions or object spread are not available in-game.
All code should remain compatible with ES5.1.

Tyranid Screeps mimics a hierarchical swarm. Each module acts like a different
organism in the hive:

- **Scheduler** – central nervous system orchestrating tasks and events
- **Hierarchical Memory** – data storage structured as Hive → Cluster → Colony → Creep
- **Logging** – colorised and severity‑based output drawn by `console.console.js`
- **Spawn Manager** – plans and queues creeps according to demand
- **Hierarchical Task Management** – adaptive objectives from hive down to single creep (`manager.htm.js`), supports task quantities and claim cooldowns
- **HiveMind** – modular decision layer that queues HTM tasks; a subconscious
  triggers modules like the spawn planner on demand
- **Hive's Gaze** – scans the map for threats and opportunities
- **Movement System** – pathing via HiveTravel (Traveler library)
- **Console Stats** – ASCII dashboard for CPU and room status
- **DNA Builder** – generates creep bodies based on room energy

The system is modular, reactive and geared towards expansion.

## Logging system

Logs are handled through `console.console.js` and should be written using the
`logger` module. Messages are color coded and accept a severity level from 0–5.
Repeated messages are aggregated into a single entry which escalates in severity
and expires automatically after roughly 30 ticks.

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

## Roadmap

Below is a high-level checklist tracking progress. Priority ranges from 1 (low) to 5 (high).

### Grundlegende Bausteine
- [x] **Scheduler** – Task orchestration (`scheduler.js`) – Prio 4
- [x] **Memory Manager** – Rigid hive layout (`manager.memory.js`) – Prio 4
- [x] **Logging** – Severity & toggles (`console.console.js`, `logger.js`) – Prio 5

### Produktion & Einheiten
- [ ] **Spawn Manager** – Queue and planning (`manager.spawn.js`, `manager.spawnQueue.js`) – Prio 4
- [ ] **Hierarchical Task Management** – Adaptive tasks across hive – Prio 5
- [ ] **Hive's Gaze** – Map awareness outside own rooms – Prio 3

### Bewegung & Wegfindung
- [x] **HiveTravel Integration** – Improve pathing (`manager.hiveTravel.js`) – Prio 3

### Überwachung & Visualisierung
- [x] **Console Stats** – CPU and room dashboard (`console.console.js`) – Prio 3
- [ ] **Agents** – Assimilation, Garbage, Efficiency – Prio 2

Next step: focus on the hierarchical task system so the scheduler can trigger colony and creep level tasks dynamically.

## Documentation
- [Project Wiki](./wiki/Home.md) - architecture and system guides
- [Roadmap](./ROADMAP.md)
