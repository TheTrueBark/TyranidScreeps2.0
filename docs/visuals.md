# 👁️ Visual Overlays
@codex-owner layoutVisualizer

`layoutVisualizer` renders ghost structures for every planned building.
The overlay helps debug base layouts without creating construction sites.
Enable it by setting `Memory.settings.showLayoutOverlay` to `true`.

`RoomVisual.js` is loaded in `main.js` to extend the prototype with
`.structure` and related helpers used for ghost drawings.

When `layoutPlanner` generates a layout, the matrix is stored under
`room.memory.layout.matrix`. The ghost layer reads from this matrix so
you can preview structure locations before construction sites are
placed.

Colors indicate build status:

| Color       | Meaning                        |
|-------------|--------------------------------|
| `#00ff00`   | Structure already built        |
| `#ffff00`   | Construction queued            |
| `white`     | Ready to build at current RCL  |
| `#555555`   | Locked until higher RCL        |

Default `RoomVisual.structure` symbols are used for each structure type.

Reserved tiles are drawn with a faint red box so you can spot blocked
locations before construction begins. The required RCL for a structure
is displayed next to its glyph in small gray text.

## Distance Transform Overlay

The command `visual.DT(1)` toggles a debug overlay that displays the
distance transform matrix for each room. When enabled the data is
recalculated and rendered every tick, allowing you to inspect pathing
weights interactively. Use `visual.DT(0)` to disable the overlay.
