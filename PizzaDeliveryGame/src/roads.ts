import * as THREE from 'three';
import type { Grid } from './types';
import {
  TILE_SIZE,
  ROAD_COLOR_INDEX,
  INTERSECTION_COLOR_INDEX,
  ROAD_MARKING_COLOR_INDEX,
  SECONDARY_ROAD_WIDTH,
} from './constants';
import type { PaletteAtlas } from './palette';
import { getCell, getNeighbors, gridToWorld } from './grid';

/* ------------------------------------------------------------------ */
/*  Road surface mesh (batched quads)                                  */
/* ------------------------------------------------------------------ */

function buildRoadSurface(grid: Grid, palette: PaletteAtlas): THREE.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const roadUV = palette.uvForIndex(ROAD_COLOR_INDEX);
  const intUV = palette.uvForIndex(INTERSECTION_COLOR_INDEX);

  const fullHalf = TILE_SIZE / 2;

  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = getCell(grid, x, z);
      if (!cell) continue;
      if (cell.type !== 'road' && cell.type !== 'intersection') continue;

      const { wx, wz } = gridToWorld(grid, x, z);
      const [u, v] =
        cell.type === 'intersection' ? intUV : roadUV;

      // All roads render at full cell width — uniform grid alignment.
      // Secondary vs primary distinction is handled by lot extension math,
      // not visual road width (half-width strips looked misaligned).
      const halfX = fullHalf;
      const halfZ = fullHalf;

      // Quads directly in XZ plane at Y=0 (no rotation needed)
      // Winding for +Y normal: use cross product verified order
      positions.push(
        wx - halfX, 0, wz - halfZ,
        wx - halfX, 0, wz + halfZ,
        wx + halfX, 0, wz + halfZ,
      );
      positions.push(
        wx - halfX, 0, wz - halfZ,
        wx + halfX, 0, wz + halfZ,
        wx + halfX, 0, wz - halfZ,
      );

      // All 6 verts get up-facing normal and same UV
      for (let i = 0; i < 6; i++) {
        normals.push(0, 1, 0);
        uvs.push(u, v);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(normals, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const mesh = new THREE.Mesh(geometry, palette.mainMaterial);
  mesh.position.y = 0.05;
  mesh.name = 'road-surface';
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Lane markings (dashed center lines)                                */
/* ------------------------------------------------------------------ */

function buildLaneMarkings(grid: Grid, palette: PaletteAtlas): THREE.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const [u, v] = palette.uvForIndex(ROAD_MARKING_COLOR_INDEX);
  const markingWidth = 0.3;
  const markingLength = 2.0;
  const halfW = markingWidth / 2;
  const halfL = markingLength / 2;

  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = getCell(grid, x, z);
      if (!cell || cell.type !== 'road' || !cell.road) continue;

      const dir = cell.road.direction;
      const [north, east, south, west] = getNeighbors(grid, x, z);

      // Check if neighbor in the road's direction is also a road/intersection
      let hasNeighbor = false;
      if (dir === 'ns') {
        hasNeighbor =
          (north?.type === 'road' || north?.type === 'intersection') ||
          (south?.type === 'road' || south?.type === 'intersection');
      } else {
        hasNeighbor =
          (east?.type === 'road' || east?.type === 'intersection') ||
          (west?.type === 'road' || west?.type === 'intersection');
      }

      if (!hasNeighbor) continue;

      const { wx, wz } = gridToWorld(grid, x, z);

      let mHalfX: number;
      let mHalfZ: number;
      if (dir === 'ns') {
        mHalfX = halfW;
        mHalfZ = halfL;
      } else {
        mHalfX = halfL;
        mHalfZ = halfW;
      }

      // Quads directly in XZ plane
      positions.push(
        wx - mHalfX, 0, wz - mHalfZ,
        wx - mHalfX, 0, wz + mHalfZ,
        wx + mHalfX, 0, wz + mHalfZ,
      );
      positions.push(
        wx - mHalfX, 0, wz - mHalfZ,
        wx + mHalfX, 0, wz + mHalfZ,
        wx + mHalfX, 0, wz - mHalfZ,
      );

      for (let i = 0; i < 6; i++) {
        normals.push(0, 1, 0);
        uvs.push(u, v);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(normals, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const mesh = new THREE.Mesh(geometry, palette.mainMaterial);
  mesh.position.y = 0.06;
  mesh.name = 'lane-markings';
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function generateRoads(grid: Grid, palette: PaletteAtlas): THREE.Group {
  const group = new THREE.Group();
  group.name = 'roads';
  group.add(buildRoadSurface(grid, palette));
  group.add(buildLaneMarkings(grid, palette));
  return group;
}
