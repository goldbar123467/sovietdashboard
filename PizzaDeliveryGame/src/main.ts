/* ------------------------------------------------------------------ */
/*  DOUGHBOY — main entry point (Phase 1 integration)                  */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { bootScene } from './renderer';
import { createScooter } from './scooter';
import { createInputHandler } from './input';
import { updateChaseCamera, triggerCameraShake } from './camera';
import { createDebugOverlay } from './debug';
import { gridToWorld } from './grid';
import { createGameLoop } from './gameLoop';
import { createHUD } from './hud';
import { createAudioManager } from './audio';

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

const seed = Math.floor(Math.random() * 100000);
const boot = bootScene(seed);
const { scene, camera, renderer, uniforms } = boot;

/* ------------------------------------------------------------------ */
/*  Scooter — spawns at grid cell (0,0), a perimeter road cell         */
/* ------------------------------------------------------------------ */

const spawnWorld = gridToWorld(boot.city.grid, 0, 0);
const scooterResult = createScooter(spawnWorld.wx, spawnWorld.wz, boot.city.grid);
scene.add(scooterResult.mesh);

/* ------------------------------------------------------------------ */
/*  Input                                                              */
/* ------------------------------------------------------------------ */

const { state: input } = createInputHandler();

/* ------------------------------------------------------------------ */
/*  Audio                                                              */
/* ------------------------------------------------------------------ */

const audioManager = createAudioManager();

/* ------------------------------------------------------------------ */
/*  Game loop                                                          */
/* ------------------------------------------------------------------ */

const gameLoop = createGameLoop();
gameLoop.init(boot, scooterResult.state, scooterResult.mesh, scooterResult.events, audioManager);

/* ------------------------------------------------------------------ */
/*  HUD                                                                */
/* ------------------------------------------------------------------ */

const hud = createHUD();
hud.showTitleScreen(true);

// Wire game events to HUD + camera effects
gameLoop.onEvent = (event) => {
  hud.onEvent(event, camera, renderer);
  if (event.type === 'wipeout') triggerCameraShake();
};

/* ------------------------------------------------------------------ */
/*  Debug overlay                                                      */
/* ------------------------------------------------------------------ */

let debugOverlay = createDebugOverlay(boot.city.grid, boot.city.blocks, boot.city.lots);
debugOverlay.visible = false;
scene.add(debugOverlay);

/* ------------------------------------------------------------------ */
/*  Keybinds (debug only — gameplay keys handled by input system)      */
/* ------------------------------------------------------------------ */

window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') {
    debugOverlay.visible = !debugOverlay.visible;
  }
});

/* ------------------------------------------------------------------ */
/*  Resize                                                             */
/* ------------------------------------------------------------------ */

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ------------------------------------------------------------------ */
/*  Hide old seed display (HUD replaces it)                            */
/* ------------------------------------------------------------------ */

const seedEl = document.getElementById('seed-display');
if (seedEl) seedEl.style.display = 'none';

/* ------------------------------------------------------------------ */
/*  Animation loop                                                     */
/* ------------------------------------------------------------------ */

let lastTime = performance.now();

(function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = now;

  // Update game state machine (deliveries, shrooms, scoring, state transitions)
  gameLoop.update(dt, input);

  // Only advance scooter physics while actively playing
  if (gameLoop.state === 'playing') {
    scooterResult.update(dt, input, boot.city.lots);
  }

  // Camera follows scooter regardless of state
  updateChaseCamera(camera, scooterResult.state, dt, gameLoop.tripIntensity);

  // Update HUD every frame (handles visibility per game state)
  hud.update(gameLoop);

  // Shader time uniform
  uniforms.uTime.value = now / 1000;

  renderer.render(scene, camera);
})();
