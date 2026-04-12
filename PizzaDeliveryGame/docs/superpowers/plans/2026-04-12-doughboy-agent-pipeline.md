# DOUGHBOY Agent Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DOUGHBOY — a procedural city pizza delivery roguelite in Three.js — using 8 parallel Opus 4.6 agents in isolated git worktrees, orchestrated via a rolling pipeline with soft gates.

**Architecture:** Domain-specialist agents own exclusive file sets. The orchestrator dispatches agents when their dependency DAG is satisfied. Hard gates at phase boundaries run QA integration. Mid-phase mini-gates allow rolling starts.

**Tech Stack:** Three.js 0.170, TypeScript 5.7, Vite 6.0, Web Audio API. No external physics or UI libraries.

**Reference docs:**
- `MASTERPLAN.md` — game design spec (numeric values are LOCKED)
- `docs/superpowers/specs/2026-04-12-doughboy-agent-harness-design.md` — agent harness design

---

## Task 0: Bootstrap — Commit Starting Point

**Files:**
- Verify: all 16 source files in `src/`, `package.json`, `tsconfig.json`, `index.html`, `vercel.json`, `MASTERPLAN.md`

- [ ] **Step 1: Verify the build compiles**

Run: `cd /home/clark/PizzaDeliveryGame && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Verify vite builds**

Run: `npx vite build`
Expected: clean build, output in `dist/`

- [ ] **Step 3: Stage and commit the foundation**

```bash
cd /home/clark/PizzaDeliveryGame
git add src/ package.json package-lock.json tsconfig.json index.html vercel.json MASTERPLAN.md .gitignore docs/
git commit -m "feat: bootstrap DOUGHBOY from CityGame procedural city generator

Copies seeded procgen city (Three.js 0.170, TypeScript 5.7, Vite 6.0) as the
foundation for the DOUGHBOY pizza delivery roguelite. Includes MASTERPLAN.md
game design spec and agent harness design doc.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Verify clean main**

Run: `git status`
Expected: clean working tree on `main`

---

## Task 1: Phase 0 — Dispatch City Engineer

**Agent:** `city-eng` | **Model:** opus | **Branch:** `wt/city-eng`

The City Engineer is the only agent in Phase 0. It upgrades the grid, fixes dispose, rebinds keys. Everything else is blocked until this merges.

- [ ] **Step 1: Create worktree**

```bash
cd /home/clark/PizzaDeliveryGame
git worktree add ../PizzaDeliveryGame-wt/city-eng -b wt/city-eng
cd ../PizzaDeliveryGame-wt/city-eng && npm install
```

- [ ] **Step 2: Dispatch city-eng agent**

Dispatch via Agent tool with `model: opus`. Full prompt:

```
You are city-eng, the City Engineer agent building DOUGHBOY — a procedural city pizza delivery roguelite in Three.js.

## Your Role
You own the procedural city generator. Your job is to prepare the foundation for all other agents by upgrading the grid, ensuring clean memory management, and rebinding keys.

## Files You Own (ONLY modify these)
- src/constants.ts
- src/city.ts
- src/grid.ts
- src/blocks.ts
- src/lots.ts
- src/debug.ts

## What You Produce (other agents depend on these)
- CityResult with exposed lots[], grid, palette — no changes to the interface shape
- Clean dispose pipeline: heap returns to baseline ±10MB after 3 dispose+regen cycles
- 24×24 grid (up from 18×18)
- Debug overlay on backtick key, regen on G key
- gridToWorld() and worldToGrid() remain unchanged in signature

## Current Phase Work (Phase 0)

### 1. Bump grid to 24×24
In src/constants.ts, change:
- DEFAULT_GRID_WIDTH from 18 to 24
- DEFAULT_GRID_HEIGHT from 18 to 24

### 2. Verify generator runs at new size
Run: npx tsc --noEmit
Run: npx vite build
Both must pass with 0 errors.

### 3. Profile and fix dispose
In src/city.ts, the disposeCity() function traverses and disposes geometries.
Verify it handles ALL geometry types in the scene tree:
- Mesh geometries (buildings, ground, vegetation, roads, lot details)
- LineSegments geometries (debug overlay, lane markings)
- InstancedMesh geometries (street furniture if any)

The current dispose looks correct but verify by reading each generator file and confirming every Mesh/LineSegments created is under the city group.

In src/main.ts, the rebuild() function calls disposeCity(city.group) then disposeCity(debugOverlay). Verify the debug overlay dispose path is clean (the current cast `debugOverlay as unknown as THREE.Group` is ugly but functional — leave it).

### 4. Rebind debug key
In src/constants.ts, change:
- DEBUG_KEY from 'KeyD' to 'Backquote'

### 5. Rebind regen key
In src/main.ts line 59, change:
- e.code === 'KeyR' to e.code === 'KeyG'

Update the seed display text on line 49 to show the new keybinds:
- Change "D=debug | R=rebuild" to "` =debug | G=rebuild"

### 6. Confirm lot AABBs are public
Read src/types.ts — the Lot interface has worldBounds: { minX, minZ, maxX, maxZ } which is already public. No changes needed. Just confirm by reading the file.

## Rules
- Only modify files you own (constants.ts, city.ts, grid.ts, blocks.ts, lots.ts, debug.ts) plus main.ts for the keybind changes
- Do NOT modify types.ts, palette.ts, buildings.ts, roads.ts, vegetation.ts, streetFurniture.ts, lotDetails.ts, prng.ts
- Run tsc --noEmit before declaring done
- Keep every file under 1500 lines
- Commit each logical change separately with descriptive messages
- Run npx vite build as final verification

## Reference
- MASTERPLAN.md Section 5 (City numeric spec) and Section 6 Phase 0
- Numeric spec values are LOCKED — use exact numbers from MASTERPLAN
```

- [ ] **Step 3: Wait for agent completion**

Agent should produce 2-3 commits on `wt/city-eng` branch.

- [ ] **Step 4: Verify agent work**

```bash
cd /home/clark/PizzaDeliveryGame-wt/city-eng
npx tsc --noEmit
npx vite build
grep -n "DEFAULT_GRID_WIDTH" src/constants.ts   # should show 24
grep -n "DEBUG_KEY" src/constants.ts             # should show Backquote
grep -n "KeyG" src/main.ts                      # should show KeyG
```

---

## Task 2: Gate 0 — QA Integration

- [ ] **Step 1: Merge city-eng to main**

```bash
cd /home/clark/PizzaDeliveryGame
git merge wt/city-eng --no-ff -m "Gate 0: merge city-eng Phase 0 — 24x24 grid, dispose fix, keybind rebind"
```

- [ ] **Step 2: Verify build on main**

```bash
npx tsc --noEmit
npx vite build
```
Expected: 0 errors on both

- [ ] **Step 3: Start dev server and visual check**

```bash
npx vite --host &
```
Open in browser. Confirm:
- City renders at larger size (24×24 = ~273m × 273m)
- Backtick toggles debug overlay
- G regenerates city
- D and R keys do nothing

- [ ] **Step 4: Clean up worktree**

```bash
cd /home/clark/PizzaDeliveryGame
git worktree remove ../PizzaDeliveryGame-wt/city-eng
git branch -d wt/city-eng
```

---

## Task 3: Phase 1, Wave 1a — Dispatch Vehicle + Shader (parallel)

These two agents have no cross-dependency. Dispatch simultaneously.

- [ ] **Step 1: Create both worktrees**

```bash
cd /home/clark/PizzaDeliveryGame
git worktree add ../PizzaDeliveryGame-wt/vehicle -b wt/vehicle
git worktree add ../PizzaDeliveryGame-wt/shader -b wt/shader
cd ../PizzaDeliveryGame-wt/vehicle && npm install
cd ../PizzaDeliveryGame-wt/shader && npm install
```

- [ ] **Step 2: Dispatch vehicle agent**

Dispatch via Agent tool with `model: opus`. Full prompt:

```
You are vehicle, the Vehicle/Physics agent building DOUGHBOY — a procedural city pizza delivery roguelite in Three.js.

## Your Role
You build the scooter controller, input system, and collision detection. You are the first gameplay agent — Camera and Gameplay both depend on your exports.

## Files You Own (ONLY create/modify these)
- src/scooter.ts (CREATE)
- src/collision.ts (CREATE)
- src/input.ts (CREATE)

## What You Produce (other agents depend on these exports)

src/input.ts must export:
```typescript
export interface InputState {
  forward: boolean;   // W key
  brake: boolean;     // S key
  left: boolean;      // A key
  right: boolean;     // D key
  pause: boolean;     // Escape key (single-frame pulse)
  restart: boolean;   // R key (single-frame pulse)
}
export function createInputHandler(): { state: InputState; dispose(): void };
```

