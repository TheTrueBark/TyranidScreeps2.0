# HUD Layout Progress

If `Memory.settings.debugLayoutProgress` is `true`, the layout planner and building manager
log cluster progress every 1000 ticks. Example console line:

```text
[cluster] W1N1:extCluster1 3/5
```

This indicates three of the five planned structures in `extCluster1` have been built.

## Spawn & Task Panels

- The left HUD column displays spawn energy status, current queue entries, and overall room energy availability. The panel is shown by default (`Memory.settings.showSpawnQueueHud = true`).
- The right column hosts the Task Board which highlights pending colony HTM tasks alongside a summary of energy logistics (outstanding vs reserved deliveries). This keeps spawn demand visible while remaining unobtrusive on the edge of the room view.
- Reservations for spawn energy update in real time so the board reflects energy in transit; once the spawn is full the entry shows as fully reserved instead of queueing new haulers.

