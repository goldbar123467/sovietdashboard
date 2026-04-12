/* ------------------------------------------------------------------ */
/*  Shrooms — collectible mushrooms scattered on roads                 */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { Grid } from './types';
import type { PRNG } from './prng';
import { getCell, gridToWorld } from './grid';

export interface Shroom {
  gridX: number;
  gridZ: number;
  worldX: number;
  worldZ: number;
  mesh: THREE.Mesh;
  collected: boolean;
}

const SHROOM_COLOR = 0x9944ff;
const SHROOM_RADIUS = 0.4;
const SHROOM_BASE_Y = 0.5;
const SHROOM_BOB_AMP = 0.2;
const SHROOM_BOB_SPEED = 2;
const SHROOM_SPIN_SPEED = 1.5;
const PICKUP_RADIUS = 2;

/**
 * Spawn `count` shrooms on random road cells spread across the grid.
 * Avoids edge cells (perimeter roads) so shrooms are interior.
 */
export function spawnShrooms(
  grid: Grid,
  scene: THREE.Scene,
  rng: PRNG,
  count: number,
): Shroom[] {
  // Collect candidate road/intersection cells that are not on the grid edge
  const candidates: Array<{ x: number; z: number }> = [];
  for (let z = 1; z < grid.height - 1; z++) {
    for (let x = 1; x < grid.width - 1; x++) {
      const cell = getCell(grid, x, z);
      if (!cell) continue;
      if (cell.type === 'road' || cell.type === 'intersection') {
        candidates.push({ x, z });
      }
    }
  }

  if (candidates.length === 0) return [];

  // Pick `count` cells, trying to spread them out by shuffling and taking first N
  // Fisher-Yates partial shuffle
  const picked: Array<{ x: number; z: number }> = [];
  const pool = candidates.slice();
  const n = Math.min(count, pool.length);

  for (let i = 0; i < n; i++) {
    const j = rng.nextInt(i, pool.length - 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
    picked.push(pool[i]);
  }

  const shrooms: Shroom[] = [];
  const geo = new THREE.IcosahedronGeometry(SHROOM_RADIUS, 1);
  const mat = new THREE.MeshBasicMaterial({ color: SHROOM_COLOR });

  for (const { x, z } of picked) {
    const { wx, wz } = gridToWorld(grid, x, z);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wx, SHROOM_BASE_Y, wz);
    scene.add(mesh);

    shrooms.push({
      gridX: x,
      gridZ: z,
      worldX: wx,
      worldZ: wz,
      mesh,
      collected: false,
    });
  }

  return shrooms;
}

/**
 * Check if the player is close enough to pick up an uncollected shroom.
 * Returns the first collected shroom, or null if none within range.
 */
export function checkShroomPickup(
  shrooms: Shroom[],
  playerX: number,
  playerZ: number,
  radius: number = PICKUP_RADIUS,
): Shroom | null {
  for (const shroom of shrooms) {
    if (shroom.collected) continue;

    const dx = shroom.worldX - playerX;
    const dz = shroom.worldZ - playerZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      shroom.collected = true;
      shroom.mesh.visible = false;
      return shroom;
    }
  }

  return null;
}

/**
 * Remove all shroom meshes from the scene and clean up.
 */
export function removeShrooms(shrooms: Shroom[], scene: THREE.Scene): void {
  for (const shroom of shrooms) {
    scene.remove(shroom.mesh);
    shroom.mesh.geometry.dispose();
  }
}

/**
 * Animate uncollected shrooms: bob up/down and rotate.
 */
export function updateShrooms(shrooms: Shroom[], time: number): void {
  for (let i = 0; i < shrooms.length; i++) {
    const shroom = shrooms[i];
    if (shroom.collected) continue;

    shroom.mesh.position.y =
      SHROOM_BASE_Y + Math.sin(time * SHROOM_BOB_SPEED + i) * SHROOM_BOB_AMP;
    shroom.mesh.rotation.y = time * SHROOM_SPIN_SPEED;
  }
}
