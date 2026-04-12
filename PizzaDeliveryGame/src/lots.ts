import type { Grid, Block, Lot, Zone } from './types';
import {
  TILE_SIZE,
  LOT_MIN_CELLS,
  LOT_MAX_CELLS,
  ZONE_DOWNTOWN_RADIUS,
  ZONE_COMMERCIAL_RADIUS,
  SECONDARY_ROAD_WIDTH,
} from './constants';
import type { PRNG } from './prng';
import { getCell, gridToWorld } from './grid';

/* ------------------------------------------------------------------ */
/*  Recursive binary split                                             */
/* ------------------------------------------------------------------ */

interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

function splitRect(rect: Rect, rng: PRNG): Rect[] {
  const w = rect.maxX - rect.minX + 1;
  const h = rect.maxZ - rect.minZ + 1;
  const area = w * h;

  // Leaf condition: small enough AND neither side too long
  if (area <= LOT_MAX_CELLS && w <= 2 && h <= 2) {
    return [rect];
  }
  // Can't split a 1-wide strip
  if (w <= 1 && h <= 1) {
    return [rect];
  }

  // Split along longer axis
  const splitHorizontal = h > w;

  if (splitHorizontal) {
    // Split along Z axis (horizontal cut)
    if (h <= 2) return [rect];
    const rangeStart = Math.floor(rect.minZ + h * 0.3);
    const rangeEnd = Math.floor(rect.minZ + h * 0.7);
    if (rangeStart >= rangeEnd) return [rect];
    const splitZ = rng.nextInt(rangeStart, rangeEnd - 1);

    const top: Rect = { minX: rect.minX, minZ: rect.minZ, maxX: rect.maxX, maxZ: splitZ };
    const bottom: Rect = { minX: rect.minX, minZ: splitZ + 1, maxX: rect.maxX, maxZ: rect.maxZ };

    return [...splitRect(top, rng), ...splitRect(bottom, rng)];
  } else {
    // Split along X axis (vertical cut)
    if (w <= 2) return [rect];
    const rangeStart = Math.floor(rect.minX + w * 0.3);
    const rangeEnd = Math.floor(rect.minX + w * 0.7);
    if (rangeStart >= rangeEnd) return [rect];
    const splitX = rng.nextInt(rangeStart, rangeEnd - 1);

    const left: Rect = { minX: rect.minX, minZ: rect.minZ, maxX: splitX, maxZ: rect.maxZ };
    const right: Rect = { minX: splitX + 1, minZ: rect.minZ, maxX: rect.maxX, maxZ: rect.maxZ };

    return [...splitRect(left, rng), ...splitRect(right, rng)];
  }
}

/* ------------------------------------------------------------------ */
/*  Zone classification                                                */
/* ------------------------------------------------------------------ */

function classifyZone(
  rect: Rect,
  gridWidth: number,
  gridHeight: number,
): Zone {
  const centerX = (rect.minX + rect.maxX) / 2;
  const centerZ = (rect.minZ + rect.maxZ) / 2;
  const gridCenterX = gridWidth / 2;
  const gridCenterZ = gridHeight / 2;

  const dist = Math.sqrt(
    (centerX - gridCenterX) ** 2 + (centerZ - gridCenterZ) ** 2,
  );

  if (dist <= ZONE_DOWNTOWN_RADIUS) return 'downtown';
  if (dist <= ZONE_COMMERCIAL_RADIUS) return 'commercial';
  return 'residential';
}

/* ------------------------------------------------------------------ */
/*  Road-facing edge detection                                         */
/* ------------------------------------------------------------------ */

type Edge = 'north' | 'south' | 'east' | 'west';

interface RoadEdgeInfo {
  edges: Edge[];
  /** Edges that face only secondary (narrow) roads — get less inset. */
  secondaryEdges: Set<Edge>;
}

