# 🧠 Project Guidelines – Screeps Tyranid AI (JavaScript)

This document defines the long-term development standards and behavioral rules for maintaining and extending the **TyranidScreeps2.0** codebase. The system is written entirely in **JavaScript** and simulates swarm-like intelligence across a modular agent-based architecture.

---

## 🔁 Code Behavior & Architecture

- All modules must be modular, testable, and injectable into the scheduler/task system.
- All code should be clean, readable, and follow a consistent structure.
- Always add or update **inline comments** when:
  - Functions are added, removed, or renamed
  - Behavior changes (e.g. logic branches, lifecycle conditions)
- Avoid global state pollution.
- CPU usage must be considered at every step.

---

## 🧪 Testing System (npm test)

- All new functionality must be covered by tests in the `/test/` directory.
- Use **Mocha + Chai** as the test runner and assertion library.
- Use a **custom mock system** in `/test/mocks/`, including:
  - `Game` object with stubs for `Game.time`, `Game.cpu.getUsed()`, etc.
  - `Memory` with simulated persistence
  - `globals.js` to expose mocks to the global scope
- Run tests via `npm test`. The test suite must never break.
- All mocks must be **pure JavaScript** (no TypeScript).

---

## 📘 Documentation Maintenance

For every code or feature update, determine whether you must update:

| Change Type                        | Requires Update In...                           |
|-----------------------------------|--------------------------------------------------|
| New function/module added         | Inline comments, roadmap, maybe `/docs/`         |
| New behavior or flow              | Roadmap and high-level doc section               |
| Refactor or restructure           | Comments, roadmap task reference                 |
| Console output or GUI changed     | README and/or visual behavior description        |
| New test case                     | Add to `/test/`, update `README` if CLI exposed  |

### Specific Locations:

- `/README.md`: High-level overview, live behavior, links
- `/docs/`: Feature-specific explanations
- `/docs/dev/`: Internals (e.g. task engine, scheduler flow, memory layout)
- `/roadmap.md`: Tick off features, update status, priority, files affected

---

## 📊 Logging, Stats, and Console GUI

- All modules (e.g., Creeps, Spawns, Towers) must report CPU usage:
  - Inject CPU stats into `statsConsole.run()` as `[name, usage]` entries
- Use `statsConsole.log(message, severity)` for persistent log display
- Log entries should:
  - Include severity level (1–5)
  - Aggregate repeated messages into single entries
  - Auto-expire after a default duration (e.g. 30 ticks)
  - Include metadata like room name if possible

---

## 🧱 Scheduler & HTM

- Use the global `scheduler.addTask()` system to register recurring logic
- Tasks should be one of:
  - `INTERVAL` → run every N ticks
  - `EVENT` → trigger-based
  - `ONCE` → one-time, auto-remove
- HTM (Hierarchical Task Management) and HMM (Hierarchical Memory Management) modules must follow the same interface.

---

## 🔍 Bug Detection & Linting

- Proactively review for:
  - Memory leaks or stale creep/room references
  - Inefficient CPU patterns
  - Redundant logic in task runners
- If a bug is found, document it as:
  - Inline comment (`// TODO`, `// FIXME`)
  - Separate note in `/docs/dev/issues.md` (if ongoing)

---

## 📈 GUI Extensions

If a feature provides enhanced visibility:
- Consider integrating it visually into `statsConsole.displayStats()` or `displayLogs()`
- Consider adding visual overlays using `RoomVisual` if relevant

---

## 💡 Best Practices

- All code should be modular and testable in isolation.
- Avoid side-effects on import.
- Prefer dependency injection or scheduler registration for behaviors.
- All new logic must integrate with the existing CPU tracking and logging tools.

---

## 🔗 Project References (Mocks, Ideas, Tools)

- [Repository README](./README.md)
- [Roadmap](./ROADMAP.md)
- [Scheduler Documentation](./docs/scheduler.md)
- [HTM Design Notes](./docs/htm.md)
- [HiveMind Overview](./docs/hivemind.md)

---

> ✅ This document is considered authoritative. All future logic and features must conform to these standards or justify changes clearly in the PR or commit message.
