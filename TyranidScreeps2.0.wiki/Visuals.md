# 👁️ Visual Overlays
@codex-owner layoutVisualizer

`layoutVisualizer` renders planned structures for every planned building.
The overlay helps debug base layouts without creating construction sites.
Enable it by setting `Memory.settings.showLayoutOverlay` to `true`.

`RoomVisual.js` is loaded in `main.js` and the `plan` overlay now draws
real Screeps structure silhouettes via `RoomVisual.structure(...)` and
`connectRoads()`. The old shorthand glyph layer (`E`, `AR`, `S2`, `PS`,
etc.) is intentionally removed there. Labs and ramparts are also part of
that silhouette layer now. Roads use the connected `RoomVisual` path,
while ramparts are rendered as merged tile outlines with a very light green
fill plus diagonal connector strokes so clipped circles disappear, the
two-tile rampart band still reads as one shape, and checkerboard diagonals
stay readable. Pure diagonal ramps now use tile-edge diagonal boundary lines
instead of a simple center stroke, and the old square tile-edge leftovers on
those pure diagonals are no longer drawn. The outer contour is derived from the actual `rampart.edge`
shell, while the inner support/corridor band is drawn slightly inset so the
roads underneath stay readable and the support layer does not add visual
blips to the outside wall. Small gray RCL
numbers remain as text. The old heavy green rampart tile tint and controller
upgrader-slot tiles are no longer drawn in `plan`.
Planner-only distance labels, `DT0`, and green valid-position dots are
hidden unless `Memory.settings.debugVisuals` is enabled.

When `layoutPlanner` generates a layout, the matrix is stored under
`room.memory.layout.matrix`. The ghost layer reads from this matrix so
you can preview structure locations before construction sites are
placed.

Overlay elements:

| Element                    | Meaning                                  |
|---------------------------|------------------------------------------|
| Structure silhouette      | Planned structure type in `plan` view    |
| Connected road overlay    | Planned logistics road network           |
| Rampart outline/fill     | Planned rampart boundary with subtle area tint |
| Small gray number         | Minimum RCL for that tile (if defined)   |
| Red/translucent tile      | Reserved or blocked diagnostic tile      |
| Debug labels              | Distance/controller or candidate notes (`debugVisuals`) |

Toggle helpers:

- `Memory.settings.showLayoutOverlay = true`
- `Memory.settings.debugVisuals = true` (shows planner distance labels, `DT0`, and green valid-tile dots)
- `Memory.settings.showLayoutLegend = true` (still used by non-`plan` overlay views)
- `Memory.settings.showLayoutOverlayLabels = true` (legacy shorthand labels; no effect in `plan` view)
- `Memory.settings.layoutPlanningMode = 'theoretical'` (spawn-independent planning)
- `Memory.settings.layoutOverlayView = 'plan'` (or `wallDistance`, `controllerDistance`, `flood`, `spawnScore`, `candidates`, `evaluation`)
- `Memory.settings.layoutCandidateOverlayIndex = -1` (selected winner, or a concrete candidate index; internal 0-based)

`visual.layoutLegend(1|0)` toggles the legend quickly from console.
`visual.layoutMode('theoretical')` keeps planner mode on theoretical.
`visual.layoutView('plan'|'wallDistance'|'controllerDistance'|'flood'|'spawnScore'|'candidates'|'evaluation')` switches overlay view.
`visual.layoutCandidate('selected'|index)` selects which candidate breakdown is shown in overlay views (console index is 1-based).

## Build Preview Only Mode

Enable `Memory.settings.buildPreviewOnly = true` (or `visual.buildPreview(1)`)
to run planner + overlay/HUD only. In this mode the normal bot loop
(spawning, creep roles, task execution) is skipped so you can inspect
planned structure placement safely.

For a dedicated planning session, use:

- `visual.runMode('theoretical')` (or `visual.enterTheoretical()`)

This applies a layout-only profile:

- bot logic suspended,
- preview planner loop active,
- layout overlay forced on,
- normal runtime HUD panels suppressed (spawn queue/task panels, source circles).

Return with:

- `visual.runMode('live')` (or `visual.enterLive()`).

