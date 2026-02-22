# Settings

This page lists the runtime settings used by the current codebase.

## Full Defaults

```javascript
if (!Memory.settings) Memory.settings = {};
Memory.settings.enableVisuals = true;
Memory.settings.alwaysShowHud = true;
Memory.settings.showTaskList = false;
Memory.settings.energyLogs = false;
Memory.settings.debugHiveGaze = false;
Memory.settings.debugVisuals = false;
Memory.settings.enableBaseBuilderPlanning = true;
Memory.settings.showSpawnQueueHud = true;
Memory.settings.enableTowerRepairs = true;
Memory.settings.pauseBot = false;
Memory.settings.buildPreviewOnly = false;
Memory.settings.showLayoutLegend = true;
Memory.settings.showLayoutOverlayLabels = false;
Memory.settings.layoutPlanningMode = 'standard';
Memory.settings.layoutOverlayView = 'plan';
Memory.settings.allowSavestateRestore = false;
Memory.settings.maxSavestates = 25;
Memory.settings.maxIncidents = 25;
Memory.settings.incidentLogWindow = 150;
Memory.settings.incidentMaxAge = 20000;
Memory.settings.enableAutoIncidentCapture = false;
Memory.settings.enableAssimilation = true;
Memory.settings.enableRebirth = true;
Memory.settings.rebirthMaxTtl = 180;
Memory.settings.enableRecycling = true;
Memory.settings.renewOverheadTicks = 10;
Memory.settings.renewQueueBusyThreshold = 1;
Memory.settings.recycleOverheadTicks = 20;
```

## Per-Setting Copy Boxes

### `enableVisuals` (default `true`)
```javascript
Memory.settings.enableVisuals = true
```

### `alwaysShowHud` (default `true`)
```javascript
Memory.settings.alwaysShowHud = true
```

### `showTaskList` (default `false`)
```javascript
Memory.settings.showTaskList = false
```

### `energyLogs` (default `false`)
```javascript
Memory.settings.energyLogs = true
```

### `debugHiveGaze` (default `false`)
```javascript
Memory.settings.debugHiveGaze = true
```

### `debugVisuals` (default `false`)
```javascript
Memory.settings.debugVisuals = true
```

### `enableBaseBuilderPlanning` (default `true`)
```javascript
Memory.settings.enableBaseBuilderPlanning = true
```

### `showSpawnQueueHud` (default `true`)
```javascript
Memory.settings.showSpawnQueueHud = true
```

### `enableTowerRepairs` (default `true`)
```javascript
Memory.settings.enableTowerRepairs = true
```

### `pauseBot` (default `false`)
```javascript
Memory.settings.pauseBot = true
```

### `buildPreviewOnly` (default `false`)
```javascript
Memory.settings.buildPreviewOnly = true
```

### `showLayoutLegend` (default `true`)
```javascript
Memory.settings.showLayoutLegend = true
```

### `showLayoutOverlayLabels` (default `false`)
```javascript
Memory.settings.showLayoutOverlayLabels = true
```

### `layoutPlanningMode` (default `'standard'`)
```javascript
Memory.settings.layoutPlanningMode = 'theoretical' // or 'standard'
```

### `layoutOverlayView` (default `'plan'`)
```javascript
Memory.settings.layoutOverlayView = 'plan' // plan|wallDistance|controllerDistance|flood|spawnScore
```

### `allowSavestateRestore` (default `false`)
```javascript
Memory.settings.allowSavestateRestore = true
```

### `maxSavestates` (default `25`)
```javascript
Memory.settings.maxSavestates = 25
```

### `maxIncidents` (default `25`)
```javascript
Memory.settings.maxIncidents = 25
```

### `incidentLogWindow` (default `150`)
```javascript
Memory.settings.incidentLogWindow = 150
```

### `incidentMaxAge` (default `20000`)
```javascript
Memory.settings.incidentMaxAge = 20000
```

### `enableAutoIncidentCapture` (default `false`)
```javascript
Memory.settings.enableAutoIncidentCapture = true
```

