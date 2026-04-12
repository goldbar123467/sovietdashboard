import * as THREE from 'three';
import type { Lot, Grid } from './types';
import type { PRNG } from './prng';
import type { PaletteAtlas } from './palette';
import { getCell, gridToWorld } from './grid';
import {
  TILE_SIZE,
  TRUNK_COLOR_INDEX,
  CANOPY_COLORS,
  GRASS_COLOR_INDEX,
  TREES_PER_LOT_RANGE,
  ROAD_TREE_INTERVAL,
  PARK_TREE_RANGE,
  GRASS_PER_LOT_RANGE,
  BUILDING_FILL_RANGE,
  BUILDING_ROAD_MARGIN,
  SECONDARY_ROAD_WIDTH,
  MAX_CANOPY_RADIUS,
} from './constants';

/* ------------------------------------------------------------------ */
/*  Tree geometry builders                                             */
/* ------------------------------------------------------------------ */

type TreeType = 'round' | 'tallSlim' | 'largeRound';

function createTreeGeometry(
  type: TreeType,
  palette: PaletteAtlas,
  canopyIndex: number,
): THREE.BufferGeometry {
  const trunkUV = palette.uvForIndex(TRUNK_COLOR_INDEX);
  const canopyUV = palette.uvForIndex(canopyIndex);

  let trunk: THREE.BufferGeometry;
  let canopy: THREE.BufferGeometry;

  switch (type) {
    case 'round':
      trunk = new THREE.CylinderGeometry(0.3, 0.3, 2, 6);
      trunk.translate(0, 1, 0);
      canopy = new THREE.IcosahedronGeometry(2.5, 1);
      canopy.translate(0, 4, 0);
      break;
    case 'tallSlim':
      trunk = new THREE.CylinderGeometry(0.3, 0.3, 2, 6);
      trunk.translate(0, 1, 0);
      canopy = new THREE.ConeGeometry(1.3, 4, 5);
      canopy.translate(0, 3.7, 0);
      break;
    case 'largeRound':
      trunk = new THREE.CylinderGeometry(0.4, 0.4, 2.5, 6);
      trunk.translate(0, 1.25, 0);
      canopy = new THREE.IcosahedronGeometry(3.2, 1);
      canopy.translate(0, 4.7, 0);
      break;
  }

  // Paint trunk UVs
  const trunkUVAttr = trunk.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < trunkUVAttr.count; i++) {
    trunkUVAttr.setXY(i, trunkUV[0], trunkUV[1]);
  }

  // Paint canopy UVs
  const canopyUVAttr = canopy.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < canopyUVAttr.count; i++) {
    canopyUVAttr.setXY(i, canopyUV[0], canopyUV[1]);
  }

  // Merge into one non-indexed geometry
  const merged = mergeBufferGeometries(trunk, canopy);
  trunk.dispose();
  canopy.dispose();
  return merged;
}

