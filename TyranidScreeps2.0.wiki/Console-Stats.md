# Console Stats & Display

The console module renders an ASCII dashboard inside the Screeps client. It combines CPU statistics, room information and recent log entries into a single view.

## Features

- **CPU Histogram** – History of CPU usage drawn with console.ascii-chart.js.
- **Stat Box** – Shows GCL progress, room energy and controller status.
- **Logging Panel** – Latest messages from the logger sorted by severity.
- Customisable characters for borders, bars and spacing.
- **Console draw time** – CPU cost for rendering the dashboard, shown under the "Total" CPU line.

The scheduler feeds data into the console module every tick. Use statsConsole.displayStats() to print the dashboard from the game console when needed.

Each room section shows the stored energy along with workforce counts. The numbers are displayed as current/max for miners, haulers and workers based on the latest spawn evaluation. The worker entry includes a (B:x U:y) breakdown so you can see how many creeps currently have builder or upgrader priorities. When a manual spawn limit is set for any role the value is appended as manual limit: X, allowing rooms to be throttled for testing. Use debug.setSpawnLimit(room, role, amount) where mount can be a number or 'auto' to clear the override. This helps track at a glance whether the colony is meeting its target creep limits.
