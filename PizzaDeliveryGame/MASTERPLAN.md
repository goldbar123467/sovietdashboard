# MASTERPLAN.md — DOUGHBOY

> Procedural city pizza delivery roguelite. The map shifts because you're tripping. Three.js, desktop browser, jam scope.

---

## 1. Pitch

Pizza delivery scooter driver, mildly dosed, one shift before sunrise. Deliver 7 pizzas across a city that breathes, leans, and occasionally rearranges itself behind your back. The pizza in the box talks to you — sometimes helpfully. Score your run. New city next time.

---

## 2. Design Pillars

1. **The trip is the hook, not the obstacle.** Visuals lie freely. Gameplay lies twice, max.
2. **Soft fails only.** Cold pizza = half score, keep driving. Hard fail reserved for scooter wipeout.
3. **One mechanic, layered deeply.** Drive → deliver → repeat. Everything else is texture.
4. **Readable at baseline, wild at peak.** A sober player must always be able to navigate. Trip effects are *additive distortion*, never *removal of information*.

---

## 3. Current State

- ✅ Procedural city generator, seeded
- ✅ Buildings as UV-shaded primitives with palette texture
- ✅ Math/shaders working
- ❌ No player, camera, gameplay, UI, audio
- ❌ Buildings have no surface detail (windows, signage, doors)

The world exists, nothing happens in it yet. Inverted from how most jam games die.

---

## 4. Locked Decisions

| System | Decision |
|---|---|
| Vehicle | Vespa-shape low-poly scooter, leans into turns |
| Camera | Third-person low chase cam |
| Run length | 7 deliveries |
| Regen cadence | City reshuffles every 3 deliveries (dissolve moment) |
| Fail model | Soft (cold pizza); hard only on wipeout |
| Trip curve | Sine wave, rising amplitude, peak on delivery 7 |
| Trip-affecting gameplay | Waypoint arrow drifts 15–30° at high trip (only one effect — keep it tight) |
| Pickup | Shrooms only — +trip, +score multiplier |
| Pizza | Talks. Helpful at low trip, lying at high trip. |
| Art | Adult Swim flat baseline → vaporwave palette shift at peak |
| Audio | One lo-fi loop, pitch-shifts down 5–10% as trip rises, slow flanger |
| Platform | Desktop browser only |
| Audience | Jam judges + itch randos. Keep the framing. |

---

## 5. Numeric Spec (starting values — tune from here, don't invent on Day 9)

