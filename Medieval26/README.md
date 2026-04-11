# Tournament House

Medieval jousting management game. Think Football Manager but you run a 13th-century English jousting house. Built with Three.js + TypeScript, deployed on Vercel.

## Play

Select tournaments on the parchment map of England, travel your knights across the realm, joust in a 3D tiltyard, and manage a 180-day season. You can't attend every tournament — choosing which to skip is the game.

## Tech Stack

| Layer | Tech |
|-------|------|
| Language | TypeScript (strict) |
| 3D Engine | Three.js 0.170.0 |
| Build | Vite 6 |
| Styling | Vanilla CSS |
| Deployment | Vercel (static) |
| Framework | None |

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview production build
```

---

## Project Metrics

### Lines of Code

| File | Lines | Purpose |
|------|------:|---------|
| `src/style.css` | 474 | All styles — panel, map, parchment, summary |
| `src/map.ts` | 330 | SVG England map, markers, tooltips, detail panel |
| `src/animation.ts` | 250 | Joust state machine, fragments, impact sound |
| `src/season.ts` | 190 | Travel, missed tournaments, season end, view switching |
| `src/main.ts` | 130 | Entry point, event wiring, animate loop |
| `src/data.ts` | 125 | PRNG, name tables, colors, knight/tournament factories |
| `src/scene/knight3d.ts` | 119 | Horse + rider 3D model construction |
| `src/scene/tiltyard.ts` | 115 | Ground, lane, barrier, stands, banners |
| `src/types.ts` | 89 | Knight, Tournament, GameState, KnightGroup |
| `src/ui.ts` | 86 | Panel rendering — roster, opponent, match log |
| `index.html` | 85 | HTML shell (no inline JS/CSS) |
| `src/simulation.ts` | 69 | classifyHit, simulateJoust (deterministic) |
| `src/scene/setup.ts` | 54 | Renderer, camera, lighting, OrbitControls |
| `src/state.ts` | 36 | Mutable game state + initialization |
| `src/debug.ts` | 31 | `window.render_game_to_text()` |

**Totals:**

| Category | Lines |
|----------|------:|
| TypeScript | 1,624 |
| CSS | 474 |
| HTML | 85 |
| Config (vite, tsconfig, vercel, package.json) | 49 |
| **Total source** | **2,232** |

### File Count

| Category | Count |
|----------|------:|
| TypeScript modules | 14 |
| CSS files | 1 |
| HTML files | 1 |
| Config files | 4 |
| **Total tracked files** | **21** |

### Build Output

| Asset | Size | Gzipped |
|-------|-----:|--------:|
| `index.html` | 4.3 KB | 1.2 KB |
| `index-*.css` | 9.2 KB | 2.4 KB |
| `index-*.js` | 520 KB | 133 KB |
| **Total** | **533 KB** | **137 KB** |

> JS bundle is 95% Three.js. Game logic is ~30KB before minification.

### Architecture

```
src/
├── main.ts              ← entry point, event wiring, animate loop
├── types.ts             ← shared interfaces (Knight, Tournament, GameState)
├── data.ts              ← PRNG, name tables, color palettes, factories
├── state.ts             ← mutable game state singleton
├── simulation.ts        ← deterministic joust engine (6 rand() calls per joust)
├── animation.ts         ← charge → impact → result → return state machine
├── season.ts            ← travel, calendar, missed detection, season summary
├── map.ts               ← procedural SVG map of England
├── ui.ts                ← left panel rendering
├── debug.ts             ← console debug output
├── style.css            ← all styles
└── scene/
    ├── setup.ts         ← Three.js renderer, camera, lighting
    ├── tiltyard.ts      ← static 3D environment (23 meshes)
    └── knight3d.ts      ← horse + rider model (17 meshes per knight)
```

**Dependency flow** (acyclic):
```
types ← data ← state ← simulation
                  ↑
scene/setup ← scene/tiltyard
          ↑← scene/knight3d
                  ↑
              ui ← map ← season ← animation
                                      ↑
                                   main.ts (wires callbacks)
```

### Module Complexity

| Module | Imports | Exports | Role |
|--------|--------:|--------:|------|
| `main.ts` | 12 | 0 | Orchestrator — wires everything |
| `season.ts` | 8 | 8 | Hub — touches map, UI, scene, data |
| `animation.ts` | 4 | 5 | Isolated — accepts callback to avoid cycles |
| `map.ts` | 4 | 3 | Leaf — reads state, calls season for validation |
| `ui.ts` | 3 | 1 | Leaf — pure rendering |
| `data.ts` | 1 | 14 | Foundation — depended on by everything |
| `types.ts` | 1 | 9 | Foundation — type-only, no runtime |
| `simulation.ts` | 2 | 1 | Isolated — pure function, deterministic |

### Game Content

| Content | Count |
|---------|------:|
| First names pool | 18 |
| Epithets pool | 16 |
| Possible knight names | 288 (18 × 16) |
| Heraldic color sets | 12 (6 player, 6 opponent) |
| Tournament locations | 6 |
| 3D meshes per tiltyard | 23 |
| 3D meshes per knight | 17 |
| Total static 3D meshes | 57 (23 + 17×2) |
| Animation phases | 5 (idle, charge, impact, result, return) |
| Hit classifications | 4 (miss, glance, solid, shatter) |
| PRNG seed | 42 |
| PRNG calls per joust | 6 (deterministic) |
| Season length | 180 days |
| Travel cost formula | `travelDays × 5` marks |

### Game Systems

| System | Status |
|--------|--------|
| 3D tiltyard scene | Complete |
| Mounted knight models | Complete |
| Joust simulation (deterministic) | Complete |
| Joust animation (charge/impact/result/return) | Complete |
| Impact sound (Web Audio synthesis) | Complete |
| Camera shake on impact | Complete |
| Lance shatter fragments (physics) | Complete |
| Unhorse tilt animation | Complete |
| Knight stat blocks (SKL/STR/STA/REP) | Complete |
| Knight selection and W/L/D tracking | Complete |
| Stamina drain and recovery | Complete |
| Parchment map of England (SVG) | Complete |
| Tournament markers with hover tooltips | Complete |
| Tournament detail panel | Complete |
| Travel system with calendar advance | Complete |
| Missed tournament detection | Complete |
| Season calendar (180 days) | Complete |
| Season summary screen | Complete |
| Multi-season progression | Complete |
| Treasury (marks) economy | Complete |
| Prestige/renown tracking | Complete |
| Map ↔ tiltyard view transitions | Complete |
| Match log with tournament context | Complete |
| Training / injuries / scouting | Not started |
| Multiple opponents per tournament | Not started |
| Rival AI houses | Not started |
| Persistence (localStorage) | Not started |
| Mobile responsive layout | Not started |

---

Built with [Claude Code](https://claude.ai/claude-code)
