## 🧠 Screeps Tyranid Bot – Roadmap

> A structured roadmap for an adaptive hive-mind Screeps AI inspired by Tyranid swarm mechanics.  
> Priority is ranked from 1 (low) to 5 (critical).

---


## 🚨 Critical Stabilization Gate (Do before new features)

- [x] Add unified incident bundles (`debug.incident`) that capture savestate refs, log windows, task logs, queue state, and HTM summaries.
- [x] Add manual debug helpers (`debug.saveIncident`, `inspectIncident`, `listIncidents`, `exportIncident`, `importIncident`) for human-readable troubleshooting.
- [x] Add retention controls for debug artifacts (`Memory.settings.maxSavestates`, `maxIncidents`, `incidentMaxAge`) with automatic pruning.
- [x] Add optional auto incident capture (`Memory.settings.enableAutoIncidentCapture`) for HTM execution errors and spawn failures.
- [x] Use the new incident pipeline to capture and fix the reservist and scout-task correctness bugs before moving to expansion/combat features.
  - [x] Reservist guard: missing `targetRoom` now fails safely and self-terminates for recycle handling (`role.reservist.js`).
  - [x] Scout guard: initialize `Memory.rooms` before low-TTL requeue/cooldown bookkeeping (`role.scout.js`).

---

## 🔎 Pre-Expansion Stability Scan (2026-02)

- [x] Harden remote role edge cases discovered during stabilization sweep.
- [x] Add regression tests for scout/reservist crash guards before new remote features.
- [x] Document resolved critical gate items in README + wiki and keep critical section focused on unresolved blockers.
- [x] Fix reservist spawn template to include CLAIM parts (`manager.hiveGaze.reserveRemoteRoom`).
- [x] Fix scout task fan-out so colonies can queue one scout task per stale exit room.
- [x] Fix task claiming precision by allowing `htm.claimTask` to claim by task id and using it in scout/spawn/hauler flows.
- [x] Fix reservist runtime loop to move into range and persist reservation work instead of suiciding after first reserve call.

---

## 🧭 Roadmap Refactor – Baseplanner Alignment (2026-02)

> Ziel: Bestehende Aufgaben bleiben erhalten, werden aber gemäß dem neuen Baseplanner-Masterplan neu gruppiert und priorisiert.

### 🔥 Program-Top-Prioritäten (neu gewichtet)
- [ ] **Prio 5**: Dynamic Baseplanner Phasen 1–6 (siehe `Baseplanner Master-Spec`) als primärer Delivery-Stream.
- [ ] **Prio 5**: `manager.building` an `basePlan.buildQueue` anbinden (RCL-Gates, Priority-Order, Reserved-Tiles).
- [ ] **Prio 4**: Memory/HUD/Visual Overlay für Planqualität, Build-Fortschritt, Validation-Warnungen vervollständigen.
- [ ] **Prio 4**: Validation & Fallback-Strategien (Lab-Constraint, Rampart-Konnektivität, Boundary-Regeln) produktionsreif machen.

### 🧩 Re-Gruppierung bestehender Roadmap-Punkte
- [ ] Auto-Layout-Aufgaben werden als **Legacy/Transition** geführt und in den Baseplanner-Phasen absorbiert statt parallel erweitert.
- [ ] Room-Intelligence-Aufgaben (Distance Transform / Kandidatenbewertung / Overlay) zählen künftig zum Baseplanner-Foundation-Track.
- [ ] Building-Manager-Aufgaben mit Layout-Bezug werden in Phase 3 + Phase 5 des Baseplanner-Plans umgesetzt.

### 📦 Obsoleszenz-Policy (ohne Löschen)
- [ ] Alte Baseplanning-Einträge als `LEGACY` markieren, wenn sie durch den Masterplan ersetzt wurden.
- [ ] Ersetzte Einträge mit Verweis auf Zielphase taggen (z. B. `→ Baseplanner P3/P5`).
- [ ] Nur dann endgültig entfernen, wenn sie seit mindestens 1 Zyklus als `LEGACY` dokumentiert waren.

---

## 🧱 Core System Foundations

