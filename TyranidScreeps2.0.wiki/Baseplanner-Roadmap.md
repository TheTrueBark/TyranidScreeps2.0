# Dynamic Base-Building Algorithm: Complete Implementation Specification

**Version:** 2.0  
**Target System:** TyranidScreeps2.0  
**Integration Points:** `planner.buildCompendium.js`, `manager.memory.js`, `manager.hud.js`, `layoutPlanner.js`

---

## Executive Summary

Diese Spezifikation beschreibt einen vollständigen, dynamischen Baseplanner für Screeps: statt statischer Stamps wird pro Raum die Topologie bewertet, Spawn-Kandidaten werden über gewichtete Metriken verglichen, und daraus wird ein RCL-gestaffelter Gesamtplan (RCL1→RCL8) erzeugt.

### Kernziele
- Multi-Kandidaten-Spawnbewertung mit gewichteten Faktoren
- Nutzung von Distance Transform (bereits vorhanden in `algorithm.distanceTransform.js`)
- Flood-Fill für Core-Nähe und Platzierungspriorität
- Min-Cut für Rampart-Linien
- Checkerboard-Erweiterungsfelder für Extensions + Straßen
- Lab-Constraint-Solver (Range-2-Regel)
- Tower-Coverage-Optimierung
- Vollständige Memory-/HUD-Integration inkl. Build Queue

---

## 1) Game Mechanics Reference (numerisch bindend)

### 1.1 RCL-Limits (kompakt)
- RCL2–RCL8 Extensions: 5/10/20/30/40/50/60
- Tower: 0/1/1/2/2/3/6
- Spawn: 1/1/1/1/1/2/3
- Links: 0/0/0/2/3/4/6
- Labs: 0/0/0/0/3/6/10
- Storage: ab RCL4 (1)
- Terminal: ab RCL6 (1)
- Factory: RCL7+
- Observer/PowerSpawn/Nuker: RCL8
- Containers: max 5
- Ramparts/Walls: ab RCL2 (2500 Strukturen)

### 1.2 Bewegung & Fatigue
- Formel: `F = 2 * (W * K - M)`
- Terrainfaktoren: Road 0.5, Plain 1.0, Swamp 5.0
- Wichtige Regel: **Road auf Swamp entfernt den Swamp-Nachteil vollständig**
- Tickzeit pro Tile: `ceil(K * W / M)`

### 1.3 CostMatrix
- `0`: Terrainstandard, `1-254`: custom, `>=255`: unpassierbar
- Werte **ersetzen** Terrainkosten (nicht additiv)
- Für Roadplanung: `plainCost:1`, `swampCost:5`

### 1.4 Tower Damage
- Basis 600 Damage, optimal bis Range 5
- Falloff bis Range 20 auf 150
- Näherung: ~30 Damage weniger je Tile (Range 5→20)

### 1.5 Links
- Transferverlust: `ceil(amount * 0.03)`
- Cooldown: Distanz in Tiles
- Kapazität: 800

### 1.6 Labs
- Jede Reaktions-Lab muss in **Range 2 zu beiden Source-Labs** liegen
- Ideal RCL8: 2 Source + 8 Reaction = 10

### 1.7 Spawn/Boundary
- Spawn braucht mindestens 1 freien Nachbarn
- Keine Nicht-Road/Nicht-Rampart-Strukturen auf Exit-Border (x/y = 0 oder 49)

---

## 2) Spawn Position Evaluation System

### 2.1 Prerequisites
- [ ] DT verfügbar (`algorithm.distanceTransform.js`)
- [ ] Terrain, Sources, Mineral, Controller lesbar
- [ ] Exit-Tiles identifizierbar

### 2.2 Gewichtete Bewertung
Form: `score = Σ(w_i * normalize(f_i))`

