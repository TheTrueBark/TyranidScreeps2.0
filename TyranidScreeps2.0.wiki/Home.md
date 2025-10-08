# Tyranid Screeps Wiki

Welcome to the Tyranid Screeps knowledge base. This wiki replaces the legacy `docs/` directory and centralises gameplay architecture notes, debugging tools, and operational guides.

## Quick Links
- [[System Overview]] - high level architecture map
- [[Runtime]] - Screeps runtime constraints and compatibility notes
- [[Settings]] - runtime flags under `Memory.settings`
- [[Console Stats]] - HUD and CLI tooling for observability
- [[Scheduler]] - central task orchestration entry point

## Core Systems
- [[Hierarchical Task Management]] - HTM design, task flow, and lifecycle
- [[HiveMind]] - strategic planning and subconscious triggers
- [[Tasks]] - catalogue of registered jobs and behaviours
- [[Roles]] - workforce logic and creep specialisation
- [[Spawn Queue]] - production planning, priority rules, and quotas

## Support Modules
- [[HiveTravel]] - pathfinding integration and movement helpers
- [[HUD]] - in-room overlays and heads-up display
- [[Visuals]] - map visualisation layers
- [[Logger]] - structured logging with severity aggregation
- [[Codex Metadata]] - annotation tags for ownership and scheduler tracking

## Memory & Persistence
- [[Memory]] - hierarchical storage schema and versioning
- [[Settings]] - runtime toggles and debugging helpers

## Contributing
- Update wiki pages whenever behaviour, APIs, or debugging workflows change.
- For local editing, clone the GitHub wiki repository (`<repo>.wiki.git`), copy the latest files from `wiki/`, edit, and push.
- Remove or update any stubs left in `docs/` after migrating pages.
- Track long-lived bugs and investigations in [[Issues]].