### ✅ Scheduler (Prio 4)
- [x] Centralized task queue with `interval`, `event`, `once` types
- [ ] Internal tick counter for global timing
- [ ] Safe execution with error isolation
- [x] Dynamic registration via `addTask(...)`
- [x] Runs logger, stats display, and future HTM triggers
- [x] Optional debug toggle to list active/queued tasks – *Prio 2*

### ✅ Logging (Prio 5)
- [ ] `logger.log(message, severity, roomName, duration)`
- [x] Logs aggregated across ticks (e.g. “(12 times since Tick X)”)
- [ ] Sorted by severity
 - [x] Integrated with `statsConsole.log` (color-based display)
- [ ] Displayed every 5 ticks (via Scheduler)
- [ ] Group logs by category (e.g. spawn, energy, defense) – *Prio 2*
- [ ] Filter toggle (e.g. only show severity ≥ 3) – *Prio 2*

### ✅ Memory Manager (Prio 4)
- [x] Hierarchical memory layout: Hive → Cluster → Colony → Creep
- [x] Auto-initialization on boot
- [x] Release mining positions when creeps die
- [x] Cleanup HTM creep memory when creeps expire
- [ ] Auto-assimilation of newly seen rooms into structure
- [ ] Persistent memory for lost-vision rooms
- [ ] Expiration system for temporary memory entries – *Prio 3*

---

## ⚙️ Production & Unit Control

### 🧠 Hierarchical Task Management (HTM) (Prio 5)
- [ ] **Hive-level tasks**: expansion, attack, reservation
- [ ] **Cluster-level**: coordinate HQ and remotes
- [ ] **Colony-level**: energy balance, building, defense
- [ ] **Creep-level**: role control, dynamic reassignment
- [x] Task priority aging / decay system
- [x] Scheduler integration: tasks executed on time
- [ ] Log differences between planned/active tasks
- [x] Task cache: “what was already attempted?” – *Prio 3*
- [x] Basic skeleton with scheduler hook
- [x] Basic HiveMind decision module queues tasks
- [x] Task claiming with cooldown and amount tracking
- [x] Creep energy request tasks claimed by haulers
- [x] Builders check nearby energy before requesting haulers
- [x] Dynamic miner evaluation based on room energy
- [x] Dynamic role evaluation via `hive.roles.js`
- [x] Modular HiveMind with spawn and subconscious modules

### ✅ Spawn Manager (Prio 4)
- [ ] Spawn queue with priority and timing
- [ ] Scheduled pre-spawn logic (e.g. “Miner in 80 ticks”)
- [x] Integrated with HTM task requests
- [x] Processes HTM spawn tasks with cooldown estimates
- [ ] Multi-room spawn and remote queue support
- [x] Panic mode: minimum creep fallback during total loss – *Prio 5*
- [x] Spawn request validation for positional roomName
- [x] Direction-aware spawning to keep spawn exits clear
- [x] Builder spawn logic driven by HiveMind
- [x] Deterministic bootstrap order: miner → hauler paired spawning
- [ ] Visual/debug marker for pending spawn queue – *Prio 2*

### ✅ Building Manager (Prio 3)
- [x] Queues container and extension construction
- [x] Places controller containers at upgrade range and spawn buffer containers
- [x] Controller containers placed two tiles from the controller in the closest direction to the spawn
- [x] Recalculates buildable areas on controller level change
- [x] Prioritizes build sites via weighted queue
- [x] Containers requested at RCL1, extensions start at RCL2

### ✅ Demand & Room Manager (Prio 3)
- [x] Scans rooms for sources and structures
- [x] Evaluates spawn demand per role
- [x] Reserves mining positions for miners
- [x] Recalculate mining spots and prefer container positions
- [x] Persist feasible mining slot caps and use valid slot counts (ignore null placeholders) for miner/hauler limits
- [x] Replacement miners requested before predecessors expire
- [x] Reserved positions cleared on miner death
- [x] Miners with 5 WORK parts reposition onto containers