src/scooter.ts must export:
```typescript
import * as THREE from 'three';
import type { InputState } from './input';
import type { Lot } from './types';
import type { Grid } from './types';

export interface ScooterState {
  position: THREE.Vector3;
  heading: number;       // radians, 0 = north (+Z)
  speed: number;         // m/s
  lean: number;          // radians, positive = right
  isWipedOut: boolean;
  wipeoutTimer: number;  // seconds remaining in lockout
}

export interface ScooterEvents {
  onWipeout: () => void;
  onScrape: () => void;
}

export function createScooter(
  spawnX: number,
  spawnZ: number,
  grid: Grid,
): { state: ScooterState; mesh: THREE.Group; update(dt: number, input: InputState, lots: Lot[]): void };
```

src/collision.ts must export:
```typescript
import type { Lot } from './types';
import type { ScooterState } from './scooter';

export interface CollisionResult {
  hit: boolean;
  type: 'none' | 'scrape' | 'wipeout';
  normal: { x: number; z: number };
}

export function checkCollision(state: ScooterState, lots: Lot[], radius: number): CollisionResult;
export function findNearestRoadCenter(wx: number, wz: number, grid: Grid): { x: number; z: number };
```

## Current Phase Work (Phase 1)

### 1. Create src/input.ts
- Listen for keydown/keyup on window
- Track held state for W, S, A, D
- Track single-frame pulses for Escape and R (set true on keydown, consumer resets to false after reading)
- Export createInputHandler() that returns { state, dispose }
- dispose() removes event listeners

### 2. Create src/scooter.ts
Build a kinematic scooter controller. NO physics engine — just math.

Scooter model (low-poly primitives, no GLTF):
- Body: BoxGeometry 0.5 × 0.8 × 1.4 (width × height × length)
- Seat: BoxGeometry 0.4 × 0.15 × 0.5 on top
- Handlebar: CylinderGeometry radius 0.02, height 0.5, rotated
- Front wheel: CylinderGeometry radius 0.25, height 0.1
- Rear wheel: CylinderGeometry radius 0.25, height 0.1
- Pizza box: BoxGeometry 0.45 × 0.15 × 0.45 on the rear rack
- All MeshLambertMaterial with fixed colors (no palette needed):
  - Body: 0x4a90d9 (blue vespa)
  - Seat: 0x2a2a2a (dark)
  - Wheels: 0x1a1a1a (black)
  - Pizza box: 0xcc4444 (red)
  - Handlebar: 0x888888 (silver)

The entire scooter is a THREE.Group. The group's Y rotation = heading. Lean is applied as Z rotation on the body group inside.

Update loop (called every frame with dt in seconds):
1. If isWipedOut: decrement wipeoutTimer by dt. If timer <= 0, set isWipedOut = false. Skip all other input processing.
2. Acceleration: if input.forward and speed < TOP_SPEED (12): speed += ACCEL (8) * dt
3. Braking: if input.brake: speed = max(0, speed - BRAKE_DECEL (14) * dt)
4. Friction: if !input.forward and !input.brake: speed = max(0, speed - FRICTION (2) * dt)
5. Turning: 
   - turnRate = lerp(MAX_TURN_RATE_LOW (140°/s), MAX_TURN_RATE_HIGH (90°/s), speed / TOP_SPEED)
   - Convert to radians: turnRateRad = turnRate * Math.PI / 180
   - if input.left: heading += turnRateRad * dt
   - if input.right: heading -= turnRateRad * dt
6. Lean:
   - targetLean = 0
   - if input.left: targetLean = MAX_LEAN (25° in radians)
   - if input.right: targetLean = -MAX_LEAN
   - Scale by speed: targetLean *= min(1, speed / (TOP_SPEED * 0.3))
   - Ease toward target: lean += (targetLean - lean) * LEAN_RECOVERY (4 * dt) clamped to max delta of MAX_LEAN
7. Position update:
   - position.x += Math.sin(heading) * speed * dt
   - position.z += Math.cos(heading) * speed * dt
8. Collision check (call checkCollision from collision.ts):
   - If hit and type === 'wipeout': set isWipedOut = true, wipeoutTimer = 1.5, speed = 0, snap to nearest road center, fire onWipeout
   - If hit and type === 'scrape': push scooter out along collision normal, speed *= 0.3, fire onScrape
9. Apply to mesh:
   - mesh.position.copy(position)
   - mesh.position.y = 0 (ground level)
   - mesh.rotation.y = heading
   - Inner body group: rotation.z = lean

### 3. Create src/collision.ts
Sphere-vs-AABB collision against lot worldBounds.

