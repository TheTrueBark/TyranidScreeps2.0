# 📊 Console Stats & Display

The console module renders an ASCII dashboard inside the Screeps client. It combines CPU statistics, room information and recent log entries into a single view.

## Features

- **CPU Histogram** – history of CPU usage drawn with `console.ascii-chart.js`.
- **Stat Box** – shows GCL progress, room energy and controller status.
- **Logging Panel** – latest messages from the logger sorted by severity.
- Customisable characters for borders, bars and spacing.

The scheduler feeds data into the console module every tick. Use `statsConsole.displayStats()` to print the dashboard from the game console when needed.
