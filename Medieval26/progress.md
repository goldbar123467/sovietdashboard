# Tournament House - Progress

## Concept
Football Manager set in a 13th-century tournament house. Scout knights, train them, enter jousts and melees across the European circuit, manage rivalries and reputations, watch 3D tiltyard action.

## Milestone 1: Jousting Prototype
- [x] Seeded PRNG (mulberry32, seed=42)
- [x] Knight data model (skill, strength, reputation, stamina, wins/losses)
- [x] Name generator from medieval name/epithet tables
- [x] 3 player knights + 3 AI opponent knights
- [x] Joust simulation engine (hit classification: miss/glance/solid/shatter)
- [x] 3D tiltyard scene (lane, tilt barrier, fences, stands, canopy, banners)
- [x] Primitive-geometry knight models (horse + rider + lance + shield)
- [x] Charge animation with galloping legs
- [x] Impact + aftermath animation with loser tilt-back
- [x] Camera movement during joust (lerp to side view)
- [x] Management panel (left sidebar, Football Manager style)
- [x] Knight selection (click to pick your champion)
- [x] Opponent display with stats
- [x] Match log with narrative text
- [x] Stamina management (recovery for benched knights)
- [x] `window.render_game_to_text()` for Playwright testing
- [ ] Lance shatter particle effect
- [ ] Sound effects
- [ ] Scouting (hidden opponent stats)
- [ ] Tournament circuit / multiple events
- [ ] Melee mode
- [ ] Knight hiring / silver economy

## Tech
- Three.js 0.170.0 via CDN import map
- Vanilla HTML/JS, single file, no build tools
- Local server: `python3 -m http.server 8080`