### City
- **Grid:** orthogonal, **24×24 tiles** (your generator's `DEFAULT_GRID_WIDTH` supports this; the 18×18 default is too small — 8–12 tile deliveries become 8–12 second straight shots)
- **Tile size:** 11.37m (codebase default — keep it)
- **Total playable area:** ~273m × 273m
- **Road width:** per existing generator
- **Building height:** 8–40m, hash-driven (verify at street level Day 0 — may feel oppressive from chase cam)
- **Reshuffle strategy:** **full regen** (new seed, everything changes including roads). Pipeline is strict-sequential; partial regen would require splitting steps 1–2 from 3–9, not worth the refactor. Lean into the disorientation — it's the premise.
- **Target delivery time:** 45–75 seconds → 7 deliveries = ~7 minute run

### Scooter (starting values — tune by feel)
- **Top speed:** 12 m/s
- **Acceleration:** 8 m/s²
- **Brake deceleration:** 14 m/s² (hard stop, no reverse)
- **Turn rate:** 90°/s at full speed, 140°/s at low speed (tighter at slow speeds, like a real scooter)
- **Friction (coast):** 2 m/s² deceleration
- **Lean max:** 25° at full turn rate
- **Lean recovery:** 4°/frame eased

### Input
- **W:** accelerate
- **S:** brake (hard stop, **no reverse**)
- **A / D:** turn (rebind existing debug overlay from `D` to **`` ` ``** or `F1`)
- **Esc:** pause
- **R:** restart to title (full reset: score, deliveries, trip intensity, city). Rebind existing dev-regen from `R` to **`F5`** or **`G`**.
- **No handbrake, no boost, no horn.**

### Camera
- **FOV:** 70°
- **Distance behind scooter:** 6m
- **Height:** 2.5m
- **Look-ahead:** 3m forward on the scooter's heading
- **Position damping:** 0.12 (lerp factor per frame at 60fps)
- **Rotation damping:** 0.15
- **No camera shake except wipeout**

### Delivery markers
- **Placement uses the existing grid** — find road cells adjacent to lot cells, no A* needed
- **First delivery:** 12–16 tiles from pizza shop (Manhattan distance) — at 11.37m tile, that's 136–182m, 11–15s straight-line
- **Each subsequent delivery:** previous marker becomes new spawn point; next marker is 10–16 tiles away
- **Reachability:** marker always spawns on a road cell adjacent to a lot, never inside building geometry
- **Trigger radius:** 4m

### Delivery beat (the 2-second moment, fully specified)
1. Scooter enters 4m radius of marker
2. Auto-deliver (no key press — keep hands on controls)
3. Chime SFX (200ms, rising third)
4. Score floater pops above marker: `+{score}` in palette accent color, floats up 2m over 1.2s, fades
5. Pizza voice line fires (delivery-tagged line from bank)
6. Next marker spawns (or run-end screen if delivery 7)
7. Waypoint arrow swings to new heading over 0.4s eased rotation
8. Run counter ticks (1/7 → 2/7)

### Scoring
```
delivery_score = 100
              × time_bonus            // 2.0 if under 30s, scales linearly to 0.5 at 90s
              × (1 + 0.25 × shrooms)  // shrooms collected this delivery
              × (cold ? 0.5 : 1.0)    // cold = over 75s

run_total = sum(deliveries) × wipeout_penalty
wipeout_penalty = max(0.5, 1.0 - 0.05 × wipeouts)
```
Theoretical max single delivery (under 30s, 4 shrooms, hot): `100 × 2.0 × 2.0 × 1.0 = 400`
Floor (cold, no shrooms, over 90s): `100 × 0.5 × 1.0 × 0.5 = 25`

### Shrooms
- **Spawn count:** 6 per city (refreshes on reshuffle)
- **Placement:** road cells **off the Manhattan-shortest grid path** between current spawn and delivery marker (trivial on the existing grid — no A* needed). At least 1 tile of detour cost. Forces risk/reward.
- **Visibility:** glowing, visible from adjacent road, hash-rotated in place
- **Effect:** +0.15 to trip intensity (capped at 1.0), +1 to delivery's shroom multiplier

### Collision
- **Use lot AABBs from the lots step**, not building meshes. Cheaper, and the data already exists.
- Sphere-vs-AABB against the lot list. Scooter collider radius ~0.6m.

### Dialogue cadence
- **Min cooldown between lines:** 8 seconds
- **No repeat within 3 lines** (rolling window)
- **Priority order when triggers collide:** wipeout > delivery > shroom > pickup > near-delivery > idle
- **Idle trigger:** fires only after 20s of no other trigger

### Sky / time of day (free trip visual)
- Starts deep midnight blue at delivery 1
- Hue shifts toward magenta/violet across the run
- Hits full vaporwave sunrise (cyan → magenta → lime gradient) at delivery 7
- Driven by `deliveryProgress` (0.0–1.0), independent of `tripIntensity` — they layer

---

## 6. Build Order

### Phase 0 — Codebase prep + feasibility (Day 0, half day)

Don't start Phase 1 until these all pass. Each one is a half-hour to two hours; together they take a morning. They prevent days of pain later.

- [ ] Bump grid to 24×24 in `constants.ts`. Confirm generator runs.
- [ ] Rip out OrbitControls. Drop in a placeholder cube + minimal chase cam (FOV 70, 6m back, 2.5m up). Drive the cube around with WASD. **Does the city feel right at street level?** Buildings might feel oppressive at 8–40m — if so, lower the ceiling to 6–25m before Phase 1.
- [ ] Rebind debug overlay from `D` → `` ` `` (backtick). Rebind dev-regen from `R` → `G`. Free WASD and R for gameplay.
- [ ] Profile heap across 3 reshuffles. Trigger `dispose()` + regen 3x via `G`. Heap should return to baseline ±10MB. **If it leaks, fix dispose before anything else** — reshuffle is built into the core loop and a leak kills runs at delivery 5.
- [ ] Profile fps on weakest target hardware (M1 / Iris baseline). Empty city (no scooter, no shaders, no particles). If under 50fps, instance trees/lights/benches/signs *now* before adding load. The InstancedMesh refactor is no longer optional.
- [ ] Confirm lot AABBs are accessible from outside the generator (collision will need them). If buried, expose.

**Gate:** all six pass → Phase 1.

### Phase 1 — Make it a game (Days 1–2)

- [ ] Scooter controller per Section 5 spec (top speed, accel, brake, turn rate, lean)
- [ ] Third-person chase camera per Section 5 spec (FOV, distance, height, look-ahead, damping)
- [ ] Input bindings per Section 5 (W/S/A/D, Esc, R — no reverse)
- [ ] Collision response: <6 m/s = stop + scrape SFX; ≥6 m/s = wipeout (cam shake, 1.5s lockout); glancing hits (<30° incidence) always scrape
- [ ] Wipeout respawn: snap to nearest road centerline, full stop, 0.5s fade
- [ ] Pizza shop anchor on tile (0,0), procgen skips it, player spawns there facing north
- [ ] Pickup marker + delivery marker per Section 5 placement rules
- [ ] Waypoint arrow: world-space billboard above scooter, points to delivery marker
- [ ] Delivery beat per Section 5 (auto-deliver, chime, score floater, pizza line, next marker, arrow swing)
- [ ] Run counter (1/7) + per-delivery timer
- [ ] Scoring formula per Section 5 (computed per delivery, accumulated)
- [ ] Pause (Esc) and Restart (R)
- [ ] Scooter audio: idle loop + accel sample, pitch tied to throttle (0.8x → 1.4x)

**Gate:** can you play 7 deliveries end-to-end without crashing? If yes → Phase 2.

### Phase 2 — Make it trip (Days 3–4)

- [ ] `uTripIntensity` uniform (0–1), global, eased
- [ ] Trip curve driver: sine wave, amplitude scales with delivery count, **independent of reshuffle**. Trip keeps climbing through the dissolve — reshuffle is a *visual* event (the city melts and reforms), trip intensity does not reset. Otherwise the dissolves at delivery 3 and 6 dump intensity right before the climax.
- [ ] Vertex wobble on building geometry: `sin(time + worldPos) * intensity`
- [ ] Palette LUT shift toward magenta/cyan/lime as intensity rises
- [ ] Sky color cycling (slow hue rotation)
- [ ] Building lean (slight Z-tilt that varies by worldPos hash)
- [ ] Waypoint arrow drift: `target_heading += noise(time) * intensity * 30°`
- [ ] Dissolve transition every 3 deliveries: intensity → 1.0, screen wash, regen city, ease back

> **CUT:** "streets rearrange behind player" — too expensive (chunk regen, seam hiding, memory churn) for a payoff the player can't see. Arrow drift carries the gameplay-affecting trip load alone.

**Gate:** does it look like the screenshot you'd post to sell the game?

### Phase 3 — Make it a place (Days 5–6)

Asset pass on existing buildings. **Don't model individual buildings — add detail at shader/decal/instance level so procgen still drives everything.**

**Build in this order. Stop whenever Day 6 ends. Everything below the line you reach is cut.**

- [ ] **Signage decals** *(highest ROI — buy this first)*: pre-bake 8–12 textures (PIZZA, LAUNDROMAT, 24HR, BAR, BODEGA, etc.). Hash-spawn one per ground-floor face. Single decal = "this is a city." Half day.
- [ ] **Ground-floor band**: bottom 2–3m gets different palette index → reads as storefronts vs. upper floors. 2 hours.
- [ ] **Window grid shader**: tile window pattern across faces using world UVs. Hash-based lit/unlit per cell. Looks incredible but the unknown — budget a full day, expect overrun.
- [ ] **Pizza shop**: one hand-authored hero building with glowing sign. Only non-procedural building. Half day.
- [ ] **Roof clutter**: `InstancedMesh` of AC units, water tanks, antennas. Hash-scattered.
- [ ] **Awnings**: extruded quads above ground-floor signage, palette-tinted.
- [ ] **Street props**: instanced lamp posts, trash bags, hydrants.

> **Phase 3 fallback:** if you only ship signage + ground-floor band, the city still reads. If you only ship the window shader and it eats the budget, you ship a featureless city. That's why signage goes first.

### Phase 4 — Make it talk (Day 7)

> **Pre-work, Day 1:** open `pizza-lines.md` and dump 15 lines into it whenever your brain is stuck on something else. Single tier, no trip-level branching. **Do not save personality writing for the day before ship.**

- [ ] Dialogue system: text bubble, bottom-center HUD
- [ ] Line bank: ~15 lines, single tier (one voice across the whole run)
- [ ] Triggers: on pickup, on near-delivery, on idle, on wipeout, on shroom grab
- [ ] At high trip: 30% chance pizza picks a line tagged `[lying]` (3–4 of the 15) that gives wrong directional advice
- [ ] Voice: deadpan, slightly resentful. **Write by hand. No LLM lines.** This is the personality layer.

### Phase 5 — Make it a build (Days 8–9)

- [ ] Title screen (scooter idling, "Press any key")
- [ ] End-of-run score screen (deliveries, avg time, shroom multiplier, total)
- [ ] Lo-fi loop integrated, pitch-shift hooked to trip uniform
- [ ] SFX: scooter idle, accel, delivery chime, wipeout, pizza voice blip
- [ ] Itch page copy + screenshots + 30s gif
- [ ] Vercel or itch HTML5 deploy

### Phase 6 — Cut list (in drop order)

1. Roof clutter, awnings, street props (Phase 3 tail — already ordered to be cut bottom-up)
2. Score breakdown → just total
3. Multi-tier pizza dialogue → one tier
4. Wipeout cam shake → instant fade respawn
5. Audio pitch-shift on trip → keep audio static

**Do not cut:** trip uniform, palette shift, pizza talks, scooter lean, signage decals, scooter SFX. Those *are* the game.

---

## 7. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Reshuffle memory leak crashes runs at delivery 5+** | High | Verify `dispose()` in Phase 0. Profile heap across 3 reshuffles before any other work. |
| **City feels wrong at street level (oppressive buildings, too-narrow streets)** | Medium | Phase 0 placeholder-cube test. Lower building ceiling if needed. |
| Scooter physics rabbit hole | High | Kinematic only, no real physics. Half day max. |
| Trip effects make game unplayable | Medium | Hard cap of 2 gameplay-affecting effects. Test sober. |
| Asset pass eats the jam | High | Shader-level detail, InstancedMesh for clutter. No per-building modeling. |
| Pizza dialogue feels generic | Medium | Write by hand. |
| Audio detuning sounds broken | Low | Test early, cap at -10%. |

---

## 8. Open Questions

1. **Jam name + deadline?** Day counts assume ~9 working days. Compress or expand.
2. **Existing repo structure** — is city gen its own module, or tangled with the render loop? Affects how cleanly `uTripIntensity` plugs in.
3. **Scooter art** — model it, grab CC0 Vespa, or fake it with primitives? (Recommendation: primitives. Capsule + two cylinders + box for the pizza warmer. Reads instantly.)

> **Title: DOUGHBOY.** Locked. Don't reopen.

---

## 9. Definition of Done (v1 ship)

- 7 deliveries playable start to finish
- City reshuffles at delivery 3 and 6 (trip intensity does not reset across reshuffle)
- Trip intensity visibly ramps over the run, peaks at delivery 7
- Pizza speaks at least 4 times per run
- Score screen shows a number
- Pause and Restart keys work
- Loads in desktop browser under 5 seconds
- **Holds 60fps at 1080p on integrated graphics (Intel Iris / Apple M1 baseline).** If it can't, cap render resolution to 1280×720 and state it on the itch page.
- **Heap returns to baseline (±10MB) across 3 reshuffles.** No leaks.
- One screenshot that makes someone click

Everything else is post-jam.
