import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Trip-ready ShaderMaterial — Phase 1: visually identical to Lambert */
/* ------------------------------------------------------------------ */

export interface TripUniforms {
  uTime: THREE.IUniform<number>;
  uTripIntensity: THREE.IUniform<number>;
  uDeliveryProgress: THREE.IUniform<number>;
}

/* ---------- vertex shader (shared by both materials) -------------- */

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uTripIntensity;
uniform float uDeliveryProgress;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;

  // Phase 2: vertex wobble will go here

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* ---------- fragment shader — Lambert-style diffuse --------------- */

const fragmentShaderLit = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uTripIntensity;
uniform float uDeliveryProgress;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec4 texColor = texture2D(map, vUv);

  // Simple Lambert diffuse lighting
  // Matches main.ts: DirectionalLight(0xffffff, 0.8) at (50, 100, 50)
  //                   AmbientLight(0xffffff, 0.6)
  vec3 lightDir = normalize(vec3(50.0, 100.0, 50.0));
  float ambient = 0.6;
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.8;

  vec3 color = texColor.rgb * (ambient + diffuse);

  // Phase 2: palette LUT shift will go here

  gl_FragColor = vec4(color, texColor.a);
}
`;

/* ---------- fragment shader — emissive (unlit, for lamps) --------- */

const fragmentShaderEmissive = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uTripIntensity;
uniform float uDeliveryProgress;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec4 texColor = texture2D(map, vUv);

  // No lighting — direct color output (equivalent to MeshBasicMaterial)

  // Phase 2: emissive trip effects will go here

  gl_FragColor = vec4(texColor.rgb, texColor.a);
}
`;

/* ---------- helper: build the shared uniform set ------------------ */

function makeTripUniforms(paletteTexture: THREE.DataTexture): {
  all: Record<string, THREE.IUniform>;
  trip: TripUniforms;
} {
  const uTime: THREE.IUniform<number> = { value: 0 };
  const uTripIntensity: THREE.IUniform<number> = { value: 0 };
  const uDeliveryProgress: THREE.IUniform<number> = { value: 0 };

  const all: Record<string, THREE.IUniform> = {
    map: { value: paletteTexture },
    uTime,
    uTripIntensity,
    uDeliveryProgress,
  };

  return { all, trip: { uTime, uTripIntensity, uDeliveryProgress } };
}

/* ---------- public API -------------------------------------------- */

/**
 * Creates a ShaderMaterial that replicates MeshLambertMaterial behavior
 * with uniform hooks for Phase 2 trip effects.
 */
export function createTripMaterial(
  paletteTexture: THREE.DataTexture,
): { material: THREE.ShaderMaterial; uniforms: TripUniforms } {
  const { all, trip } = makeTripUniforms(paletteTexture);

  const material = new THREE.ShaderMaterial({
    uniforms: all,
    vertexShader,
    fragmentShader: fragmentShaderLit,
    side: THREE.FrontSide,
  });

  return { material, uniforms: trip };
}

/**
 * Creates an unlit ShaderMaterial (equivalent to MeshBasicMaterial)
 * for self-illuminated objects like street lamp heads.
 */
export function createEmissiveTripMaterial(
  paletteTexture: THREE.DataTexture,
): { material: THREE.ShaderMaterial; uniforms: TripUniforms } {
  const { all, trip } = makeTripUniforms(paletteTexture);

  const material = new THREE.ShaderMaterial({
    uniforms: all,
    vertexShader,
    fragmentShader: fragmentShaderEmissive,
    side: THREE.FrontSide,
  });

  return { material, uniforms: trip };
}
