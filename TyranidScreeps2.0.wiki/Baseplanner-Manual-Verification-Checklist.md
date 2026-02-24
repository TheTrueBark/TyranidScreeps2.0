# Baseplanner – Manual Verification Checklist (Phasen + Algorithmen)

Diese Checkliste ist als reproduzierbarer Debug-Run gedacht.  
Ziel: Probleme schnell isolieren, reproduzieren und später vergleichen.

---

## 0) Vorbereitung

1. Sicherstellen, dass du in einer **eigenen Test-Session** bist.
2. Bot pausieren oder in theoretischen Modus wechseln, damit keine Live-Tasks stören.

### Console-Setup (copy/paste)
```js
Memory.settings = Memory.settings || {};
Memory.settings.pauseBot = false;
Memory.settings.enableVisuals = true;
Memory.settings.showLayoutOverlay = true;
Memory.settings.layoutOverlayView = 'plan';
Memory.settings.layoutPlanningMode = 'theoretical';
Memory.settings.layoutPlanningManualMode = true;
Memory.settings.layoutPlanningTopCandidates = 5;
Memory.settings.layoutPlanningCandidatesPerTick = 1;
Memory.settings.layoutPlanningMaxCandidatesPerTick = 25;
Memory.settings.layoutPlanningDynamicBatching = true;
Memory.settings.layoutPlanningDebugPhaseFrom = 1;
Memory.settings.layoutPlanningDebugPhaseTo = 10;
Memory.settings.layoutPlanningRecalcScope = 'all';
```

---

## 1) Manual Planner Mode / Phasensteuerung prüfen

### A) Mode aktivieren
```js
visual.layoutManualMode(1)
```
**Soll:** Log meldet manuellen Planner-Modus aktiv.

### B) Initialrun bis Base-Phase 4 (entspricht intern 1..9)
```js
visual.layoutInitializePhase('W1N1', 4, 1)
```
Dann 5–20 Ticks laufen lassen.

**Soll prüfen:**
- `Memory.rooms.W1N1.layout.theoreticalPipeline.status` ist `paused_phase_9` oder `completed`.
- `Memory.rooms.W1N1.layout.theoretical.selectedCandidateIndex` ist gesetzt.
- Keine Exceptions im Log.

### C) Nur Base-Phasen 3..4 neu rechnen
```js
visual.layoutInitializePhase('W1N1', 4, 3)
```
Wieder 5–20 Ticks laufen lassen.

**Soll prüfen:**
- Re-Run startet ohne Full-Reset.
- Candidate/Evaluation Daten aktualisieren sich.

---

## 2) MinCut-Algorithmus prüfen (flow + continuity)

### A) Overlay auf Kandidaten/Evaluation
```js
visual.layoutView('candidates')
visual.layoutCandidate('selected')
```

### B) Memory-Metadaten checken
```js
const p = Memory.rooms.W1N1.layout.theoreticalPipeline;
const t = Memory.rooms.W1N1.layout.theoretical;
({
  pipelineStatus: p && p.status,
  selected: t && t.selectedCandidateIndex,
  continuityMeta: t && t.candidates && t.candidates.find(c => c.selected)?.weightedMetrics
})
```

### C) Erwartung
- Cut ist vorhanden (Rampart-Linie sichtbar/ableitbar).
- Keine offensichtlich getrennten Rampart-Inseln.
- Bei schwierigen Räumen: continuity bridging greift (bridgedTiles > 0 möglich).

---

## 3) FloodFill-Algorithmus prüfen (weighted + 4-way im Unit-Test abgesichert)

### A) Praktische Sichtprüfung
```js
visual.layoutView('floodDepth')
```

**Soll prüfen:**
- Flood-Tiefen sehen radial plausibel aus.
- Keine unplausiblen Sprünge über Walls.

### B) Bei swamp-heavy rooms
- Prüfen, ob Placement nicht unnatürlich durch Swamp-Korridore bevorzugt wird.
- Kandidatenvergleich mit `visual.layoutView('evaluation')` gegenchecken.

---

## 4) BasePlan Validation prüfen

### A) Validation-Objekt
```js
Memory.rooms.W1N1.basePlan && Memory.rooms.W1N1.basePlan.validation
```

### B) Recovery-Objekt
```js
Memory.rooms.W1N1.basePlan && Memory.rooms.W1N1.basePlan.validationRecovery
```

### C) Profiling
```js
Memory.rooms.W1N1.basePlan && Memory.rooms.W1N1.basePlan.validation && Memory.rooms.W1N1.basePlan.validation.checkedAt
```
> Detail: `durationMs` kommt aus dem Validator-Result und sollte bei Re-Runs beobachtbar bleiben.

### D) Erwartung
- `validation` vorhanden.
- Bei Warnungen: `issues` sind konkret (z. B. `lab-range-fail`, `rampart-connectivity-fail`, etc.).

---

## 5) Building/HUD Integration prüfen

### A) HUD
- Base Plan Block sichtbar.
- Enthält: Status, Spawn, Score, Validation (`ok`/`warn(N)`), Next Build.

### B) BuildQueue-Konsum
```js
Memory.rooms.W1N1.basePlan && Memory.rooms.W1N1.basePlan.buildQueue && Memory.rooms.W1N1.basePlan.buildQueue.slice(0,5)
```

**Soll:**
- `manager.building.executeLayout` priorisiert `basePlan.buildQueue` vor legacy matrix.

---

## 6) Fehlerfall-Referenz (für spätere Debug-Sessions)

Wenn Probleme auftreten, direkt sichern:
```js
({
  tick: Game.time,
  room: 'W1N1',
  manualMode: Memory.settings.layoutPlanningManualMode,
  overlay: Memory.settings.layoutOverlayView,
  pipeline: Memory.rooms.W1N1.layout && Memory.rooms.W1N1.layout.theoreticalPipeline,
  theoretical: Memory.rooms.W1N1.layout && Memory.rooms.W1N1.layout.theoretical,
  basePlanValidation: Memory.rooms.W1N1.basePlan && Memory.rooms.W1N1.basePlan.validation,
  basePlanRecovery: Memory.rooms.W1N1.basePlan && Memory.rooms.W1N1.basePlan.validationRecovery,
})
```

Damit hast du einen stabilen Snapshot zum Vergleich mit späteren Änderungen.

---

## 7) Abschlusskriterien „Platzhalter ersetzt“

Ein Algorithmus gilt als abgeschlossen, wenn:
- Unit-Tests grün sind,
- es im Manual-Run reproduzierbar funktioniert,
- die zugehörige Roadmap/Wiki-Markierung gesetzt wurde,
- und Debug/Metadaten vorhanden sind, um Fehler später nachvollziehen zu können.