/** Merge two buffer geometries into a single non-indexed geometry. */
function mergeBufferGeometries(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const geos = [a, b];
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
/*  Grass tuft geometry                                                */
/* ------------------------------------------------------------------ */

function createGrassTuft(palette: PaletteAtlas): THREE.BufferGeometry {
  const grassUV = palette.uvForIndex(GRASS_COLOR_INDEX);

  // 3-triangle fan: 9 vertices, each blade is a thin triangle
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const dx = Math.cos(angle) * 0.05;
    const dz = Math.sin(angle) * 0.05;

    // Base left, base right, tip
    positions.push(-dx, 0, -dz);
    positions.push(dx, 0, dz);
    positions.push(0, 0.4, 0);

    normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
    uvs.push(grassUV[0], grassUV[1], grassUV[0], grassUV[1], grassUV[0], grassUV[1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

/* ------------------------------------------------------------------ */
/*  Placement helpers                                                  */
/* ------------------------------------------------------------------ */

const TREE_TYPES: TreeType[] = ['round', 'tallSlim', 'largeRound'];

function placeTree(
  x: number,
  z: number,
  rng: PRNG,
  palette: PaletteAtlas,
  forceType?: TreeType,
): THREE.Mesh {
  const type = forceType ?? rng.pick(TREE_TYPES);
  const canopyIndex = rng.pick(CANOPY_COLORS);
  const geo = createTreeGeometry(type, palette, canopyIndex);
  const mesh = new THREE.Mesh(geo, palette.mainMaterial);
  mesh.position.set(x, 0, z);
  return mesh;
}

function placeGrassTuft(
  x: number,
  z: number,
  rng: PRNG,
  palette: PaletteAtlas,
): THREE.Mesh {
  const geo = createGrassTuft(palette);
  const mesh = new THREE.Mesh(geo, palette.mainMaterial);
  const yRot = rng.nextFloat(0, Math.PI * 2);
  mesh.rotation.y = yRot;
  mesh.position.set(x, 0, z);
  return mesh;
}

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
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function generateVegetation(
  lots: Lot[],
  grid: Grid,
  rng: PRNG,
  palette: PaletteAtlas,
  builtLots: Set<number>,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vegetation';

  // --- Lot trees + parks + grass ---
  for (let li = 0; li < lots.length; li++) {
    const lot = lots[li];
    const wb = lot.worldBounds;
    const inset = 1;
    const minX = wb.minX + inset;
    const maxX = wb.maxX - inset;
    const minZ = wb.minZ + inset;
    const maxZ = wb.maxZ - inset;

    // Skip if inset makes bounds invalid
    if (minX >= maxX || minZ >= maxZ) continue;

    const hasBuilding = builtLots.has(li);

    if (!hasBuilding && lot.zone === 'residential' && rng.chance(0.5)) {
      // Vacant residential lot → park: 4-8 trees + 5-15 grass tufts
      const treeCount = rng.nextInt(PARK_TREE_RANGE[0], PARK_TREE_RANGE[1]);
      for (let i = 0; i < treeCount; i++) {
        const tx = rng.nextFloat(minX, maxX);
        const tz = rng.nextFloat(minZ, maxZ);
        group.add(placeTree(tx, tz, rng, palette));
      }

      const grassCount = rng.nextInt(5, 15);
      for (let i = 0; i < grassCount; i++) {
        const gx = rng.nextFloat(minX, maxX);
        const gz = rng.nextFloat(minZ, maxZ);
        group.add(placeGrassTuft(gx, gz, rng, palette));
      }
    } else if (!hasBuilding) {
      // Vacant non-residential lot: 0-3 trees
      const range = TREES_PER_LOT_RANGE[lot.zone];
      const treeCount = rng.nextInt(range[0], range[1]);
      for (let i = 0; i < treeCount; i++) {
        const tx = rng.nextFloat(minX, maxX);
        const tz = rng.nextFloat(minZ, maxZ);
        group.add(placeTree(tx, tz, rng, palette));
      }
    } else {
      // Lot has a building — compute building footprint to avoid clipping
      const lotW = wb.maxX - wb.minX;
      const lotD = wb.maxZ - wb.minZ;
      const marginW =
        (lot.roadFacingEdges.includes('east') ? BUILDING_ROAD_MARGIN : 0) +
        (lot.roadFacingEdges.includes('west') ? BUILDING_ROAD_MARGIN : 0);
      const marginD =
        (lot.roadFacingEdges.includes('north') ? BUILDING_ROAD_MARGIN : 0) +
        (lot.roadFacingEdges.includes('south') ? BUILDING_ROAD_MARGIN : 0);
      const maxFill = BUILDING_FILL_RANGE[1];
      const bHalfW = Math.max(2, lotW - marginW) * maxFill / 2;
      const bHalfD = Math.max(2, lotD - marginD) * maxFill / 2;
      const cx = (wb.minX + wb.maxX) / 2;
      const cz = (wb.minZ + wb.maxZ) / 2;

      // Place trees only where canopy won't clip the building.
      // Skip (don't push to edge) — pushing created trees on roads.
      const range = TREES_PER_LOT_RANGE[lot.zone];
      const treeCount = rng.nextInt(range[0], range[1]);
      for (let i = 0; i < treeCount; i++) {
        const tx = rng.nextFloat(minX, maxX);
        const tz = rng.nextFloat(minZ, maxZ);
        if (Math.abs(tx - cx) < bHalfW + MAX_CANOPY_RADIUS &&
            Math.abs(tz - cz) < bHalfD + MAX_CANOPY_RADIUS) {
          continue;
        }
        group.add(placeTree(tx, tz, rng, palette));
      }

      // Grass on residential lots — skip if inside building footprint
      if (lot.zone === 'residential') {
        const grassCount = rng.nextInt(GRASS_PER_LOT_RANGE[0], GRASS_PER_LOT_RANGE[1]);
        for (let i = 0; i < grassCount; i++) {
          const gx = rng.nextFloat(minX, maxX);
          const gz = rng.nextFloat(minZ, maxZ);
          if (Math.abs(gx - cx) < bHalfW + 0.5 &&
              Math.abs(gz - cz) < bHalfD + 0.5) {
            continue;
          }
          group.add(placeGrassTuft(gx, gz, rng, palette));
        }
      }
    }
  }

  // --- Road trees along main artery roads (not secondary/side roads) ---
  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = getCell(grid, x, z);
      if (!cell || cell.type !== 'road') continue;
      if (isPerimeterCell(grid, x, z)) continue;
      // Only arteries — secondary roads are too narrow for trees
      if (!isArteryCell(grid, x, z)) continue;

      // Every 2nd road cell
      if ((x + z) % ROAD_TREE_INTERVAL !== 0) continue;

      const { wx, wz } = gridToWorld(grid, x, z);
      // Place 1m past the road cell edge into the lot inset zone (sidewalk)
      const roadTreeOffset = TILE_SIZE / 2 + 1.0;
      // Alternate sides
      const side = (x + z) % 4 < 2 ? 1 : -1;

      let tx: number;
      let tz: number;
      let adjCell: ReturnType<typeof getCell>;
      if (cell.road?.direction === 'ns') {
        tx = wx + roadTreeOffset * side;
        tz = wz;
        adjCell = getCell(grid, x + side, z);
      } else {
        tx = wx;
        tz = wz + roadTreeOffset * side;
        adjCell = getCell(grid, x, z + side);
      }

      // Skip if adjacent cell is a road (tree would sit on road surface)
      if (adjCell && (adjCell.type === 'road' || adjCell.type === 'intersection')) continue;

      group.add(placeTree(tx, tz, rng, palette, 'tallSlim'));
    }
  }

  return group;
}
