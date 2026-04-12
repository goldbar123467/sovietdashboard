/* ------------------------------------------------------------------ */
/*  Collision detection — sphere-vs-AABB for scooter against lots      */
/* ------------------------------------------------------------------ */

import type { Lot, Grid } from './types';
import type { ScooterState } from './scooter';
import { worldToGrid, gridToWorld, getCell } from './grid';

export interface CollisionResult {
  hit: boolean;
  type: 'none' | 'scrape' | 'wipeout';
  normal: { x: number; z: number };
}

const GLANCING_THRESHOLD = 0.866; // cos(30deg)

/**
 * Sphere-vs-AABB collision between the scooter and lot worldBounds.
 * Returns the first collision found (early exit).
 */
export function checkCollision(
  state: ScooterState,
  lots: Lot[],
  radius: number,
): CollisionResult {
  const sx = state.position.x;
  const sz = state.position.z;

  for (let i = 0; i < lots.length; i++) {
    const wb = lots[i].worldBounds;

    // Closest point on AABB to scooter center
    const closestX = Math.max(wb.minX, Math.min(sx, wb.maxX));
    const closestZ = Math.max(wb.minZ, Math.min(sz, wb.maxZ));

    const dx = sx - closestX;
    const dz = sz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      // Collision detected — compute normal
      const dist = Math.sqrt(distSq);
      let nx: number;
      let nz: number;

      if (dist > 0.0001) {
        nx = dx / dist;
        nz = dz / dist;
      } else {
        // Scooter center is inside the AABB — push toward heading direction
        nx = Math.sin(state.heading);
        nz = Math.cos(state.heading);
      }

      // Velocity direction from heading
      const velX = Math.sin(state.heading);
      const velZ = Math.cos(state.heading);

      // Incidence: dot product of velocity direction and collision normal
      const dot = velX * nx + velZ * nz;

      let type: 'scrape' | 'wipeout';
      if (Math.abs(dot) < GLANCING_THRESHOLD) {
        // Glancing hit — always scrape regardless of speed
        type = 'scrape';
      } else if (state.speed >= 6) {
        type = 'wipeout';
      } else {
        type = 'scrape';
      }

      return { hit: true, type, normal: { x: nx, z: nz } };
    }
  }

  return { hit: false, type: 'none', normal: { x: 0, z: 0 } };
}

/**
 * Finds the world-space center of the nearest road or intersection
 * cell within a search radius of 3 grid cells.
 */
export function findNearestRoadCenter(
  wx: number,
  wz: number,
  grid: Grid,
): { x: number; z: number } {
  const gridPos = worldToGrid(grid, wx, wz);
  const searchRadius = 3;

  let bestDistSq = Infinity;
  let bestWx = wx;
  let bestWz = wz;

  for (let dz = -searchRadius; dz <= searchRadius; dz++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const cx = gridPos.x + dx;
      const cz = gridPos.z + dz;
      const cell = getCell(grid, cx, cz);

      if (!cell) continue;
      if (cell.type !== 'road' && cell.type !== 'intersection') continue;

      const worldPos = gridToWorld(grid, cx, cz);
      const ddx = worldPos.wx - wx;
      const ddz = worldPos.wz - wz;
      const distSq = ddx * ddx + ddz * ddz;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestWx = worldPos.wx;
        bestWz = worldPos.wz;
      }
    }
  }

  return { x: bestWx, z: bestWz };
}
