# 🧠 Hierarchical Task Management

The HTM system breaks down objectives from the top level hive to individual creeps. Each layer can issue tasks to the level below it, forming a flexible chain of command.

## Levels

1. **Hive** – global strategy such as expansion or large scale attacks.
2. **Cluster** – group of rooms working together (main base plus remotes).
3. **Colony** – a single owned room managing local resources and defense.
4. **Creep** – execution unit taking orders and reporting results.

## Features

- Task priority with aging / decay so outdated plans are replaced.
- Scheduler integration ensures tasks run when expected.
- Logging of planned vs active tasks for easier debugging.
- Cache of attempted tasks to avoid redundant orders.

The system is designed to be adaptive: creeps can be reassigned on the fly and colonies react to new threats detected by Hive's Gaze.