**Faktoren & Gewichte**
- controllerDist: -2.6
- avgSourceDist: -0.65
- mineralDist: -0.2
- dtValue: +1.4
- exitDist: +0.8
- exitDistPenalty (<5): -4.2
- terrainQuality: +0.8
- symmetry: +0.3
- defenseRampart: +0.9
- defenseStandoff: +1.1

### 2.3 Candidate-Pipeline
1. Tiles 1..48 iterieren
2. Hard Filter: DT>=3, nicht swamp/wall, exitDist>=5
3. Score berechnen
4. Nach Score sortieren
5. Top-N (Standard 5)
6. `Memory.rooms[roomName].spawnCandidates` speichern

### 2.4 Umsetzung
- [ ] `evaluateSpawnPosition`
- [ ] `chebyshev`, `pathDistance`, `normalize`, `standardDeviation`
- [ ] `estimateRampartEfficiency`, `estimateStandoffDistance`
- [ ] `findTopSpawnCandidates(room, N=5)`
- [ ] Console command `evaluateSpawns('W7N3')`

---

## 3) Core Algorithms

### 3.1 Distance Transform
- Status: ✅ vorhanden in `algorithm.distanceTransform.js`

### 3.2 Flood Fill
- BFS ab Spawn-Core, Ergebnis = Distanzmatrix
- Niedrige Distanz = hohe Platzierungspriorität
- [ ] `algorithm.floodFill.js` erstellen
- [ ] Mit Walkability-Matrix kombinieren

### 3.3 Min-Cut (Edmonds-Karp)
- Ziel: minimale Rampart-Linie zwischen Core und Exits
- Graph mit Node-Splitting pro Tile
- Tile-Gewichte: Swamp teurer, Wall als nicht schneidbar
- [ ] `algorithm.minCut.js`
- [ ] MaxFlow + Cut-Extraktion
- [ ] Kontinuierliche Barriere verifizieren

### 3.4 Checkerboard
- White/Black Pattern via `(x+y)%2`
- Extensions auf einer Farbe, Straßen auf der anderen
- [ ] Generator für Extension-Pattern
- [ ] Generator für Road-Pattern

---

## 4) Dynamic Placement Algorithm

### 4.1 Leitprinzipien
1. Core-first
2. Keine retroaktiven Verschiebungen
3. Constraints strikt prüfen
4. RCL-aware Build Order

### 4.2 Core Cluster (5x5)
- Spawn (origin)
- Storage (adjacent)
- Terminal (adjacent to storage)
- Hub-Link (adjacent zu Storage + Terminal)
- Factory + Power Spawn nahe Hub
- Ziel: Hub-Creep kann zentrale Strukturen von 1 Tile bedienen

### 4.3 Controller Zone
- Container in Range1 zum Controller
- Link in Range2 + LOS zum Hub-Link
- Upgrade-Spots in Range3 sammeln

### 4.4 Source Stations
- Pro Source: Container auf Pfad Richtung Storage (adjacent zur Source)
- Link adjacent zum Container & max Range2 zur Source
- `Memory.rooms[room].miningPositions` integrieren

### 4.5 Extensions
- Checkerboard + Flood-Distanzsortierung
- RCL-konforme Mengen (5,10,20,...,60)

### 4.6 Labs
- Finde zusammenhängende Area nahe Terminal
- Suche 2 Source-Lab-Positionen, die 8 Reaction-Labs (Range2 zu beiden) erlauben
- Bei Fehlschlag: Warnung + ohne Labs weiter

### 4.7 Towers
- Greedy-Placement auf Maximierung der minimalen kombinierten Rampart-DPS

### 4.8 Ramparts
- Min-Cut als Basis + Zusatzschutz auf kritischen Core-Strukturen

### 4.9 Straßennetz
- Source↔Storage, Controller↔Storage, Mineral↔Storage, Exit-Roads, Rampart-Service
- Einheitliche Path-Kosten für Roadplanung: plain=1/swamp=5

---

## 5) RCL Build Priorities

