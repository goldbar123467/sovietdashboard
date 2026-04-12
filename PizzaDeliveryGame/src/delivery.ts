/* ------------------------------------------------------------------ */
/*  Delivery system — target selection and marker rendering            */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { Grid, Lot } from './types';
import type { PRNG } from './prng';
import { getCell, gridToWorld } from './grid';

export interface DeliveryMarker {
  gridX: number;
  gridZ: number;
  worldX: number;
  worldZ: number;
  mesh: THREE.Group;
}

const MARKER_COLOR = 0xffdd00;

/**
 * Find a delivery target on a road/intersection cell adjacent to at
 * least one lot, within a Manhattan distance range from the origin.
 *
 * Retries up to 3 times with widening range if no candidates found.
 */
export function findDeliveryTarget(
  grid: Grid,
  lots: Lot[],
  fromGridX: number,
  fromGridZ: number,
  minDist: number,
  maxDist: number,
  rng: PRNG,
): { gridX: number; gridZ: number } {
  // Pre-compute a set of lot cells for fast adjacency lookup.
  // A lot cell is any cell covered by a lot's gridBounds that isn't road/intersection.
  const lotCells = new Set<string>();
  for (const lot of lots) {
    const gb = lot.gridBounds;
    for (let z = gb.minZ; z <= gb.maxZ; z++) {
      for (let x = gb.minX; x <= gb.maxX; x++) {
        const cell = getCell(grid, x, z);
        if (cell && cell.type === 'empty') {
          lotCells.add(`${x},${z}`);
        }
      }
    }
  }

  const dirs = [
    [0, -1], // north
    [1, 0],  // east
    [0, 1],  // south
    [-1, 0], // west
  ];

  for (let retry = 0; retry < 4; retry++) {
    const lo = Math.max(0, minDist - retry * 2);
    const hi = maxDist + retry * 2;

    const candidates: Array<{ gridX: number; gridZ: number }> = [];

    for (let z = 0; z < grid.height; z++) {
      for (let x = 0; x < grid.width; x++) {
        const cell = getCell(grid, x, z);
        if (!cell) continue;
        if (cell.type !== 'road' && cell.type !== 'intersection') continue;

        // Manhattan distance check
        const dist = Math.abs(x - fromGridX) + Math.abs(z - fromGridZ);
        if (dist < lo || dist > hi) continue;

        // Adjacency to lot: check 4 neighbors for a lot cell
        let adjacentToLot = false;
        for (const [dx, dz] of dirs) {
          if (lotCells.has(`${x + dx},${z + dz}`)) {
            adjacentToLot = true;
            break;
          }
        }

        if (adjacentToLot) {
          candidates.push({ gridX: x, gridZ: z });
        }
      }
    }

    if (candidates.length > 0) {
      return rng.pick(candidates);
    }
  }

  // Absolute fallback: pick any road cell in the middle of the grid
  return {
    gridX: Math.floor(grid.width / 2),
    gridZ: Math.floor(grid.height / 2),
  };
}

/**
 * Create a visible delivery marker at the given world position.
 *
 * Mesh: yellow disc on the ground + spinning upward cone beacon.
 */
export function createDeliveryMarker(
  scene: THREE.Scene,
  worldX: number,
  worldZ: number,
): DeliveryMarker {
  const group = new THREE.Group();
  group.name = 'deliveryMarker';

  // Ground disc
  const discGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.3, 16);
  const discMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = 0.15;
  group.add(disc);

  // Upward-pointing beacon cone
  const coneGeo = new THREE.ConeGeometry(0.6, 1.5, 8);
  const coneMat = new THREE.MeshBasicMaterial({
    color: MARKER_COLOR,
    transparent: true,
    opacity: 0.8,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 2;
  group.add(cone);

  group.position.set(worldX, 0, worldZ);
  scene.add(group);

  // gridX/gridZ will be set by the caller (createGameLoop) via the
  // findDeliveryTarget return value — we use 0 as placeholder since
  // the DeliveryMarker is constructed from world coords.
  return {
    gridX: 0,
    gridZ: 0,
    worldX,
    worldZ,
    mesh: group,
  };
}

/**
 * Remove a delivery marker from the scene and dispose its geometry.
 */
export function removeDeliveryMarker(
  marker: DeliveryMarker,
  scene: THREE.Scene,
): void {
  marker.mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    }
  });
  scene.remove(marker.mesh);
}
