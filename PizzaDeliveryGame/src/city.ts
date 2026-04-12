import * as THREE from 'three';
import type { Grid, Block, Lot } from './types';
import type { PaletteAtlas } from './palette';
import { createPRNG } from './prng';
import { createPalette } from './palette';
import { generateGrid } from './grid';
import { generateRoads } from './roads';
import { detectBlocks } from './blocks';
import { subdivideLots } from './lots';
import { generateBuildings } from './buildings';
import { generateDecals } from './decals';
import { generateVegetation } from './vegetation';
import { generateStreetFurniture } from './streetFurniture';
import { generateLotDetails } from './lotDetails';
import {
  TILE_SIZE,
  DEFAULT_GRID_WIDTH,
  DEFAULT_GRID_HEIGHT,
  GROUND_COLOR_INDEX,
} from './constants';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CityResult {
  group: THREE.Group;
  grid: Grid;
  blocks: Block[];
  lots: Lot[];
  palette: PaletteAtlas;
}

/* ------------------------------------------------------------------ */
/*  Singleton palette                                                  */
/* ------------------------------------------------------------------ */

let sharedPalette: PaletteAtlas | null = null;

function getPalette(): PaletteAtlas {
  if (!sharedPalette) {
    sharedPalette = createPalette();
  }
  return sharedPalette;
}

/* ------------------------------------------------------------------ */
/*  Ground plane                                                       */
/* ------------------------------------------------------------------ */

function createGround(palette: PaletteAtlas): THREE.Mesh {
  const groundSize = DEFAULT_GRID_WIDTH * TILE_SIZE;
  const geo = new THREE.PlaneGeometry(groundSize * 1.5, groundSize * 1.5);

  // Paint all UVs with the ground palette color
  const [u, v] = palette.uvForIndex(GROUND_COLOR_INDEX);
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, u, v);
  }

  const mesh = new THREE.Mesh(geo, palette.standardMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.01;
  mesh.name = 'ground';
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Build pipeline                                                     */
/* ------------------------------------------------------------------ */

export function buildCity(seed: number): CityResult {
  const rng = createPRNG(seed);
  const palette = getPalette();

  const grid = generateGrid(DEFAULT_GRID_WIDTH, DEFAULT_GRID_HEIGHT, rng);
  const roads = generateRoads(grid, palette);
  const blocks = detectBlocks(grid);

  const lots = blocks
    .filter((b) => !b.exterior)
    .flatMap((b) => subdivideLots(b, grid, rng));

  const { group: buildings, builtLots } = generateBuildings(lots, rng, palette);
  const ground = createGround(palette);

  const decals = generateDecals(lots, rng);
  const vegetation = generateVegetation(lots, grid, rng, palette, builtLots);
  const furniture = generateStreetFurniture(grid, palette);
  const details = generateLotDetails(lots, palette);

  const group = new THREE.Group();
  group.name = 'city';
  group.add(ground);
  group.add(roads);
  group.add(buildings);
  group.add(decals);
  group.add(vegetation);
  group.add(furniture);
  group.add(details);

  return { group, grid, blocks, lots, palette };
}

/* ------------------------------------------------------------------ */
/*  Dispose (geometries only — shared materials are kept)              */
/* ------------------------------------------------------------------ */

export function disposeCity(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    } else if (obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
    }
  });
  group.removeFromParent();
}
