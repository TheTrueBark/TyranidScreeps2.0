# Console Stats and Display

The stats/console module collects CPU, room, and log telemetry under
`Memory.stats`. The historical ASCII dashboard still exists as an optional
manual view, but it is no longer the primary operator surface.

## Features

- **Telemetry retention** - CPU samples, log aggregates, and room snapshots are
  stored in `Memory.stats`.
- **Optional ASCII dashboard** - a manual Screeps-console view combining the CPU
  histogram, room stats, and recent logs.
- **Console draw time** - CPU cost for rendering the dashboard, exposed for
  profiling when that view is enabled.
- **Dashboard-first operations** - the preferred operator UI is the external
  Dashboard at `https://github.com/TheTrueBark/Dashboard`.

The runtime continues to feed telemetry into the stats module every tick. The
main loop no longer prints the ASCII dashboard periodically by default.

## Default Behavior

- Telemetry collection remains enabled.
- Periodic console rendering is disabled by default.
- Set `Memory.settings.consoleDisplayEnabled = true` if you explicitly want the
  ASCII dashboard printed again.

## Manual Use

Use `statsConsole.displayStats()` if you want to print the dashboard on demand
from the Screeps console.

Each room section shows stored energy and workforce counts. Values are displayed
as current/max for miners, haulers, and workers based on the latest spawn
evaluation. The worker entry includes a `(B:x U:y)` breakdown so you can inspect
builder vs upgrader priority splits. Manual spawn limits are appended as
`manual limit: X`. Use `debug.setSpawnLimit(room, role, amount)` where `amount`
is a number or `'auto'` to clear the override.