### Prioritätsmodell
- Prio 1: Spawn, Extensions, Storage (ab RCL4)
- Prio 2: Tower, Link, Terminal
- Prio 3: Container, Rampart, zentrale Roads
- Prio 4+: Labs/Extractor/Factory/Observer/Nuker je nach RCL

### Queue-Format
```js
Memory.rooms[roomName].buildQueue = [
  { type:'extension', pos:{x:25,y:30}, rcl:2, priority:1, built:false }
]
```

### Reihenfolge
1. Nach RCL
2. Nach Priorität
3. Nach Distanz zum Spawn

- [ ] `generateBuildQueue(room, basePlan)`
- [ ] `getNextBuild(room)`
- [ ] Integration in `manager.building.js`

---

## 6) Multi-Layout Evaluation

### Metriken (gewichtet)
- avgExtDist (0.14)
- maxExtDist (0.07)
- minTowerDamage (0.13)
- rampartEff (0.09)
- roadEff (0.02)
- sourceDist (0.07)
- controllerDist (0.15)
- compactness (0.04)
- labQuality (0.04)
- hubQuality (0.04)
- rangedBuffer (0.06)
- logisticsCoverage (0.10)
- infraCost (0.05)

### Workflow
1. Top-Spawn-Kandidaten erzeugen
2. Für jeden Kandidaten komplettes Layout bauen
3. Layout bewerten
4. Bestes Score-Layout wählen
5. In `Memory.rooms[room].basePlan` persistieren

- [ ] `evaluateLayout(room, layout)`
- [ ] `generateCompleteLayout(room, spawnPos)`
- [ ] `generateOptimalLayout(room)`

---

## 7) Memory Integration

### Neues Memory-Schema
`Memory.rooms[room].basePlan` enthält:
- Version, generatedAt, spawnPos
- `structures` (core/controller/sources/mineral/extensions/towers/labs/ramparts/roads)
- `buildQueue`
- `evaluation`

Zusätzlich temporär:
- `spawnCandidates`

### Manager API (in `manager.memory.js`)
- [ ] `initializeBasePlanMemory(room)`
- [ ] `storeBasePlan(roomName, plan)`
- [ ] `getBasePlan(roomName)`
- [ ] `markStructureBuilt(roomName, index)`
- [ ] `getNextStructureToBuild(roomName, currentRCL)`

---

## 8) HUD Visualization

### HUD-Blöcke
- Planungsstatus (vorhanden/fehlt)
- Spawn-Position
- Build-Fortschritt
- Qualitäts-Score
- Nächstes Build-Element

### Overlay
- Geplante Strukturen via RoomVisual nach Typ eingefärbt
- Aktuelles RCL: solide Darstellung
- Zukünftiges RCL: transparenter/Outline
- Toggle: `togglePlanVis(roomName)`

- [ ] `renderBasePlanningStatus(room, x, y)`
- [ ] `visualizePlannedStructures(room)`

---

## 9) Edge Cases & Validation

### Typische Problemfälle
- Kein 5x5-Raum → DT-Schwelle reduzieren
- Controller in Ecke → minimaler Upgrade-Kern priorisieren
- 1-Source-Raum → Linkverteilung anpassen
- Swamp-heavy → kritische Straßen priorisieren
- Asymmetrisch/Narrow Corridors → defensiv robuste, ggf. längere Ramparts akzeptieren

### Validierungschecks
- Core-Adjazenzregeln
- Controller-Container Range1
- Lab-Range2 zu beiden Source-Labs
- Extension-Anzahl pro RCL
- Overlap-Prüfung
- Boundary-Regel (kein Build auf Exitrand, außer Road/Rampart)
- Rampart-Konnektivität

- [ ] `validateBasePlan(room, plan)`
- [ ] Fehlerbehandlung/Fallback (`handleValidationFailure`)

---

## 10) Umsetzung in Phasen (Roadmap)

