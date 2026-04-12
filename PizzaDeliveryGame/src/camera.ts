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
const LOOK_AHEAD_MIN = 1.0;  // meters forward at rest
const LOOK_AHEAD_MAX = 3.0;  // meters forward at full speed
const LOOK_HEIGHT = 0.8;     // y-level of look-at target
const POS_DAMPING_SLOW = 0.12;  // lerp factor at 60 fps when slow/stopped
const POS_DAMPING_FAST = 0.15;  // lerp factor at 60 fps when fast (>8 m/s)
const SPEED_REF = 12;           // reference speed for interpolation
const SNAP_THRESHOLD = 20;      // snap camera if > 20 m from ideal (respawn)
const ROT_DAMPING = 0.15;    // lerp factor at 60 fps

/* ------------------------------------------------------------------ */
/*  Camera shake state                                                 */
/* ------------------------------------------------------------------ */

const SHAKE_DURATION = 0.3;      // seconds
const SHAKE_AMPLITUDE = 0.3;     // meters on X and Z

let _shakeTimer = 0;             // seconds remaining; 0 = inactive
let _shakeOffsetX = 0;
let _shakeOffsetZ = 0;

/* ------------------------------------------------------------------ */
/*  Module-level smoothed look-at target                               */
/* ------------------------------------------------------------------ */

const _smoothedTarget = new THREE.Vector3(0, LOOK_HEIGHT, 0);
let _initialized = false;
let _prevFov = FOV;

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
 * Trigger a wipeout camera shake.
 * For 0.3 s, random offsets (±0.3 m on X/Z) are applied to the camera
 * position, decaying linearly to zero. Subsequent calls while a shake
 * is active are ignored.
 */
export function triggerCameraShake(): void {
  if (_shakeTimer > 0) return;          // already shaking — ignore
  _shakeTimer = SHAKE_DURATION;
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
 *
 * @param tripIntensity  0-1 mushroom trip intensity; widens FOV at peak.
 */
export function updateChaseCamera(
  camera: THREE.PerspectiveCamera,
  scooter: ScooterState,
  dt: number,
  tripIntensity: number = 0,
): void {
  // --- FOV warp from trip intensity ---
  const targetFov = FOV + tripIntensity * 5;
  if (targetFov !== _prevFov) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
    _prevFov = targetFov;
  }

  // Speed-scaled look-ahead: 1 m at rest, 3 m at full speed
  const speedFactor = Math.min(scooter.speed / SPEED_REF, 1);
  const lookAhead = LOOK_AHEAD_MIN + speedFactor * (LOOK_AHEAD_MAX - LOOK_AHEAD_MIN);

  // Ideal camera position: behind and above the scooter
  const idealX = scooter.position.x - Math.sin(scooter.heading) * DISTANCE_BEHIND;
  const idealZ = scooter.position.z - Math.cos(scooter.heading) * DISTANCE_BEHIND;
  const idealY = HEIGHT_ABOVE;

  // Ideal look-at target: ahead of the scooter (scaled by speed)
  const lookX = scooter.position.x + Math.sin(scooter.heading) * lookAhead;
  const lookZ = scooter.position.z + Math.cos(scooter.heading) * lookAhead;
  const lookY = LOOK_HEIGHT;

  // Speed-dependent position damping: tighter at high speed, smoother when slow
  const posDampingBase = POS_DAMPING_SLOW + speedFactor * (POS_DAMPING_FAST - POS_DAMPING_SLOW);

  // Frame-independent damping factors
  const posDamping = 1 - Math.pow(1 - posDampingBase, dt * 60);
  const rotDamping = 1 - Math.pow(1 - ROT_DAMPING, dt * 60);

  // Distance from camera to ideal position
  const dx = idealX - camera.position.x;
  const dy = idealY - camera.position.y;
  const dz = idealZ - camera.position.z;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (!_initialized || distSq > SNAP_THRESHOLD * SNAP_THRESHOLD) {
    // Snap on first frame or after respawn / large teleport
    camera.position.set(idealX, idealY, idealZ);
    _smoothedTarget.set(lookX, lookY, lookZ);
    _initialized = true;
  } else {
    // Lerp camera position toward ideal
    camera.position.x += dx * posDamping;
    camera.position.y += dy * posDamping;
    camera.position.z += dz * posDamping;

    // Lerp smoothed look-at target
    _smoothedTarget.x += (lookX - _smoothedTarget.x) * rotDamping;
    _smoothedTarget.y += (lookY - _smoothedTarget.y) * rotDamping;
    _smoothedTarget.z += (lookZ - _smoothedTarget.z) * rotDamping;
  }

  // --- Wipeout camera shake ---
  if (_shakeTimer > 0) {
    _shakeTimer -= dt;
    if (_shakeTimer <= 0) {
      // Shake finished — remove residual offset
      camera.position.x -= _shakeOffsetX;
      camera.position.z -= _shakeOffsetZ;
      _shakeOffsetX = 0;
      _shakeOffsetZ = 0;
      _shakeTimer = 0;
    } else {
      // Remove previous frame's offset, then apply new decayed offset
      camera.position.x -= _shakeOffsetX;
      camera.position.z -= _shakeOffsetZ;

      const decay = _shakeTimer / SHAKE_DURATION;   // 1 → 0 linear
      _shakeOffsetX = (Math.random() * 2 - 1) * SHAKE_AMPLITUDE * decay;
      _shakeOffsetZ = (Math.random() * 2 - 1) * SHAKE_AMPLITUDE * decay;

      camera.position.x += _shakeOffsetX;
      camera.position.z += _shakeOffsetZ;
    }
  }

  camera.lookAt(_smoothedTarget);
}
