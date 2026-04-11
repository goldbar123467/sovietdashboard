import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6b9bc7);
scene.fog = new THREE.Fog(0x6b9bc7, 50, 90);

export const camera = new THREE.PerspectiveCamera(40, (window.innerWidth - 320) / window.innerHeight, 0.1, 200);
camera.position.set(14, 9, 20);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth - 320, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.domElement.style.position = "absolute";
renderer.domElement.style.left = "320px";
renderer.domElement.style.top = "0";
document.body.appendChild(renderer.domElement);

// ─── Lighting ───────────────────────────────────────────
const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x5a4a30, 0.6);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffeebb, 1.3);
sunLight.position.set(10, 18, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -25;
sunLight.shadow.camera.right = 25;
sunLight.shadow.camera.top = 25;
sunLight.shadow.camera.bottom = -25;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 50;
sunLight.shadow.bias = -0.002;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x8899cc, 0.3);
fillLight.position.set(-8, 6, -10);
scene.add(fillLight);

// ─── Controls ───────────────────────────────────────────
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI / 2.15;
controls.minDistance = 5;
controls.maxDistance = 35;
controls.update();

export const clock = new THREE.Clock();
