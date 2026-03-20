# Layout Planner

This page documents the current intended behavior of the theoretical layout planner, with emphasis on the parts that were recently hardened to prevent "looks fine in overlay, but loses in winner selection" regressions.

It is meant to be the stable reference for:

- candidate generation and selection,
- hard reject rules,
- full-plan reranking,
- source logistics and chokepoint handling,
- defense/rampart planning expectations,
- practical debug workflow.

## Planner Modes

The planner currently has two relevant Harabi stages:

- `foundation`
  Builds and scores the stabilized structural footprint:
  - core stamp,
  - controller stamp,
  - source containers/links/routes,
  - labs,
  - extension/special previews,
  - road network skeleton.

- `full`
  Materializes the expensive final plan:
  - finalized roads,
  - finalized rampart shell,
  - support/corridor ramparts,
  - tower placement against actual shell,
  - validation against the practical, built layout.

The theoretical pipeline intentionally evaluates many candidates in `foundation` first and only materializes a small finalist set as `full`.

## Candidate Lifecycle

The planner works in these broad steps:

1. Generate anchor candidates from DT, controller/source/mineral/exit metrics.
2. Build `foundation` plans for those anchors.
3. Score those candidates and persist compact per-candidate debug data.
4. Optionally run refinement mutations on the best seeds.
5. Rerank the leading finalists as real `full` plans.
6. Persist only the final winner as `basePlan`.

This separation exists for CPU reasons. The key rule is:

- cheap `foundation` ranking is allowed for broad exploration,
- final winner selection must reflect practical `full`-plan failures.

## Foundation Guardrails

Certain validation failures are no longer "just a bad score". They are considered hard disqualifiers for winner selection.

Current hard reject prefixes:

- `controller-stamp-missing`
- `controller-stamp-incomplete`
- `missing-logistics-route`
- `source-road-anchor-missing`
- `road-network-disconnected`
- `spawn-exit-blocked`
- `extension-foundation-rank-missing`

When a candidate hits one of these:

- it is marked `selectionRejected: true`,
- the triggering flags are persisted in `hardRejectFlags`,
- it is excluded from winner selection even if its raw score is otherwise high.

This prevents obviously broken candidates from surviving merely because their geometry is compact or cheap.

The rule set now lives in `planner.winnerSelection.js`, so reject prefixes,
penalty buckets, deterministic tie-breaks, and finalist rerank behavior are no
longer spread across `layoutPlanner.js`.

## Full-Plan Rerank

In `harabi/full`, the planner reranks only the leading finalists as real full plans before persisting a winner.

Important details:

- the finalist rerank uses the cheaper `estimate` defense mode, not the heaviest mincut smoothing path,
- this keeps CPU low enough for practical theoretical runs,
- it still catches practical failures that do not appear in the early `foundation` score.

The rerank exists specifically to stop this class of bug:

- a candidate looks excellent in the early footprint,
- but its real full plan leaks, disconnects, or collapses around roads/ramparts,
- and would otherwise still win.

### Full-Plan Penalty Signals

The rerank and selection penalty path pays special attention to:

- `rampart-boundary-leak`
- `road-network-disconnected`
- `base-road-redundancy-missing`
- `missing-logistics-route`
- `source-road-anchor-missing`
- `rampart-road-missing`
- `rampart-road-disconnected`
- `controller-link-*`
- `source-link-*`
- `spawn-spread-fail`
- `container-count-fail`

The goal is not "lowest geometric cost wins", but "best practical buildable base wins".

## Heuristic Config

Winner-selection tuning lives under `Memory.settings.layoutWinnerSelection`.
Relevant keys:

- `profile` (`strict` by default)
- `rerankTopN`
- `rerankDefenseMode`
- `hardRejectPrefixes`
- `penaltyBuckets.{critical,major,minor}`
- `tieBreakers`

The default profile stays compatible with the pre-module behavior, but the
module now persists richer debug state:

- `selectionStage` (`foundation` or `full-rerank`)
- `selectionBreakdown` (raw score, penalty, bucket counts, matched flags, tie-break snapshot)

