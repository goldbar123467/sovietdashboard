import * as THREE from 'three';
import type { Grid } from './types';
import type { PaletteAtlas } from './palette';
import { getCell, gridToWorld } from './grid';
import {
  TILE_SIZE,
  LIGHT_OFFSET,
  BENCH_INTERVAL,
  LIGHT_POLE_COLOR_INDEX,
  LIGHT_LAMP_COLOR_INDEX,
  SIGN_COLOR_INDEX,
  BENCH_COLOR_INDEX,
  SECONDARY_ROAD_WIDTH,
} from './constants';

/* ------------------------------------------------------------------ */
/*  Artery / perimeter detection                                       */
/* ------------------------------------------------------------------ */

function isPerimeterCell(grid: Grid, x: number, z: number): boolean {
  return x === 0 || z === 0 || x === grid.width - 1 || z === grid.height - 1;
}

function isArteryCell(grid: Grid, x: number, z: number): boolean {
  const { width, height } = grid;
  const nsPositions = [Math.floor(width / 3), Math.floor((2 * width) / 3)];
  const ewPositions = [Math.floor(height / 3), Math.floor((2 * height) / 3)];
  return nsPositions.includes(x) || ewPositions.includes(z);
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

function paintAllUVs(
  geo: THREE.BufferGeometry,
  uv: [number, number],
): void {
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, uv[0], uv[1]);
  }
}