## Theoretical Compendium Planner

In theoretical mode, `layoutPlanner` now uses the compendium planner
(`planner.buildCompendium.js`) to generate a spawn-independent draft.
The generated overlay includes:

- core anchor (storage-centric),
- upgrader 2x4 candidate slots near controller,
- source containers/links for both primary sources,
- checkerboard extension expansion up to RCL 8,
- labs/towers/core specials (factory/power spawn/nuker/observer),
- roads and rampart envelope preview.

Planner v2 uses a terrain-first dynamic placement model:

- anchor scoring from controller/source/mineral/exit distance + distance transform,
- explicit exit-proximity exclusion for non-road structures,
- per-structure constraints (spawn neighbor exits, storage/terminal/link ranges, checkerboard extensions),
- roads planned with equal plain/swamp path costs to avoid swamp-detours when paths are shorter.
- source logistics roads are planned as a shared trunk + branch tree (instead of always two fully separate storage→source lines).
- source link placement prefers miner-reachable positions near the source container, with fallback for cramped 1-spot source geometries, and now also avoids narrow through-lanes when the road still needs to continue past the source area.
- rampart envelope uses adaptive margin to keep core structures outside ranged pressure where possible (target >= 4-tile inner standoff) and now adds an inner support band so the final shell is effectively two tiles thick where terrain allows.
- on single-exit rooms the rampart cut now also protects the reachable exit opening itself plus a short inward approach corridor, with a small reserve around that approach so later dragontooth wall teeth can be added in front of the shell without rethinking the whole cut.
- extension/special structure candidates are only accepted when they touch the storage-connected road component, so clipped stamp fragments no longer seed isolated build pockets.
- disconnected road fragments are pruned against that same storage-connected main network, so clipped stamp roads no longer survive as unreachable leftovers.
- rampart finalization backfills short `road.rampartAccess` connectors before pruning disconnected perimeter segments, guarantees an inner support rampart on boundary road spines, extends protected interior corridor coverage three tiles deep on those spines, trims lone stray support/corridor tiles that do not actually connect back into the shell, and post-prunes redundant outer blips when they do not improve enclosure quality.
- checkerboard `road.grid` is generated broadly, then pruned at the end: remote roads without adjacent structures are removed, except protected logistics routes (source/controller/mineral) and rampart-perimeter roads.

Planner output is persisted in `room.memory.layout.theoretical` for HUD
and view overlays (`wallDistance`, `controllerDistance`, `flood`,
`spawnScore`, `candidates`, `evaluation`).

Theoretical planning now runs as a multi-candidate HTM pipeline:

- `PLAN_LAYOUT_CANDIDATES` parent task tracks run progress.
- `PLAN_LAYOUT_CANDIDATE` subtasks evaluate candidates over multiple ticks.
- Every candidate stores both pre-score contributions and final weighted evaluation metrics.
- Final weighted evaluation includes logistics-route coverage and infrastructure-cost pressure (road/rampart cost proxy) so disconnected or expensive plans rank lower.
- Overlay view `candidates` compares all end scores.
- Overlay view `evaluation` shows the weighted score breakdown for the active candidate.
- A right-side checklist shows planning stages (`X`, `n/5`, `✔`) plus per-candidate completion states.
- The checklist is now numbered (`1..10`) and follows the major paper pipeline blocks.
- The active building overlay can be switched to any candidate via `visual.layoutCandidate(index)` (`1` = first candidate).
- With `visual.layoutCandidate('selected')`, the overlay automatically switches to the final winner once planning completes.
- In theoretical mode, the normal task panel is hidden to avoid overlap; the planning HUD still shows `Currently Viewing Candidate: N`.

For the current intended planner semantics behind those visuals, especially candidate rejection, finalist rerank, and source-link chokepoint behavior, see [Layout Planner](./Layout-Planner.md).

## Distance Transform Overlay

The command `visual.DT(1)` toggles a debug overlay that displays the
distance transform matrix for each room. When enabled the data is
recalculated and rendered every tick, allowing you to inspect pathing
weights interactively. Use `visual.DT(0)` to disable the overlay.
