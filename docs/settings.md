# ⚙ Settings

This page lists runtime toggles stored under `Memory.settings` and related console commands.
These options let you adjust visual overlays and logging from the game console.

## Memory.settings

```javascript
Memory.settings = {
  enableVisuals: true,      // HUD and layout overlays
  showTaskList: false,      // print scheduled tasks periodically
  energyLogs: false,        // enable energy request & demand logging
  showLayoutOverlay: false, // draw planned structures
  debugHiveGaze: false,     // verbose scout & hiveGaze logging
};
```

`enableVisuals` toggles the heads‑up display drawn by `hudManager`. Set
`showTaskList` to `true` to print scheduled jobs every 50 ticks. `energyLogs`
controls debug output from `manager.energyRequests` and
`manager.hivemind.demand`.

## Console helpers

* `visual.overlay(1)` / `(0)` – toggle HUD visuals
* `visual.DT(1)` / `(0)` – distance transform overlay
* `debug.toggle('module', true)` – enable logging for a module
* `debug.showSchedule()` – show the current scheduler queue once
* `debug.showHTM()` – list active HTM tasks
* `debug.memoryStatus()` – display memory schema versions

Energy request and demand logs are disabled by default. Enable them via:

```javascript
debug.toggle('energyRequests', true);
debug.toggle('demandManager', true);
```

Alternatively set `Memory.settings.energyLogs = true` to persist the setting.
