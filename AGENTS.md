# AGENTS – Repository Guidelines

This file provides high-level instructions for Codex agents working on this project.

- **Follow `Instructions.md`:** The development standards in `Instructions.md` are authoritative.
- **Run Tests:** Execute `npm test` before committing. If `node_modules` are missing, run `npm install` once.
- **Documentation:** Update inline comments, repo-tracked docs under `TyranidScreeps2.0.wiki/`, `README.md`, or `ROADMAP.md` when behavior changes or new features are introduced.
- **Documentation Language:** Keep all newly written or updated docs in English.
- **Dashboard-First Observability:** The primary operational surface is the external Dashboard at `https://github.com/TheTrueBark/Dashboard`. Keep telemetry collection in memory, and document console output as optional/manual unless code explicitly changes that behavior.
- **Modularity:** Keep modules small and testable. Maintain CPU tracking via `statsConsole.run()` and logging via `statsConsole.log()`.
- **Testing:** Add or update tests under `/test/` for new or changed logic.
- **Pull Request Notes:** Summaries should mention major code changes and include the result of `npm test`.