### 🔄 Energy Demand Module (Prio 3)
- [x] Record delivery performance for requesters
- [x] Evaluate metrics to spawn extra haulers when throughput is low
- [x] Maintain at least two haulers and spawn emergency collector when none remain
- [x] Initial spawn order enforces miner/hauler pair before upgraders
- [x] Persist aggregated demand and hauler supply metrics
- [x] Global demand totals aggregate per room and supply rate only counts hauler deliveries
- [x] Haulers prioritise ruins and tombstones when closer than containers

### 🚚 Remote Harvest Pipeline (Prio 4)
- [ ] Extend `manager.hiveGaze.remoteScoreRoom` to store per-source paths, terrain costs, and claimed-by data for downstream consumers.
- [ ] Gate expansion promotion until surrounding scout intel is seeded and fresh (`seedReachableRoomMemory` + `lastScouted` age checks).
- [ ] Add remote profitability model before promotion: `expectedIncome - (creep upkeep + spawn time cost + road/container upkeep + reservation upkeep)` and persist per remote under `Memory.rooms[remote].profit`.
- [ ] Promote remotes via a bundled HTM package per selected source: `REMOTE_MINER_INIT` + `RESERVE_REMOTE_ROOM` + planned `ISSUE_REMOTE_ROAD_TASKS` (road issuance only for now, construction execution deferred).
- [ ] Teach `manager.spawn` to size dedicated remote haulers using stored distances (round-trip energy > carry capacity → add CARRY/MOVE pairs).
- [ ] Update `role.hauler` (or create `role.remoteHauler`) so creeps can accept `remote` pickup tasks, navigate across rooms, and unload to the owning colony’s link/storage.
- [ ] Ensure remote miners auto-request containers and link them to dropoff points for hauler pathfinding.
- [ ] Add lifecycle predictors that queue replacement miners/haulers/reservers based on travel time and TTL so replacements arrive before predecessor expiry.
- [ ] Cover the full pipeline in `test/remotePipeline.test.js`: remote claim queues miner+hauler, hauler delivers home, reservation upkeep respected.

### 🛰️ Empire Logistics Network (Prio 3)
- [ ] Create `manager.logistics` to scan all owned terminals/storage each tick and compute surplus/deficit per resource.
- [ ] Allow rooms to lodge logistics requests (energy, boosts, power) via memory schema consumed by HTM planners.
- [ ] Implement terminal balancing: move excess energy > threshold to deficit rooms before market sales.
- [ ] Add market hooks: sell surplus when empire buffer > target, buy deficit resources when no donor room exists.
- [ ] Dispatch lightweight hauler tasks to move overflow energy into terminals/storage so buffers stay within min/max bands.
- [ ] Write tests that simulate multi-room inventories and assert transfer orders.

---

## 🛰️ Map Awareness – Hive's Gaze (Prio 3)
- [ ] Remote room vision analysis via `Memory.rooms`
- [ ] Threat detection: enemy creeps, towers, spawns
- [ ] Threat classification: harmless, scout, raid
- [ ] Trigger HTM defensive tasks (e.g. defend room X)
- [ ] Pattern analysis: recurring threats, raid timings
- [ ] Persistent “intel” storage for enemy activity

### 📈 Remote Profitability Modeling (Prio 4)
- [ ] Calculate per-source net energy (`harvest - miner upkeep - hauler upkeep - reservation`) using existing DNA helpers.
- [ ] Track spawn-time consumption per remote (ticks of spawn blocked) and expose it via `Memory.rooms[remote].profit`.
- [ ] Use profitability and spawn budgets to rank candidate remotes in `selectExpansionTarget` (knapsack selection when multiple remotes compete for spawn time).
- [ ] Persist profitability history to detect remotes that have fallen below configured net thresholds and trigger HTM “drop remote” tasks.
- [ ] Unit test scoring behaviour with mocked path lengths and source energy densities.

### ✅ Room Intelligence (Prio 3)
- [x] Distance transform for terrain analysis
- [x] HUD displays analysis status
- [x] Stores structures and construction sites per room
- [x] Add theoretical, spawn-independent planning overlay mode with controller-centric upgrader lane, evaluated spawn candidate, source containers, and logistics road draft views.

---


