# 📝 Logger System

The logger provides structured runtime logging across the codebase. Log entries
flow through `console.console.js`, are aggregated into `Memory.stats`, and can
be surfaced either in the Screeps console or in external tooling that reads the
same telemetry.

## Severity Levels

- **0** – debug / trivial information
- **1** – routine messages
- **2** – important notices
- **3** – warnings
- **4** – errors
- **5** – critical failures

Higher severity entries are highlighted and displayed before lower ones. Repeated
log messages across ticks are aggregated into a single entry. Each log entry
auto-expires after about 30 ticks so the telemetry window stays readable.

## Usage

```javascript
const logger = require('logger');
logger.log('spawnManager', 'Spawning failed', 3);
```

Logs can be toggled per module via `console.debugLogs.js`. This allows selective debugging without polluting the console.

The aggregated log counts stored under `Memory.stats.logCounts` are cleared every
250 ticks to keep memory usage low.

## Integration with statsConsole

`statsConsole.log()` is used internally to aggregate colored log lines into the
shared telemetry path. Periodic data collection continues even when the ASCII
console display is disabled.

Operationally, the preferred viewing surface is the external Dashboard:
`https://github.com/TheTrueBark/Dashboard`
