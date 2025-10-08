# AGENTS – Repository Guidelines

This file provides high-level instructions for Codex agents working on this project.

- **Follow `Instructions.md`:** The development standards in `Instructions.md` are authoritative.
- **Run Tests:** Execute `npm test` before committing. If `node_modules` are missing, run `npm install` once.
- **Documentation:** Update inline comments, the GitHub wiki (`wiki/`), or `ROADMAP.md` when behavior changes or new features are introduced.
- **Modularity:** Keep modules small and testable. Maintain CPU tracking via `statsConsole.run()` and logging via `statsConsole.log()`.
- **Testing:** Add or update tests under `/test/` for new or changed logic.
- **Pull Request Notes:** Summaries should mention major code changes and include the result of `npm test`.

