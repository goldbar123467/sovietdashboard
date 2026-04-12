# DOUGHBOY Agent Harness Design

> 8-agent rolling pipeline with soft gates, all Opus 4.6, building a procedural city pizza delivery roguelite in Three.js.

---

## 1. Architecture Overview

**Pattern:** Rolling pipeline with soft gates and dependency DAG.

**Agents:** 8 domain specialists, each running Opus 4.6 in isolated git worktrees. Agents own specific files, produce typed interfaces, and declare dependencies. The orchestrator dispatches agents when their dependencies are merged to main. Hard gates at phase boundaries run full QA integration.

**Codebase:** `/home/clark/PizzaDeliveryGame/` — seeded procedural city generator (Three.js 0.170, TypeScript 5.7, Vite 6.0) with 16 source files. MASTERPLAN.md defines 6 build phases turning this into a playable game.

---

## 2. Agent Registry & Ownership Map

File ownership is exclusive. No agent touches another agent's files. If two agents need the same file, one owns it and the other declares a dependency.

| Agent | ID | Branch | Owns | Produces |
|---|---|---|---|---|
| City Engineer | `city-eng` | `wt/city-eng` | `constants.ts`, `city.ts`, `grid.ts`, `blocks.ts`, `lots.ts`, `debug.ts`, `src/decals.ts` | `CityResult` with exposed `lots[]`, `grid`, clean dispose pipeline, 24x24 grid |
| Vehicle/Physics | `vehicle` | `wt/vehicle` | `src/scooter.ts`, `src/collision.ts`, `src/input.ts` | `Scooter` (position, heading, speed, lean), `InputState`, collision API |
| Camera/Renderer | `camera` | `wt/camera` | `src/camera.ts`, `src/renderer.ts`, `main.ts` | `ChaseCamera`, `bootScene()` returning `{scene, camera, renderer}` |
| Shader/VFX | `shader` | `wt/shader` | `src/tripShader.ts`, `src/sky.ts`, `palette.ts` | `uTripIntensity` uniform, wobble material, palette LUT shift, sky gradient |
| Gameplay | `gameplay` | `wt/gameplay` | `src/delivery.ts`, `src/scoring.ts`, `src/waypoint.ts`, `src/shrooms.ts`, `src/gameLoop.ts` | `DeliverySystem`, `ScoringEngine`, `WaypointArrow`, run state machine |
| UI/Dialogue | `ui` | `wt/ui` | `src/hud.ts`, `src/dialogue.ts`, `src/screens.ts`, `src/pizzaLines.ts` | HUD overlay, dialogue triggers, title/pause/score screens |
| Audio | `audio` | `wt/audio` | `src/audio.ts`, `public/sfx/*` | `AudioManager` (play/stop/pitch-shift), SFX triggers |
| QA/Integration | `qa` | reads `main` | No owned files | Gate pass/fail reports, merge conflict resolution |

### Friction points (pre-resolved)

| Friction | Resolution |
|---|---|
| `main.ts` — Camera restructures, Gameplay wires in gameLoop | Camera owns main.ts. Camera exports `bootScene()` returning `{scene, camera, renderer}`. Gameplay calls `bootScene()` then attaches its loop. No shared mutation. |
| `palette.ts` — Shader modifies for trip LUT, City Engineer reads | City Engineer finishes palette work in Phase 0. Shader takes ownership in Phase 2+. Sequential handoff. |
| `types.ts` — everyone imports | City Engineer owns through Phase 0. After Gate 0, becomes append-only. Agents add new interfaces, never modify existing ones. QA validates. |

---

## 3. Dependency DAG & Phase Schedule

### DAG

