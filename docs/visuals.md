# 👁️ Visual Overlays
@codex-owner layoutVisualizer

`layoutVisualizer` renders ghost structures for every planned building.
The overlay helps debug base layouts without creating construction sites.
Enable it by setting `Memory.settings.showLayoutOverlay` to `true`.

`RoomVisual.js` is loaded in `main.js` to extend the prototype with
`.structure` and related helpers used for ghost drawings.

When the building manager plans extensions via `layoutPlanner`,
their stamp is stored in `room.memory.baseLayout`. The ghost layer
reads from this memory so you can preview extension locations before
construction sites are placed.

Colors indicate build status:

| Color       | Meaning                        |
|-------------|--------------------------------|
| `#00ff00`   | Structure already built        |
| `#ffff00`   | Construction queued            |
| `white`     | Ready to build at current RCL  |
| `#555555`   | Locked until higher RCL        |

Default `RoomVisual.structure` symbols are used for each structure type.

## Distance Transform Overlay

The command `visual.DT(1)` toggles a debug overlay that displays the
distance transform matrix for each room. When enabled the data is
recalculated and rendered every tick, allowing you to inspect pathing
weights interactively. Use `visual.DT(0)` to disable the overlay.
