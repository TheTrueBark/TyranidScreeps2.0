# Project Guidelines - Screeps Tyranid AI (JavaScript)

This document defines the long-term development standards and maintenance rules
for **TyranidScreeps2.0**. The system is written in JavaScript and models
swarm-like intelligence through modular runtime systems.

---

## Code Behavior and Architecture

- Keep modules modular, testable, and injectable into the scheduler/task system.
- Prefer clean, readable code with small and well-defined responsibilities.
- Add or update inline comments when functions are added, removed, renamed, or
  when behavior changes in a non-obvious way.
- Avoid global state pollution.
- Treat CPU usage as a first-class design constraint.

---

## Testing (`npm test`)

- Cover new or changed functionality with tests under `/test/`.
- Use **Mocha + Chai** and the existing mock system under `/test/mocks/`.
- Keep mocks in plain JavaScript.
- Run `npm test` before committing. The suite must not be left broken.

The mock stack includes:
- `Game` stubs (`Game.time`, `Game.cpu.getUsed()`, etc.)
- simulated `Memory`
- `globals.js` exposing mocks to the global scope

---

## Documentation Maintenance

For every code or feature update, determine whether you must also update docs.

| Change Type | Requires Update In... |
|---|---|
| New function/module added | Inline comments, `ROADMAP.md`, and possibly `TyranidScreeps2.0.wiki/` |
| New behavior or flow | `README.md`, `ROADMAP.md`, and the relevant wiki page |
| Refactor or restructure | Comments, roadmap references, and architecture docs if behavior changed |
| Console/HUD/dashboard behavior changed | `README.md`, observability docs, and relevant settings pages |
| New test case or new console helper | `/test/`, and `README.md` if user-facing |

### Documentation policy

- Keep all updated documentation in English.
- Treat repo-tracked docs as the source of truth:
  - `README.md`
  - `ROADMAP.md`
  - `TyranidScreeps2.0.wiki/`
- Update docs in the same commit as the related code change whenever possible.
- The primary operations UI is the external Dashboard:
  `https://github.com/TheTrueBark/Dashboard`
- Document the in-console ASCII display as optional/manual unless the runtime
  explicitly depends on it.

---

## Logging, Stats, and Observability

- All major modules should report CPU usage through `statsConsole.run()` rows.
- Use `statsConsole.log(message, severity)` for persistent structured logging.
- Log entries should:
  - include severity level (`1-5`)
  - aggregate repeated messages
  - expire automatically after a reasonable window
  - include metadata such as room name where useful
- Telemetry collection in `Memory.stats` must remain intact even if console
  rendering is reduced or disabled.

---

## Scheduler and HTM

- Register recurring logic through `scheduler.addTask()`.
- Supported trigger types are:
  - `INTERVAL` - run every N ticks
  - `EVENT` - trigger-based
  - `ONCE` - one-time, auto-remove
- HTM and memory-management flows should keep predictable interfaces and
  scheduling boundaries.

---

## Bug Detection and Code Health

- Proactively review for:
  - stale creep/room references
  - memory leaks
  - inefficient CPU patterns
  - redundant task-runner logic
- If a bug is found, document it with:
  - inline notes such as `TODO` or `FIXME`
  - a durable roadmap or issue reference if it is ongoing

---

## Visuals and Operator UX

If a feature improves visibility:
- consider room visuals when they help in-game debugging
- consider telemetry exposure through `Memory.stats` and the external Dashboard
- only rely on console rendering when manual ad-hoc inspection is the goal

---

## Best Practices

- Keep logic modular and testable in isolation.
- Avoid side effects during module import.
- Prefer dependency injection or explicit scheduler registration.
- New logic should integrate with existing logging and CPU tracking paths.

## Codex Metadata

Source files may include metadata tags used by documentation tooling. When
adding new modules or tasks, annotate them where appropriate:

- `@codex-owner moduleName` - declares ownership of a file or memory branch
- `@codex-task TASK_NAME` - documents an HTM task registered in `taskRegistry`
- `@codex-scheduler-task` - marks scheduled jobs in `main.js` or elsewhere
- `@codex-path Memory.path` - specifies persisted memory locations

These annotations help keep docs aligned with the codebase.

---

## Project References

- [Repository README](./README.md)
- [Roadmap](./ROADMAP.md)
- [Scheduler Documentation](./TyranidScreeps2.0.wiki/Scheduler.md)
- [HTM Design Notes](./TyranidScreeps2.0.wiki/Hierarchical-Task-Management.md)
- [HiveMind Overview](./TyranidScreeps2.0.wiki/HiveMind.md)

---

This document is authoritative. Future changes should follow these standards or
explicitly document why they diverge.
