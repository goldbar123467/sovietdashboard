import type { Cell, CellType, Grid, RoadDirection } from './types';
import type { PRNG } from './prng';
import { TILE_SIZE, MIN_ROAD_SPACING } from './constants';

/* ------------------------------------------------------------------ */
/*  Core accessors                                                     */
/* ------------------------------------------------------------------ */

export function createGrid(width: number, height: number): Grid {
  const cells: Cell[][] = [];
  for (let z = 0; z < height; z++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ type: 'empty', x, z });
    }
    cells.push(row);
  }
  return { width, height, cells };
}

export function getCell(grid: Grid, x: number, z: number): Cell | null {
  if (x < 0 || z < 0 || x >= grid.width || z >= grid.height) return null;
  return grid.cells[z][x];
}

export function setRoad(
  grid: Grid,
  x: number,
  z: number,
  dir: RoadDirection,
  secondary = false,
): void {
  const cell = getCell(grid, x, z);
  if (!cell) return;
  cell.type = 'road';
  cell.road = { direction: dir, secondary };
}

export function getNeighbors(
  grid: Grid,
  x: number,
  z: number,
): (Cell | null)[] {
  return [
    getCell(grid, x, z - 1), // north
    getCell(grid, x + 1, z), // east
    getCell(grid, x, z + 1), // south
    getCell(grid, x - 1, z), // west
  ];
}

/* ------------------------------------------------------------------ */
/*  Coordinate conversion                                              */
/* ------------------------------------------------------------------ */

export function gridToWorld(
  grid: Grid,
  x: number,
  z: number,
): { wx: number; wz: number } {
  const wx = x * TILE_SIZE + TILE_SIZE / 2 - (grid.width * TILE_SIZE) / 2;
  const wz = z * TILE_SIZE + TILE_SIZE / 2 - (grid.height * TILE_SIZE) / 2;
  return { wx, wz };
}

export function worldToGrid(
  grid: Grid,
  wx: number,
  wz: number,
): { x: number; z: number } {
  const x = Math.floor((wx + (grid.width * TILE_SIZE) / 2) / TILE_SIZE);
  const z = Math.floor((wz + (grid.height * TILE_SIZE) / 2) / TILE_SIZE);
  return { x, z };
}

/* ------------------------------------------------------------------ */
/*  Road-placement helpers (private)                                   */
/* ------------------------------------------------------------------ */

function placePerimeterRoads(grid: Grid): void {
  const { width, height } = grid;
  for (let x = 0; x < width; x++) {
    setRoad(grid, x, 0, 'ew');
    setRoad(grid, x, height - 1, 'ew');
  }
  for (let z = 0; z < height; z++) {
    setRoad(grid, 0, z, 'ns');
    setRoad(grid, width - 1, z, 'ns');
  }
}

function placeArteries(grid: Grid): void {
  const { width, height } = grid;
  const nsPositions = [Math.floor(width / 3), Math.floor((2 * width) / 3)];
  const ewPositions = [Math.floor(height / 3), Math.floor((2 * height) / 3)];

  for (const x of nsPositions) {
    for (let z = 0; z < height; z++) {
      setRoad(grid, x, z, 'ns');
    }
  }
  for (const z of ewPositions) {
    for (let x = 0; x < width; x++) {
      setRoad(grid, x, z, 'ew');
    }
  }
}

/**
 * For each superblock carved out by the perimeter + arteries, randomly add
 * interior roads. Each superblock has a 60 % chance for a vertical road and
 * a 60 % chance for a horizontal road.
 */
function placeSecondaryRoads(grid: Grid, rng: PRNG): void {
  const { width, height } = grid;

  // Collect the sorted x-positions and z-positions of existing NS / EW roads
  // to determine superblock boundaries.
  const nsRoadXs = new Set<number>();
  const ewRoadZs = new Set<number>();

  for (let x = 0; x < width; x++) {
    for (let z = 0; z < height; z++) {
      const cell = getCell(grid, x, z);
      if (!cell || cell.type !== 'road') continue;
      // Perimeter + arteries: NS roads span the full height
      // Check if this column is a full NS road
      if (cell.road?.direction === 'ns' || x === 0 || x === width - 1) {
        nsRoadXs.add(x);
      }
      if (cell.road?.direction === 'ew' || z === 0 || z === height - 1) {
        ewRoadZs.add(z);
      }
    }
  }

  const sortedXs = [...nsRoadXs].sort((a, b) => a - b);
  const sortedZs = [...ewRoadZs].sort((a, b) => a - b);

  for (let i = 0; i < sortedXs.length - 1; i++) {
    for (let j = 0; j < sortedZs.length - 1; j++) {
      const x0 = sortedXs[i];
      const x1 = sortedXs[i + 1];
      const z0 = sortedZs[j];
      const z1 = sortedZs[j + 1];

      const blockW = x1 - x0;
      const blockH = z1 - z0;

      // Vertical interior road (secondary — narrower)
      if (blockW >= MIN_ROAD_SPACING * 2 && rng.chance(0.6)) {
        const midX = x0 + Math.floor(blockW / 2);
        for (let z = z0; z <= z1; z++) {
          // Don't overwrite existing main roads at superblock boundaries
          const existing = getCell(grid, midX, z);
          if (existing && existing.type === 'road' && !existing.road?.secondary) continue;
          setRoad(grid, midX, z, 'ns', true);
        }
      }

      // Horizontal interior road (secondary — narrower)
      if (blockH >= MIN_ROAD_SPACING * 2 && rng.chance(0.6)) {
        const midZ = z0 + Math.floor(blockH / 2);
        for (let x = x0; x <= x1; x++) {
          const existing = getCell(grid, x, midZ);
          if (existing && existing.type === 'road' && !existing.road?.secondary) continue;
          setRoad(grid, x, midZ, 'ew', true);
        }
      }
    }
  }
}

function classifyIntersections(grid: Grid): void {
  const { width, height } = grid;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const cell = getCell(grid, x, z);
      if (!cell || cell.type !== 'road') continue;

      const [north, east, south, west] = getNeighbors(grid, x, z);
      const hasNS =
        (north?.type === 'road' || north?.type === 'intersection') &&
        (south?.type === 'road' || south?.type === 'intersection');
      const hasEW =
        (east?.type === 'road' || east?.type === 'intersection') &&
        (west?.type === 'road' || west?.type === 'intersection');

      if (hasNS && hasEW) {
        const connections = new Set<RoadDirection>();
        connections.add('ns');
        connections.add('ew');
        cell.type = 'intersection' as CellType;
        cell.intersection = { connections };
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public: full generation pipeline                                   */
/* ------------------------------------------------------------------ */

export function generateGrid(
  width: number,
  height: number,
  rng: PRNG,
): Grid {
  const grid = createGrid(width, height);
  placePerimeterRoads(grid);
  placeArteries(grid);
  placeSecondaryRoads(grid, rng);
  classifyIntersections(grid);
  return grid;
}