### 🧭 Baseplanner Master-Spec (Prio 5)
- [x] Integrate comprehensive dynamic baseplanner implementation paper into project docs (`TyranidScreeps2.0.wiki/Baseplanner-Roadmap.md`).
- [x] Implement Phase 1 (Foundation): planner scaffolding, utility math, terrain/exit preprocessing. *(2026-02: `planner.baseplannerFoundation.js` extracted from `planner.buildCompendium.js` and wired into candidate + plan generation pipeline.)*
- [x] Add builder-debug controls for phased Baseplanner iteration: HUD phase-window markers, selective theoretical recalculation scopes, and dedicated flood-depth overlay for per-step diagnostics.
- [x] Implement Phase 2 (Algorithms): flood fill, min-cut integration, checkerboard placement primitives. *(2026-02: added `algorithm.floodFill.js`, `algorithm.minCut.js` (proxy cut), `algorithm.checkerboard.js` and wired them into `planner.buildCompendium.js`.)*
- [x] Implement Phase 3 (Placement): core/controller/source/lab/tower/rampart/road generation. *(2026-02: `planner.buildCompendium.js` placement pipeline validated and now emits `buildQueue`-ready plans.)*
- [x] Implement Phase 4 (Scoring): multi-layout evaluation and best-candidate selection. *(2026-02: `planner.buildCompendium.js` now exposes phase-specific APIs (`evaluateLayoutForRoom`, `generateCompleteLayout`, `generateOptimalLayout`) and performs weighted candidate selection across generated layouts.)*
- [x] Implement Phase 5 (Integration): memory schema + HUD overlay + building queue consumption. *(2026-02: theoretical winner now persists to `Memory.rooms[room].basePlan`, HUD displays base plan status/score/next item, and `manager.building.executeLayout` consumes `basePlan.buildQueue` before legacy matrix tasks.)*
- [x] Implement Phase 6 (Validation): edge-case checks, auto-fixes, performance profiling. *(2026-02: `manager.basePlanValidation.js` now covers queue shape/bounds/border, overlap handling, extension RCL-cap normalization, controller-container + lab-range + rampart-connectivity checks, and records validation duration (`durationMs`) for profiling; manual phase initialization remains available for targeted recomputation.)*

---
## 🧭 Movement & Pathing

### 🧍 HiveTravel Integration (Prio 3)
- [x] Integrate screepers' Traveler (`manager.hiveTravel.js`)
- [x] Replace native `moveTo` calls with enhanced wrapper
- [ ] Add reusable movement options (e.g. `reusePath`, `ignoreCreeps`)
- [ ] Cross-room pathing support
- [ ] Logging for movement errors and stuck detection
- [ ] Movement config per role (scout, hauler, combat)
- [ ] Harden HiveTravel edge handling when route exits are blocked or destination shifts mid-route (`manager.hiveTravel.js` TODOs).
  - [ ] Add explicit border-repath fallback when a creep remains on exit tiles for N ticks.
  - [ ] Add destination-change reconciliation so cached paths are invalidated when destination mutates mid-travel.
  - [ ] Add tests for cross-room handoff on blocked exits and temporary hostile blocking creeps.

### ✅ Deprecated Pathfinder (Prio 4)
- [x] Path caching to speed repeated routes
- [x] Depth-first traffic manager to reduce congestion
- [x] Supports cost matrix adjustments

- Replaced by HiveTravel library
---

## 🧼 Agent Intelligence – Memory Maintenance

### 🧠 Assimilation Agent (Prio 2)
- [ ] Analyze dead creeps via `Memory.creeps`
- [ ] Determine cause: under-spawned, blocked, out-of-energy
- [ ] Feed into HTM to adjust future decisions

### 🧹 Garbage Agent (Prio 2)
- [x] Purge expired or unused memory entries
- [x] Reset console log counts every 250 ticks
- [x] Remove stale HTM creep containers regularly
- [ ] Respect memory types: permanent, semi, temporary
- [x] Run every N ticks via scheduler

### 📈 Efficiency Agent (Prio 2)
- [ ] Track creep paths to determine frequently used routes
- [ ] Mark road candidates
- [ ] Generate construction site plans into memory

---

## 📊 Console Stats & Visual Display