### Phase 1 – Foundation
- Utils + Terrain/Exit-Basics
- `planner.room.js` Grundgerüst

### Phase 2 – Core Algorithms
- Flood Fill / Min-Cut / Checkerboard

### Phase 3 – Placement System
- Spawn-Eval, Core, Controller, Sources, Extensions, Labs, Towers, Ramparts, Roads

### Phase 4 – Evaluation & Selection
- 13-Metriken + Multi-Kandidat-Selektion

### Phase 5 – Memory + HUD
- Persistenz + Anzeigen + Overlay

### Phase 6 – Test + Feinschliff
- Edge-Case-Validierung
- Performance-Ziele
- End-to-End Integration mit Construction

---

## 11) Referenz-Snippets aus dem Paper (Inspiration für die Implementierung)

> Zweck: Diese Blöcke sind bewusst als **Startpunkte**/Blueprints übernommen, damit beim Implementieren direkt Copy-&-Adapt möglich ist.

### 11.1 Spawn-Evaluation (gewichteter Score)

```js
function evaluateSpawnPosition(room, x, y, dtMatrix, terrain, controller, sources, mineral, exits) {
  if (dtMatrix.get(x, y) < 3) return null;
  if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) return null;
  if (terrain.get(x, y) === TERRAIN_MASK_WALL) return null;

  const minExitDist = Math.min(...exits.map(e => chebyshev({ x, y }, e)));
  if (minExitDist < 5) return null;

  const controllerDist = chebyshev({ x, y }, controller.pos);
  const avgSourceDist = mean(sources.map(s => pathDistance({ x, y }, s.pos)));
  const mineralDist = pathDistance({ x, y }, mineral.pos);
  const dtValue = dtMatrix.get(x, y);

  const score =
    -2.6 * normalize(controllerDist, 0, 30) +
    -0.65 * normalize(avgSourceDist, 0, 40) +
    -0.2 * normalize(mineralDist, 0, 40) +
    1.4 * normalize(dtValue, 3, 15) +
    0.8 * normalize(minExitDist, 5, 25);

  return { pos: { x, y }, score };
}
```

### 11.2 Flood-Fill (BFS-Distanzmatrix)

```js
function floodFill(room, startPos, walkableMatrix) {
  const distanceMatrix = new PathFinder.CostMatrix();
  const queue = [{ x: startPos.x, y: startPos.y, dist: 0 }];
  const visited = new Set([`${startPos.x}:${startPos.y}`]);

  while (queue.length) {
    const current = queue.shift();
    distanceMatrix.set(current.x, current.y, current.dist);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        if (!walkableMatrix[ny * 50 + nx]) continue;

        const key = `${nx}:${ny}`;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, dist: current.dist + 1 });
      }
    }
  }
  return distanceMatrix;
}
```

### 11.3 Checkerboard-Regeln

```js
const isCheckerboardWhite = (x, y) => (x + y) % 2 === 0;
const isCheckerboardBlack = (x, y) => (x + y) % 2 === 1;
```

### 11.4 Tower-Falloff

```js
function calculateTowerDamage(range) {
  const base = 600;
  if (range <= 5) return base;
  if (range >= 20) return base * 0.25;
  const reduction = 0.75 * (range - 5) / 15;
  return base * (1 - reduction);
}
```

### 11.5 Lab-Constraint-Check (Range-2 zu beiden Source-Labs)

```js
function isValidReactionLab(reactionPos, sourceLab1Pos, sourceLab2Pos) {
  return reactionPos.getRangeTo(sourceLab1Pos) <= 2 &&
         reactionPos.getRangeTo(sourceLab2Pos) <= 2;
}
```

### 11.6 Build Queue Sortierung

```js
queue.sort((a, b) => {
  if (a.rcl !== b.rcl) return a.rcl - b.rcl;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.pos.getRangeTo(basePlan.spawn) - b.pos.getRangeTo(basePlan.spawn);
});
```

