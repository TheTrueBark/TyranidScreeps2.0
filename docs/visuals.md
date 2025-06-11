# 👁️ Visual Overlays
@codex-owner layoutVisualizer

`layoutVisualizer` renders ghost structures for every planned building.
The overlay helps debug base layouts without creating construction sites.
Enable it by setting `Memory.settings.showLayoutOverlay` to `true`.

`RoomVisual.js` is loaded in `main.js` to extend the prototype with
`.structure` and related helpers used for ghost drawings.

Colors indicate build status:

| Color       | Meaning                        |
|-------------|--------------------------------|
| `#00ff00`   | Structure already built        |
| `#ffff00`   | Construction queued            |
| `white`     | Ready to build at current RCL  |
| `#555555`   | Locked until higher RCL        |

Default `RoomVisual.structure` symbols are used for each structure type.
