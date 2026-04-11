import * as THREE from 'three';
import type { KnightGroup } from '../types';

/**
 * Apply team colors to a GLTF knight model.
 * Object_0 (knight/rider armor) → primaryColor
 * Object_1 (horse armor)        → accentColor
 */
export function colorizeGltfKnight(
  gltfGroup: THREE.Group,
  primaryColor: number,
  accentColor: number,
): void {
  const primary = new THREE.Color(primaryColor);
  const accent = new THREE.Color(accentColor);
  let meshIndex = 0;

  gltfGroup.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;

    // Clone material so each knight instance is independent
    const oldMat = mesh.material as THREE.MeshStandardMaterial;
    const mat = oldMat.clone();

    if (meshIndex === 0) {
      // First mesh (knight + upper armor) — primary color
      mat.color.copy(primary);
      mat.metalness = 0.35;
      mat.roughness = 0.45;
    } else {
      // Second mesh (horse armor) — accent color
      mat.color.copy(accent);
      mat.metalness = 0.25;
      mat.roughness = 0.55;
    }

    mesh.material = mat;
    meshIndex++;
  });
}

// ─── Procedural animation helpers ────────────────────────

/**
 * Animate the GLTF model during a galloping charge.
 * Call each frame during the charge phase.
 *
 * @param model   The KnightGroup with a gltfModel in userData
 * @param t       Elapsed time (seconds) since charge started
 * @param p       Charge progress 0→1
 */
export function animateGallop(model: KnightGroup, t: number, p: number): void {
  const gltf = model.userData.gltfModel;
  if (!gltf) return;

  const speed = 10 + p * 8; // leg frequency (matches procedural leg anim)
  const intensity = p;       // ramp up with charge progress

  // Vertical bob — simulates gallop rhythm
  gltf.position.y += Math.sin(t * speed) * 0.06 * intensity;

  // Forward/back pitch — horse lunges on each stride
  gltf.rotation.x = Math.sin(t * speed * 0.5) * 0.04 * intensity;

  // Lateral sway — subtle side-to-side rock
  gltf.rotation.z = Math.sin(t * speed * 0.25) * 0.025 * intensity;
}

/**
 * Subtle idle breathing animation when the knight is stationary.
 * Call each frame when not charging.
 *
 * @param model  The KnightGroup
 * @param t      Global elapsed time (e.g. from clock.elapsedTime)
 */
export function animateIdle(model: KnightGroup, t: number): void {
  const gltf = model.userData.gltfModel;
  if (!gltf) return;

  // Gentle breathing bob
  gltf.position.y += Math.sin(t * 1.8) * 0.008;

  // Horse head micro-nod
  gltf.rotation.x = Math.sin(t * 1.2) * 0.008;
  gltf.rotation.z = Math.sin(t * 0.7) * 0.005;
}

/**
 * Reset GLTF model transform to neutral (call between rounds / after animation).
 */
export function resetGltfPose(model: KnightGroup): void {
  const gltf = model.userData.gltfModel;
  if (!gltf) return;
  gltf.rotation.set(0, 0, 0);
  // Don't reset position — it's set by the loader's ground offset
}
