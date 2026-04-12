/* ------------------------------------------------------------------ */
/*  Scooter controller — kinematic vehicle with lean and wipeout       */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { InputState } from './input';
import type { Lot, Grid } from './types';
import { checkCollision, findNearestRoadCenter } from './collision';

/* ------------------------------------------------------------------ */
/*  Constants (LOCKED — from MASTERPLAN)                               */
/* ------------------------------------------------------------------ */

const TOP_SPEED = 12;            // m/s
const ACCEL = 8;                 // m/s^2
const BRAKE_DECEL = 14;          // m/s^2
const FRICTION = 2;              // m/s^2
const MAX_TURN_RATE_LOW = 140;   // deg/s at speed 0
const MAX_TURN_RATE_HIGH = 90;   // deg/s at top speed
const MAX_LEAN = 25 * Math.PI / 180; // radians
const COLLIDER_RADIUS = 0.6;
const WIPEOUT_LOCKOUT = 1.5;     // seconds

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Mesh builder (low-poly primitives)                                 */
/* ------------------------------------------------------------------ */

function buildScooterMesh(): { group: THREE.Group; bodyGroup: THREE.Group } {
  const group = new THREE.Group();

  // Inner body group for lean rotation
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  // Body: blue vespa frame
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.8, 1.4);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a90d9 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.65; // wheels (0.25 radius) + half body height (0.4)
  bodyGroup.add(body);

  // Seat: dark pad on top
  const seatGeo = new THREE.BoxGeometry(0.4, 0.15, 0.5);
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.y = 1.125; // body top (1.05) + half seat height
  seat.position.z = -0.1;
  bodyGroup.add(seat);

  // Handlebar: silver cylinder rotated to horizontal
  const hbarGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
  const hbarMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const hbar = new THREE.Mesh(hbarGeo, hbarMat);
  hbar.rotation.z = Math.PI / 2; // rotate to horizontal (X axis)
  hbar.position.set(0, 1.15, 0.55);
  bodyGroup.add(hbar);

  // Front wheel
  const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.rotation.z = Math.PI / 2; // rotate so axle is along X
  frontWheel.position.set(0, 0.25, 0.55);
  bodyGroup.add(frontWheel);

  // Rear wheel
  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rearWheel.rotation.z = Math.PI / 2;
  rearWheel.position.set(0, 0.25, -0.55);
  bodyGroup.add(rearWheel);

  // Pizza box: red box on rear rack
  const pizzaGeo = new THREE.BoxGeometry(0.45, 0.15, 0.45);
  const pizzaMat = new THREE.MeshLambertMaterial({ color: 0xcc4444 });
  const pizzaBox = new THREE.Mesh(pizzaGeo, pizzaMat);
  pizzaBox.position.set(0, 1.125, -0.5);
  bodyGroup.add(pizzaBox);

  return { group, bodyGroup };
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createScooter(
  spawnX: number,
  spawnZ: number,
  grid: Grid,
): {
  state: ScooterState;
  mesh: THREE.Group;
  update(dt: number, input: InputState, lots: Lot[]): void;
  events: ScooterEvents;
} {
  const { group, bodyGroup } = buildScooterMesh();

  const state: ScooterState = {
    position: new THREE.Vector3(spawnX, 0, spawnZ),
    heading: 0,
    speed: 0,
    lean: 0,
    isWipedOut: false,
    wipeoutTimer: 0,
  };

  const events: ScooterEvents = {
    onWipeout: () => {},
    onScrape: () => {},
  };

  // Place mesh at spawn
  group.position.set(spawnX, 0, spawnZ);

  function update(dt: number, input: InputState, lots: Lot[]): void {
    // 1. Wipeout recovery
    if (state.isWipedOut) {
      state.wipeoutTimer -= dt;
      if (state.wipeoutTimer <= 0) {
        state.isWipedOut = false;
        state.wipeoutTimer = 0;
      }
      // Still apply mesh transforms even during wipeout
      applyMesh();
      return;
    }

    // 2. Acceleration
    if (input.forward && state.speed < TOP_SPEED) {
      state.speed += ACCEL * dt;
      if (state.speed > TOP_SPEED) state.speed = TOP_SPEED;
    }

    // 3. Braking
    if (input.brake) {
      state.speed = Math.max(0, state.speed - BRAKE_DECEL * dt);
    }

    // 4. Friction (only when not accelerating or braking)
    if (!input.forward && !input.brake) {
      state.speed = Math.max(0, state.speed - FRICTION * dt);
    }

    // 5. Turning
    const speedRatio = state.speed / TOP_SPEED;
    const turnRateDeg = lerp(MAX_TURN_RATE_LOW, MAX_TURN_RATE_HIGH, speedRatio);
    const turnRateRad = turnRateDeg * Math.PI / 180;

    if (input.left) {
      state.heading += turnRateRad * dt;
    }
    if (input.right) {
      state.heading -= turnRateRad * dt;
    }

    // 6. Lean
    let targetLean = 0;
    if (input.left) targetLean = MAX_LEAN;
    if (input.right) targetLean = -MAX_LEAN;
    // Scale by speed
    targetLean *= Math.min(1, state.speed / (TOP_SPEED * 0.3));
    // Ease toward target
    state.lean += (targetLean - state.lean) * Math.min(1, 4 * dt);

    // 7. Position update
    state.position.x += Math.sin(state.heading) * state.speed * dt;
    state.position.z += Math.cos(state.heading) * state.speed * dt;

    // 8. Collision check
    const collision = checkCollision(state, lots, COLLIDER_RADIUS);

    if (collision.hit) {
      if (collision.type === 'wipeout') {
        state.isWipedOut = true;
        state.wipeoutTimer = WIPEOUT_LOCKOUT;
        state.speed = 0;
        // Snap to nearest road center
        const roadCenter = findNearestRoadCenter(
          state.position.x,
          state.position.z,
          grid,
        );
        state.position.x = roadCenter.x;
        state.position.z = roadCenter.z;
        events.onWipeout();
      } else if (collision.type === 'scrape') {
        // Push scooter out along collision normal
        state.position.x += collision.normal.x * COLLIDER_RADIUS;
        state.position.z += collision.normal.z * COLLIDER_RADIUS;
        state.speed *= 0.3;
        events.onScrape();
      }
    }

    // 9. Apply to mesh
    applyMesh();
  }

  function applyMesh(): void {
    group.position.copy(state.position);
    group.position.y = 0;
    group.rotation.y = state.heading;
    bodyGroup.rotation.z = state.lean;
  }

  return { state, mesh: group, update, events };
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