```
PHASE 0 (foundation)
  city-eng ─────────────────────────────────────┐
                                                 v
                                            === GATE 0 ===
                                                 |
PHASE 1 (make it a game)                        |
  vehicle <─────────────────────────────────────┘
  camera <──── vehicle (needs scooter position)
  shader <──── city-eng (needs palette.ts, materials)
  gameplay <── vehicle + camera (needs scooter + scene)
  ui <──────── gameplay (needs run state, score)
  audio <───── vehicle (needs throttle/speed for pitch)
                                                 |
                                            === GATE 1 ===
                                                 |
PHASE 2 (make it trip)                           |
  shader <──── gameplay (needs deliveryProgress)
  gameplay <── shader (arrow drift needs uTripIntensity)
  camera <──── shader (FOV warp at high trip)
  ui <──────── shader (palette affects HUD colors)
  audio <───── shader (pitch-shift needs tripIntensity)
                                                 |
                                            === GATE 2 ===
                                                 |
PHASE 3 (make it a place)                        |
  city-eng <── shader (signage decals use trip-aware materials)
  shader <──── city-eng (window grid shader on building geometry)
                                                 |
PHASE 4 (make it talk)                           |
  ui <──────── gameplay (dialogue triggers from events)
                                                 |
PHASE 5 (ship it)                                |
  ui ──── title screen, score screen             |
  audio ── final SFX pass                        |
  camera ── polish pass                          |
                                                 |
                                            === GATE FINAL ===
```

### Dispatch waves (parallel batches within phases)

**Phase 0:**
- Wave 0a: `city-eng`

**Phase 1:**
- Wave 1a: `vehicle` + `shader` (no cross-dependency)
- Wave 1b: `camera` + `audio` (both depend only on vehicle)
- Wave 1c: `gameplay` (depends on vehicle + camera)
- Wave 1d: `ui` (depends on gameplay)

**Phase 2:**
- Wave 2a: `shader` (owns tripIntensity, goes first)
- Wave 2b: `gameplay` + `camera` + `audio` + `ui` (all depend on shader)

