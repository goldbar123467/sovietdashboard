import * as THREE from 'three';
import type { Lot, BuildingSection, BuildingDef } from './types';
import type { PRNG } from './prng';
import type { PaletteAtlas } from './palette';
import {
  STORY_HEIGHT,
  BUILDING_HEIGHTS,
  BUILDING_FILL_RANGE,
  BUILDING_ROAD_MARGIN,
  VACANCY_RATE,
  WALL_COLOR_INDICES,
  WINDOW_COLOR_INDICES,
  ROOFTOP_PROP_COLOR_INDEX,
} from './constants';

/* ------------------------------------------------------------------ */
/*  Section layout (setbacks)                                          */
/* ------------------------------------------------------------------ */

function computeSections(
  stories: number,
  footprintW: number,
  footprintD: number,
  rng: PRNG,
): BuildingSection[] {
  const totalH = stories * STORY_HEIGHT;

  if (stories >= 10) {
    // 3 sections: base 60%, mid 30%, top 10%
    const baseH = totalH * 0.6;
    const midH = totalH * 0.3;
    const topH = totalH * 0.1;
    const shrink1 = rng.nextFloat(0.8, 0.9);
    const shrink2 = rng.nextFloat(0.8, 0.9);
    return [
      { width: footprintW, depth: footprintD, height: baseH, offsetY: 0 },
      {
        width: footprintW * shrink1,
        depth: footprintD * shrink1,
        height: midH,
        offsetY: baseH,
      },
      {
        width: footprintW * shrink1 * shrink2,
        depth: footprintD * shrink1 * shrink2,
        height: topH,
        offsetY: baseH + midH,
      },
    ];
  }

  if (stories >= 5) {
    // 2 sections: base 70%, top 30%
    const baseH = totalH * 0.7;
    const topH = totalH * 0.3;
    const shrink = rng.nextFloat(0.8, 0.9);
    return [
      { width: footprintW, depth: footprintD, height: baseH, offsetY: 0 },
      {
        width: footprintW * shrink,
        depth: footprintD * shrink,
        height: topH,
        offsetY: baseH,
      },
    ];
  }

  // 1-4 stories: single section
  return [
    { width: footprintW, depth: footprintD, height: totalH, offsetY: 0 },
  ];
}

/* ------------------------------------------------------------------ */
/*  Building definition                                                */
/* ------------------------------------------------------------------ */

function defineBulding(lot: Lot, rng: PRNG): BuildingDef | null {
  // Vacancy check
  if (rng.chance(VACANCY_RATE[lot.zone])) return null;

  const [minS, maxS] = BUILDING_HEIGHTS[lot.zone];
  const stories = rng.nextInt(minS, maxS);

  const lotW = lot.worldBounds.maxX - lot.worldBounds.minX;
  const lotD = lot.worldBounds.maxZ - lot.worldBounds.minZ;

  // Inset per road-facing edge (lot bounds already have 1.5m roadInset)
  const marginW =
    (lot.roadFacingEdges.includes('east') ? BUILDING_ROAD_MARGIN : 0) +
    (lot.roadFacingEdges.includes('west') ? BUILDING_ROAD_MARGIN : 0);
  const marginD =
    (lot.roadFacingEdges.includes('north') ? BUILDING_ROAD_MARGIN : 0) +
    (lot.roadFacingEdges.includes('south') ? BUILDING_ROAD_MARGIN : 0);

  const availW = Math.max(2, lotW - marginW);
  const availD = Math.max(2, lotD - marginD);

  const fill = rng.nextFloat(BUILDING_FILL_RANGE[0], BUILDING_FILL_RANGE[1]);
  const footprintW = availW * fill;
  const footprintD = availD * fill;

  const sections = computeSections(stories, footprintW, footprintD, rng);

  const wallColor = rng.pick(WALL_COLOR_INDICES[lot.zone]);
  const windowColor = rng.pick(WINDOW_COLOR_INDICES);

  // Rooftop props for tall buildings
  const rooftopProps: BuildingDef['rooftopProps'] = [];
  if (stories >= 10) {
    const topSection = sections[sections.length - 1];
    const halfW = topSection.width / 2;
    const halfD = topSection.depth / 2;

    if (rng.chance(0.6)) {
      rooftopProps.push({
        type: 'ac',
        x: rng.nextFloat(-halfW * 0.6, halfW * 0.6),
        z: rng.nextFloat(-halfD * 0.6, halfD * 0.6),
      });
    }
    if (rng.chance(0.3)) {
      rooftopProps.push({
        type: 'antenna',
        x: rng.nextFloat(-halfW * 0.3, halfW * 0.3),
        z: rng.nextFloat(-halfD * 0.3, halfD * 0.3),
      });
    }
    if (rng.chance(0.2)) {
      rooftopProps.push({
        type: 'tank',
        x: rng.nextFloat(-halfW * 0.5, halfW * 0.5),
        z: rng.nextFloat(-halfD * 0.5, halfD * 0.5),
      });
    }
  }

  return { lot, sections, wallColor, windowColor, rooftopProps };
}

/* ------------------------------------------------------------------ */
/*  Mesh generation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build a single building mesh from its definition.
 * Each box face gets UV mapped to palette indices: ground floor = wall,
 * upper faces alternate ~60% window / ~40% wall.
 */
