# Issues Log

Use this page to capture long-lived bugs, edge cases, and investigation notes that impact multiple modules. Summaries should include the tick observed, reproduction steps, and the current mitigation or status.


## Resolved in stabilization sweep (2026-02)

- ✅ Reservist crash-risk on missing `targetRoom` was fixed with a fail-safe suicide path in `role.reservist.js` and regression coverage in `test/roleReservist.test.js`.
- ✅ Scout crash-risk when `Memory.rooms` was absent during TTL requeue handling was fixed in `role.scout.js` with regression coverage in `test/roleScout.test.js`.

- ✅ Reservists were being spawned with `[MOVE, WORK]`; remote reservation now enqueues `[CLAIM, MOVE]` so `reserveController` can succeed.
- ✅ Scout task dedupe now operates per target room, enabling multi-exit scouting from a single colony in the same scan tick.
- ✅ `htm.claimTask` now supports claiming by `taskId`; scout, spawn, and hauler claim paths now target exact tasks to avoid decrementing the wrong task.
- ✅ Reservists were suiciding after the first reserve attempt (including successful ones); reservists now path into range and continue reserving until natural death or terminal failure.
- ⚠️ Deferred: HiveTravel edge handling when an expected exit is blocked or when destination updates during movement is still tracked as TODO in `manager.hiveTravel.js`; roadmap item added under Movement & Pathing.
- ⚠️ Deferred remote expansion orchestration: wait for seeded/fresh scout intel, score remotes by net economy, then promote via a task bundle (`REMOTE_MINER_INIT` + `RESERVE_REMOTE_ROOM` + planned road-task issuance) with travel-time-based recurring replacements.
- ⚠️ Deferred movement hardening specifics: add border-stall repath fallback and destination-mutation cache invalidation in `manager.hiveTravel.js`, plus regression tests for blocked exits.
