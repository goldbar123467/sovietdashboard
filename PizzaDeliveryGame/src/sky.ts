import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Sky dome — Phase 1: static deep midnight blue                     */
/*  Phase 2 will add gradient shifts keyed to deliveryProgress.       */
/* ------------------------------------------------------------------ */

const SKY_RADIUS = 500;
const SKY_COLOR = 0x0a0a2e;

export function createSky(): {
  mesh: THREE.Mesh;
  update(deliveryProgress: number): void;
} {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const material = new THREE.MeshBasicMaterial({
    color: SKY_COLOR,
    side: THREE.BackSide,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Phase 2: deliveryProgress will drive color/gradient changes
  let _progress = 0;

  function update(deliveryProgress: number): void {
    _progress = deliveryProgress;
    // No-op in Phase 1 — hook for Phase 2 sky transitions
  }

  return { mesh, update };
}
