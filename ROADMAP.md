## 🧠 Screeps Tyranid Bot – Roadmap

> A structured roadmap for an adaptive hive-mind Screeps AI inspired by Tyranid swarm mechanics.  
> Priority is ranked from 1 (low) to 5 (critical).

---

## 🧱 Core System Foundations

### ✅ Scheduler (Prio 4)
- [x] Centralized task queue with `interval`, `event`, `once` types
- [ ] Internal tick counter for global timing
- [ ] Safe execution with error isolation
- [x] Dynamic registration via `addTask(...)`
- [ ] Runs logger, stats display, and future HTM triggers
- [ ] Optional debug toggle to list active/queued tasks – *Prio 2*

### ✅ Logging (Prio 5)
- [ ] `logger.log(message, severity, roomName, duration)`
- [ ] Logs aggregated across ticks (e.g. “(12 times since Tick X)”)
- [ ] Sorted by severity
 - [x] Integrated with `statsConsole.log` (color-based display)
- [ ] Displayed every 5 ticks (via Scheduler)
- [ ] Group logs by category (e.g. spawn, energy, defense) – *Prio 2*
- [ ] Filter toggle (e.g. only show severity ≥ 3) – *Prio 2*

### ✅ Memory Manager (Prio 4)
- [x] Hierarchical memory layout: Hive → Cluster → Colony → Creep
- [x] Auto-initialization on boot
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
- [ ] Task priority aging / decay system
- [ ] Scheduler integration: tasks executed on time
- [ ] Log differences between planned/active tasks
- [ ] Task cache: “what was already attempted?” – *Prio 3*

### ✅ Spawn Manager (Prio 4)
- [ ] Spawn queue with priority and timing
- [ ] Scheduled pre-spawn logic (e.g. “Miner in 80 ticks”)
- [ ] Integrated with HTM task requests
- [ ] Multi-room spawn and remote queue support
- [ ] Panic mode: minimum creep fallback during total loss – *Prio 5*
- [ ] Visual/debug marker for pending spawn queue – *Prio 2*

### ✅ Building Manager (Prio 3)
- [x] Queues container and extension construction
- [x] Recalculates buildable areas on controller level change
- [x] Prioritizes build sites via weighted queue

### ✅ Demand & Room Manager (Prio 3)
- [x] Scans rooms for sources and structures
- [x] Evaluates spawn demand per role
- [x] Reserves mining positions for miners

---

## 🛰️ Map Awareness – Hive's Gaze (Prio 3)
- [ ] Remote room vision analysis via `Memory.rooms`
- [ ] Threat detection: enemy creeps, towers, spawns
- [ ] Threat classification: harmless, scout, raid
- [ ] Trigger HTM defensive tasks (e.g. defend room X)
- [ ] Pattern analysis: recurring threats, raid timings
- [ ] Persistent “intel” storage for enemy activity

### ✅ Room Intelligence (Prio 3)
- [x] Distance transform for terrain analysis
- [x] HUD displays analysis status
- [x] Stores structures and construction sites per room

---

## 🧭 Movement & Pathing

### 🧍 Traveler 2.0 Integration (Prio 3)
- [ ] Integrate BonzaiFerroni’s Traveler 2.0 (`agent.traveler.js`)
- [ ] Replace native `moveTo` calls with enhanced wrapper
- [ ] Add reusable movement options (e.g. `reusePath`, `ignoreCreeps`)
- [ ] Cross-room pathing support
- [ ] Logging for movement errors and stuck detection
- [ ] Movement config per role (scout, hauler, combat)

### ✅ Custom Pathfinder (Prio 4)
- [x] Path caching to speed repeated routes
- [x] Depth-first traffic manager to reduce congestion
- [x] Supports cost matrix adjustments

---

## 🧼 Agent Intelligence – Memory Maintenance

### 🧠 Assimilation Agent (Prio 2)
- [ ] Analyze dead creeps via `Memory.creeps`
- [ ] Determine cause: under-spawned, blocked, out-of-energy
- [ ] Feed into HTM to adjust future decisions

### 🧹 Garbage Agent (Prio 2)
- [ ] Purge expired or unused memory entries
- [ ] Respect memory types: permanent, semi, temporary
- [ ] Run every N ticks via scheduler

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
- [ ] Define creep “DNA” profiles (e.g. `[MOVE, WORK, CARRY]`)
- [ ] Cost-aware scaling by room energy
- [ ] Templates per role, RCL-dependent

### 🧱 Auto-Layout System
- [ ] Analyze room structures by RCL
- [ ] Auto-place extensions, roads, containers, towers
- [ ] Plan paths from sources to controller/spawns/storage

### 🐞 Debug Tools
- [ ] `console.command('scan')` for room diagnostics
- [ ] Live creep debug (e.g. display current task)
- [ ] Visualize HTM task tree (`console.taskTree()`)

---

## 🧭 Immediate Focus

> Build out the **Hierarchical Task Management (HTM)** system:
> - Define task levels and scopes
> - Trigger dynamically via Scheduler
> - Assign tasks to creeps and rooms based on need
