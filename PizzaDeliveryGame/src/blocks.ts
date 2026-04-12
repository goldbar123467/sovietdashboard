import type { Block, Grid } from './types';
import { getCell } from './grid';

/* ------------------------------------------------------------------ */
/*  Flood-fill block detection                                         */
/* ------------------------------------------------------------------ */

export function detectBlocks(grid: Grid): Block[] {
  const { width, height } = grid;
  const visited: boolean[][] = [];
  for (let z = 0; z < height; z++) {
    visited.push(new Array<boolean>(width).fill(false));
  }

  const blocks: Block[] = [];

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (visited[z][x]) continue;

      const cell = getCell(grid, x, z);
      if (!cell || cell.type !== 'empty') {
        visited[z][x] = true;
        continue;
      }

      // Flood-fill from this empty cell
      const stack: Array<{ x: number; z: number }> = [{ x, z }];
      visited[z][x] = true;

      let minX = x;
      let minZ = z;
      let maxX = x;
      let maxZ = z;
      let cellCount = 0;

      while (stack.length > 0) {
        const cur = stack.pop()!;
        cellCount++;

        if (cur.x < minX) minX = cur.x;
        if (cur.z < minZ) minZ = cur.z;
        if (cur.x > maxX) maxX = cur.x;
        if (cur.z > maxZ) maxZ = cur.z;

        // Check 4 neighbors
        const neighbors = [
          { x: cur.x, z: cur.z - 1 },
          { x: cur.x + 1, z: cur.z },
          { x: cur.x, z: cur.z + 1 },
          { x: cur.x - 1, z: cur.z },
        ];

        for (const n of neighbors) {
          if (n.x < 0 || n.z < 0 || n.x >= width || n.z >= height) continue;
          if (visited[n.z][n.x]) continue;

          const neighbor = getCell(grid, n.x, n.z);
          if (!neighbor || neighbor.type !== 'empty') continue;

          visited[n.z][n.x] = true;
          stack.push(n);
        }
      }

      // Determine if exterior (bounding rect touches grid edge)
      const exterior =
        minX === 0 ||
        minZ === 0 ||
        maxX === width - 1 ||
        maxZ === height - 1;

      blocks.push({
        minX,
        minZ,
        maxX,
        maxZ,
        area: cellCount,
        exterior,
      });
    }
  }

  // Sort by area descending
  blocks.sort((a, b) => b.area - a.area);

  return blocks;
}
