# 👁️ Visual Overlays
@codex-owner layoutVisualizer

`layoutVisualizer` renders planned structures for every planned building.
The overlay helps debug base layouts without creating construction sites.
Enable it by setting `Memory.settings.showLayoutOverlay` to `true`.

`RoomVisual.js` is loaded in `main.js` and the planner overlay draws
color-coded dots per structure type, optional compact labels, plus an
on-screen legend.

When `layoutPlanner` generates a layout, the matrix is stored under
`room.memory.layout.matrix`. The ghost layer reads from this matrix so
you can preview structure locations before construction sites are
placed.

Overlay elements:

| Element                    | Meaning                                  |
|---------------------------|------------------------------------------|
| Colored dot               | Planned structure type                   |
| Small gray number         | Minimum RCL for that tile (if defined)   |
| Red translucent tile      | Reserved/blocked tile                    |
| Legend panel              | Dot color-to-structure mapping           |

Toggle helpers:

- `Memory.settings.showLayoutOverlay = true`
- `Memory.settings.showLayoutLegend = true`
- `Memory.settings.showLayoutOverlayLabels = true` (optional extra text labels)
- `Memory.settings.layoutPlanningMode = 'theoretical'` (spawn-independent planning)
- `Memory.settings.layoutOverlayView = 'plan'` (or `wallDistance`, `controllerDistance`, `flood`, `spawnScore`)

`visual.layoutLegend(1|0)` toggles the legend quickly from console.
`visual.layoutMode('theoretical'|'standard')` switches planner mode.
`visual.layoutView('plan'|'wallDistance'|'controllerDistance'|'flood'|'spawnScore')` switches overlay view.

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

## Distance Transform Overlay

The command `visual.DT(1)` toggles a debug overlay that displays the
distance transform matrix for each room. When enabled the data is
recalculated and rendered every tick, allowing you to inspect pathing
weights interactively. Use `visual.DT(0)` to disable the overlay.