**Phase 3:**
- Wave 3a: `shader` (window grid shader + trip-aware signage material)
- Wave 3b: `city-eng` (signage decals + ground-floor band, uses shader's materials)

**Phase 4:**
- Wave 4a: `ui`

**Phase 5:**
- Wave 5a: `ui` + `audio` + `camera` (independent polish)

### Mid-phase pulls

When an agent is blocked on a specific dependency (not a full gate):
1. Orchestrator monitors blocking agent's worktree for completion
2. QA does fast review of blocking agent's branch in isolation
3. Merge blocking agent to main (mini-gate)
4. Notify unblocked agent to rebase on new main
5. Unblocked agent starts work

This allows rolling starts within phases without waiting for full gate sync.

---

## 4. Agent Specifications

### 4.1 City Engineer (`city-eng`)

**Phase 0:**
- Bump `DEFAULT_GRID_WIDTH` and `DEFAULT_GRID_HEIGHT` to 24 in `constants.ts`
- Confirm generator runs at new size
- Profile heap across 3 reshuffles via dispose() + regen — heap must return to baseline +/-10MB
- Fix any memory leaks in dispose pipeline
- Confirm `Lot.worldBounds` is publicly accessible (already is — verify)
- Rebind debug overlay from `D` to backtick
- Rebind dev-regen from `R` to `G`

**Phase 3:**
- Signage decals: 8-12 pre-baked textures (PIZZA, LAUNDROMAT, 24HR, BAR, BODEGA, etc.), hash-spawned one per ground-floor face
- Ground-floor band: bottom 2-3m gets different palette index for storefront read
- Roof clutter: InstancedMesh of AC units, water tanks, antennas, hash-scattered

**Idle during:** Phases 1, 2, 4, 5

### 4.2 Vehicle/Physics (`vehicle`)

**Phase 1:**
- Scooter controller with MASTERPLAN Section 5 exact values:
  - Top speed: 12 m/s
  - Acceleration: 8 m/s^2
  - Brake deceleration: 14 m/s^2 (hard stop, no reverse)
  - Turn rate: 90 deg/s at full speed, 140 deg/s at low speed
  - Friction (coast): 2 m/s^2
  - Lean max: 25 deg at full turn rate
  - Lean recovery: 4 deg/frame eased
- Input bindings: W accel, S brake, A/D turn. No reverse.
- Collision: sphere-vs-AABB against lot worldBounds array. Scooter collider radius 0.6m.
- Collision response: <6 m/s = stop + scrape event; >=6 m/s = wipeout (1.5s lockout)
- Glancing hits (<30 deg incidence) always scrape regardless of speed
- Wipeout respawn: snap to nearest road centerline, full stop, 0.5s fade

**Exports:** `Scooter` class with `{position: Vector3, heading: number, speed: number, lean: number, update(dt, input, lots): void}`, `InputState`, `CollisionResult`

**Idle during:** Phases 0, 2, 3, 4, 5

### 4.3 Camera/Renderer (`camera`)

**Phase 1:**
- Remove OrbitControls entirely
- Chase camera per MASTERPLAN Section 5:
  - FOV: 70 deg
  - Distance behind scooter: 6m
  - Height: 2.5m
  - Look-ahead: 3m forward on scooter heading
  - Position damping: 0.12 (lerp factor per frame at 60fps)
  - Rotation damping: 0.15
  - No camera shake except wipeout
- Restructure main.ts: export `bootScene()` returning `{scene, camera, renderer}`
- Lighting: ambient 0.6 + directional sun at (50, 100, 50) intensity 0.8
- Window resize handler

**Phase 2:**
- FOV warp: +5 deg at peak tripIntensity
- Camera shake on wipeout only (short burst, 0.3s)

**Phase 5:**
- Damping tuning, final feel polish

### 4.4 Shader/VFX (`shader`)

**Phase 1 (prep):**
- Create ShaderMaterial replacing MeshLambertMaterial
- Add `uTime` uniform, wire to render loop
- Add `uTripIntensity` uniform stub (reads 0.0, no visual change yet)
- Ensure all existing buildings render identically after material swap

**Phase 2:**
- Trip curve driver: sine wave, amplitude scales with delivery count, independent of reshuffle
- Vertex wobble: `sin(time + worldPos) * intensity` on building geometry
- Palette LUT shift toward magenta/cyan/lime as intensity rises
- Sky color: starts deep midnight blue at delivery 1, hue shifts toward magenta/violet, full vaporwave sunrise (cyan/magenta/lime) at delivery 7, driven by `deliveryProgress` (0.0-1.0) independent of `tripIntensity`
- Building lean: slight Z-tilt varying by worldPos hash
- Dissolve transition every 3 deliveries: intensity -> 1.0, screen wash, regen city, ease back

**Phase 3:**
- Window grid shader: tile window pattern across faces using world UVs, hash-based lit/unlit per cell
- Trip-aware signage material for city-eng's decals

### 4.5 Gameplay (`gameplay`)

**Phase 1:**
- Pizza shop anchor on tile (0,0), procgen skips it, player spawns facing north
- Delivery marker placement using existing grid: road cells adjacent to lot cells
  - First delivery: 12-16 tiles from pizza shop (Manhattan distance)
  - Subsequent: previous marker becomes spawn, next marker 10-16 tiles away
  - Reachability: marker always on road cell adjacent to lot, never inside building
  - Trigger radius: 4m
- Delivery beat (the 2-second moment):
  1. Scooter enters 4m radius
  2. Auto-deliver (no key press)
  3. Chime SFX event (audio picks up)
  4. Score floater: `+{score}` in accent color, floats up 2m over 1.2s, fades
  5. Pizza voice line event (ui picks up)
  6. Next marker spawns (or run-end if delivery 7)
  7. Waypoint arrow swings to new heading over 0.4s eased
  8. Run counter ticks
- Waypoint arrow: world-space billboard above scooter, points to delivery marker
- Run counter (1/7) + per-delivery timer
- Scoring per MASTERPLAN Section 5:
  ```
  delivery_score = 100 * time_bonus * (1 + 0.25 * shrooms) * (cold ? 0.5 : 1.0)
  run_total = sum(deliveries) * max(0.5, 1.0 - 0.05 * wipeouts)
  ```
- Shroom spawning: 6 per city, road cells off Manhattan-shortest path, at least 1 tile detour, +0.15 trip intensity (capped 1.0), +1 delivery shroom multiplier
- Pause (Esc) / Restart (R)
- Run state machine: title -> playing -> paused -> score

**Phase 2:**
- Waypoint arrow drift: `heading += noise(time) * tripIntensity * 30 deg`
- Feed `deliveryProgress` (0.0-1.0) and `deliveryCount` to shader uniforms
- Trigger city reshuffle dissolve at delivery 3 and 6

**Exports:** `GameLoop.init(scene, camera, scooter, audioManager)`, `GameLoop.update(dt)`, event emitter for delivery/wipeout/shroom/idle events

### 4.6 UI/Dialogue (`ui`)

**Phase 1:**
- HUD: run counter (1/7), per-delivery timer, current score
- Score floater rendering (DOM or canvas overlay)
- Pause overlay
- Restart confirmation

**Phase 4:**
- Dialogue system: text bubble, bottom-center of screen
- 15 hand-written pizza lines, deadpan and slightly resentful voice
- Triggers with priority: wipeout > delivery > shroom > pickup > near-delivery > idle
- Min cooldown: 8s between lines
- No repeat within 3-line rolling window
- Idle trigger: fires after 20s of no other trigger
- At high trip (tripIntensity > 0.6): 30% chance of `[lying]` tagged line (3-4 of the 15) giving wrong directional advice

**Phase 5:**
- Title screen: scooter idling, "Press any key"
- End-of-run score screen: deliveries, avg time, shroom multiplier, total score

### 4.7 Audio (`audio`)

**Phase 1:**
- Web Audio API, no external library
- Scooter: idle loop + accel sample, pitch tied to throttle (0.8x idle -> 1.4x full speed)
- Delivery chime: 200ms, rising third
- Wipeout SFX
- Scrape SFX

**Phase 2:**
- Lo-fi background loop
- Pitch-shift down 5-10% as tripIntensity rises
- Slow flanger effect on music

**Phase 5:**
- Pizza voice blip on dialogue trigger
- Shroom pickup sound
- Final mix/balance pass

**Exports:** `AudioManager.play(id)`, `AudioManager.setThrottle(0-1)`, `AudioManager.setTripIntensity(0-1)`

### 4.8 QA/Integration (`qa`)

**Every gate:**
1. Merge all active worktree branches to `staging` in dependency order: city-eng -> vehicle -> camera -> shader -> gameplay -> ui -> audio
2. Run `tsc --noEmit`
3. Run `vite build`
4. Launch dev server, check console for errors
5. Phase-specific smoke test
6. Verify no file over 1500 lines
7. Verify no ownership violations
8. If clean: fast-forward `main` to staging, delete staging
9. If broken: bisect by reverting merges to find culprit, report to orchestrator

**Mid-phase reviews:**
- Type safety check on individual agent branches
- Interface contract validation (exports match what dependents expect)
- No leaked `any` types

**Gate-specific tests:**
- Gate 0: Generator runs at 24x24, dispose doesn't leak
- Gate 1: Play 7 deliveries end-to-end without crash, verify scoring math
- Gate 2: Trip ramps visually, dissolve doesn't leak memory, 3 reshuffles heap +/-10MB
- Gate Final: Full MASTERPLAN Section 9 Definition of Done checklist

---

## 5. Worktree Topology & Merge Strategy

### Branch structure

```
main                          <- always buildable, gates land here
  staging                     <- QA integration branch, ephemeral per gate
  wt/city-eng                 <- City Engineer worktree
  wt/vehicle                  <- Vehicle/Physics worktree
  wt/camera                   <- Camera/Renderer worktree
  wt/shader                   <- Shader/VFX worktree
  wt/gameplay                 <- Gameplay worktree
  wt/ui                       <- UI/Dialogue worktree
  wt/audio                    <- Audio worktree
```

### Disk layout

```
/home/clark/PizzaDeliveryGame/              <- main (orchestrator + QA)
/home/clark/PizzaDeliveryGame-wt/city-eng/
/home/clark/PizzaDeliveryGame-wt/vehicle/
/home/clark/PizzaDeliveryGame-wt/camera/
/home/clark/PizzaDeliveryGame-wt/shader/
/home/clark/PizzaDeliveryGame-wt/gameplay/
/home/clark/PizzaDeliveryGame-wt/ui/
/home/clark/PizzaDeliveryGame-wt/audio/
```

Each worktree gets its own `npm install` on creation.

### Merge order (fixed, mirrors dependency DAG)

1. city-eng (foundation)
2. vehicle (new files, no city-eng conflicts)
3. camera (modifies main.ts, depends on vehicle exports)
4. shader (modifies palette.ts, adds new files)
5. gameplay (new files, imports from vehicle + camera + shader)
6. ui (new files, imports from gameplay)
7. audio (new files, imports from vehicle + shader)

### types.ts protocol

- City Engineer owns `types.ts` through Phase 0
- After Gate 0: append-only. Any agent may add new `interface` or `type` declarations
- No agent may modify or remove existing type definitions
- QA validates at each gate: diff types.ts, confirm only additions

---

## 6. Orchestrator Protocol

The orchestrator (main Opus session) does not write code. It dispatches, monitors, gates, and arbitrates.

### Dispatch loop

```
1. Read current state of main
2. Determine unblocked agents (all dependencies merged)
3. For each unblocked agent:
   a. git worktree add ../PizzaDeliveryGame-wt/{id} -b wt/{id}
   b. npm install in worktree
   c. Dispatch via Agent tool (model: opus, isolation: worktree)
4. Monitor for completion
5. On agent completion:
   a. QA mini-review on agent's branch
   b. Pass -> merge to main, notify blocked agents
   c. Fail -> feedback to agent, agent fixes
6. All phase agents complete -> hard gate
7. Repeat from 1
```

### Agent prompt template

```
You are {agent_id}, a specialist agent building DOUGHBOY.

## Your role
{role description}

## Files you own (only modify these)
{file list}

## What you produce (other agents depend on these exports)
{interface contracts}

## Current phase work
{tasks from Section 4}

## Reference
- MASTERPLAN.md Sections {relevant sections}
- Numeric spec values are LOCKED -- use exact numbers from MASTERPLAN Section 5

## Rules
- Only modify files you own
- Export clean interfaces -- no implementation leakage
- Run tsc --noEmit before declaring done
- Keep every file under 1500 lines
- Commit with descriptive messages per logical unit
```

### Failure handling

| Failure | Response |
|---|---|
| Code doesn't compile | Return error to agent, agent fixes in worktree |
| Merge conflict at gate | QA resolves trivial (import additions). Structural -> orchestrator reassigns ownership, re-dispatches |
| File over 1500 lines | Orchestrator instructs agent to split, suggests boundary |
| Smoke test fails | QA bisects by reverting merges to find culprit. Culprit fixes. |
| Agent blocked >1hr | Orchestrator checks blocker's progress. If stuck, escalates to user. |

---

## 7. Gate Checklist

Run by QA at each hard gate:

```
[ ] All active agent branches pushed
[ ] Merge to staging in order: city-eng, vehicle, camera, shader, gameplay, ui, audio
[ ] tsc --noEmit passes
[ ] vite build succeeds
[ ] Dev server starts, no console errors
[ ] Phase-specific smoke test passes
[ ] No file over 1500 lines
[ ] No ownership violations
[ ] Heap profile if reshuffle occurred (+/-10MB tolerance)
[ ] Fast-forward main to staging
[ ] Delete staging branch
[ ] All agents rebase worktrees on new main
```

---

## 8. Definition of Done

From MASTERPLAN Section 9, validated at Gate Final:

- 7 deliveries playable start to finish
- City reshuffles at delivery 3 and 6 (trip intensity does not reset)
- Trip intensity visibly ramps, peaks at delivery 7
- Pizza speaks at least 4 times per run
- Score screen shows a number
- Pause and Restart keys work
- Loads in desktop browser under 5 seconds
- 60fps at 1080p on integrated graphics (or cap at 720p)
- Heap returns to baseline +/-10MB across 3 reshuffles
- One screenshot that sells the game
