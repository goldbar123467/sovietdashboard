import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { scene } from './scene/setup';
import type { KnightGroup } from './types';

// ─── Physics world (lazy-init, reused across jousts) ─────
let world: CANNON.World | null = null;

interface RagdollPiece {
  body: CANNON.Body;
  mesh: THREE.Mesh;
}

const pieces: RagdollPiece[] = [];

function ensureWorld(): CANNON.World {
  if (world) return world;

  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -20, 0), // heavier than real for snappier comedy falls
  });
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.35;

  // Ground plane at y = 0 (matches tiltyard ground)
  const ground = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
  });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  return world;
}

// ─── Shape from Three.js geometry ────────────────────────
function shapeFromGeo(geo: THREE.BufferGeometry): CANNON.Shape {
  if (geo instanceof THREE.BoxGeometry) {
    const p = geo.parameters;
    return new CANNON.Box(
      new CANNON.Vec3(p.width / 2, p.height / 2, p.depth / 2),
    );
  }
  if (geo instanceof THREE.SphereGeometry) {
    return new CANNON.Sphere(geo.parameters.radius);
  }
  if (geo instanceof THREE.CylinderGeometry) {
    // Approximate cylinder as a box — avoids edge-case issues with tiny radii
    const p = geo.parameters;
    const r = Math.max(p.radiusTop ?? 0.02, p.radiusBottom ?? 0.02);
    return new CANNON.Box(new CANNON.Vec3(r, p.height / 2, r));
  }
  return new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.1));
}

// ─── Public API ──────────────────────────────────────────

/**
 * Hide the original rider, clone each mesh into the scene as an independent
 * physics-driven object, and apply a knockback impulse.
 *
 * knockDirection: +1 to knock rightward (Knight A loses),
 *                 -1 to knock leftward  (Knight B loses).
 */
export function spawnRagdoll(
  loserModel: KnightGroup,
  knockDirection: number,
): void {
  destroyRagdoll(); // clean up any prior ragdoll
  const w = ensureWorld();

  // Ensure world matrices are current before extracting positions
  loserModel.updateWorldMatrix(true, true);

  // Hide the animated rider — the horse stays visible
  loserModel.userData.rider.visible = false;
  if (loserModel.userData.gltfModel) loserModel.userData.gltfModel.visible = false;

  const rider = loserModel.userData.rider;

  for (const child of rider.children) {
    if (!(child instanceof THREE.Mesh)) continue;

    // Get world-space position & orientation
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    child.getWorldPosition(wp);
    child.getWorldQuaternion(wq);

    // Clone the mesh so the original stays parented to the rider group
    const clone = child.clone();
    clone.position.copy(wp);
    clone.quaternion.copy(wq);
    clone.castShadow = true;
    // Ensure ragdoll pieces are visible (originals may be ghosted for GLTF overlay)
    if ((clone.material as THREE.MeshStandardMaterial).opacity < 1) {
      clone.material = (clone.material as THREE.MeshStandardMaterial).clone();
      (clone.material as THREE.MeshStandardMaterial).transparent = false;
      (clone.material as THREE.MeshStandardMaterial).opacity = 1;
      (clone.material as THREE.MeshStandardMaterial).depthWrite = true;
    }
    scene.add(clone);

    // Physics body
    const shape = shapeFromGeo(child.geometry);
    const body = new CANNON.Body({
      mass: 1,
      shape,
      position: new CANNON.Vec3(wp.x, wp.y, wp.z),
      quaternion: new CANNON.Quaternion(wq.x, wq.y, wq.z, wq.w),
      linearDamping: 0.05,
      angularDamping: 0.15,
    });

    // Launch velocity — same base for all pieces, random spread for scatter
    body.velocity.set(
      knockDirection * (5 + Math.random() * 4) + (Math.random() - 0.5) * 2,
      5 + Math.random() * 4,
      (Math.random() - 0.5) * 4,
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 10,
    );

    w.addBody(body);
    pieces.push({ body, mesh: clone });
  }
}

/** Step the physics world and sync body positions → mesh positions. */
export function stepRagdoll(delta: number): void {
  if (!world || pieces.length === 0) return;

  world.step(1 / 60, delta, 3);

  for (const { body, mesh } of pieces) {
    mesh.position.set(body.position.x, body.position.y, body.position.z);
    mesh.quaternion.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w,
    );
  }
}

/** Remove all ragdoll meshes from the scene and bodies from the world. */
export function destroyRagdoll(): void {
  for (const { body, mesh } of pieces) {
    scene.remove(mesh);
    if (world) world.removeBody(body);
  }
  pieces.length = 0;
}