---


## 12) Ergänzende Punkte, die zuvor fehlten (nützlich für Umsetzung)

### 12.1 Definition of Done pro Phase
- [ ] Jede Phase endet mit klarer DoD-Checkliste (Code fertig, Tests grün, Memory-Migration geprüft, HUD-Overlay geprüft).
- [ ] Für jede Phase mindestens ein reproduzierbarer Console-Workflow (`planRoom`, `validatePlan`, `nextBuild`).
- [ ] CPU-Budget-Snapshot dokumentieren (Before/After) für neue Planer-Teile.

### 12.2 Migration & Backward Compatibility
- [ ] Übergangszeit: `room.memory.layout` und `Memory.rooms[room].basePlan` parallel pflegen (Read-compat).
- [ ] Expliziter Umschaltpunkt, ab dem nur noch `basePlan` geschrieben wird.
- [ ] Fallback: Bei ungültigem `basePlan` auf bestehende Minimal-Buildlogik zurückfallen statt Hard-Fail.

### 12.3 Teststrategie (zusätzlich zu Unit-Tests)
- [ ] Golden-Room-Tests: 3-5 repräsentative Raumtopologien mit erwarteten Mindestkriterien (z. B. 60 Extensions erreichbar).
- [ ] Property Checks: keine Overlaps, Boundary-Regeln, Lab-Range-2-Constraint, Rampart-Konnektivität.
- [ ] Regression-Bucket: bekannte Fehlerbilder als feste Testfälle (Controller-Ecke, Swamp-heavy, 1-Source).

### 12.4 Operative Telemetrie
- [ ] `statsConsole.run()`-Einträge für Spawn-Eval, Layout-Generation, Validation und Queue-Emission ergänzen.
- [ ] `statsConsole.log()`-Events bei Plan-Fallbacks, Constraint-Verletzungen und Auto-Fixes (Severity inkl. roomName).
- [ ] HUD soll neben Qualitäts-Score auch „validation warnings count“ anzeigen.

### 12.5 Entscheidungslog / ADR-Light
- [ ] Größere Planungsentscheidungen (z. B. Min-Cut-Variante, Tower-Heuristik) als kurze ADR-Notiz im Wiki festhalten.
- [ ] Jede ersetzte Legacy-Funktion mit Verweis auf Nachfolger dokumentieren, um Obsoleszenz transparent zu machen.

---

## Integration Points (konkret)

- `planner.buildCompendium.js` → Spawn-Bewertung/Weights harmonisieren
- `manager.memory.js` → BasePlan API ergänzen
- `manager.hud.js` → Planstatus + Overlay
- `manager.building.js` → Queue-Verbrauch (`getNextStructureToBuild`)
- `layoutPlanner.js` → neues dynamisches System integrieren oder ablösen
- `memory.schemas.js` → Schema dokumentieren
- `main.js` → HUD/Overlay Calls

---

## Performance Targets

- Distance Transform: <50ms
- Flood Fill: <30ms
- Spawn-Evaluation (alle Tiles): <2s
- Min-Cut: <3s
- Voller Layout-Generate: <5s
- 5-Kandidaten-Workflow: <30s

Bei Überschreitung:
- CPU-Profile (`Game.cpu.getUsed()`)
- Hot Paths optimieren
- DT/Terrain cachen
- Suchraum reduzieren (z. B. Randbereiche skippen)

---

## Konsole / Operative Commands (Zielbild)

```js
global.planRoom(roomName)
global.evaluateSpawns(roomName)
global.togglePlanVis(roomName)
global.validatePlan(roomName)
global.nextBuild(roomName)
global.replanRoom(roomName)
```

---

## Quellenhinweis
- Automating Base Planning in Screeps – A Step-by-Step Guide: https://sy-harabi.github.io/Automating-base-planning-in-screeps/
