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

  // Compute world position from original vertex for hash/wobble reference
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;

  // Phase 2: vertex wobble — apply displacement in local space
  vec3 pos = position;
  if (uTripIntensity > 0.0) {
    pos.x += sin(uTime * 2.0 + worldPos.x * 0.5 + worldPos.z * 0.3) * uTripIntensity * 0.3;
    pos.z += cos(uTime * 1.7 + worldPos.z * 0.4 + worldPos.x * 0.2) * uTripIntensity * 0.2;
  }

  // Building lean: slight tilt based on world position hash
  if (uTripIntensity > 0.0) {
    float leanHash = fract(sin(dot(vec2(worldPos.x * 0.1, worldPos.z * 0.1), vec2(12.9898, 78.233))) * 43758.5453);
    float leanAngle = (leanHash - 0.5) * uTripIntensity * 0.08;
    float cosA = cos(leanAngle);
    float sinA = sin(leanAngle);
    // Rotate around X axis (lean forward/back)
    float newY = pos.y * cosA - pos.z * sinA;
    float newZ = pos.y * sinA + pos.z * cosA;
    pos.y = newY;
    pos.z = newZ;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
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

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 texColor = texture2D(map, vUv);

  // Simple Lambert diffuse lighting
  // Matches main.ts: DirectionalLight(0xffffff, 0.8) at (50, 100, 50)
  //                   AmbientLight(0xffffff, 0.6)
  vec3 lightDir = normalize(vec3(50.0, 100.0, 50.0));
  float ambient = 0.6;
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.8;

  vec3 color = texColor.rgb * (ambient + diffuse);

  // Phase 2: palette LUT shift toward vaporwave
  if (uTripIntensity > 0.0) {
    vec3 hsv = rgb2hsv(color);
    hsv.x += uTripIntensity * 0.15; // hue shift toward magenta
    hsv.x = fract(hsv.x);           // wrap hue
    hsv.y = min(1.0, hsv.y + uTripIntensity * 0.3); // increase saturation
    color = hsv2rgb(hsv);
    // Mix toward a magenta/cyan tint
    vec3 vaporTint = vec3(0.8, 0.2, 0.9); // magenta
    color = mix(color, color * vaporTint, uTripIntensity * 0.25);
  }

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

// RGB to HSV
vec3 rgb2hsv_e(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB
vec3 hsv2rgb_e(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 texColor = texture2D(map, vUv);

  // No lighting — direct color output (equivalent to MeshBasicMaterial)
  vec3 color = texColor.rgb;

  // Phase 2: emissive trip color shift
  if (uTripIntensity > 0.0) {
    vec3 hsv = rgb2hsv_e(color);
    hsv.x += uTripIntensity * 0.15;
    hsv.x = fract(hsv.x);
    hsv.y = min(1.0, hsv.y + uTripIntensity * 0.3);
    color = hsv2rgb_e(hsv);
    vec3 vaporTint = vec3(0.8, 0.2, 0.9);
    color = mix(color, color * vaporTint, uTripIntensity * 0.25);
  }

  gl_FragColor = vec4(color, texColor.a);
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

/* ---------- dissolve transition ------------------------------------ */

/**
 * Triggers a dissolve transition: ramps uTripIntensity to 1.0, holds
 * briefly, fires onPeak callback (for scene swap), then ramps back down
 * to the saved intensity. Useful for delivery-complete transitions.
 */
export function triggerDissolve(
  uniforms: TripUniforms,
  onPeak: () => void,
): void {
  const savedIntensity = uniforms.uTripIntensity.value;
  const startTime = performance.now();
  const rampUpMs = 500;
  const holdMs = 300;
  const rampDownMs = 1000;
  const totalMs = rampUpMs + holdMs + rampDownMs;
  let peakFired = false;

  function tick(): void {
    const elapsed = performance.now() - startTime;

    if (elapsed < rampUpMs) {
      // Ramp up to 1.0
      const t = elapsed / rampUpMs;
      uniforms.uTripIntensity.value = savedIntensity + (1.0 - savedIntensity) * t;
    } else if (elapsed < rampUpMs + holdMs) {
      // Hold at peak
      uniforms.uTripIntensity.value = 1.0;
      if (!peakFired) {
        peakFired = true;
        onPeak();
      }
    } else if (elapsed < totalMs) {
      // Ramp back down
      const t = (elapsed - rampUpMs - holdMs) / rampDownMs;
      uniforms.uTripIntensity.value = 1.0 - (1.0 - savedIntensity) * t;
    } else {
      // Done — restore original intensity
      uniforms.uTripIntensity.value = savedIntensity;
      return;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
