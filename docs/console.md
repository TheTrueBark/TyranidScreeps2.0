# 📊 Console Stats & Display

The console module renders an ASCII dashboard inside the Screeps client. It combines CPU statistics, room information and recent log entries into a single view.

## Features

- **CPU Histogram** – history of CPU usage drawn with `console.ascii-chart.js`.
- **Stat Box** – shows GCL progress, room energy and controller status.
- **Logging Panel** – latest messages from the logger sorted by severity.
- Customisable characters for borders, bars and spacing.
- **Console draw time** – CPU cost for rendering the dashboard, shown under the
  "Total" CPU line.

The scheduler feeds data into the console module every tick. Use `statsConsole.displayStats()` to print the dashboard from the game console when needed.

Each room section shows the stored energy along with workforce counts. The numbers are
displayed as `current/max` for miners, haulers, builders and upgraders based on
the latest spawn evaluation. This helps track whether the colony is meeting its
target creep limits at a glance.