function findRoadFacingEdges(
  rect: Rect,
  grid: Grid,
): RoadEdgeInfo {
  const edges: Edge[] = [];
  const secondaryEdges = new Set<Edge>();

  function checkEdge(
    edge: Edge,
    cells: Array<{ x: number; z: number }>,
  ): void {
    let foundRoad = false;
    let allSecondary = true;
    for (const { x, z } of cells) {
      const cell = getCell(grid, x, z);
      if (cell && (cell.type === 'road' || cell.type === 'intersection')) {
        foundRoad = true;
        if (!cell.road?.secondary) allSecondary = false;
      }
    }
    if (foundRoad) {
      edges.push(edge);
      if (allSecondary) secondaryEdges.add(edge);
    }
  }

  // North edge: check cells at z = minZ - 1
  if (rect.minZ > 0) {
    const cells = [];
    for (let x = rect.minX; x <= rect.maxX; x++) cells.push({ x, z: rect.minZ - 1 });
    checkEdge('north', cells);
  }

  // South edge: check cells at z = maxZ + 1
  if (rect.maxZ < grid.height - 1) {
    const cells = [];
    for (let x = rect.minX; x <= rect.maxX; x++) cells.push({ x, z: rect.maxZ + 1 });
    checkEdge('south', cells);
  }

  // West edge: check cells at x = minX - 1
  if (rect.minX > 0) {
    const cells = [];
    for (let z = rect.minZ; z <= rect.maxZ; z++) cells.push({ x: rect.minX - 1, z });
    checkEdge('west', cells);
  }

  // East edge: check cells at x = maxX + 1
  if (rect.maxX < grid.width - 1) {
    const cells = [];
    for (let z = rect.minZ; z <= rect.maxZ; z++) cells.push({ x: rect.maxX + 1, z });
    checkEdge('east', cells);
  }

  return { edges, secondaryEdges };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function subdivideLots(
  block: Block,
  grid: Grid,
  rng: PRNG,
): Lot[] {
  // Skip exterior blocks
  if (block.exterior) return [];

  const blockRect: Rect = {
    minX: block.minX,
    minZ: block.minZ,
    maxX: block.maxX,
    maxZ: block.maxZ,
  };

  const leafRects = splitRect(blockRect, rng);

  // Filter out lots that are too small
  const validRects = leafRects.filter((r) => {
    const w = r.maxX - r.minX + 1;
    const h = r.maxZ - r.minZ + 1;
    return w * h >= LOT_MIN_CELLS;
  });

  return validRects.map((rect) => {
    const w = rect.maxX - rect.minX + 1;
    const h = rect.maxZ - rect.minZ + 1;

    // Compute world bounds — cell edges, then inset from road-facing sides
    const minWorld = gridToWorld(grid, rect.minX, rect.minZ);
    const maxWorld = gridToWorld(grid, rect.maxX, rect.maxZ);

    const { edges: roadFacingEdges, secondaryEdges } = findRoadFacingEdges(rect, grid);
    const roadInset = 1.5; // meters to pull lot bounds away from major road edge
    // Secondary roads are narrow — extend lot INTO the road cell's sidewalk zone,
    // stopping 0.5m before the narrow road surface edge.
    // Leave a 2 m sidewalk zone between road surface and lot edge so
    // street trees, lights and benches have room to sit without clipping.
    const secondaryExtension = (TILE_SIZE / 2) * (1 - SECONDARY_ROAD_WIDTH) - 2.0;

    function insetFor(edge: Edge): number {
      if (!roadFacingEdges.includes(edge)) return 0;
      return secondaryEdges.has(edge) ? -secondaryExtension : roadInset;
    }

    const worldBounds = {
      minX: minWorld.wx - TILE_SIZE / 2 + insetFor('west'),
      minZ: minWorld.wz - TILE_SIZE / 2 + insetFor('north'),
      maxX: maxWorld.wx + TILE_SIZE / 2 - insetFor('east'),
      maxZ: maxWorld.wz + TILE_SIZE / 2 - insetFor('south'),
    };

    return {
      gridBounds: {
        minX: rect.minX,
        minZ: rect.minZ,
        maxX: rect.maxX,
        maxZ: rect.maxZ,
      },
      worldBounds,
      area: w * h,
      zone: classifyZone(rect, grid.width, grid.height),
      roadFacingEdges,
    };
  });
}