### ✅ Console Stats (Prio 3)
- [x] CPU usage histogram (ascii-chart)
- [x] Room energy/controller dashboards
- [x] Integrated logging panel with severity-based color
- [ ] Per-room toggle views – *Prio 2*
- [ ] Layout toggle (minimal mode vs full debug) – *Prio 2*
- [ ] Display scheduled tasks or HTM tree – *Prio 3*

---

## 💡 Future Features & Experimental Ideas

### 🧬 DNA Builder & Creep Templates
- [x] Basic energy-based DNA builder for miner, hauler, worker roles
- [ ] Cost-aware scaling by room energy
- [ ] Templates per role, RCL-dependent

### 🧱 Auto-Layout System (Legacy/Transition → Baseplanner, ehem. Prio 3)
- [x] Generate multiple dynamic layout candidates with distance transform filters and weighted pre-scoring.
- [x] Score anchors by controller/source/mineral/exit/terrain symmetry inputs and keep top candidates.
- [ ] **LEGACY → Baseplanner P3/P5:** Emit lab/extension/tower/road layers as buildQueue-ready structure plans (statt separater Stamp-Pipeline).
- [ ] **LEGACY → Baseplanner P5:** Teach `manager.building.executeLayout` to consume `basePlan.buildQueue` incl. reserved tiles, rampart overlays, and phased RCL unlocks.
- [x] Persist selected layout + candidate evaluation data in `room.memory.layout` and expose debug overlays (`candidates`, `evaluation`).
- [ ] **Migration:** Mirror `room.memory.layout` into `Memory.rooms[room].basePlan` until all consumers switched.

### 🐞 Debug Tools
- [ ] `console.command('scan')` for room diagnostics
- [ ] Live creep debug (e.g. display current task)
- [ ] Visualize HTM task tree (`console.taskTree()`)
- [x] `startFresh()` console helper to wipe all memory
### 🛡️ Active Defense Orchestration (Prio 3)
- [ ] Implement `manager.defense` to classify incoming raids (scout, poke, siege) using hive gaze threat feeds.
- [ ] Subtract tower DPS from hostile EHP to determine required defender compositions.
- [ ] Add `role.defender` (melee/ranged/healer mixes) with coordinated rampart movement and focus fire.
- [ ] Expose HTM hooks to request/retire defenders and to queue rampart repair tasks post-fight.
- [ ] Simulate invasion waves in tests to validate defender spawn triggers and targeting logic.

### 🛸 Quad Combat Doctrine (Prio 2)
- [ ] Build `combat.quad` helper that maintains 2×2 formations, adjusts cost matrices, and issues synchronized moves.
- [ ] Create `role.quadMember` behaviour for attack/heal combos and retreat sequencing.
- [ ] Add HTM tasks for assembling quads at staging rooms, including creep DNA templates and rally positions.
- [ ] Provide sandbox/simulation coverage to ensure formation integrity across room transitions and through swamps.

---


### 📌 Baseplanner Delivery Scope (Erstimplementierung vs. Vollausbau)
- [x] **Erstimplementierung (Phase 1–3 Output-Delivery):** Kandidatenbewertung + Placement + `buildQueue`-Emission sind im Planner-Output vorhanden.
- [ ] **Vollausbau-Nachzug nach Abschluss aller Phasen:** Algorithmische Kernbausteine mit Produktionsqualität erneut aufgreifen und nachschärfen.
  - [ ] **MinCut/MaxFlow:** Proxy-MinCut durch vollständige MaxFlow/Edmonds-Karp-Cut-Extraktion ersetzen.
  - [ ] Kontinuierliche, topologisch robuste Barrierebildung gegen komplexe Exit-Geometrien validieren.
  - [ ] Performance-Budgets (CPU/Bucket) für Vollraum- und Replan-Läufe gegen Profiling-Grenzen absichern.

## 🧭 Immediate Focus

> 1. ✅ Delivered **Baseplanner Phase 1–3** end-to-end in planner output (spawn eval → placement → buildQueue emission).
> 2. Wire **Construction + Memory + HUD** to `basePlan` (Phase 5) so planner output is actually executed and visible.
> 3. Keep HTM/Remote tracks active only where they unblock planner rollout (task claiming, logistics hooks, remote profitability inputs).
