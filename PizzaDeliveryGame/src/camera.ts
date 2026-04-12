/* ------------------------------------------------------------------ */
/*  Chase camera — follows scooter with damped position and look-at    */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { ScooterState } from './scooter';

/* ------------------------------------------------------------------ */
/*  Constants (LOCKED — from MASTERPLAN Section 5)                     */
/* ------------------------------------------------------------------ */

const FOV = 70;
const NEAR = 0.1;
const FAR = 2000;
const DISTANCE_BEHIND = 6;   // meters behind scooter
const HEIGHT_ABOVE = 2.5;    // meters above ground
const LOOK_AHEAD = 3;        // meters forward on scooter heading
const LOOK_HEIGHT = 0.8;     // y-level of look-at target
const POS_DAMPING = 0.12;    // lerp factor at 60 fps
const ROT_DAMPING = 0.15;    // lerp factor at 60 fps

/* ------------------------------------------------------------------ */
/*  Module-level smoothed look-at target                               */
/* ------------------------------------------------------------------ */

const _smoothedTarget = new THREE.Vector3(0, LOOK_HEIGHT, 0);
let _initialized = false;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Creates a PerspectiveCamera configured for chase-cam use.
 * The aspect ratio is derived from the current window size.
 */
export function createChaseCamera(
  _renderer: THREE.WebGLRenderer,
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    FOV,
    window.innerWidth / window.innerHeight,
    NEAR,
    FAR,
  );
  return camera;
}

/**
 * Updates the chase camera to follow the scooter with frame-independent
 * position and rotation damping.
 *
 * Position damping: camera eases toward an ideal point 6 m behind the
 * scooter at 2.5 m height.
 *
 * Rotation damping: a smoothed look-at target eases toward a point 3 m
 * ahead of the scooter at 0.8 m height.
 */
export function updateChaseCamera(
  camera: THREE.PerspectiveCamera,
  scooter: ScooterState,
  dt: number,
): void {
  // Ideal camera position: behind and above the scooter
  const idealX = scooter.position.x - Math.sin(scooter.heading) * DISTANCE_BEHIND;
  const idealZ = scooter.position.z - Math.cos(scooter.heading) * DISTANCE_BEHIND;
  const idealY = HEIGHT_ABOVE;

  // Ideal look-at target: ahead of the scooter
  const lookX = scooter.position.x + Math.sin(scooter.heading) * LOOK_AHEAD;
  const lookZ = scooter.position.z + Math.cos(scooter.heading) * LOOK_AHEAD;
  const lookY = LOOK_HEIGHT;

  // Frame-independent damping factors
  const posDamping = 1 - Math.pow(1 - POS_DAMPING, dt * 60);
  const rotDamping = 1 - Math.pow(1 - ROT_DAMPING, dt * 60);

  if (!_initialized) {
    // Snap on first frame — no easing
    camera.position.set(idealX, idealY, idealZ);
    _smoothedTarget.set(lookX, lookY, lookZ);
    _initialized = true;
  } else {
    // Lerp camera position toward ideal
    camera.position.x += (idealX - camera.position.x) * posDamping;
    camera.position.y += (idealY - camera.position.y) * posDamping;
    camera.position.z += (idealZ - camera.position.z) * posDamping;

    // Lerp smoothed look-at target
    _smoothedTarget.x += (lookX - _smoothedTarget.x) * rotDamping;
    _smoothedTarget.y += (lookY - _smoothedTarget.y) * rotDamping;
    _smoothedTarget.z += (lookZ - _smoothedTarget.z) * rotDamping;
  }

  camera.lookAt(_smoothedTarget);
}