/** Merge multiple buffer geometries into a single non-indexed geometry. */
function mergeGeometries(
  geos: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const geo of geos) {
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;
    const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
    const idx = geo.index;

    if (idx) {
      const indexArray = idx.array;
      for (let i = 0; i < indexArray.length; i++) {
        const vi = indexArray[i];
        positions.push(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
        normals.push(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi));
        uvs.push(uvAttr.getX(vi), uvAttr.getY(vi));
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return merged;
}

/* ------------------------------------------------------------------ */
/*  Street light                                                       */
/* ------------------------------------------------------------------ */

function createStreetLight(
  x: number,
  z: number,
  palette: PaletteAtlas,
): THREE.Mesh {
  const poleUV = palette.uvForIndex(LIGHT_POLE_COLOR_INDEX);

  // Pole: cylinder 0.15 radius, 5.7m height
  const pole = new THREE.CylinderGeometry(0.15, 0.15, 5.7, 6);
  pole.translate(0, 5.7 / 2, 0);
  paintAllUVs(pole, poleUV);

  // Lamp: box 0.5x0.3x0.5 at top of pole
  const lamp = new THREE.BoxGeometry(0.5, 0.3, 0.5);
  lamp.translate(0, 5.7 + 0.15, 0);
  // Lamp uses emissiveMaterial so we paint its UVs too but use a separate mesh
  const lampUV = palette.uvForIndex(LIGHT_LAMP_COLOR_INDEX);
  paintAllUVs(lamp, lampUV);

  // Merge pole geometry
  const poleGeo = mergeGeometries([pole]);
  pole.dispose();

  // Lamp gets emissive material
  const lampGeo = mergeGeometries([lamp]);
  lamp.dispose();

  // Create a group-like merged mesh for the pole
  const poleMesh = new THREE.Mesh(poleGeo, palette.standardMaterial);
  poleMesh.position.set(x, 0, z);

  // We need to return a single mesh, so we'll use a Group internally
  // but the spec says THREE.Group containing meshes. Let's make two meshes.
  // Actually, for simplicity let's merge pole + lamp into one mesh using mainMaterial
  // and make a separate lamp mesh with emissiveMaterial.
  // The cleanest approach: return just the pole mesh and add lamp separately.
  // But the function returns a single Mesh... let's refactor to add to group directly.

  // This is called from the main function; we'll handle it there.
  // For now, return pole mesh and let caller handle lamp.
  return poleMesh;
}

function createStreetLightLamp(
  x: number,
  z: number,
  palette: PaletteAtlas,
): THREE.Mesh {
  const lampUV = palette.uvForIndex(LIGHT_LAMP_COLOR_INDEX);
  const lamp = new THREE.BoxGeometry(0.5, 0.3, 0.5);
  lamp.translate(0, 5.7 + 0.15, 0);
  paintAllUVs(lamp, lampUV);

  const geo = mergeGeometries([lamp]);
  lamp.dispose();

  const mesh = new THREE.Mesh(geo, palette.emissiveMaterial);
  mesh.position.set(x, 0, z);
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Traffic sign                                                       */
/* ------------------------------------------------------------------ */

function createTrafficSign(
  x: number,
  z: number,
  palette: PaletteAtlas,
): THREE.Mesh {
  const signUV = palette.uvForIndex(SIGN_COLOR_INDEX);

  // Thin pole: 0.05 radius, 3m
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 3, 6);
  pole.translate(0, 1.5, 0);
  paintAllUVs(pole, signUV);

  // Sign face: box 0.7x1.2x0.1
  const face = new THREE.BoxGeometry(0.7, 1.2, 0.1);
  face.translate(0, 3 + 0.6, 0);
  paintAllUVs(face, signUV);

  const geo = mergeGeometries([pole, face]);
  pole.dispose();
  face.dispose();

  const mesh = new THREE.Mesh(geo, palette.standardMaterial);
  mesh.position.set(x, 0, z);
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Bench                                                              */
/* ------------------------------------------------------------------ */

function createBench(
  x: number,
  z: number,
  rotateForNS: boolean,
  palette: PaletteAtlas,
): THREE.Mesh {
  const benchUV = palette.uvForIndex(BENCH_COLOR_INDEX);

  // Seat: 1.2x0.1x0.4 at y=0.45
  const seat = new THREE.BoxGeometry(1.2, 0.1, 0.4);
  seat.translate(0, 0.45, 0);
  paintAllUVs(seat, benchUV);

  // Back: 1.2x0.4x0.08 at y=0.7
  const back = new THREE.BoxGeometry(1.2, 0.4, 0.08);
  back.translate(0, 0.7, -0.16);
  paintAllUVs(back, benchUV);

  const geo = mergeGeometries([seat, back]);
  seat.dispose();
  back.dispose();

  const mesh = new THREE.Mesh(geo, palette.standardMaterial);
  mesh.position.set(x, 0, z);
  if (rotateForNS) {
    mesh.rotation.y = Math.PI / 2;
  }
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function generateStreetFurniture(
  grid: Grid,
  palette: PaletteAtlas,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'street-furniture';

  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = getCell(grid, x, z);
      if (!cell) continue;

      const { wx, wz } = gridToWorld(grid, x, z);

      // --- Street lights + signs at intersection corners ---
      if (cell.type === 'intersection') {
        // Place at all 4 corners, flush with cell edges
        const cornerOffset = TILE_SIZE / 2;
        const corners: [number, number][] = [
          [wx + cornerOffset, wz + cornerOffset],
          [wx - cornerOffset, wz + cornerOffset],
          [wx + cornerOffset, wz - cornerOffset],
          [wx - cornerOffset, wz - cornerOffset],
        ];

        for (const [cx, cz] of corners) {
          // Only place if the diagonal cell is NOT a road (it's a sidewalk corner)
          const diagX = cx > wx ? x + 1 : x - 1;
          const diagZ = cz > wz ? z + 1 : z - 1;
          const diag = getCell(grid, diagX, diagZ);
          if (diag && (diag.type === 'road' || diag.type === 'intersection')) continue;

          group.add(createStreetLight(cx, cz, palette));
          group.add(createStreetLightLamp(cx, cz, palette));
        }

        // Traffic sign at one corner (first valid corner)
        for (const [cx, cz] of corners) {
          const diagX = cx > wx ? x + 1 : x - 1;
          const diagZ = cz > wz ? z + 1 : z - 1;
          const diag = getCell(grid, diagX, diagZ);
          if (diag && (diag.type === 'road' || diag.type === 'intersection')) continue;
          group.add(createTrafficSign(cx, cz, palette));
          break; // Only one sign per intersection
        }
      }

      // --- Street lights along main artery roads (every 6th cell) ---
      if (cell.type === 'road' && isArteryCell(grid, x, z) && !isPerimeterCell(grid, x, z)) {
        if ((x + z) % 6 === 0) {
          // Place 1m past the road cell edge (in the lot-inset sidewalk zone)
          const offset = TILE_SIZE / 2 + 1.0;
          const dir = cell.road?.direction;
          const adjX = dir === 'ns' ? x + 1 : x;
          const adjZ = dir === 'ew' ? z + 1 : z;
          const adj = getCell(grid, adjX, adjZ);
          // Only place if adjacent cell is not a road
          if (!adj || (adj.type !== 'road' && adj.type !== 'intersection')) {
            const lx = dir === 'ns' ? wx + offset : wx;
            const lz = dir === 'ew' ? wz + offset : wz;
            group.add(createStreetLight(lx, lz, palette));
            group.add(createStreetLightLamp(lx, lz, palette));
          }
        }
      }

      // --- Benches on main artery roads (every 4th cell) ---
      if (cell.type === 'road' && isArteryCell(grid, x, z) && !isPerimeterCell(grid, x, z)) {
        if ((x + z) % BENCH_INTERVAL === 0) {
          const offset = TILE_SIZE / 2 + 1.0;
          const dir = cell.road?.direction;
          const adjX = dir === 'ns' ? x + 1 : x;
          const adjZ = dir === 'ew' ? z + 1 : z;
          const adj = getCell(grid, adjX, adjZ);
          if (!adj || (adj.type !== 'road' && adj.type !== 'intersection')) {
            const bx = dir === 'ns' ? wx + offset : wx;
            const bz = dir === 'ew' ? wz + offset : wz;
            group.add(createBench(bx, bz, dir === 'ns', palette));
          }
        }
      }
    }
  }

  return group;
}