checkCollision(state, lots, radius):
- radius = 0.6 (scooter collider)
- For each lot in lots:
  - Find closest point on AABB to scooter position (clamp scooter x,z to lot minX..maxX, minZ..maxZ)
  - Distance = sqrt((closestX - scooterX)^2 + (closestZ - scooterZ)^2)
  - If distance < radius: collision detected
    - normal = normalize(scooterPos - closestPoint)
    - Calculate incidence angle: dot(velocity_direction, normal)
    - If abs(angle) < cos(30°) → type = 'scrape' regardless of speed
    - Else if speed >= 6 → type = 'wipeout'
    - Else → type = 'scrape'
  - Return first collision found (don't check all — early exit)
- If no collision: return { hit: false, type: 'none', normal: {x:0, z:0} }

findNearestRoadCenter(wx, wz, grid):
- Convert world to grid coords using worldToGrid()
- Search in a spiral pattern (or just check all cells within radius 3) for the nearest road/intersection cell
- Convert that cell back to world coords using gridToWorld()
- Return the world position of that cell's center

## Rules
- Only create src/scooter.ts, src/collision.ts, src/input.ts — do NOT modify any existing files
- Import from existing files: types.ts (Lot, Grid), grid.ts (gridToWorld, worldToGrid)
- Run npx tsc --noEmit before declaring done
- Keep every file under 1500 lines
- Commit each file separately with descriptive messages

## Reference
- MASTERPLAN.md Section 5 (Scooter, Input, Collision numeric specs)
- All numeric values are LOCKED — use exact numbers from MASTERPLAN
```

- [ ] **Step 3: Dispatch shader agent (in parallel)**

Dispatch via Agent tool with `model: opus`. Full prompt:

```
You are shader, the Shader/VFX agent building DOUGHBOY — a procedural city pizza delivery roguelite in Three.js.

## Your Role
You own the visual pipeline — materials, shaders, sky, trip effects. In Phase 1, your job is to swap the MeshLambertMaterial to a custom ShaderMaterial that looks IDENTICAL but has uniform hooks for Phase 2 trip effects.

## Files You Own (ONLY create/modify these)
- src/tripShader.ts (CREATE)
- src/sky.ts (CREATE)
- src/palette.ts (MODIFY — you own this file from Phase 1 onward)

## What You Produce (other agents depend on these exports)

src/tripShader.ts must export:
```typescript
import * as THREE from 'three';

export interface TripUniforms {
  uTime: THREE.IUniform<number>;
  uTripIntensity: THREE.IUniform<number>;
  uDeliveryProgress: THREE.IUniform<number>;
}

export function createTripMaterial(
  paletteTexture: THREE.DataTexture,
): { material: THREE.ShaderMaterial; uniforms: TripUniforms };

export function createEmissiveTripMaterial(
  paletteTexture: THREE.DataTexture,
): { material: THREE.ShaderMaterial; uniforms: TripUniforms };
```

src/sky.ts must export:
```typescript
import * as THREE from 'three';

export function createSky(): { mesh: THREE.Mesh; update(deliveryProgress: number): void };
```

## Current Phase Work (Phase 1 — prep only)

### 1. Create src/tripShader.ts

Write a custom ShaderMaterial that replicates MeshLambertMaterial's behavior:

Vertex shader:
- Standard MVP transform: projectionMatrix * modelViewMatrix * vec4(position, 1.0)
- Pass UV to fragment
- Pass world normal for lighting
- Pass world position for future trip effects
- Include uniforms: uTime (float), uTripIntensity (float), uDeliveryProgress (float)
- In Phase 1, uTripIntensity reads 0.0 — NO visual effect. Just plumbing.

Fragment shader:
- Sample palette texture at UV coordinates (same as MeshLambertMaterial's map lookup)
- Apply simple Lambert diffuse lighting:
  - Ambient: 0.6
  - Directional: dot(normal, lightDir) * 0.8
  - Light direction: normalize(vec3(50, 100, 50))
- Output: paletteColor * (ambient + diffuse)
- NO trip effects in Phase 1. Leave commented placeholder showing where they'll go:
  // Phase 2: vertex wobble here
  // Phase 2: palette LUT shift here

Emissive variant (createEmissiveTripMaterial):
- Same as above but fragment shader ignores lighting, just outputs palette color directly
- Used for self-lit objects (street lamps)

CRITICAL: After this change, the city must look IDENTICAL to before. Same colors, same lighting, same everything. The only difference is the material class (ShaderMaterial instead of MeshLambertMaterial).

### 2. Modify src/palette.ts

Change createPalette() to use your new materials instead of MeshLambertMaterial/MeshBasicMaterial:

Replace lines that create materials (around line 136-137):
```typescript
// OLD:
const mainMaterial = new THREE.MeshLambertMaterial({ map: texture });
const emissiveMaterial = new THREE.MeshBasicMaterial({ map: texture });

// NEW:
import { createTripMaterial, createEmissiveTripMaterial } from './tripShader';
const { material: mainMaterial, uniforms } = createTripMaterial(texture);
const { material: emissiveMaterial } = createEmissiveTripMaterial(texture);
```

Update the PaletteAtlas interface to include uniforms:
- Add `uniforms: TripUniforms` to the returned object
- Keep mainMaterial type as THREE.Material (or THREE.ShaderMaterial) — existing code that uses it only calls it as a Material

### 3. Create src/sky.ts (stub)

Create a simple sky dome/background that can be updated later:
- Large SphereGeometry (radius 500, inverted normals or BackSide material)
- Solid deep midnight blue color (0x0a0a2e) — MASTERPLAN says "starts deep midnight blue at delivery 1"
- update(deliveryProgress) is a no-op stub in Phase 1 — will be implemented in Phase 2
- Export createSky() returning { mesh, update }

## Rules
- Only create/modify: src/tripShader.ts, src/sky.ts, src/palette.ts
- Do NOT modify any other file
- The PaletteAtlas interface shape must remain compatible — mainMaterial and emissiveMaterial must still work everywhere they're currently used
- Run npx tsc --noEmit before declaring done
- Keep every file under 1500 lines
- Commit each logical change separately

## Reference
- MASTERPLAN.md Section 5 (Sky/time of day), Section 6 Phase 2 (for understanding what the plumbing enables)
- The existing palette.ts creates a 16×16 DataTexture — your shader reads from this same texture
```

- [ ] **Step 4: Wait for both agents to complete**

Both agents work in parallel. Check completion of each independently.

---

## Task 4: Phase 1, Wave 1a — Verify + Mini-Gate for Vehicle

Vehicle must merge before Camera and Audio can start. Shader can merge independently.

- [ ] **Step 1: Verify vehicle agent work**

```bash
cd /home/clark/PizzaDeliveryGame-wt/vehicle
npx tsc --noEmit
# Check files exist and exports match spec:
grep -n "export function createScooter" src/scooter.ts
grep -n "export function createInputHandler" src/input.ts
grep -n "export function checkCollision" src/collision.ts
grep -n "export function findNearestRoadCenter" src/collision.ts
```

- [ ] **Step 2: Merge vehicle to main (mini-gate)**

```bash
cd /home/clark/PizzaDeliveryGame
git merge wt/vehicle --no-ff -m "Phase 1: merge vehicle — scooter controller, input, collision"
npx tsc --noEmit
```

- [ ] **Step 3: Verify shader agent work**

```bash
cd /home/clark/PizzaDeliveryGame-wt/shader
npx tsc --noEmit
grep -n "export function createTripMaterial" src/tripShader.ts
grep -n "export function createSky" src/sky.ts
```

- [ ] **Step 4: Merge shader to main**

```bash
cd /home/clark/PizzaDeliveryGame
git merge wt/shader --no-ff -m "Phase 1: merge shader — trip material plumbing, sky stub"
npx tsc --noEmit
npx vite build
```

- [ ] **Step 5: Clean up worktrees**

```bash
git worktree remove ../PizzaDeliveryGame-wt/vehicle
git worktree remove ../PizzaDeliveryGame-wt/shader
git branch -d wt/vehicle wt/shader
```

---

## Task 5: Phase 1, Wave 1b — Dispatch Camera + Audio (parallel)

Both depend only on vehicle (now merged).

- [ ] **Step 1: Create both worktrees**

```bash
cd /home/clark/PizzaDeliveryGame
git worktree add ../PizzaDeliveryGame-wt/camera -b wt/camera
git worktree add ../PizzaDeliveryGame-wt/audio -b wt/audio
cd ../PizzaDeliveryGame-wt/camera && npm install
cd ../PizzaDeliveryGame-wt/audio && npm install
```

- [ ] **Step 2: Dispatch camera agent**

Dispatch via Agent tool with `model: opus`. Full prompt:

```
You are camera, the Camera/Renderer agent building DOUGHBOY — a procedural city pizza delivery roguelite in Three.js.

## Your Role
You own the camera system, scene bootstrap, and main.ts restructuring. You replace OrbitControls with a chase camera that follows the scooter.

## Files You Own (ONLY create/modify these)
- src/camera.ts (CREATE)
- src/renderer.ts (CREATE)
- src/main.ts (MODIFY — you own this file)

## What You Produce (other agents depend on these exports)

src/camera.ts must export:
```typescript
import * as THREE from 'three';
import type { ScooterState } from './scooter';

export function createChaseCamera(
  renderer: THREE.WebGLRenderer,
): THREE.PerspectiveCamera;

export function updateChaseCamera(
  camera: THREE.PerspectiveCamera,
  scooter: ScooterState,
  dt: number,
): void;
```

src/renderer.ts must export:
```typescript
import * as THREE from 'three';
import type { CityResult } from './city';
import type { ScooterState } from './scooter';
import type { TripUniforms } from './tripShader';

export interface BootResult {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  city: CityResult;
  uniforms: TripUniforms;
}

export function bootScene(seed: number): BootResult;
export function rebuildCity(boot: BootResult, newSeed: number): void;
```

## Current Phase Work (Phase 1)

### 1. Create src/camera.ts

Chase camera per MASTERPLAN Section 5:
- FOV: 70 degrees
- Near: 0.1, Far: 2000
- Distance behind scooter: 6m
- Height above ground: 2.5m
- Look-ahead: 3m forward on scooter's heading
- Position damping: 0.12 (lerp factor per frame at 60fps — scale by dt for frame independence: factor = 1 - Math.pow(1 - 0.12, dt * 60))
- Rotation damping: 0.15 (same scaling)
- No camera shake (Phase 2 adds it)

createChaseCamera(renderer):
- Create PerspectiveCamera(70, aspect, 0.1, 2000)
- Return it

updateChaseCamera(camera, scooter, dt):
- Calculate ideal position: 6m behind scooter along its heading, 2.5m up
  - idealX = scooter.position.x - Math.sin(scooter.heading) * 6
  - idealZ = scooter.position.z - Math.cos(scooter.heading) * 6
  - idealY = 2.5
- Calculate look-at target: 3m ahead of scooter
  - targetX = scooter.position.x + Math.sin(scooter.heading) * 3
  - targetZ = scooter.position.z + Math.cos(scooter.heading) * 3
  - targetY = 0.8 (scooter height)
- Lerp camera position toward ideal with damping factor
- camera.lookAt(lerpedTarget)

### 2. Create src/renderer.ts

bootScene(seed):
- Create WebGLRenderer({ antialias: true }), set size, pixel ratio, append to document.body
- Create Scene with background color 0x0a0a2e (midnight blue — sky.ts will override with mesh)
- Create lights: AmbientLight(0xffffff, 0.6) + DirectionalLight(0xffffff, 0.8) at position (50, 100, 50)
- Build city: call buildCity(seed) from city.ts
- Add city.group to scene
- Create sky: call createSky() from sky.ts, add mesh to scene
- Create camera: call createChaseCamera(renderer)
- Get uniforms from city.palette.uniforms (added by shader agent)
- Return { scene, camera, renderer, city, uniforms }

rebuildCity(boot, newSeed):
- Call disposeCity on existing city group
- Call buildCity(newSeed)
- Add new city to scene
- Update boot.city reference

### 3. Rewrite src/main.ts

Replace the entire file. The new main.ts is the game's entry point:

```typescript
import { bootScene, rebuildCity } from './renderer';
import { createScooter } from './scooter';
import { createInputHandler } from './input';
import { updateChaseCamera } from './camera';
import { createDebugOverlay } from './debug';
import { gridToWorld } from './grid';

// Boot
let seed = Math.floor(Math.random() * 100000);
const boot = bootScene(seed);
const { scene, camera, renderer, uniforms } = boot;

// Scooter spawns at tile (0,0) — center of the grid
const spawnWorld = gridToWorld(boot.city.grid, 0, 0);
const scooterResult = createScooter(spawnWorld.wx, spawnWorld.wz, boot.city.grid);
scene.add(scooterResult.mesh);

// Input
const { state: input, dispose: disposeInput } = createInputHandler();

// Debug overlay
let debugOverlay = createDebugOverlay(boot.city.grid, boot.city.blocks, boot.city.lots);
debugOverlay.visible = false;
scene.add(debugOverlay);

// HUD (seed display for now)
const seedEl = document.getElementById('seed-display')!;
seedEl.textContent = `Seed: ${seed}`;

// Keybinds
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') {
    debugOverlay.visible = !debugOverlay.visible;
  }
  if (e.code === 'KeyG') {
    seed = Math.floor(Math.random() * 100000);
    // Remove scooter and debug before rebuild
    scooterResult.mesh.removeFromParent();
    debugOverlay.removeFromParent();
    rebuildCity(boot, seed);
    // Re-add scooter at new spawn
    const newSpawn = gridToWorld(boot.city.grid, 0, 0);
    scooterResult.state.position.set(newSpawn.wx, 0, newSpawn.wz);
    scene.add(scooterResult.mesh);
    // Recreate debug
    debugOverlay = createDebugOverlay(boot.city.grid, boot.city.blocks, boot.city.lots);
    debugOverlay.visible = false;
    scene.add(debugOverlay);
    seedEl.textContent = `Seed: ${seed}`;
  }
});

// Resize
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Game loop
let lastTime = performance.now();
(function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = now;

  // Update scooter
  scooterResult.update(dt, input, boot.city.lots);

  // Update camera
  updateChaseCamera(camera, scooterResult.state, dt);

  // Update shader time uniform
  uniforms.uTime.value = now / 1000;

  renderer.render(scene, camera);
})();
```

NOTE: This is the starting structure. The Gameplay agent will later import and extend this with the game loop, but they'll do so by calling gameLoop.init() — they won't modify main.ts.

### 4. Remove OrbitControls import
The old main.ts imports OrbitControls. Your rewrite removes it entirely. No references to OrbitControls should remain.

## Rules
- Only create/modify: src/camera.ts, src/renderer.ts, src/main.ts
- You may read (but not modify): src/city.ts, src/scooter.ts, src/input.ts, src/tripShader.ts, src/sky.ts, src/palette.ts, src/grid.ts, src/debug.ts, src/types.ts
- The scooter agent has already created src/scooter.ts, src/input.ts, src/collision.ts — import from them
- The shader agent has already modified src/palette.ts to include uniforms on PaletteAtlas — access via city.palette.uniforms
- Run npx tsc --noEmit before declaring done
- Keep every file under 1500 lines
- Commit each logical change separately

## Reference
- MASTERPLAN.md Section 5 (Camera spec), Section 6 Phase 1
```

- [ ] **Step 3: Dispatch audio agent (in parallel)**

Dispatch via Agent tool with `model: opus`. Full prompt:

```
You are audio, the Audio agent building DOUGHBOY — a procedural city pizza delivery roguelite in Three.js.

## Your Role
You own all audio — SFX, music, pitch-shifting. You use Web Audio API only, no external libraries.

## Files You Own (ONLY create/modify these)
- src/audio.ts (CREATE)
- public/sfx/ (CREATE directory — but we'll generate sounds procedurally, no audio files needed)

## What You Produce (other agents depend on these exports)

src/audio.ts must export:
```typescript
export interface AudioManager {
  /** Start audio context (must be called from user gesture) */
  init(): void;
  /** Play a named sound effect */
  play(id: 'chime' | 'wipeout' | 'scrape' | 'shroom' | 'voiceBlip'): void;
  /** Set scooter throttle for engine pitch (0 = idle, 1 = full speed) */
  setThrottle(value: number): void;
  /** Set trip intensity for music pitch-shift (0 = sober, 1 = peak) */
  setTripIntensity(value: number): void;
  /** Start/stop the background lo-fi loop */
  startMusic(): void;
  stopMusic(): void;
  /** Clean up */
  dispose(): void;
}

export function createAudioManager(): AudioManager;
```

## Current Phase Work (Phase 1)

### 1. Create src/audio.ts

All sounds are procedurally generated using Web Audio API oscillators and noise buffers. No audio files.

AudioContext setup:
- Create AudioContext lazily on first init() call (browser requires user gesture)
- Master gain node at 0.5 volume
- All sounds route through master gain

Scooter engine sound:
- Two detuned sawtooth oscillators (fundamental + 5th) through a low-pass filter (cutoff 200Hz)
- GainNode at 0.15 (subtle, not annoying)
- setThrottle(value): adjust oscillator frequency from 40Hz (idle, value=0) to 90Hz (full, value=1)
- Also adjust low-pass cutoff from 200Hz to 600Hz with throttle
- Start oscillators on init(), they run continuously

Delivery chime:
- play('chime'): Two short sine tones in sequence (rising third)
  - First tone: 523Hz (C5), duration 0.1s, gain 0.3
  - Second tone: 659Hz (E5), starts at 0.1s, duration 0.1s, gain 0.3
  - Both through a gain envelope: attack 0.01s, release 0.05s

Wipeout SFX:
- play('wipeout'): White noise burst through bandpass filter
  - Duration: 0.3s
  - Bandpass center: 800Hz, Q: 1
  - Gain envelope: 0.4 attack, fast decay
  - Create noise buffer: AudioBuffer filled with random values

Scrape SFX:
- play('scrape'): Short filtered noise
  - Duration: 0.15s
  - Highpass 2000Hz
  - Gain: 0.2

Shroom pickup:
- play('shroom'): Rising arpeggio of 3 sine tones
  - 440Hz, 554Hz, 659Hz (A4, C#5, E5)
  - Each 0.08s, slight overlap
  - Gain: 0.25

Voice blip:
- play('voiceBlip'): Quick square wave blip
  - 220Hz, duration 0.05s
  - Gain: 0.15

Background music (Phase 1 stub):
- startMusic(): Create a simple lo-fi loop using oscillators
  - Very quiet (gain 0.08)
  - Low-pass filtered sawtooth at 150Hz
  - Slow LFO (0.5Hz) modulating gain slightly for "breathing" effect
  - This is a placeholder — Phase 2 will add pitch-shift based on tripIntensity
- stopMusic(): disconnect and stop oscillators
- setTripIntensity(value): no-op in Phase 1 (Phase 2 will implement pitch-shift)

### 2. Important: User gesture requirement
AudioContext must be resumed after a user gesture. The init() method should call audioContext.resume(). The Gameplay agent will call audioManager.init() on first keypress.

## Rules
- Only create src/audio.ts
- Do NOT create audio files — generate ALL sounds procedurally with Web Audio API
- Do NOT modify any existing file
- Run npx tsc --noEmit before declaring done
- Keep src/audio.ts under 1500 lines (it will be the largest single file — aim for ~400 lines)
- Commit with a descriptive message

## Reference
- MASTERPLAN.md Section 5 (Audio specs), Section 6 Phases 1 and 5
```

- [ ] **Step 4: Wait for both agents to complete**

---

## Task 6: Phase 1, Wave 1b — Verify + Merge Camera and Audio

- [ ] **Step 1: Verify camera agent**

```bash
cd /home/clark/PizzaDeliveryGame-wt/camera
npx tsc --noEmit
grep -n "export function createChaseCamera" src/camera.ts
grep -n "export function bootScene" src/renderer.ts
grep -n "OrbitControls" src/main.ts  # should find NOTHING
```

- [ ] **Step 2: Verify audio agent**

```bash
cd /home/clark/PizzaDeliveryGame-wt/audio
npx tsc --noEmit
grep -n "export function createAudioManager" src/audio.ts
```

- [ ] **Step 3: Merge camera to main**

```bash
cd /home/clark/PizzaDeliveryGame
git merge wt/camera --no-ff -m "Phase 1: merge camera — chase cam, scene bootstrap, main.ts rewrite"
npx tsc --noEmit
```

- [ ] **Step 4: Merge audio to main**

```bash
git merge wt/audio --no-ff -m "Phase 1: merge audio — procedural SFX, engine sound, music stub"
npx tsc --noEmit
npx vite build
```

- [ ] **Step 5: Smoke test — drive the scooter**

```bash
npx vite --host &
```
Open browser. Confirm:
- Scooter visible at city center
- WASD drives it around
- Chase camera follows smoothly
- Collisions with buildings work (scrape at low speed, wipeout at high speed)
- City still renders correctly with new shader materials

- [ ] **Step 6: Clean up worktrees**

```bash
git worktree remove ../PizzaDeliveryGame-wt/camera
git worktree remove ../PizzaDeliveryGame-wt/audio
git branch -d wt/camera wt/audio
```

---

## Task 7: Phase 1, Wave 1c — Dispatch Gameplay

Depends on vehicle + camera (both merged).

- [ ] **Step 1: Create worktree**

```bash
cd /home/clark/PizzaDeliveryGame
git worktree add ../PizzaDeliveryGame-wt/gameplay -b wt/gameplay
cd ../PizzaDeliveryGame-wt/gameplay && npm install
```

- [ ] **Step 2: Dispatch gameplay agent**

Dispatch via Agent tool with `model: opus`. Full prompt:

```
You are gameplay, the Gameplay agent building DOUGHBOY — a procedural city pizza delivery roguelite in Three.js.

## Your Role
You own the game logic — deliveries, scoring, shrooms, waypoint arrow, run state machine. You wire everything together into a playable game loop.

## Files You Own (ONLY create/modify these)
- src/delivery.ts (CREATE)
- src/scoring.ts (CREATE)
- src/waypoint.ts (CREATE)
- src/shrooms.ts (CREATE)
- src/gameLoop.ts (CREATE)

## What You Produce (other agents depend on these exports)

src/gameLoop.ts must export:
```typescript
import * as THREE from 'three';
import type { BootResult } from './renderer';
import type { ScooterState } from './scooter';
import type { InputState } from './input';
import type { AudioManager } from './audio';

export type GameEvent = 
  | { type: 'delivery'; deliveryIndex: number; score: number }
  | { type: 'wipeout' }
  | { type: 'scrape' }
  | { type: 'shroom'; tripIntensity: number }
  | { type: 'idle' }
  | { type: 'nearDelivery' }
  | { type: 'runEnd'; totalScore: number };

export type GameState = 'title' | 'playing' | 'paused' | 'score';

export interface GameLoop {
  state: GameState;
  deliveryCount: number;
  totalDeliveries: number;
  currentScore: number;
  deliveryTimer: number;
  tripIntensity: number;
  deliveryProgress: number;
  onEvent: (event: GameEvent) => void;
  
  init(boot: BootResult, scooter: ScooterState, scooterMesh: THREE.Group, audio: AudioManager): void;
  update(dt: number, input: InputState): void;
  start(): void;
  pause(): void;
  resume(): void;
  restart(newSeed: number): void;
}

export function createGameLoop(): GameLoop;
```

src/scoring.ts must export:
```typescript
export interface DeliveryScore {
  base: number;
  timeBonus: number;
  shroomMultiplier: number;
  coldPenalty: number;
  total: number;
}

export function calculateDeliveryScore(timeSeconds: number, shroomsCollected: number): DeliveryScore;
export function calculateRunTotal(deliveryScores: DeliveryScore[], wipeoutCount: number): number;
```

## Current Phase Work (Phase 1)

### 1. Create src/scoring.ts

Implement MASTERPLAN Section 5 scoring formula EXACTLY:
```
delivery_score = 100 × time_bonus × (1 + 0.25 × shrooms) × (cold ? 0.5 : 1.0)
time_bonus = 2.0 if under 30s, scales linearly to 0.5 at 90s (clamp: min 0.5, max 2.0)
cold = timeSeconds > 75

run_total = sum(delivery totals) × wipeout_penalty
wipeout_penalty = max(0.5, 1.0 - 0.05 × wipeouts)
```

calculateDeliveryScore(timeSeconds, shroomsCollected):
- timeBonus: if timeSeconds <= 30 return 2.0; if timeSeconds >= 90 return 0.5; else lerp linearly
- shroomMultiplier: 1 + 0.25 * shroomsCollected
- coldPenalty: timeSeconds > 75 ? 0.5 : 1.0
- total: Math.round(100 * timeBonus * shroomMultiplier * coldPenalty)
- Return { base: 100, timeBonus, shroomMultiplier, coldPenalty, total }

### 2. Create src/delivery.ts

Delivery marker placement and management.

```typescript
import * as THREE from 'three';
import type { Grid, Lot } from './types';
import type { PRNG } from './prng';
import { getCell, gridToWorld } from './grid';

export interface DeliveryMarker {
  gridX: number;
  gridZ: number;
  worldX: number;
  worldZ: number;
  mesh: THREE.Mesh;
}

export function createDeliveryMarker(scene: THREE.Scene, x: number, z: number): DeliveryMarker;
export function findDeliveryTarget(
  grid: Grid,
  lots: Lot[],
  fromGridX: number,
  fromGridZ: number,
  minDist: number,
  maxDist: number,
  rng: PRNG,
): { gridX: number; gridZ: number };
export function removeDeliveryMarker(marker: DeliveryMarker, scene: THREE.Scene): void;
```

findDeliveryTarget algorithm:
1. Collect all road cells that are adjacent to at least one lot (check 4 neighbors for empty/lot cells)
2. Filter to cells whose Manhattan distance from (fromGridX, fromGridZ) is between minDist and maxDist
3. If no candidates, widen range by 2 in each direction and retry (max 3 retries)
4. Pick one at random using rng.pick()
5. Return grid coordinates

Marker mesh: CylinderGeometry(radius 1.5, height 0.3) at y=0.1, rotating slowly (add rotation in update). Color: bright yellow (0xffdd00) MeshBasicMaterial for visibility.

First delivery: minDist=12, maxDist=16 (from tile 0,0)
Subsequent: minDist=10, maxDist=16 (from previous delivery location)

### 3. Create src/shrooms.ts

```typescript
import * as THREE from 'three';
import type { Grid } from './types';

export interface Shroom {
  gridX: number;
  gridZ: number;
  worldX: number;
  worldZ: number;
  mesh: THREE.Mesh;
  collected: boolean;
}

export function spawnShrooms(grid: Grid, scene: THREE.Scene, rng: PRNG, count: number): Shroom[];
export function checkShroomPickup(shrooms: Shroom[], playerX: number, playerZ: number, radius: number): Shroom | null;
export function removeShrooms(shrooms: Shroom[], scene: THREE.Scene): void;
```

spawnShrooms:
- Find 6 road cells that are NOT on the Manhattan-shortest path between spawn and delivery
- At least 1 tile of detour cost from the direct path
- Mesh: IcosahedronGeometry(radius 0.4), MeshBasicMaterial color 0x9944ff (purple glow), emissive-like
- Add slight hover animation (sin wave on Y position)
- Return array of Shroom objects

checkShroomPickup:
- For each uncollected shroom, check if distance to player < 2m (pickup radius)
- If collected, set shroom.collected = true, hide mesh
- Return the collected shroom or null

### 4. Create src/waypoint.ts

```typescript
import * as THREE from 'three';

export interface WaypointArrow {
  mesh: THREE.Group;
  update(
    scooterX: number,
    scooterZ: number,
    targetX: number,
    targetZ: number,
    dt: number,
    tripIntensity: number,
  ): void;
}

export function createWaypointArrow(scene: THREE.Scene): WaypointArrow;
```

Arrow is a world-space billboard above the scooter:
- ConeGeometry(0.3, 0.8, 4) pointing forward, bright green (0x00ff88)
- Positioned 3m above scooter
- Rotates to point toward delivery target
- Rotation eases toward target heading over 0.4s (lerp)
- tripIntensity: no-op in Phase 1 (Phase 2 adds drift: heading += noise * intensity * 30°)

### 5. Create src/gameLoop.ts

The central game loop state machine.

States:
- 'title': waiting for first keypress. On any key → 'playing', call audio.init() and audio.startMusic()
- 'playing': active gameplay. Checks input.pause → 'paused'. Checks input.restart → restart. Runs delivery logic.
- 'paused': game frozen. Checks input.pause → 'playing'
- 'score': run complete, showing score. Checks input.restart → restart

init(boot, scooter, scooterMesh, audio):
- Store references
- Create PRNG from city seed for delivery/shroom placement
- Create first delivery marker (12-16 tiles from tile 0,0)
- Create waypoint arrow
- Spawn 6 shrooms
- Set state to 'title'

update(dt, input):
- If 'title': check for any key press → start()
- If 'paused': check input.pause → resume()
- If 'playing':
  1. Update delivery timer += dt
  2. Check delivery: distance(scooter.position, currentMarker) < 4m → deliver
     - Calculate score, fire delivery event
     - Play chime: audio.play('chime')
     - Increment deliveryCount
     - If deliveryCount === 7 → run end, fire runEnd event, state = 'score'
     - If deliveryCount === 3 or 6 → trigger city reshuffle (call rebuildCity, respawn shrooms)
     - Else → spawn next delivery marker
  3. Check shroom pickup
     - On pickup: tripIntensity = min(1.0, tripIntensity + 0.15), fire shroom event, audio.play('shroom')
  4. Update waypoint arrow
  5. Update tripIntensity on shader uniform: boot.uniforms.uTripIntensity.value = tripIntensity
  6. Update deliveryProgress: boot.uniforms.uDeliveryProgress.value = deliveryCount / 7
  7. Handle pause/restart input
  8. Wire scooter events: onWipeout → audio.play('wipeout'), fire wipeout event; onScrape → audio.play('scrape')
  9. Update audio throttle: audio.setThrottle(scooter.speed / 12)

start():
- audio.init()
- audio.startMusic()
- state = 'playing'
- Reset timer, score, deliveries

restart(newSeed):
- Reset everything, rebuild city, respawn

## Rules
- Only create: src/delivery.ts, src/scoring.ts, src/waypoint.ts, src/shrooms.ts, src/gameLoop.ts
- Do NOT modify main.ts (Camera agent owns it) — instead, main.ts will be updated to import and call your gameLoop
- Import from: types.ts, grid.ts, scooter.ts, input.ts, audio.ts, renderer.ts, city.ts, prng.ts, tripShader.ts
- Run npx tsc --noEmit before declaring done
- Keep every file under 1500 lines
- Commit each file separately

## Reference
- MASTERPLAN.md Section 5 (Delivery markers, Scoring, Shrooms, Dialogue cadence, Delivery beat)
- All numeric values are LOCKED
```

- [ ] **Step 3: Wait for agent completion**

- [ ] **Step 4: Verify and merge**

```bash
cd /home/clark/PizzaDeliveryGame-wt/gameplay
npx tsc --noEmit
cd /home/clark/PizzaDeliveryGame
git merge wt/gameplay --no-ff -m "Phase 1: merge gameplay — delivery system, scoring, shrooms, waypoint, game loop"
npx tsc --noEmit
```

- [ ] **Step 5: Clean up**

```bash
git worktree remove ../PizzaDeliveryGame-wt/gameplay
git branch -d wt/gameplay
```

---

## Task 8: Phase 1, Wave 1d — Dispatch UI

Depends on gameplay (now merged).

- [ ] **Step 1: Create worktree and dispatch**

```bash
cd /home/clark/PizzaDeliveryGame
git worktree add ../PizzaDeliveryGame-wt/ui -b wt/ui
cd ../PizzaDeliveryGame-wt/ui && npm install
```

- [ ] **Step 2: Dispatch UI agent**

Dispatch via Agent tool with `model: opus`. Full prompt:

```
You are ui, the UI/Dialogue agent building DOUGHBOY — a procedural city pizza delivery roguelite in Three.js.

## Your Role
You own all 2D UI — HUD, overlays, screens. In Phase 1, you build the HUD and pause/score overlays. Phase 4 adds the dialogue system.

## Files You Own (ONLY create/modify these)
- src/hud.ts (CREATE)

## What You Produce

src/hud.ts must export:
```typescript
import type { GameLoop, GameEvent, GameState } from './gameLoop';

export interface HUD {
  update(gameLoop: GameLoop): void;
  showScoreFloater(score: number, worldX: number, worldZ: number): void;
  showPauseOverlay(visible: boolean): void;
  showScoreScreen(totalScore: number, deliveryCount: number): void;
  showTitleScreen(visible: boolean): void;
  onEvent(event: GameEvent): void;
  dispose(): void;
}

export function createHUD(): HUD;
```

## Current Phase Work (Phase 1)

### 1. Create src/hud.ts

All UI is DOM-based (HTML elements overlaid on the canvas). No canvas 2D drawing needed.

Create a container div#game-hud with pointer-events: none, positioned fixed over the viewport.

HUD elements (visible during 'playing' state):
- **Run counter**: top-right, "1/7" in large monospace text, white with text-shadow
- **Delivery timer**: below run counter, "00:00" format (MM:SS), updates every frame
- **Score**: top-left, "Score: 0" in monospace, white
- **Waypoint hint**: small "DELIVER" text that pulses when near delivery marker

Score floater:
- showScoreFloater(score, worldX, worldZ): creates a "+{score}" DOM element
- Positioned at the 3D world location projected to screen coords (you'll need camera + renderer refs)
- Animates: translate up 80px over 1.2s, opacity 0→1→0
- Color: #ffdd00 (yellow accent)
- Remove from DOM after animation completes
- Use CSS animations/transitions (create a style element on init)

Pause overlay:
- Semi-transparent black backdrop (rgba(0,0,0,0.6))
- "PAUSED" centered, large white text
- "Press ESC to resume" below

Title screen:
- Full screen overlay
- "DOUGHBOY" in large bold text, white
- "Press any key to start" pulsing below
- Dark background (rgba(10,10,30,0.9))

Score screen (end of run):
- Full screen overlay
- "RUN COMPLETE" header
- Total score in large text
- "Press R to restart"
- Dark background

onEvent(event):
- delivery → call showScoreFloater with event.score
- runEnd → call showScoreScreen with event.totalScore

update(gameLoop):
- Update run counter text: `${gameLoop.deliveryCount}/${gameLoop.totalDeliveries}`
- Update timer: format gameLoop.deliveryTimer as MM:SS
- Update score: gameLoop.currentScore
- Show/hide elements based on gameLoop.state:
  - 'title': show title screen, hide HUD
  - 'playing': show HUD, hide overlays
  - 'paused': show HUD + pause overlay
  - 'score': show score screen, hide HUD

### CSS approach
Inject a <style> element on createHUD() with all styles. Use classes for show/hide.

Styling:
- Font: monospace throughout
- White text with subtle text-shadow for readability against any background
- Run counter: font-size 28px
- Timer: font-size 18px
- Score: font-size 22px
- All positioned with padding (16px from edges)

## Rules
- Only create src/hud.ts
- All UI is DOM-based — no canvas 2D rendering
- Do NOT modify main.ts or any other file
- To project 3D world coords to screen for floaters, accept camera and renderer as params in createHUD or in showScoreFloater
- Run npx tsc --noEmit before declaring done
- Keep under 1500 lines
- Commit with descriptive message

## Reference
- MASTERPLAN.md Section 5 (Delivery beat, specifically step 4: score floater)
- MASTERPLAN.md Section 6 Phases 1, 4, 5
```

- [ ] **Step 3: Wait, verify, merge**

```bash
cd /home/clark/PizzaDeliveryGame-wt/ui
npx tsc --noEmit
cd /home/clark/PizzaDeliveryGame
git merge wt/ui --no-ff -m "Phase 1: merge ui — HUD, pause overlay, title/score screens"
npx tsc --noEmit
```

- [ ] **Step 4: Clean up**

```bash
git worktree remove ../PizzaDeliveryGame-wt/ui
git branch -d wt/ui
```

---

## Task 9: Gate 1 — Full Integration

All Phase 1 agents merged. QA integration check.

- [ ] **Step 1: Build verification**

```bash
cd /home/clark/PizzaDeliveryGame
npx tsc --noEmit
npx vite build
```

- [ ] **Step 2: Integration wiring**

At this point, main.ts (written by camera agent) creates the scooter and renders the scene but doesn't wire in the game loop, HUD, or audio. We need a one-time integration pass to connect everything.

Create a fresh worktree for the integration:

```bash
git worktree add ../PizzaDeliveryGame-wt/integrate -b wt/integrate
cd ../PizzaDeliveryGame-wt/integrate && npm install
```

Dispatch an integration agent (`model: opus`) to update main.ts to import and wire:
- createGameLoop() → gameLoop.init(boot, scooterResult.state, scooterResult.mesh, audioManager)
- createHUD() → hud.update(gameLoop) in the animation loop
- createAudioManager() → pass to gameLoop
- gameLoop.onEvent → hud.onEvent
- Wire scooter events to gameLoop/audio
- Wire pause/restart to gameLoop.pause()/restart()

This is the one exception where the integration agent modifies main.ts — all future changes go through the owning agent.

- [ ] **Step 3: Verify full integration**

```bash
npx tsc --noEmit
npx vite build
npx vite --host &
```

Gate 1 smoke test:
- Press any key → game starts, HUD visible
- WASD drives scooter, camera follows
- Waypoint arrow points to delivery marker
- Drive to marker → auto-deliver, chime plays, score floater shows, next marker spawns
- Collect shrooms (purple glowing objects off the path)
- Esc → pauses, Esc again → resumes
- Complete 7 deliveries → score screen
- R → restart
- City reshuffles at delivery 3 and 6

- [ ] **Step 4: Merge and clean up**

```bash
cd /home/clark/PizzaDeliveryGame
git merge wt/integrate --no-ff -m "Gate 1: wire game loop, HUD, audio into main — 7 deliveries playable"
npx tsc --noEmit
git worktree remove ../PizzaDeliveryGame-wt/integrate
git branch -d wt/integrate
```

---

## Task 10: Phase 2, Wave 2a — Dispatch Shader (trip effects)

Shader goes first in Phase 2 — everyone else depends on tripIntensity.

- [ ] **Step 1: Create worktree and dispatch**

```bash
cd /home/clark/PizzaDeliveryGame
git worktree add ../PizzaDeliveryGame-wt/shader2 -b wt/shader2
cd ../PizzaDeliveryGame-wt/shader2 && npm install
```

- [ ] **Step 2: Dispatch shader agent for Phase 2**

Dispatch via Agent tool with `model: opus`. Full prompt:

```
You are shader, the Shader/VFX agent building DOUGHBOY. This is Phase 2 — Make It Trip.

## Files You Own
- src/tripShader.ts (MODIFY)
- src/sky.ts (MODIFY)
- src/palette.ts (MODIFY if needed)

## Phase 2 Work

### 1. Trip curve driver
In src/tripShader.ts, the vertex shader currently has placeholder comments. Now implement:

Vertex shader modifications:
- Add vertex wobble: displace vertex position by sin(uTime * 2.0 + worldPos.x * 0.5 + worldPos.z * 0.3) * uTripIntensity * 0.3 on X and Z axes
- Add building lean: tilt vertices based on a hash of their world position: lean = sin(worldPos.x * 12.9898 + worldPos.z * 78.233) * uTripIntensity * 0.05 applied as a Z-axis rotation

Fragment shader modifications:
- Palette LUT shift: mix the sampled color toward a vaporwave palette as uTripIntensity rises
  - Target hue shift: toward magenta (mix factor: uTripIntensity * 0.4)
  - Increase saturation by uTripIntensity * 0.3
  - Shift: mix(originalColor, vec3(magenta/cyan tint), uTripIntensity * 0.3)
  - Use a smooth HSV shift — convert RGB→HSV, add hue offset of uTripIntensity * 0.15, increase S, convert back

### 2. Sky gradient
In src/sky.ts, implement update(deliveryProgress):
- deliveryProgress 0.0 (delivery 1) → deep midnight blue (0x0a0a2e)
- deliveryProgress 0.5 → transitioning through dark magenta/violet
- deliveryProgress 1.0 (delivery 7) → full vaporwave sunrise: gradient from cyan at horizon to magenta at zenith to lime at the very top
- Use vertex colors on the sky sphere: color varies by vertex Y position (zenith vs horizon)
- Update vertex colors each time deliveryProgress changes

### 3. Dissolve transition effect
Create a dissolve function that triggers every 3 deliveries:
- Rapidly ramp tripIntensity to 1.0 over 0.5s
- Apply a screen-space white wash (a full-screen quad with additive blending, opacity animating 0→0.8→0)
- After peak (0.3s at full intensity), the city gets regenerated (gameplay triggers this)
- Ease tripIntensity back to its natural level over 1.0s

Add to exports:
```typescript
export function triggerDissolve(uniforms: TripUniforms, onPeak: () => void): void;
```

The onPeak callback is where gameplay will call rebuildCity().

## Rules
- Only modify: src/tripShader.ts, src/sky.ts, src/palette.ts
- Run npx tsc --noEmit before declaring done
- The game must still be playable at tripIntensity = 0 (sober baseline must look normal)
- Commit each logical change separately

## Reference
- MASTERPLAN.md Section 5 (Sky/time of day), Section 6 Phase 2
- Design pillar: "Readable at baseline, wild at peak. Trip effects are additive distortion, never removal of information."
```

- [ ] **Step 3: Wait, verify, merge**

```bash
cd /home/clark/PizzaDeliveryGame-wt/shader2
npx tsc --noEmit
cd /home/clark/PizzaDeliveryGame
git merge wt/shader2 --no-ff -m "Phase 2: merge shader — trip wobble, palette shift, sky gradient, dissolve"
npx tsc --noEmit
git worktree remove ../PizzaDeliveryGame-wt/shader2
git branch -d wt/shader2
```

---

## Task 11: Phase 2, Wave 2b — Dispatch Gameplay + Camera + Audio + UI (parallel)

All depend on shader Phase 2 (now merged).

- [ ] **Step 1: Create all worktrees**

```bash
cd /home/clark/PizzaDeliveryGame
git worktree add ../PizzaDeliveryGame-wt/gameplay2 -b wt/gameplay2
git worktree add ../PizzaDeliveryGame-wt/camera2 -b wt/camera2
git worktree add ../PizzaDeliveryGame-wt/audio2 -b wt/audio2
git worktree add ../PizzaDeliveryGame-wt/ui2 -b wt/ui2
for d in gameplay2 camera2 audio2 ui2; do cd ../PizzaDeliveryGame-wt/$d && npm install; done
```

- [ ] **Step 2: Dispatch all 4 agents in parallel**

**Gameplay Phase 2 prompt:**
```
You are gameplay (Phase 2). Modify src/waypoint.ts to add arrow drift:
- In the update function, add noise-based heading drift: heading += (Math.sin(time * 1.7) * 0.3 + Math.sin(time * 3.1) * 0.2) * tripIntensity * (30 * Math.PI / 180)
- This makes the waypoint arrow lie about direction at high trip — the ONLY gameplay-affecting trip effect

Also modify src/gameLoop.ts:
- Wire dissolve trigger: when deliveryCount hits 3 or 6, call triggerDissolve(uniforms, () => rebuildCity(boot, newSeed))
- Import triggerDissolve from tripShader.ts
- Feed deliveryProgress to uniforms each frame (already stubbed)

Only modify: src/waypoint.ts, src/gameLoop.ts
Run npx tsc --noEmit before done.
```

**Camera Phase 2 prompt:**
```
You are camera (Phase 2). Modify src/camera.ts:
- Read uTripIntensity and apply FOV warp: camera.fov = 70 + tripIntensity * 5
- Call camera.updateProjectionMatrix() when fov changes
- Add wipeout camera shake: on wipeout event, apply random offset to camera position for 0.3s (±0.3m on X/Z), decaying to zero

Only modify: src/camera.ts
Run npx tsc --noEmit before done.
```

**Audio Phase 2 prompt:**
```
You are audio (Phase 2). Modify src/audio.ts:
- Implement setTripIntensity(value): adjust the lo-fi music loop's playback rate from 1.0 (sober) to 0.9 (peak trip) — a 10% pitch drop
- Add a slow flanger effect on the music: delay node with LFO-modulated delay time (0.5-5ms range, 0.3Hz LFO rate), wet/dry mix increases with tripIntensity

Only modify: src/audio.ts
Run npx tsc --noEmit before done.
```

**UI Phase 2 prompt:**
```
You are ui (Phase 2). Modify src/hud.ts:
- Read tripIntensity and apply subtle visual effects to HUD text:
  - At high trip (>0.5): text color shifts slightly toward magenta
  - Text gains a subtle CSS text-shadow glow that intensifies with trip
  - Timer digits occasionally "glitch" — swap two digits for one frame, 5% chance per update at tripIntensity > 0.7

Only modify: src/hud.ts
Run npx tsc --noEmit before done.
```

- [ ] **Step 3: Wait for all, verify, merge in order**

```bash
for branch in gameplay2 camera2 audio2 ui2; do
  cd /home/clark/PizzaDeliveryGame-wt/$branch && npx tsc --noEmit
done
cd /home/clark/PizzaDeliveryGame
git merge wt/gameplay2 --no-ff -m "Phase 2: gameplay — arrow drift, dissolve trigger"
git merge wt/camera2 --no-ff -m "Phase 2: camera — FOV warp, wipeout shake"
git merge wt/audio2 --no-ff -m "Phase 2: audio — music pitch-shift, flanger"
git merge wt/ui2 --no-ff -m "Phase 2: ui — trip-reactive HUD effects"
npx tsc --noEmit && npx vite build
```

- [ ] **Step 4: Clean up all worktrees**

```bash
for d in gameplay2 camera2 audio2 ui2; do
  git worktree remove ../PizzaDeliveryGame-wt/$d
done
git branch -d wt/gameplay2 wt/camera2 wt/audio2 wt/ui2
```

---

## Task 12: Gate 2 — Trip Integration Check

- [ ] **Step 1: Visual smoke test**

```bash
npx vite --host &
```

Gate 2 checklist:
- Play through 7 deliveries
- Trip intensity visibly increases across the run
- Buildings wobble and lean at high trip
- Colors shift toward vaporwave palette
- Sky transitions from midnight blue to vaporwave sunrise
- Waypoint arrow drifts at high trip (but is still usable)
- Dissolve effect fires at delivery 3 and 6 (city regenerates through a white flash)
- Music pitch drops subtly as trip rises
- FOV slightly widens at high trip
- HUD text gets trippy at high intensity

- [ ] **Step 2: Memory check**

Play through a full run (triggers 2 reshuffles). Check browser dev tools Memory tab — heap should be within ±10MB of starting point.

---

## Task 13: Phase 3 — Dispatch Shader + City Engineer (sequential)

- [ ] **Step 1: Shader Phase 3 — window grid shader**

```bash
git worktree add ../PizzaDeliveryGame-wt/shader3 -b wt/shader3
cd ../PizzaDeliveryGame-wt/shader3 && npm install
```

Dispatch shader agent for Phase 3:
```
You are shader (Phase 3 — Make It A Place). Add window grid shader and trip-aware signage material.

In src/tripShader.ts fragment shader:
- Add window grid pattern using world-space UVs
- Tile a window pattern: every 2.5m horizontally, every 3m vertically (STORY_HEIGHT from constants)
- Each "cell" is either lit (warm yellow 0xfff9c4) or dark (wall color)
- Lit/dark determined by hash of floor(worldPos / cellSize): fract(sin(dot(cellCoord, vec2(12.9898, 78.233))) * 43758.5453) > 0.6 means lit
- Windows only appear above ground floor (worldPos.y > 3.0)
- At high trip: lit windows occasionally "flicker" — probability of state change = uTripIntensity * 0.1 per frame

Add a signage material export for city-eng to use on decal quads:
```typescript
export function createSignageMaterial(paletteTexture: THREE.DataTexture): THREE.ShaderMaterial;
```
- Accepts a signage texture (not palette) — simple textured quad with trip color shift applied

Only modify: src/tripShader.ts
Run npx tsc --noEmit before done.
```

Merge, then dispatch city-eng:

- [ ] **Step 2: City Engineer Phase 3 — signage and details**

```bash
git merge wt/shader3 --no-ff -m "Phase 3: shader — window grid, signage material"
git worktree remove ../PizzaDeliveryGame-wt/shader3 && git branch -d wt/shader3
git worktree add ../PizzaDeliveryGame-wt/city-eng3 -b wt/city-eng3
cd ../PizzaDeliveryGame-wt/city-eng3 && npm install
```

Dispatch city-eng for Phase 3:
```
You are city-eng (Phase 3 — Make It A Place). Add signage decals and ground-floor band.

Create src/decals.ts:
- Pre-define 8-12 signage texts: "PIZZA", "LAUNDROMAT", "24HR", "BAR", "BODEGA", "DELI", "PHARMACY", "LIQUOR", "NAIL SALON", "LAUNDRY"
- For each ground-floor building face (lot with road-facing edge):
  - Use lot hash to pick a signage text
  - Create a PlaneGeometry quad (2m × 0.8m) positioned on the building face at Y = 2m
  - Use CanvasTexture to render the text onto the quad (white text on dark background)
  - Position the quad 0.05m in front of the building face

Modify src/buildings.ts:
- After creating building sections, add a ground-floor band: the bottom 3m gets a different palette index (use index 21 — warm commercial tone) vs upper floors
- This means modifying the UV painting loop for the first section's bottom faces

Only create: src/decals.ts
Only modify: src/buildings.ts
Run npx tsc --noEmit before done.
```

- [ ] **Step 3: Merge and verify**

```bash
cd /home/clark/PizzaDeliveryGame
git merge wt/city-eng3 --no-ff -m "Phase 3: city-eng — signage decals, ground-floor band"
npx tsc --noEmit && npx vite build
git worktree remove ../PizzaDeliveryGame-wt/city-eng3 && git branch -d wt/city-eng3
```

---

## Task 14: Phase 4 — Dispatch UI (dialogue system)

- [ ] **Step 1: Create worktree and dispatch**

```bash
git worktree add ../PizzaDeliveryGame-wt/ui4 -b wt/ui4
cd ../PizzaDeliveryGame-wt/ui4 && npm install
```

Dispatch UI agent for Phase 4:
```
You are ui (Phase 4 — Make It Talk). Build the pizza dialogue system.

Create src/dialogue.ts:
```typescript
export interface DialogueSystem {
  update(dt: number, tripIntensity: number): void;
  trigger(type: 'delivery' | 'wipeout' | 'shroom' | 'nearDelivery' | 'idle'): void;
  dispose(): void;
}
export function createDialogueSystem(): DialogueSystem;
```

Create src/pizzaLines.ts with 15 hand-written lines:
```typescript
export interface PizzaLine {
  text: string;
  triggers: Array<'delivery' | 'wipeout' | 'shroom' | 'nearDelivery' | 'idle'>;
  lying?: boolean;
}
export const PIZZA_LINES: PizzaLine[] = [...];
```

Write 15 lines in a deadpan, slightly resentful pizza voice. Examples:
- "You missed the turn. Again." (nearDelivery)
- "I'm getting cold in here." (idle)
- "That's my cheese on the pavement now." (wipeout)
- "Take a left... trust me." (nearDelivery, lying: true — actually wrong direction)

Dialogue rules from MASTERPLAN:
- Min cooldown: 8 seconds between lines
- No repeat within 3-line rolling window
- Priority: wipeout > delivery > shroom > nearDelivery > idle
- Idle triggers after 20s of no other trigger
- At tripIntensity > 0.6: 30% chance of picking a [lying] line

Display: text bubble at bottom-center of screen, DOM element, fades in over 0.2s, stays 3s, fades out over 0.5s. White text on semi-transparent dark background, rounded corners.

Only create: src/dialogue.ts, src/pizzaLines.ts
Modify: src/hud.ts (add dialogue bubble rendering)
Run npx tsc --noEmit before done.
```

- [ ] **Step 2: Merge and verify**

```bash
cd /home/clark/PizzaDeliveryGame
git merge wt/ui4 --no-ff -m "Phase 4: ui — pizza dialogue system, 15 hand-written lines"
npx tsc --noEmit
git worktree remove ../PizzaDeliveryGame-wt/ui4 && git branch -d wt/ui4
```

---

## Task 15: Phase 5, Wave 5a — Dispatch UI + Audio + Camera polish (parallel)

- [ ] **Step 1: Create all worktrees**

```bash
for d in ui5 audio5 camera5; do
  git worktree add ../PizzaDeliveryGame-wt/$d -b wt/$d
  cd ../PizzaDeliveryGame-wt/$d && npm install
done
```

- [ ] **Step 2: Dispatch all 3 agents**

**UI Phase 5:** Polish title screen (scooter idling animation hint, key prompt), score screen (deliveries breakdown, avg time, total), integrate dialogue triggers into game loop.

**Audio Phase 5:** Add voice blip SFX on dialogue, shroom pickup sound, final mix balance. Ensure all SFX volumes are balanced.

**Camera Phase 5:** Damping tuning, test feel at all trip levels, ensure smooth transitions during dissolve.

- [ ] **Step 3: Merge all, final build**

```bash
cd /home/clark/PizzaDeliveryGame
for branch in ui5 audio5 camera5; do
  git merge wt/$branch --no-ff -m "Phase 5: merge $branch — final polish"
done
npx tsc --noEmit && npx vite build
for d in ui5 audio5 camera5; do
  git worktree remove ../PizzaDeliveryGame-wt/$d
done
git branch -d wt/ui5 wt/audio5 wt/camera5
```

---

## Task 16: Gate Final — Definition of Done

Full MASTERPLAN Section 9 checklist:

- [ ] **7 deliveries playable start to finish**
- [ ] **City reshuffles at delivery 3 and 6** (trip intensity does NOT reset across reshuffle)
- [ ] **Trip intensity visibly ramps over the run, peaks at delivery 7**
- [ ] **Pizza speaks at least 4 times per run**
- [ ] **Score screen shows a number**
- [ ] **Pause (Esc) and Restart (R) work**
- [ ] **Loads in desktop browser under 5 seconds**
- [ ] **Holds 60fps at 1080p** (if not, cap at 720p and note it)
- [ ] **Heap returns to baseline ±10MB across 3 reshuffles**
- [ ] **One screenshot that makes someone click**

Final commit:

```bash
git add -A
git commit -m "DOUGHBOY v1 — 7-delivery procedural city pizza delivery roguelite

Ship build. All MASTERPLAN requirements met.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Execution Summary

| Task | Phase | Agents | Parallel? |
|------|-------|--------|-----------|
| 0 | Bootstrap | orchestrator | — |
| 1 | Phase 0 | city-eng | solo |
| 2 | Gate 0 | QA | — |
| 3 | Phase 1 W1a | vehicle + shader | yes |
| 4 | Phase 1 verify | QA mini-gate | — |
| 5 | Phase 1 W1b | camera + audio | yes |
| 6 | Phase 1 verify | QA | — |
| 7 | Phase 1 W1c | gameplay | solo |
| 8 | Phase 1 W1d | ui | solo |
| 9 | Gate 1 | integration + QA | — |
| 10 | Phase 2 W2a | shader | solo |
| 11 | Phase 2 W2b | gameplay + camera + audio + ui | yes (4 parallel) |
| 12 | Gate 2 | QA | — |
| 13 | Phase 3 | shader → city-eng | sequential |
| 14 | Phase 4 | ui | solo |
| 15 | Phase 5 | ui + audio + camera | yes |
| 16 | Gate Final | QA | — |

**Total agent dispatches:** ~20 (some agents dispatched multiple times for different phases)
**Maximum parallelism:** 4 agents in Phase 2 Wave 2b
**Critical path:** city-eng → vehicle → camera → gameplay → (all subsequent)
