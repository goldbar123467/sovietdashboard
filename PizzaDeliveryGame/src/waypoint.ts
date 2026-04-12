/* ------------------------------------------------------------------ */
/*  Waypoint arrow — floating 3D indicator pointing to delivery target */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';

export interface WaypointArrow {
  group: THREE.Group;
  update(
    scooterX: number,
    scooterZ: number,
    scooterHeading: number,
    targetX: number,
    targetZ: number,
    dt: number,
    tripIntensity: number,
  ): void;
}

const ARROW_HEIGHT = 3; // meters above scooter
const LERP_SPEED = 6; // radians/sec easing factor (~0.4s settle)
const ARROW_COLOR = 0x00ff88;

/**
 * Creates a floating cone arrow that hovers above the scooter and
 * rotates to point toward the current delivery target.
 */
export function createWaypointArrow(scene: THREE.Scene): WaypointArrow {
  const group = new THREE.Group();
  group.name = 'waypointArrow';

  // Cone pointing forward (+Z after rotation)
  const coneGeo = new THREE.ConeGeometry(0.3, 0.8, 4);
  const coneMat = new THREE.MeshBasicMaterial({ color: ARROW_COLOR });
  const cone = new THREE.Mesh(coneGeo, coneMat);

  // ConeGeometry points up (+Y) by default. Rotate so it points along +Z.
  cone.rotation.x = Math.PI / 2;

  group.add(cone);
  scene.add(group);

  // Internal tracked heading for smooth lerp
  let currentYaw = 0;

  function update(
    scooterX: number,
    scooterZ: number,
    _scooterHeading: number,
    targetX: number,
    targetZ: number,
    dt: number,
    _tripIntensity: number,
  ): void {
    // Follow scooter position, floating above
    group.position.set(scooterX, ARROW_HEIGHT, scooterZ);

    // Compute desired heading toward target
    const dx = targetX - scooterX;
    const dz = targetZ - scooterZ;
    const targetYaw = Math.atan2(dx, dz); // atan2(x, z) for Three.js Y-rotation

    // Lerp with shortest-path angle wrapping
    let delta = targetYaw - currentYaw;
    // Wrap to [-PI, PI]
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    currentYaw += delta * Math.min(1, LERP_SPEED * dt);

    // Arrow drift at high trip — the ONLY gameplay-affecting trip effect
    let targetAngle = currentYaw;
    if (_tripIntensity > 0) {
      const time = performance.now() / 1000;
      const drift = (Math.sin(time * 1.7) * 0.3 + Math.sin(time * 3.1) * 0.2) * _tripIntensity * (30 * Math.PI / 180);
      targetAngle += drift;
    }

    group.rotation.y = targetAngle;
  }

  return { group, update };
}