## Source Logistics Rules

Source logistics are planned in `foundation`, not deferred.

Each source tries to establish:

- one source container,
- one reserved road anchor tile near that container,
- one source link that does not consume the reserved road anchor,
- a route that can actually reconnect to the storage-connected main road network.

### Road Anchor First

The planner reserves at least one road anchor next to each source container before placing the source link.

This matters because otherwise a good link placement can consume the only route tile and silently create:

- unreachable sources,
- one-road-only trunks,
- blocked corridors behind the source area.

### Chokepoint-Aware Source Link Placement

Source links are no longer picked only by "close to storage / close to source".

They now also consider:

- local walkable openness,
- whether the candidate blocks a narrow transit corridor,
- whether the candidate sits directly on the likely continuation lane behind the source container.

That means the planner now prefers side-pocket link positions over the straight-through corridor tile when the road still needs to continue past the source area toward:

- another source,
- the mineral,
- or the rest of the base approach.

This is the intended behavior for tight terrain chokepoints.

## Road Connectivity Intent

The planner treats the storage-connected road component as the main network.

That has several consequences:

- extension/special structure candidates must attach to the storage-connected road network,
- clipped road fragments outside that network are pruned,
- source logistics are validated against the same main component,
- reconnect passes may relocate a limited blocker when a single structure prevents a valid reconnection.

The desired outcome is:

- not just "roads exist",
- but "roads that matter belong to the same usable logistics network".

## Defense and Rampart Intent

The defense planner is still evolving, but the intended behavior is already clear:

- ramparts should protect the base against exits, not just draw arbitrary cheap internal separators,
- single-exit rooms should defend the actual exit opening and a short inward approach,
- support/corridor ramparts exist to create a thicker repairable interior band,
- the shell should preserve repair access and road access where possible.

### Current Single-Exit Behavior

On single-exit rooms the planner now seeds defense planning from:

- the actual exit region,
- the center of that opening,
- a short inward corridor,
- a small reserve around that corridor for future dragontooth wall teeth.

This is intentionally closer to the Harabi/mincut philosophy of cutting the room from the exit side, rather than simply protecting a compact box around the core.

## Persisted Debug Data

Useful planner state is persisted in:

- `Memory.rooms[room].layout.theoreticalPipeline`
- `Memory.rooms[room].layout.theoreticalCandidatePlans`
- `Memory.rooms[room].layout.theoretical`
- `Memory.rooms[room].basePlan`

Helpful fields to inspect:

- `selectionRejected`
- `hardRejectFlags`
- `selectionStage`
- `selectionBreakdown`
- `validation`
- `defenseScore`
- `fullSelectionRerank`
- `foundationDebug`
- `sourceResourceDebug`
- `logisticsRoutes`

The winner may later be compacted, but the compact rows still retain enough score/debug state for postmortem analysis.

## Debug Workflow

Recommended commands:

```js
startFresh({ wipe: 'all', theoreticalBuildingMode: true, layoutPlanDumpDebug: true })
```

```js
visual.layoutManualMode(1)
visual.layoutInitializePhase('W1N1', 4, 1)
```

```js
layoutPlanDump('W1N1', { force: true, print: true, maxEntries: 120, includeRoadEntries: true })
```

```js
visual.memoryBreakdownReport()
```

Use the dump workflow when you need to answer one of these questions:

- Did a candidate fail in `foundation` already?
- Did it only become invalid after `full` rerank?
- Was it rejected, penalized, or did it simply lose by score?
- Did the source link or road anchor consume the only corridor tile?

## Non-Goals

The planner is not yet trying to solve every defense/wall refinement in one pass.

Still in progress or intentionally deferred:

- final dragontooth wall placement in front of the shell,
- perfect exit-screening in every exotic terrain room,
- every possible redundant road trunk under extreme chokepoint terrain.

But the rules above are now meant to stay stable:

- broken foundation candidates should not win,
- finalists should be reranked on practical full plans,
- source links should not casually choke through-lanes,
- and the main road network should stay storage-connected and usable.
