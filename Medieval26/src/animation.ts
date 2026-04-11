import * as THREE from 'three';
import { scene, camera } from './scene/setup';
import { knightAModel, knightBModel, LANE_START } from './scene/knight3d';
import { animateGallop, resetGltfPose } from './scene/knightAnim';
import type { JoustResult, KnightGroup } from './types';
import { spawnRagdoll, stepRagdoll, destroyRagdoll } from './physics';

const CHARGE_DURATION = 2.0;
const IMPACT_DURATION = 0.3;
const RESULT_DURATION = 1.0;
const RETURN_DURATION = 1.5;

export let joustState: "idle" | "charge" | "impact" | "result" | "return" = "idle";
let joustTimer = 0;
export let joustResult: JoustResult | null = null;

// Callback injected by main.ts to avoid circular deps
let _onJoustComplete: (() => void) | null = null;
export function setOnJoustComplete(fn: () => void) { _onJoustComplete = fn; }

// ─── Impact sound (Web Audio API, synthesized wood crack) ───
let audioCtx: AudioContext | null = null;
export function playImpactSound() {
  if (!audioCtx) audioCtx = new AudioContext();
  const ctx = audioCtx;
  const now = ctx.currentTime;

  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 800;
  filter.Q.value = 1.2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.15);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.5, now);
  thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
  osc.connect(thudGain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

// ─── Camera shake state ─────────────────────────────────
let shakeIntensity = 0;
const camBasePos = new THREE.Vector3();

// ─── Lance fragment pool (Layer 3: shatter) ──────────────
interface Fragment {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  age: number;
}
const fragments: Fragment[] = [];
const fragmentGeo = new THREE.BoxGeometry(0.06, 0.06, 0.2);
const fragmentMat = new THREE.MeshStandardMaterial({ color: 0xc4a46c, roughness: 0.7 });

export function spawnFragments(atZ: number, side: number) {
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(fragmentGeo, fragmentMat);
    mesh.position.set(side * 0.3, 2.0, atZ);
    mesh.castShadow = true;
    scene.add(mesh);
    fragments.push({
      mesh,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      vz: (Math.random() - 0.5) * 4,
      spin: (Math.random() - 0.5) * 12,
      age: 0,
    });
  }
}

export function updateFragments(delta: number) {
  for (let i = fragments.length - 1; i >= 0; i--) {
    const f = fragments[i];
    f.age += delta;
    f.vy -= 12 * delta;
    f.mesh.position.x += f.vx * delta;
    f.mesh.position.y += f.vy * delta;
    f.mesh.position.z += f.vz * delta;
    f.mesh.rotation.x += f.spin * delta;
    f.mesh.rotation.z += f.spin * 0.7 * delta;
    if (f.mesh.position.y < -0.5 || f.age > 2) {
      scene.remove(f.mesh);
      fragments.splice(i, 1);
    }
  }
}

export function clearFragments() {
  for (const f of fragments) scene.remove(f.mesh);
  fragments.length = 0;
}

// ─── Result helpers ──────────────────────────────────────
interface ResultAction {
  type: "none" | "shatter" | "unhorse";
  side?: number;
  loserModel?: "A" | "B";
}

function getResultAction(): ResultAction {
  if (!joustResult) return { type: "none" };

  const aType = joustResult.aHit.type;
  const bType = joustResult.bHit.type;

  if (aType === "shatter") return { type: "shatter", side: 1 };
  if (bType === "shatter") return { type: "shatter", side: -1 };

  if (!joustResult.isDraw && (aType === "solid" || bType === "solid")) {
    return {
      type: "unhorse",
      loserModel: joustResult.loser === joustResult.knightA ? "A" : "B",
    };
  }

  return { type: "none" };
}

let resultAction: ResultAction | null = null;

function resetLegs(model: KnightGroup | null) {
  if (!model) return;
  const legs = model.userData.horse.userData.legs;
  for (const l of legs) l.rotation.x = 0;
}

export function setJoustResult(result: JoustResult) {
  joustResult = result;
}

export function startJoust(result: JoustResult) {
  joustResult = result;
  joustState = "charge";
  joustTimer = 0;
}

export function updateJoustAnimation(delta: number) {
  joustTimer += delta;

  // Need fresh references since knight3d exports are let bindings
  const aModel = knightAModel;
  const bModel = knightBModel;

  if (joustState === "charge") {
    const progress = Math.min(joustTimer / CHARGE_DURATION, 1);

    if (aModel) {
      aModel.position.z = LANE_START * (1 - progress);
      const legs = aModel.userData.horse.userData.legs;
      for (let i = 0; i < legs.length; i++) {
        legs[i].rotation.x = Math.sin(joustTimer * 14 + i * Math.PI * 0.5) * 0.5;
      }
      animateGallop(aModel, joustTimer, progress);
    }
    if (bModel) {
      bModel.position.z = -LANE_START * (1 - progress);
      const legs = bModel.userData.horse.userData.legs;
      for (let i = 0; i < legs.length; i++) {
        legs[i].rotation.x = Math.sin(joustTimer * 14 + i * Math.PI * 0.5) * 0.5;
      }
      animateGallop(bModel, joustTimer, progress);
    }

    if (progress >= 1) {
      joustState = "impact";
      joustTimer = 0;
      resetLegs(aModel);
      resetLegs(bModel);
      if (aModel) resetGltfPose(aModel);
      if (bModel) resetGltfPose(bModel);
      playImpactSound();
      camBasePos.copy(camera.position);
      shakeIntensity = 0.3;
      resultAction = getResultAction();
    }

  } else if (joustState === "impact") {
    const progress = Math.min(joustTimer / IMPACT_DURATION, 1);

    shakeIntensity *= 0.88;
    camera.position.set(
      camBasePos.x + (Math.random() - 0.5) * shakeIntensity,
      camBasePos.y + (Math.random() - 0.5) * shakeIntensity * 0.5,
      camBasePos.z + (Math.random() - 0.5) * shakeIntensity,
    );

    if (progress >= 1) {
      camera.position.copy(camBasePos);
      shakeIntensity = 0;
      joustState = "result";
      joustTimer = 0;
      if (resultAction!.type === "shatter") {
        spawnFragments(0, resultAction!.side!);
      }
      if (resultAction!.type === "unhorse") {
        const loserM = resultAction!.loserModel === "A" ? aModel : bModel;
        if (loserM) {
          spawnRagdoll(loserM, resultAction!.loserModel === "A" ? 1 : -1);
        }
      }
    }

  } else if (joustState === "result") {
    const progress = Math.min(joustTimer / RESULT_DURATION, 1);

    updateFragments(delta);
    stepRagdoll(delta);

    if (progress >= 1) {
      joustState = "return";
      joustTimer = 0;
    }

  } else if (joustState === "return") {
    const progress = Math.min(joustTimer / RETURN_DURATION, 1);

    updateFragments(delta);
    stepRagdoll(delta);

    if (aModel) {
      aModel.position.z = LANE_START * progress;
    }
    if (bModel) {
      bModel.position.z = -LANE_START * progress;
    }

    if (progress >= 1) {
      joustState = "idle";
      joustTimer = 0;
      clearFragments();
      destroyRagdoll();
      if (_onJoustComplete) _onJoustComplete();
    }
  }
}
