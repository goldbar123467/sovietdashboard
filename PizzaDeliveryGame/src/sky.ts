import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Sky dome — Phase 2: vertex-colored gradient keyed to progress     */
/*  At deliveryProgress 0 → deep midnight blue (identical to Phase 1) */
/*  At deliveryProgress 1 → full vaporwave: cyan horizon, magenta     */
/*                          mid-sky, lime zenith                       */
/* ------------------------------------------------------------------ */

const SKY_RADIUS = 500;

export function createSky(): {
  mesh: THREE.Mesh;
  update(deliveryProgress: number): void;
} {
  const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });

  // Initialize vertex color attribute
  const colors = new Float32Array(geo.attributes.position.count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';

  function update(deliveryProgress: number): void {
    const posAttr = geo.attributes.position;
    const colorAttr = geo.attributes.color as THREE.BufferAttribute;
    const p = deliveryProgress;

    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      // Normalize Y to 0 (bottom) .. 1 (top/zenith)
      const t = (y + SKY_RADIUS) / (SKY_RADIUS * 2);

      // Horizon color (t ~ 0.5, equator)
      // Base: midnight blue (0x0a0a2e → r:0.04, g:0.04, b:0.18)
      // Progress 1.0 → cyan
      const horizonR = 0.04 + p * 0.0;
      const horizonG = 0.04 + p * 0.7;
      const horizonB = 0.18 + p * 0.6;

      // Mid color (t ~ 0.7) → magenta
      const midR = 0.04 + p * 0.8;
      const midG = 0.04 + p * 0.1;
      const midB = 0.18 + p * 0.6;

      // Zenith color (t ~ 1.0) → lime-ish
      const zenithR = 0.02 + p * 0.4;
      const zenithG = 0.02 + p * 0.8;
      const zenithB = 0.12 + p * 0.1;

      let r: number, g: number, b: number;

      if (t < 0.5) {
        // Below horizon — just dark
        r = horizonR * 0.3;
        g = horizonG * 0.3;
        b = horizonB * 0.3;
      } else if (t < 0.7) {
        // Horizon to mid
        const f = (t - 0.5) / 0.2;
        r = horizonR + (midR - horizonR) * f;
        g = horizonG + (midG - horizonG) * f;
        b = horizonB + (midB - horizonB) * f;
      } else {
        // Mid to zenith
        const f = (t - 0.7) / 0.3;
        r = midR + (zenithR - midR) * f;
        g = midG + (zenithG - midG) * f;
        b = midB + (zenithB - midB) * f;
      }

      colorAttr.setXYZ(i, r, g, b);
    }
    colorAttr.needsUpdate = true;
  }

  // Initialize at progress 0 (deep midnight blue — matches Phase 1)
  update(0);

  return { mesh, update };
}
