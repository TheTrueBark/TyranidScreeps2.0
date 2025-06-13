# 📝 Logger System

The logger provides structured console output across the entire code base. Logs are sent through `console.console.js` so that they appear inside the screeps console UI with color codes.

## Severity Levels

- **0** – debug / trivial information
- **1** – routine messages
- **2** – important notices
- **3** – warnings
- **4** – errors
- **5** – critical failures

Higher severity entries are highlighted and displayed before lower ones. Repeated
log messages across ticks are aggregated into a single entry. Each log entry
auto-expires after about 30 ticks so the console stays readable.

## Usage

```javascript
const logger = require('logger');
logger.log('spawnManager', 'Spawning failed', 3);
```

Logs can be toggled per module via `console.debugLogs.js`. This allows selective debugging without polluting the console.

The aggregated log counts stored under `Memory.stats.logCounts` are cleared every
250 ticks to keep memory usage low.

## Integration with statsConsole

`statsConsole.log()` is used internally to print colored lines. The scheduler periodically triggers the log display so that messages are flushed every few ticks alongside CPU and room statistics.
