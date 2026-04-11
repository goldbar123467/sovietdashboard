import * as THREE from 'three';
import { scene } from './setup';

// Ground
const groundGeo = new THREE.PlaneGeometry(80, 80);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.95 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Lane surface (dirt track)
const laneGeo = new THREE.PlaneGeometry(7, 36);
const laneMat = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.9 });
const lane = new THREE.Mesh(laneGeo, laneMat);
lane.rotation.x = -Math.PI / 2;
lane.position.set(0, 0.02, 0);
lane.receiveShadow = true;
scene.add(lane);

// Tilt barrier (central fence)
const barrierMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.7 });

const barrierRail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 32), barrierMat);
barrierRail.position.set(0, 1.0, 0);
barrierRail.castShadow = true;
scene.add(barrierRail);

const barrierRail2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 32), barrierMat);
barrierRail2.position.set(0, 0.5, 0);
barrierRail2.castShadow = true;
scene.add(barrierRail2);

// Barrier posts
for (let z = -14; z <= 14; z += 4) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 6), barrierMat);
  post.position.set(0, 0.65, z);
  post.castShadow = true;
  scene.add(post);
}

// Outer fences
const fenceMat = new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.8 });
for (const xSide of [-3.5, 3.5]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 34), fenceMat);
  rail.position.set(xSide, 0.7, 0);
  rail.castShadow = true;
  scene.add(rail);
  for (let z = -16; z <= 16; z += 4) {
    const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), fenceMat);
    fp.position.set(xSide, 0.45, z);
    fp.castShadow = true;
    scene.add(fp);
  }
}

// ─── Stands (spectator area) ─────────────────���──────────
const standMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.75 });
const canopyMat = new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.5, metalness: 0.1 });
const canopyTrimMat = new THREE.MeshStandardMaterial({ color: 0xd4a843, roughness: 0.3, metalness: 0.4 });

// Left stands (noble box)
const standL = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 14), standMat);
standL.position.set(-7.5, 1.25, 0);
standL.castShadow = true;
standL.receiveShadow = true;
scene.add(standL);

const stepL = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 14), standMat);
stepL.position.set(-4.8, 0.4, 0);
stepL.receiveShadow = true;
scene.add(stepL);

const canopyL = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.15, 10), canopyMat);
canopyL.position.set(-7.5, 3.8, 0);
canopyL.castShadow = true;
scene.add(canopyL);

const trimL = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 0.3), canopyTrimMat);
trimL.position.set(-7.5, 3.72, 5.1);
scene.add(trimL);
const trimL2 = trimL.clone();
trimL2.position.z = -5.1;
scene.add(trimL2);

for (const z of [-4.5, 4.5]) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6), canopyTrimMat);
  pole.position.set(-5, 3.05, z);
  pole.castShadow = true;
  scene.add(pole);
}

// Right stands (simpler)
const standR = new THREE.Mesh(new THREE.BoxGeometry(5, 1.8, 14), standMat);
standR.position.set(7, 0.9, 0);
standR.castShadow = true;
standR.receiveShadow = true;
scene.add(standR);

// ─── Banners ────────────────────────────────────────────
const bannerColors = [0x1565c0, 0xd4a843, 0x8b1a1a, 0x1b5e20];
for (let i = 0; i < 4; i++) {
  const z = -6 + i * 4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5, 6), barrierMat);
  pole.position.set(-5, 5.0, z);
  scene.add(pole);
  const bannerGeo = new THREE.PlaneGeometry(0.7, 1.8);
  const bannerMat2 = new THREE.MeshStandardMaterial({
    color: bannerColors[i], side: THREE.DoubleSide, roughness: 0.6
  });
  const banner = new THREE.Mesh(bannerGeo, bannerMat2);
  banner.position.set(-5, 6.2, z);
  banner.rotation.y = Math.PI / 2;
  scene.add(banner);
}
