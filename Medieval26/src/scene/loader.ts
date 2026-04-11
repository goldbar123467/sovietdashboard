import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();

let cachedKnightScene: THREE.Group | null = null;
/** Y-offset to place model feet on ground (y=0) */
let knightGroundOffset = 0;

/**
 * Preload all GLTF models. Call once before the game loop starts.
 * Computes scale so the knight+horse height ≈ 2.3 game-units.
 */
export async function preloadModels(): Promise<void> {
  try {
    const gltf = await gltfLoader.loadAsync('/models/knight_and_horse.glb');
    const root = gltf.scene;

    // Enable shadows on every mesh
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Measure raw bounding box
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());

    // Target height: match procedural knight (helmet at ~2.15)
    const targetHeight = 2.3;
    const scale = targetHeight / size.y;
    root.scale.setScalar(scale);

    // Recompute after scaling
    box.setFromObject(root);
    knightGroundOffset = -box.min.y;

    // Center the model horizontally and along Z
    const center = box.getCenter(new THREE.Vector3());
    root.position.x = -center.x;
    root.position.z = -center.z;
    root.position.y = knightGroundOffset;

    cachedKnightScene = root;

    console.log(
      `[Loader] Knight model ready — scale ${scale.toFixed(4)},`,
      `height ${(size.y * scale).toFixed(2)},`,
      `offset-y ${knightGroundOffset.toFixed(3)}`,
    );
  } catch (e) {
    console.warn('[Loader] Knight GLB not found, using procedural fallback.', e);
  }
}

/**
 * Returns a deep clone of the cached knight model, or null if not loaded.
 * The clone is pre-scaled and positioned so feet sit at y=0.
 */
export function cloneKnightModel(): THREE.Group | null {
  if (!cachedKnightScene) return null;
  return cachedKnightScene.clone(true);
}

/** Whether the GLTF knight was loaded successfully. */
export function hasKnightModel(): boolean {
  return cachedKnightScene !== null;
}
