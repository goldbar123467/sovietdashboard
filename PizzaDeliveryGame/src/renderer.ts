/* ------------------------------------------------------------------ */
/*  Scene bootstrap — renderer, lighting, city, sky, camera            */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { buildCity, disposeCity } from './city';
import type { CityResult } from './city';
import { createSky } from './sky';
import { createChaseCamera } from './camera';
import type { TripUniforms } from './tripShader';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BootResult {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  city: CityResult;
  uniforms: TripUniforms;
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

/**
 * Creates the full scene: WebGL renderer, scene graph, lights, city,
 * sky dome, and chase camera. Returns everything the game loop needs.
 */
export function bootScene(seed: number): BootResult {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(50, 100, 50);
  scene.add(sun);

  // City
  const city = buildCity(seed);
  scene.add(city.group);

  // Sky dome
  const sky = createSky();
  scene.add(sky.mesh);

  // Camera
  const camera = createChaseCamera(renderer);

  // Uniforms from the singleton palette (shared across rebuilds)
  const uniforms = city.palette.uniforms;

  return { scene, camera, renderer, city, uniforms };
}

/* ------------------------------------------------------------------ */
/*  Rebuild                                                            */
/* ------------------------------------------------------------------ */

/**
 * Tears down the current city and builds a new one from the given seed.
 * The palette (and its uniforms) are singletons so they persist across
 * rebuilds — only geometry is replaced.
 */
export function rebuildCity(boot: BootResult, newSeed: number): void {
  disposeCity(boot.city.group);

  const newCity = buildCity(newSeed);
  boot.scene.add(newCity.group);

  // Mutate in place so all callers see the updated city
  boot.city = newCity;
}
