import * as THREE from 'three';
import type { Lot } from './types';
import type { PRNG } from './prng';

const SIGN_TEXTS = [
  'PIZZA', 'LAUNDROMAT', '24HR', 'BAR', 'BODEGA',
  'DELI', 'PHARMACY', 'LIQUOR', 'NAIL SALON', 'LAUNDRY',
  'TATTOO', 'PAWN',
];

/** Eligible zones for signage decals. */
const SIGN_ZONES = new Set(['downtown', 'commercial']);

/** Fraction of eligible lots that get a sign. */
const SIGN_CHANCE = 0.6;

/** Sign quad dimensions in meters. */
const SIGN_WIDTH = 2.5;
const SIGN_HEIGHT = 0.7;

/** Canvas dimensions for CanvasTexture. */
const CANVAS_W = 256;
const CANVAS_H = 64;

/** Y position of sign center on the building face. */
const SIGN_Y = 2.5;

/** Offset in front of the building face (meters). */
const SIGN_OFFSET = 0.05;

/* ------------------------------------------------------------------ */
/*  Canvas texture                                                     */
/* ------------------------------------------------------------------ */

function makeSignTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;

  // Dark background
  ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // White bold text, centered
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Arial, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function generateDecals(lots: Lot[], rng: PRNG): THREE.Group {
  const group = new THREE.Group();
  group.name = 'decals';

  for (const lot of lots) {
    if (!SIGN_ZONES.has(lot.zone)) continue;
    if (lot.roadFacingEdges.length === 0) continue;
    if (!rng.chance(SIGN_CHANCE)) continue;

    const text = rng.pick(SIGN_TEXTS);
    const texture = makeSignTexture(text);
    const geo = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);

    const { minX, maxX, minZ, maxZ } = lot.worldBounds;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const edge = lot.roadFacingEdges[0];

    switch (edge) {
      case 'north':
        // minZ face, facing -Z (outward from the building toward the road)
        mesh.position.set(cx, SIGN_Y, minZ - SIGN_OFFSET);
        mesh.rotation.y = Math.PI; // PlaneGeometry faces +Z by default; flip to face -Z
        break;
      case 'south':
        // maxZ face, facing +Z
        mesh.position.set(cx, SIGN_Y, maxZ + SIGN_OFFSET);
        // Default PlaneGeometry orientation faces +Z, no rotation needed
        break;
      case 'east':
        // maxX face, facing +X
        mesh.position.set(maxX + SIGN_OFFSET, SIGN_Y, cz);
        mesh.rotation.y = -Math.PI / 2;
        break;
      case 'west':
        // minX face, facing -X
        mesh.position.set(minX - SIGN_OFFSET, SIGN_Y, cz);
        mesh.rotation.y = Math.PI / 2;
        break;
    }

    group.add(mesh);
  }

  return group;
}
