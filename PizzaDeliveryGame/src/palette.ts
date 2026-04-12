import * as THREE from 'three';
import {
  createTripMaterial,
  createEmissiveTripMaterial,
  type TripUniforms,
} from './tripShader';

export interface PaletteAtlas {
  texture: THREE.DataTexture;
  mainMaterial: THREE.ShaderMaterial;      // trip shader — buildings only
  standardMaterial: THREE.MeshLambertMaterial; // plain lit — roads, trees, ground, props
  emissiveMaterial: THREE.ShaderMaterial;
  uniforms: TripUniforms;
  uvForIndex(index: number): [number, number];
  setFaceUV(
    uvAttr: THREE.BufferAttribute,
    faceStartIndex: number,
    paletteIndex: number,
  ): void;
}

const SIZE = 16;

/** Write an RGBA pixel into the data array at a given row/col. */
function setPixel(
  data: Uint8Array,
  col: number,
  row: number,
  r: number,
  g: number,
  b: number,
): void {
  const i = (row * SIZE + col) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = 255;
}

/** Convert a 0xRRGGBB integer to [r, g, b] bytes. */
function hex(c: number): [number, number, number] {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

function fillRow(data: Uint8Array, row: number, colors: number[]): void {
  for (let col = 0; col < colors.length; col++) {
    const [r, g, b] = hex(colors[col]);
    setPixel(data, col, row, r, g, b);
  }
}

function buildAtlasData(): Uint8Array {
  const data = new Uint8Array(SIZE * SIZE * 4);

  // Row 0: whites and grays (indices 0-15)
  fillRow(data, 0, [
    0xffffff, 0xf5f5f5, 0xeeeeee, 0xe0e0e0,
    0xd0d0d0, 0xc0c0c0, 0xb0b0b0, 0xa0a0a0,
    0x909090, 0x808080, 0x9e9e9e, 0x606060,
    0x505050, 0x404040, 0x303030, 0x202020,
  ]);

  // Row 1: warm building wall colors — beige, tan, sandstone (indices 16-31)
  fillRow(data, 1, [
    0xc5b8a5, 0xd4c5b0, 0xb8a99a, 0xe0d5c5,
    0xa89888, 0x9b8b7a, 0x8b7d6b, 0xa0927e,
    0xb8a898, 0x7a6c5d, 0xdacdb8, 0xc9b99f,
    0xbfae94, 0xd6c8af, 0xcab996, 0xb09e84,
  ]);

  // Row 2: cool building wall colors — blue-grays, slate (indices 32-47)
  fillRow(data, 2, [
    0x4a5568, 0x2d3748, 0x1a202c, 0x718096,
    0x5a6778, 0x63707e, 0x3d4f5f, 0x556677,
    0x6b7d8e, 0x475766, 0x3a3a3a, 0x4d5c6b,
    0x5c6f7f, 0x6a7b89, 0x324252, 0x283848,
  ]);

  // Row 3: windows, doors, accents (indices 48-63)
  fillRow(data, 3, [
    0x1a2540, 0x253550, 0xfff9c4, 0xe3f2fd,
    0xf3e5f5, 0xffe0b2, 0xc8e6c9, 0x8b4513,
    0x6b3410, 0xd4a574, 0x444444, 0x555555,
    0x666666, 0xaa8866, 0xcc9944, 0xffcc00,
  ]);

  // Row 4: street furniture & lot detail colors (indices 64-79)
  fillRow(data, 4, [
    0x555555, // 64 LIGHT_POLE_COLOR_INDEX — dark gray pole
    0xffffcc, // 65 LIGHT_LAMP_COLOR_INDEX — warm yellow lamp
    0xcc3333, // 66 SIGN_COLOR_INDEX — red sign
    0x8b6914, // 67 BENCH_COLOR_INDEX — wooden brown bench
    0xf5f5dc, // 68 FENCE_COLOR_INDEX — beige/off-white fence
    0x888888, // 69 DRIVEWAY_COLOR_INDEX — concrete gray driveway
    0x000000, 0x000000, 0x000000, 0x000000,
    0x000000, 0x000000, 0x000000, 0x000000,
    0x000000, 0x000000,
  ]);

  // Row 5: reserved / extra accent colors
  // (left black / zeroed for now)

  // Row 6: trunk browns (index 96)
  fillRow(data, 6, [
    0x5c3a1e, 0x6b4423, 0x4a2e14, 0x7a5030,
    0x000000, 0x000000, 0x000000, 0x000000,
    0x000000, 0x000000, 0x000000, 0x000000,
    0x000000, 0x000000, 0x000000, 0x000000,
  ]);

  // Row 7: greens — canopy and grass (indices 112-115)
  fillRow(data, 7, [
    0x2d6b30, 0x3a8040, 0x267d2e, 0x4a7c4f,
    0x000000, 0x000000, 0x000000, 0x000000,
    0x000000, 0x000000, 0x000000, 0x000000,
    0x000000, 0x000000, 0x000000, 0x000000,
  ]);

  // Row 8: ground (index 128)
  fillRow(data, 8, [
    0x4a7c4f, 0x3e6b42, 0x557a50, 0x000000,
    0x000000, 0x000000, 0x000000, 0x000000,
    0x000000, 0x000000, 0x000000, 0x000000,
    0x000000, 0x000000, 0x000000, 0x000000,
  ]);

  return data;
}

export function createPalette(): PaletteAtlas {
  const data = buildAtlasData();

  const texture = new THREE.DataTexture(
    data as unknown as BufferSource,
    SIZE,
    SIZE,
    THREE.RGBAFormat,
  );
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  const { material: mainMaterial, uniforms } = createTripMaterial(texture);
  const { material: emissiveMaterial } = createEmissiveTripMaterial(texture);
  const standardMaterial = new THREE.MeshLambertMaterial({ map: texture });

  function uvForIndex(index: number): [number, number] {
    const col = index % SIZE;
    const row = Math.floor(index / SIZE);
    return [(col + 0.5) / SIZE, (row + 0.5) / SIZE];
  }

  function setFaceUV(
    uvAttr: THREE.BufferAttribute,
    faceStartIndex: number,
    paletteIndex: number,
  ): void {
    const [u, v] = uvForIndex(paletteIndex);
    for (let i = 0; i < 6; i++) {
      uvAttr.setXY(faceStartIndex + i, u, v);
    }
  }

  return { texture, mainMaterial, standardMaterial, emissiveMaterial, uniforms, uvForIndex, setFaceUV };
}
