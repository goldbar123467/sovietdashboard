import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA_START_Y, CAMERA_PITCH_DEG, DEBUG_KEY } from './constants';
import { createDebugOverlay } from './debug';
import { buildCity, disposeCity } from './city';
import type { CityResult } from './city';

/* Scene, camera, renderer, controls, lights ----------------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
const pitchRad = (CAMERA_PITCH_DEG * Math.PI) / 180;
camera.position.set(0, CAMERA_START_Y, CAMERA_START_Y / Math.tan(pitchRad));
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(50, 100, 50);
scene.add(sun);

/* City generation ------------------------------------------------- */
const seedEl = document.getElementById('seed-display')!;
let seed = Math.floor(Math.random() * 100000);
let city: CityResult;
let debugOverlay: THREE.Group;

function rebuild(): void {
  // Tear down previous city + debug
  if (city) { disposeCity(city.group); }
  if (debugOverlay) { disposeCity(debugOverlay as unknown as THREE.Group); debugOverlay.removeFromParent(); }

  city = buildCity(seed);
  scene.add(city.group);

  debugOverlay = createDebugOverlay(city.grid, city.blocks, city.lots);
  debugOverlay.visible = false;
  scene.add(debugOverlay);

  seedEl.textContent = `Seed: ${seed} | \`=debug | G=rebuild`;
}

rebuild();

/* Input ----------------------------------------------------------- */
window.addEventListener('keydown', (e) => {
  if (e.code === DEBUG_KEY) {
    debugOverlay.visible = !debugOverlay.visible;
  }
  if (e.code === 'KeyG') {
    seed = Math.floor(Math.random() * 100000);
    rebuild();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* Render loop ----------------------------------------------------- */
(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();
