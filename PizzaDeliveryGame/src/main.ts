/* ------------------------------------------------------------------ */
/*  DOUGHBOY — main entry point                                        */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { bootScene, rebuildCity } from './renderer';
import { createScooter } from './scooter';
import { createInputHandler } from './input';
import { updateChaseCamera } from './camera';
import { createDebugOverlay } from './debug';
import { disposeCity } from './city';
import { gridToWorld } from './grid';

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

let seed = Math.floor(Math.random() * 100000);
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
/*  Debug overlay                                                      */
/* ------------------------------------------------------------------ */

let debugOverlay = createDebugOverlay(boot.city.grid, boot.city.blocks, boot.city.lots);
debugOverlay.visible = false;
scene.add(debugOverlay);

/* ------------------------------------------------------------------ */
/*  HUD (seed display — UI agent will replace)                         */
/* ------------------------------------------------------------------ */

const seedEl = document.getElementById('seed-display')!;
seedEl.textContent = `Seed: ${seed}`;

/* ------------------------------------------------------------------ */
/*  Keybinds                                                           */
/* ------------------------------------------------------------------ */

window.addEventListener('keydown', (e) => {
  // Toggle debug overlay
  if (e.code === 'Backquote') {
    debugOverlay.visible = !debugOverlay.visible;
  }

  // Regenerate city with new seed
  if (e.code === 'KeyG') {
    seed = Math.floor(Math.random() * 100000);

    // Remove scooter and debug overlay from scene
    scooterResult.mesh.removeFromParent();
    disposeCity(debugOverlay as unknown as THREE.Group);
    debugOverlay.removeFromParent();

    // Rebuild city
    rebuildCity(boot, seed);

    // Reset scooter to new grid origin
    const newSpawn = gridToWorld(boot.city.grid, 0, 0);
    scooterResult.state.position.set(newSpawn.wx, 0, newSpawn.wz);
    scooterResult.state.speed = 0;
    scooterResult.state.heading = 0;
    scene.add(scooterResult.mesh);

    // Rebuild debug overlay
    debugOverlay = createDebugOverlay(boot.city.grid, boot.city.blocks, boot.city.lots);
    debugOverlay.visible = false;
    scene.add(debugOverlay);

    seedEl.textContent = `Seed: ${seed}`;
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
/*  Game loop                                                          */
/* ------------------------------------------------------------------ */

let lastTime = performance.now();

(function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = now;

  scooterResult.update(dt, input, boot.city.lots);
  updateChaseCamera(camera, scooterResult.state, dt);
  uniforms.uTime.value = now / 1000;

  renderer.render(scene, camera);
})();