function buildMesh(def: BuildingDef, palette: PaletteAtlas): THREE.Mesh {
  const wallUV = palette.uvForIndex(def.wallColor);
  const winUV = palette.uvForIndex(def.windowColor);
  // Ground-floor band: 2 palette slots darker than the wall color
  const groundFloorUV = palette.uvForIndex(def.wallColor + 2);

  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allUVs: number[] = [];

  for (const section of def.sections) {
    const box = new THREE.BoxGeometry(
      section.width,
      section.height,
      section.depth,
    );
    // Translate so the box base sits at section.offsetY
    box.translate(0, section.offsetY + section.height / 2, 0);

    const posArr = box.attributes.position as THREE.BufferAttribute;
    const normArr = box.attributes.normal as THREE.BufferAttribute;
    const uvArr = box.attributes.uv as THREE.BufferAttribute;

    // BoxGeometry has 6 faces * 2 triangles * 3 verts = 36 verts (non-indexed)
    // But Three.js BoxGeometry uses an index buffer with 24 unique verts.
    // We need to un-index it for per-face UV painting.
    const idx = box.index;
    if (idx) {
      const indexArray = idx.array;
      for (let i = 0; i < indexArray.length; i++) {
        const vi = indexArray[i];
        allPositions.push(
          posArr.getX(vi),
          posArr.getY(vi),
          posArr.getZ(vi),
        );
        allNormals.push(
          normArr.getX(vi),
          normArr.getY(vi),
          normArr.getZ(vi),
        );
        // Placeholder UV — we'll overwrite below
        allUVs.push(uvArr.getX(vi), uvArr.getY(vi));
      }
    }

    box.dispose();
  }

  // Now assign palette UVs per triangle based on height and face normal
  const totalVerts = allPositions.length / 3;
  const groundFloorThreshold = STORY_HEIGHT;

  for (let i = 0; i < totalVerts; i += 3) {
    // Triangle center Y
    const y0 = allPositions[i * 3 + 1];
    const y1 = allPositions[(i + 1) * 3 + 1];
    const y2 = allPositions[(i + 2) * 3 + 1];
    const avgY = (y0 + y1 + y2) / 3;

    // Normal of first vertex (all 3 share the same face normal)
    const ny = allNormals[i * 3 + 1];

    // Top and bottom faces always get wall color
    if (Math.abs(ny) > 0.9) {
      for (let v = 0; v < 3; v++) {
        allUVs[(i + v) * 2] = wallUV[0];
        allUVs[(i + v) * 2 + 1] = wallUV[1];
      }
    } else if (avgY < groundFloorThreshold) {
      // Ground floor side faces get a darker band color
      for (let v = 0; v < 3; v++) {
        allUVs[(i + v) * 2] = groundFloorUV[0];
        allUVs[(i + v) * 2 + 1] = groundFloorUV[1];
      }
    } else {
      // Upper floor side faces: ~60% window, ~40% wall
      // Use a simple hash of triangle index to be deterministic
      const useWindow = (i / 3) % 5 < 3; // 60% window
      const [u, v] = useWindow ? winUV : wallUV;
      for (let vi = 0; vi < 3; vi++) {
        allUVs[(i + vi) * 2] = u;
        allUVs[(i + vi) * 2 + 1] = v;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(allPositions, 3),
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(allNormals, 3),
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(allUVs, 2),
  );

  const mesh = new THREE.Mesh(geometry, palette.mainMaterial);

  // Center on the lot
  const cx = (def.lot.worldBounds.minX + def.lot.worldBounds.maxX) / 2;
  const cz = (def.lot.worldBounds.minZ + def.lot.worldBounds.maxZ) / 2;
  mesh.position.set(cx, 0, cz);

  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Rooftop props                                                      */
/* ------------------------------------------------------------------ */

function buildRooftopProps(
  def: BuildingDef,
  palette: PaletteAtlas,
): THREE.Object3D[] {
  if (def.rooftopProps.length === 0) return [];

  const topSection = def.sections[def.sections.length - 1];
  const roofY = topSection.offsetY + topSection.height;

  const cx = (def.lot.worldBounds.minX + def.lot.worldBounds.maxX) / 2;
  const cz = (def.lot.worldBounds.minZ + def.lot.worldBounds.maxZ) / 2;

  const propUV = palette.uvForIndex(ROOFTOP_PROP_COLOR_INDEX);
  const props: THREE.Object3D[] = [];

  for (const prop of def.rooftopProps) {
    let geo: THREE.BufferGeometry;

    switch (prop.type) {
      case 'ac':
        geo = new THREE.BoxGeometry(1, 0.5, 1);
        geo.translate(0, 0.25, 0);
        break;
      case 'antenna':
        geo = new THREE.CylinderGeometry(0.05, 0.05, 3, 6);
        geo.translate(0, 1.5, 0);
        break;
      case 'tank':
        geo = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
        geo.translate(0, 0.75, 0);
        break;
    }

    // Paint all UVs with the prop color
    const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, propUV[0], propUV[1]);
    }

    const mesh = new THREE.Mesh(geo, palette.mainMaterial);
    mesh.position.set(cx + prop.x, roofY, cz + prop.z);
    props.push(mesh);
  }

  return props;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface BuildingsResult {
  group: THREE.Group;
  /** Set of lot indices that have buildings (not vacant). */
  builtLots: Set<number>;
}

export function generateBuildings(
  lots: Lot[],
  rng: PRNG,
  palette: PaletteAtlas,
): BuildingsResult {
  const group = new THREE.Group();
  group.name = 'buildings';
  const builtLots = new Set<number>();

  for (let i = 0; i < lots.length; i++) {
    const def = defineBulding(lots[i], rng);
    if (!def) continue;

    builtLots.add(i);
    group.add(buildMesh(def, palette));

    for (const prop of buildRooftopProps(def, palette)) {
      group.add(prop);
    }
  }

  return { group, builtLots };
}