### `enableAssimilation` (default `true`)
```javascript
Memory.settings.enableAssimilation = true
```

### `enableRebirth` (default `true`)
```javascript
Memory.settings.enableRebirth = true
```

### `rebirthMaxTtl` (default `180`)
```javascript
Memory.settings.rebirthMaxTtl = 180
```

### `enableRecycling` (default `true`)
```javascript
Memory.settings.enableRecycling = true
```

### `renewOverheadTicks` (default `10`)
```javascript
Memory.settings.renewOverheadTicks = 10
```

### `renewQueueBusyThreshold` (default `1`)
```javascript
Memory.settings.renewQueueBusyThreshold = 1
```

### `recycleOverheadTicks` (default `20`)
```javascript
Memory.settings.recycleOverheadTicks = 20
```

## Optional Feature Flags (Read By Modules)

These are consumed by modules but do not currently get explicit defaults in `main.js`.

### `showLayoutOverlay`
```javascript
Memory.settings.showLayoutOverlay = true
```

### `debugBuilding`
```javascript
Memory.settings.debugBuilding = true
```

### `debugLayoutProgress`
```javascript
Memory.settings.debugLayoutProgress = true
```

### `enableAutoScout`
```javascript
Memory.settings.enableAutoScout = true
```

## Console Helpers

```javascript
visual.overlay(1)      // HUD visuals on
visual.overlay(0)      // HUD visuals off
visual.spawnQueue(1)   // spawn queue HUD on
visual.spawnQueue(0)   // spawn queue HUD off
visual.baseBuilder(1)  // layout/base planning + overlay on
visual.baseBuilder(0)  // layout/base planning + overlay off
visual.buildPreview(1) // planner/overlay-only mode on
visual.buildPreview(0) // planner/overlay-only mode off
visual.layoutLegend(1) // planner legend on
visual.layoutLegend(0) // planner legend off
visual.layoutMode('theoretical') // switch planner to theoretical mode
visual.layoutMode('standard')    // switch planner to standard mode
visual.layoutView('plan')        // plan view
visual.layoutView('wallDistance')
visual.layoutView('controllerDistance')
visual.layoutView('flood')
visual.layoutView('spawnScore')
visual.theoreticalPlanning(1)    // enable suspended theoretical planning mode
visual.theoreticalPlanning(0)    // return to live mode preset
visual.runMode('theoretical')    // same as above, explicit run mode
visual.runMode('live')
visual.enterTheoretical()        // shortcut
visual.enterLive()               // shortcut
visual.DT(1)           // distance transform overlay on
visual.DT(0)           // distance transform overlay off
visual.rescanRooms()   // force scout rescan
debug.showHTM()        // print active HTM tasks
debug.showSchedule()   // print scheduler jobs
debug.memoryStatus()   // print memory schema info
debug.setSpawnLimit('W1N1', 'hauler', 3)
debug.setSpawnLimit('W1N1', 'hauler', 'auto')
startFresh()
startFresh(true)
startFresh({ theoreticalBuildingMode: true })
```

## `startFresh` Detailed Behavior

`startFresh()` clears major runtime memory branches (`rooms`, `hive`, `htm`, `demand`,
`spawnQueue`, `creeps`, `stats`, `spawns`, `roleEval`, `nextSpawnId`, `settings`) so the bot
can rebuild state from scratch.

`startFresh(true)` does the same wipe and then sets `Memory.settings.pauseBot = true`.

`startFresh({ theoreticalBuildingMode: true })` wipes runtime memory and enters
theoretical planning mode (`buildPreviewOnly`, layout overlay, legend, labels,
theoretical planner mode + default plan view).

To keep visual debugging usable after a wipe, these settings are preserved and restored:

- `enableVisuals`
- `alwaysShowHud`
- `showSpawnQueueHud`
- `showLayoutOverlay`
- `showLayoutLegend`
- `showLayoutOverlayLabels`
- `buildPreviewOnly`
- `layoutPlanningMode`
- `layoutOverlayView`
