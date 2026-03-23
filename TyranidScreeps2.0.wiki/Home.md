# Tyranid Screeps Wiki

Welcome to the Tyranid Screeps knowledge base. This repo-tracked wiki replaces
the old `docs/` flow and serves as the source of truth for architecture notes,
debugging workflows, and operator-facing runtime guidance.

Changes merged to `main` are mirrored automatically into the GitHub `Wiki` tab
through the repository sync workflow.

## Quick Links

- [System Overview](./System-Overview.md) - high-level architecture map
- [Runtime](./Runtime.md) - current Screeps runtime constraints and migration notes
- [Settings](./Settings.md) - runtime flags under `Memory.settings`
- [Console Stats](./Console-Stats.md) - telemetry collection and optional console rendering
- [Scheduler](./Scheduler.md) - central task orchestration entry point
- [Layout Planner](./Layout-Planner.md) - candidate evaluation, rerank, source logistics, and defense planning
- [Baseplanner Roadmap](./Baseplanner-Roadmap.md) - full dynamic basebuilding specification and phased rollout checklist

## Core Systems

- [Hierarchical Task Management](./Hierarchical-Task-Management.md) - HTM design, task flow, and lifecycle
- [HiveMind](./HiveMind.md) - strategic planning and subconscious triggers
- [Tasks](./Tasks.md) - catalog of registered jobs and behaviors
- [Roles](./Roles.md) - workforce logic and creep specialization
- [Spawn Queue](./Spawn-Queue.md) - production planning, priority rules, and quotas

## Support Modules

- [HiveTravel](./HiveTravel.md) - pathfinding integration and movement helpers
- [HUD](./HUD.md) - in-room overlays and heads-up display
- [Visuals](./Visuals.md) - map visualization layers
- [Logger](./Logger.md) - structured logging and telemetry aggregation
- [Codex Metadata](./Codex-Metadata.md) - annotation tags for ownership and scheduler tracking

## Memory and Persistence

- [Memory](./Memory.md) - hierarchical storage schema and versioning
- [Settings](./Settings.md) - runtime toggles and debugging helpers

## Observability

- The primary operator UI is the external Dashboard:
  `https://github.com/TheTrueBark/Dashboard`
- `Memory.stats` remains the source telemetry store inside Screeps.
- The in-console ASCII dashboard is optional and disabled by default unless
  explicitly enabled for manual debugging.

## Contributing

- Update wiki pages whenever behavior, APIs, or debugging workflows change.
- Keep repo-tracked docs in English.
- Update docs in the same commit as the code change whenever possible.
- Treat `TyranidScreeps2.0.wiki/` as the source of truth even if a separate wiki
  mirror exists elsewhere.
- The GitHub `Wiki` tab is mirrored from this folder by
  `.github/workflows/sync-wiki.yml`.
- Configure the `WIKI_PUSH_TOKEN` repository secret before relying on the
  automatic wiki mirror.
- Keep the token in GitHub Actions secrets only; do not commit it into tracked
  files.
- Remove or update any stale legacy stubs after migration work.
- Track long-lived bugs and investigations in [Issues](./Issues.md).
