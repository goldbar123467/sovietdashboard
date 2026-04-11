import * as THREE from 'three';
import { scene } from './setup';
import type { Knight, KnightGroup } from '../types';

export const LANE_START = 16;
export const LANE_X_OFFSET = 1.3;

export let knightAModel: KnightGroup | null = null;
export let knightBModel: KnightGroup | null = null;

export function createKnight3D(primaryColor: number, accentColor: number): KnightGroup {
  const group = new THREE.Group() as KnightGroup;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 });
  const armorMat = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.4, metalness: 0.2 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.3, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

  // ── Horse ──
  const horse = new THREE.Group();

  const horseBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 1.6), bodyMat);
  horseBody.position.y = 0.9;
  horseBody.castShadow = true;
  horse.add(horseBody);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.4), bodyMat);
  neck.position.set(0, 1.35, -0.7);
  neck.rotation.x = -0.4;
  neck.castShadow = true;
  horse.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), bodyMat);
  head.position.set(0, 1.55, -1.05);
  head.castShadow = true;
  horse.add(head);

  const legGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.8, 5);
  const legPositions: [number, number, number][] = [
    [0.22, 0.4, -0.55], [-0.22, 0.4, -0.55],
    [0.22, 0.4, 0.55], [-0.22, 0.4, 0.55],
  ];
  const legs: THREE.Mesh[] = [];
  for (const [lx, ly, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.set(lx, ly, lz);
    leg.castShadow = true;
    horse.add(leg);
    legs.push(leg);
  }
  horse.userData.legs = legs;

  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 1.2), armorMat);
  blanket.position.set(0, 1.3, 0);
  horse.add(blanket);

  group.add(horse);
  group.userData.horse = horse as KnightGroup['userData']['horse'];

  // ── Rider ──
  const rider = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.3), armorMat);
  torso.position.set(0, 1.75, 0);
  torso.castShadow = true;
  rider.add(torso);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), armorMat);
  helmet.position.set(0, 2.15, 0);
  helmet.castShadow = true;
  rider.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.08), darkMat);
  visor.position.set(0, 2.12, -0.14);
  rider.add(visor);

  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.3), accentMaterial);
  shield.position.set(-0.28, 1.75, -0.05);
  shield.castShadow = true;
  rider.add(shield);

  const lance = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.018, 3.2, 5),
    new THREE.MeshStandardMaterial({ color: 0xc4a46c, roughness: 0.6 })
  );
  lance.rotation.x = Math.PI / 2;
  lance.rotation.y = 0.15;
  lance.position.set(-0.2, 1.8, -1.4);
  lance.castShadow = true;
  rider.add(lance);

  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), armorMat);
  rArm.position.set(-0.1, 1.7, -0.1);
  rider.add(rArm);
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), armorMat);
  lArm.position.set(-0.22, 1.7, -0.05);
  rider.add(lArm);

  group.add(rider);
  group.userData.rider = rider;
  group.userData.lance = lance;
  group.userData.shield = shield;

  return group;
}

export function placeKnights(knightA: Knight, knightB: Knight): void {
  if (knightAModel) scene.remove(knightAModel);
  if (knightBModel) scene.remove(knightBModel);

  knightAModel = createKnight3D(knightA.primary, knightA.accent);
  knightAModel.position.set(LANE_X_OFFSET, 0, LANE_START);
  knightAModel.rotation.y = 0;
  scene.add(knightAModel);

  knightBModel = createKnight3D(knightB.primary, knightB.accent);
  knightBModel.position.set(-LANE_X_OFFSET, 0, -LANE_START);
  knightBModel.rotation.y = Math.PI;
  scene.add(knightBModel);
}
