import * as THREE from 'three';
import type { Grid, Block, Lot } from './types';
import { TILE_SIZE } from './constants';
import { gridToWorld } from './grid';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function lineMat(
  color: number,
  opacity: number,
): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthTest: false,
  });
}

function pushSegment(
  verts: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  y: number,
): void {
  verts.push(ax, y, az, bx, y, bz);
}

/* ------------------------------------------------------------------ */
/*  Grid lines (white, opacity 0.3)                                    */
/* ------------------------------------------------------------------ */

function createGridLines(grid: Grid): THREE.LineSegments {
  const halfW = (grid.width * TILE_SIZE) / 2;
  const halfH = (grid.height * TILE_SIZE) / 2;
  const y = 0.05;
  const verts: number[] = [];

  // Vertical lines
  for (let x = 0; x <= grid.width; x++) {
    const wx = x * TILE_SIZE - halfW;
    pushSegment(verts, wx, -halfH, wx, halfH, y);
  }
  // Horizontal lines
  for (let z = 0; z <= grid.height; z++) {
    const wz = z * TILE_SIZE - halfH;
    pushSegment(verts, -halfW, wz, halfW, wz, y);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const lines = new THREE.LineSegments(geo, lineMat(0xffffff, 0.3));
  lines.name = 'debug-grid-lines';
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Road X-marks (red, opacity 0.5)                                    */
/* ------------------------------------------------------------------ */

function createRoadMarks(grid: Grid): THREE.LineSegments {
  const y = 0.1;
  const verts: number[] = [];
  const inset = TILE_SIZE * 0.15;

  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.cells[z][x];
      if (cell.type !== 'road' && cell.type !== 'intersection') continue;

      const { wx, wz } = gridToWorld(grid, x, z);
      const half = TILE_SIZE / 2 - inset;

      // Draw an X
      pushSegment(verts, wx - half, wz - half, wx + half, wz + half, y);
      pushSegment(verts, wx - half, wz + half, wx + half, wz - half, y);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const lines = new THREE.LineSegments(geo, lineMat(0xff0000, 0.5));
  lines.name = 'debug-road-marks';
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Block bounds (yellow)                                              */
/* ------------------------------------------------------------------ */

function createBlockBounds(grid: Grid, blocks: Block[]): THREE.LineSegments {
  const y = 0.15;
  const verts: number[] = [];

  for (const b of blocks) {
    const min = gridToWorld(grid, b.minX, b.minZ);
    const max = gridToWorld(grid, b.maxX, b.maxZ);

    const x0 = min.wx - TILE_SIZE / 2;
    const z0 = min.wz - TILE_SIZE / 2;
    const x1 = max.wx + TILE_SIZE / 2;
    const z1 = max.wz + TILE_SIZE / 2;

    pushSegment(verts, x0, z0, x1, z0, y);
    pushSegment(verts, x1, z0, x1, z1, y);
    pushSegment(verts, x1, z1, x0, z1, y);
    pushSegment(verts, x0, z1, x0, z0, y);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const lines = new THREE.LineSegments(geo, lineMat(0xffff00, 1.0));
  lines.name = 'debug-block-bounds';
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Lot bounds (cyan)                                                  */
/* ------------------------------------------------------------------ */

function createLotBounds(lots: Lot[]): THREE.LineSegments {
  const y = 0.2;
  const verts: number[] = [];

  for (const lot of lots) {
    const { minX, minZ, maxX, maxZ } = lot.worldBounds;
    pushSegment(verts, minX, minZ, maxX, minZ, y);
    pushSegment(verts, maxX, minZ, maxX, maxZ, y);
    pushSegment(verts, maxX, maxZ, minX, maxZ, y);
    pushSegment(verts, minX, maxZ, minX, minZ, y);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const lines = new THREE.LineSegments(geo, lineMat(0x00ffff, 1.0));
  lines.name = 'debug-lot-bounds';
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function createDebugOverlay(
  grid: Grid,
  blocks?: Block[],
  lots?: Lot[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'debug-overlay';

  group.add(createGridLines(grid));
  group.add(createRoadMarks(grid));

  if (blocks && blocks.length > 0) {
    group.add(createBlockBounds(grid, blocks));
  }
  if (lots && lots.length > 0) {
    group.add(createLotBounds(lots));
  }

  return group;
}
