import * as THREE from 'three';
import type { Lot } from './types';
import type { PaletteAtlas } from './palette';
import { FENCE_COLOR_INDEX, DRIVEWAY_COLOR_INDEX } from './constants';

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

/* ------------------------------------------------------------------ */
/*  Fence generation                                                   */
/* ------------------------------------------------------------------ */

type Edge = 'north' | 'south' | 'east' | 'west';

function buildFence(
  lot: Lot,
  palette: PaletteAtlas,
): THREE.Mesh[] {
  const fenceUV = palette.uvForIndex(FENCE_COLOR_INDEX);
  const meshes: THREE.Mesh[] = [];
  const wb = lot.worldBounds;
  const allEdges: Edge[] = ['north', 'south', 'east', 'west'];
  const nonRoadEdges = allEdges.filter(
    (e) => !lot.roadFacingEdges.includes(e),
  );

  const segmentLength = 1.2;
  const segmentHeight = 0.8;
  const segmentThickness = 0.1;
  const postSize = 0.15;
  const postHeight = 0.7;

  // Inset fence ends away from road-facing edges so they don't clip
  // into the road at corners.
  const roadInset = 1.0;
  const insetN = lot.roadFacingEdges.includes('north') ? roadInset : 0;
  const insetS = lot.roadFacingEdges.includes('south') ? roadInset : 0;
  const insetE = lot.roadFacingEdges.includes('east') ? roadInset : 0;
  const insetW = lot.roadFacingEdges.includes('west') ? roadInset : 0;

  for (const edge of nonRoadEdges) {
    let startX: number;
    let startZ: number;
    let endX: number;
    let endZ: number;

    switch (edge) {
      case 'north':
        startX = wb.minX + insetW;
        startZ = wb.minZ;
        endX = wb.maxX - insetE;
        endZ = wb.minZ;
        break;
      case 'south':
        startX = wb.minX + insetW;
        startZ = wb.maxZ;
        endX = wb.maxX - insetE;
        endZ = wb.maxZ;
        break;
      case 'east':
        startX = wb.maxX;
        startZ = wb.minZ + insetN;
        endX = wb.maxX;
        endZ = wb.maxZ - insetS;
        break;
      case 'west':
        startX = wb.minX;
        startZ = wb.minZ + insetN;
        endX = wb.minX;
        endZ = wb.maxZ - insetS;
        break;
    }

    const edgeLength = Math.sqrt(
      (endX - startX) ** 2 + (endZ - startZ) ** 2,
    );
    const segmentCount = Math.floor(edgeLength / segmentLength);
    if (segmentCount < 1) continue;

    const dx = (endX - startX) / edgeLength;
    const dz = (endZ - startZ) / edgeLength;

    for (let i = 0; i < segmentCount; i++) {
      const cx = startX + dx * (i * segmentLength + segmentLength / 2);
      const cz = startZ + dz * (i * segmentLength + segmentLength / 2);

      // Fence segment
      let segGeo: THREE.BufferGeometry;
      if (edge === 'north' || edge === 'south') {
        // Runs along X axis
        segGeo = new THREE.BoxGeometry(segmentLength, segmentHeight, segmentThickness);
      } else {
        // Runs along Z axis
        segGeo = new THREE.BoxGeometry(segmentThickness, segmentHeight, segmentLength);
      }
      segGeo.translate(0, segmentHeight / 2, 0);
      paintAllUVs(segGeo, fenceUV);

      const segMesh = new THREE.Mesh(segGeo, palette.mainMaterial);
      segMesh.position.set(cx, 0, cz);
      meshes.push(segMesh);

      // Fence post at the start of each segment
      const postX = startX + dx * i * segmentLength;
      const postZ = startZ + dz * i * segmentLength;
      const postGeo = new THREE.BoxGeometry(postSize, postHeight, postSize);
      postGeo.translate(0, postHeight / 2, 0);
      paintAllUVs(postGeo, fenceUV);

      const postMesh = new THREE.Mesh(postGeo, palette.mainMaterial);
      postMesh.position.set(postX, 0, postZ);
      meshes.push(postMesh);
    }

    // Final post at end
    const lastPostX = startX + dx * segmentCount * segmentLength;
    const lastPostZ = startZ + dz * segmentCount * segmentLength;
    const lastPostGeo = new THREE.BoxGeometry(postSize, postHeight, postSize);
    lastPostGeo.translate(0, postHeight / 2, 0);
    paintAllUVs(lastPostGeo, fenceUV);

    const lastPostMesh = new THREE.Mesh(lastPostGeo, palette.mainMaterial);
    lastPostMesh.position.set(lastPostX, 0, lastPostZ);
    meshes.push(lastPostMesh);
  }

  return meshes;
}

/* ------------------------------------------------------------------ */
/*  Driveway generation                                                */
/* ------------------------------------------------------------------ */

function buildDriveway(
  lot: Lot,
  palette: PaletteAtlas,
): THREE.Mesh | null {
  if (lot.roadFacingEdges.length === 0) return null;

  const drivewayUV = palette.uvForIndex(DRIVEWAY_COLOR_INDEX);
  const wb = lot.worldBounds;
  const edge = lot.roadFacingEdges[0]; // Use the first road-facing edge

  // Flat plane 2x3m, rotated to XZ plane at y=0.02
  const geo = new THREE.PlaneGeometry(2, 3);
  paintAllUVs(geo, drivewayUV);

  const mesh = new THREE.Mesh(geo, palette.mainMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;

  const cx = (wb.minX + wb.maxX) / 2;
  const cz = (wb.minZ + wb.maxZ) / 2;

  switch (edge) {
    case 'north':
      mesh.position.x = cx;
      mesh.position.z = wb.minZ;
      break;
    case 'south':
      mesh.position.x = cx;
      mesh.position.z = wb.maxZ;
      break;
    case 'east':
      mesh.position.x = wb.maxX;
      mesh.position.z = cz;
      mesh.rotation.z = Math.PI / 2;
      break;
    case 'west':
      mesh.position.x = wb.minX;
      mesh.position.z = cz;
      mesh.rotation.z = Math.PI / 2;
      break;
  }

  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function generateLotDetails(
  lots: Lot[],
  palette: PaletteAtlas,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lot-details';

  for (const lot of lots) {
    // Only residential lots get fences and driveways
    if (lot.zone !== 'residential') continue;

    // Fences on non-road-facing edges
    const fenceMeshes = buildFence(lot, palette);
    for (const mesh of fenceMeshes) {
      group.add(mesh);
    }

    // Driveway on road-facing edge
    const driveway = buildDriveway(lot, palette);
    if (driveway) {
      group.add(driveway);
    }
  }

  return group;
}
