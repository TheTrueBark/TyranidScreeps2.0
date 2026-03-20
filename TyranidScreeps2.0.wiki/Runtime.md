# Runtime Environment

As of **March 20, 2026**, the production Screeps runtime for this project should
still be treated as **ECMAScript 5.1** compatible. Runtime-critical code should
therefore continue to avoid syntax that requires modern Node support until the
announced Screeps Node.js 24 migration is actually live.

## Current Safe Baseline

- Prefer ES5.1-compatible syntax for in-game runtime code.
- Avoid relying on modern syntax such as arrow functions, classes, object spread,
  optional chaining, and nullish coalescing in code that must run on the live
  shard today.
- Keep any future modernization work behind a deliberate runtime migration pass.

## Forthcoming Runtime Change

Screeps has announced a move to **Node.js 24** on **April 1, 2026**. Once that
cutover is confirmed live, this page and the project coding baseline should be
updated to reflect the new runtime reality.

Until then, treat ES5.1 compatibility as the production target for shipped code.
