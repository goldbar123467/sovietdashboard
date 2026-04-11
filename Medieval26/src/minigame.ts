import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { scene, camera, controls } from './scene/setup';
import { knightAModel, knightBModel, LANE_START, LANE_X_OFFSET } from './scene/knight3d';
import { animateGallop, resetGltfPose } from './scene/knightAnim';
import { playImpactSound, setJoustResult } from './animation';
import { rand } from './data';
import type { Knight, JoustResult, HitResult, MiniGameState, LanceAimZone } from './types';

// ═══════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════
const FADE_DURATION = 0.8;
const READY_DURATION = 1.6;
const CHARGE_DURATION = 3.0;
const POST_HIT_DURATION = 2.8;
const ROUND_GAP_DURATION = 1.4;
const MATCH_RESULT_DURATION = 3.0;

// The total lateral distance the lance must cross:
// player at x=1.3, opponent at x=-1.3 → 2.6 units across the barrier
const BARRIER_WIDTH = LANE_X_OFFSET * 2; // 2.6

// ═══════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════
let mgState: MiniGameState | null = null;
let playerKnight: Knight | null = null;
let opponentKnight: Knight | null = null;
let _onComplete: ((result: JoustResult) => void) | null = null;

const savedCamPos = new THREE.Vector3();
const savedCamTarget = new THREE.Vector3();
let shakeIntensity = 0;
let camFlinchX = 0;
let camFlinchY = 0;

let fpLance: THREE.Group | null = null;
let fpShield: THREE.Group | null = null;

// Impact flash
let impactFlash: THREE.Mesh | null = null;
let impactFlashAge = 0;

let audioCtx: AudioContext | null = null;

// Hit detection
let hitResolved = false;
let playerHitResult: HitResult | null = null;
let opponentHitResult: HitResult | null = null;
let hitContactPoint: THREE.Vector3 | null = null;

// Slow-mo at impact
let timeScale = 1.0;

// Opponent animation
let oppRecoilImpulse = new THREE.Vector3();
let oppRecoilAngle = 0;
let opponentUnhorsed = false;
let oppLanceTilt = 0;

// ═══════════════════════════════════════════════════════
// Cannon-ES Physics
// ═══════════════════════════════════════════════════════
let physWorld: CANNON.World | null = null;

interface PhysFragment { body: CANNON.Body; mesh: THREE.Mesh; age: number; }
const physFragments: PhysFragment[] = [];

interface RagdollPiece { body: CANNON.Body; mesh: THREE.Mesh; }
const ragdollPieces: RagdollPiece[] = [];

interface Dust { mesh: THREE.Mesh; vx: number; vy: number; vz: number; age: number; maxAge: number; }
const dustParticles: Dust[] = [];
const dustGeo = new THREE.SphereGeometry(0.04, 4, 3);
const dustMat = new THREE.MeshBasicMaterial({ color: 0x9a7a4a, transparent: true, opacity: 0.5 });

function ensurePhysWorld(): CANNON.World {
  if (physWorld) return physWorld;
  physWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  physWorld.broadphase = new CANNON.SAPBroadphase(physWorld);
  physWorld.defaultContactMaterial.friction = 0.5;
  physWorld.defaultContactMaterial.restitution = 0.25;
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physWorld.addBody(ground);
  return physWorld;
}

function cleanupAllPhysics() {
  for (const f of physFragments) { scene.remove(f.mesh); if (physWorld) physWorld.removeBody(f.body); }
  physFragments.length = 0;
  for (const r of ragdollPieces) { scene.remove(r.mesh); if (physWorld) physWorld.removeBody(r.body); }
  ragdollPieces.length = 0;
  for (const d of dustParticles) scene.remove(d.mesh);
  dustParticles.length = 0;
  if (impactFlash) { scene.remove(impactFlash); impactFlash = null; }
  physWorld = null;
}

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════
export function setOnMiniGameComplete(fn: (r: JoustResult) => void) { _onComplete = fn; }
export function isMiniGameActive(): boolean { return mgState !== null; }

export function startMiniGame(knightA: Knight, knightB: Knight) {
  playerKnight = knightA;
  opponentKnight = knightB;
  savedCamPos.copy(camera.position);
  savedCamTarget.copy(controls.target);
  controls.enabled = false;

  mgState = {
    phase: "fade-in", currentRound: 1,
    playerRoundsWon: 0, opponentRoundsWon: 0,
    roundResults: [], aimY: 0, isBlocking: false,
    timer: 0, totalChargeTime: 0, chargeProgress: 0,
  };

  showHUD(); updateScoreDisplay(); updateRoundDisplay(); setActionText("");
  document.getElementById("view-fade")!.classList.add("active");
  addInputListeners();
}

export function updateMiniGame(delta: number) {
  if (!mgState) return;
  const dt = delta * timeScale;
  mgState.timer += dt;

  stepPhysics(dt);
  updateDust(dt);
  updateImpactFlash(dt);

  switch (mgState.phase) {
    case "fade-in": phaseFadeIn(); break;
    case "ready": phaseReady(); break;
    case "charge": phaseCharge(dt); break;
    case "impact": phasePostHit(dt); break;
    case "round-result": phaseRoundGap(); break;
    case "match-result": phaseMatchResult(dt); break;
    case "fade-out": phaseFadeOut(); break;
  }

  // Slow-mo recovery
  if (timeScale < 1.0) timeScale = Math.min(1.0, timeScale + delta * 1.5);
}

// ═══════════════════════════════════════════════════════
// Phases
// ═══════════════════════════════════════════════════════
function phaseFadeIn() {
  if (mgState!.timer >= FADE_DURATION * 0.5 && !fpLance) {
    setupFirstPerson();
    resetForNewRound();
  }
  if (mgState!.timer >= FADE_DURATION) {
    document.getElementById("view-fade")!.classList.remove("active");
    enterPhase("ready");
  }
}

function phaseReady() {
  if (mgState!.timer < 0.1) {
    updateRoundDisplay();
    setActionText(`ROUND ${mgState!.currentRound}`, true);
    playHornSound();
  }
  if (mgState!.timer >= READY_DURATION * 0.6) setActionText("");
  if (mgState!.timer >= READY_DURATION) {
    mgState!.totalChargeTime = 0;
    enterPhase("charge");
  }
  updateFPCamera(0, 0);
}

// ═══════════════════════════════════════════════════════
// CHARGE — lance physically hits opponent via raycasting
// ═══════════════════════════════════════════════════════
function phaseCharge(delta: number) {
  mgState!.totalChargeTime += delta;
  const rawP = Math.min(mgState!.timer / CHARGE_DURATION, 1);
  const p = easeInQuad(rawP);
  mgState!.chargeProgress = p;
  const t = mgState!.totalChargeTime;

  const bModel = knightBModel;
  const aModel = knightAModel;

  const playerZ = LANE_START * (1 - p);
  const opponentZ = -LANE_START * (1 - p);

  if (aModel) aModel.position.z = playerZ;

  if (bModel) {
    bModel.position.z = opponentZ;
    bModel.position.y = Math.sin(t * (10 + p * 8) * 0.5) * 0.04 * p;

    const legSpeed = 10 + p * 8;
    const legAmp = 0.35 + p * 0.25;
    const legs = bModel.userData.horse.userData.legs;
    for (let i = 0; i < legs.length; i++) {
      legs[i].rotation.x = Math.sin(t * legSpeed + i * Math.PI * 0.5) * legAmp;
    }

    bModel.userData.rider.rotation.x = -0.06 * p;
    bModel.userData.rider.rotation.z = Math.sin(t * legSpeed * 0.5) * 0.025;
    // GLTF gallop: forward pitch + lateral sway driven by charge speed
    if (bModel.userData.gltfModel) {
      bModel.userData.gltfModel.rotation.x = -0.06 * p + Math.sin(t * legSpeed * 0.5) * 0.04 * p;
      bModel.userData.gltfModel.rotation.z = Math.sin(t * legSpeed * 0.25) * 0.025 * p;
    }

    if (p > 0.15) {
      const targetTilt = -0.4;
      oppLanceTilt += (targetTilt - oppLanceTilt) * 2.5 * delta;
      bModel.userData.lance.rotation.x = Math.PI / 2 + oppLanceTilt;
      bModel.userData.lance.rotation.z = Math.sin(t * 3) * 0.03;
    }
  }

  // Dust
  if (p > 0.1 && Math.random() < 0.25 + p * 0.4)
    spawnDust(-LANE_X_OFFSET, 0.05, opponentZ + 1.0, 0.5 + p * 1.5);
  if (p > 0.1 && Math.random() < 0.15)
    spawnDust(LANE_X_OFFSET, 0.05, playerZ + 0.8, 0.3);

  updateFPCamera(p, t);
  updateFPWeapons(p, t);
  updateCrosshairUI();
  updateBlockUI();

  // ═══════════════════════════════════════════════════
  // HIT DETECTION — raycast ACROSS the barrier
  // The lance extends from the player's side (-X direction)
  // toward the opponent's body on the other side of the barrier
  // ═══════════════════════════════════════════════════
  if (!hitResolved && bModel) {
    // Only check when the two knights are passing each other (close in Z)
    const zDist = Math.abs(playerZ - opponentZ);
    if (zDist < 4.0) {
      bModel.updateWorldMatrix(true, true);

      if (!mgState!.isBlocking) {
        // Lance origin: on the player's side, at lance hand position
        const aimY = mgState!.aimY;
        const lanceBaseY = 1.9 + aimY * 0.4; // aim shifts lance height
        const lanceOrigin = new THREE.Vector3(
          LANE_X_OFFSET - 0.3, // slightly toward center from player position
          lanceBaseY,
          playerZ,             // at player's current z
        );

        // Lance direction: across the barrier toward opponent
        // The lance goes LEFT (negative X) and slightly toward the opponent's z
        const targetX = -LANE_X_OFFSET; // opponent x position
        const targetY = lanceBaseY + aimY * 0.15;
        const targetZ = opponentZ;

        const lanceDir = new THREE.Vector3(
          targetX - lanceOrigin.x,
          targetY - lanceOrigin.y,
          targetZ - lanceOrigin.z,
        ).normalize();

        const raycaster = new THREE.Raycaster(lanceOrigin, lanceDir, 0, BARRIER_WIDTH + 1.5);

        // Collect opponent rider meshes
        const riderMeshes: THREE.Mesh[] = [];
        bModel.userData.rider.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) riderMeshes.push(child);
        });

        const intersects = raycaster.intersectObjects(riderMeshes, false);

        if (intersects.length > 0) {
          const hit = intersects[0];
          hitContactPoint = hit.point.clone();
          playerHitResult = classifyHitFromContact(hit);
          opponentHitResult = resolveOpponentLanceHit();

          // Trigger all the physics at the contact point
          triggerImpactAtPoint(hitContactPoint, playerHitResult, bModel);

          // Brief slow-motion
          timeScale = 0.3;

          hitResolved = true;
        }
      }

      // If blocking or lance hasn't hit, check if they've passed each other
      if (!hitResolved && playerZ <= Math.abs(opponentZ) * 0.3) {
        // They've crossed — it's a miss (or shield block)
        if (mgState!.isBlocking) {
          playerHitResult = { type: "miss", score: 0, label: "keeps shield high, no attack" };
        } else {
          playerHitResult = { type: "miss", score: 0, label: "lance finds only air!" };
        }
        opponentHitResult = resolveOpponentLanceHit();
        triggerPlayerHitEffects(opponentHitResult);
        hitResolved = true;
      }
    }
  }

  if (rawP >= 1 && !hitResolved) {
    playerHitResult = { type: "miss", score: 0, label: "rides past without contact" };
    opponentHitResult = resolveOpponentLanceHit();
    triggerPlayerHitEffects(opponentHitResult);
    hitResolved = true;
  }

  if (hitResolved) {
    finalizeRoundResult();
    enterPhase("impact");
  }
}

// ═══════════════════════════════════════════════════════
// CLASSIFY HIT by what the lance actually struck
// ═══════════════════════════════════════════════════════
function classifyHitFromContact(intersection: THREE.Intersection): HitResult {
  const hitY = intersection.point.y;
  const geo = (intersection.object as THREE.Mesh).geometry;

  // Identify body part by geometry type + world position
  const isSphere = geo instanceof THREE.SphereGeometry;
  const isBox = geo instanceof THREE.BoxGeometry;
  const isThinBox = isBox && (geo as THREE.BoxGeometry).parameters.width < 0.1;

  if (isSphere || hitY > 2.05) {
    // HELMET — devastating
    return { type: "shatter", score: 3, label: "shatters his lance on the helm!" };
  }
  if (isThinBox) {
    // SHIELD — deflected
    return { type: "glance", score: 1, label: "lance deflects off the shield" };
  }
  if (hitY > 1.6) {
    // TORSO — solid center hit
    return { type: "solid", score: 2, label: "strikes solid into the breastplate!" };
  }
  // LOW — arm or below
  return { type: "glance", score: 1, label: "catches a low blow on the side" };
}

function resolveOpponentLanceHit(): HitResult {
  const skill = opponentKnight!.skill;
  const blocking = mgState!.isBlocking;
  const r = rand();
  const s = skill / 100;

  if (blocking) {
    if (r < 0.08 * s) return { type: "solid", score: 2, label: "drives through the guard!" };
    if (r < 0.35) return { type: "glance", score: 1, label: "scrapes the raised shield" };
    return { type: "miss", score: 0, label: "lance clatters off shield" };
  }

  if (r < 0.12 * s) return { type: "shatter", score: 3, label: "shatters his lance on the breastplate!" };
  if (r < 0.45 + s * 0.2) return { type: "solid", score: 2, label: "strikes true to the center!" };
  if (r < 0.7) return { type: "glance", score: 1, label: "lands a scraping blow" };
  return { type: "miss", score: 0, label: "lance passes wide" };
}

// ═══════════════════════════════════════════════════════
// IMPACT — all physics effects at the contact point
// ═══════════════════════════════════════════════════════
function triggerImpactAtPoint(
  contactPt: THREE.Vector3,
  hitResult: HitResult,
  opponentModel: THREE.Group,
) {
  // Sound — layered for bigger hits
  playImpactSound();
  if (hitResult.score >= 2) setTimeout(() => playImpactSound(), 70);
  if (hitResult.type === "shatter") setTimeout(() => playImpactSound(), 150);

  // Camera
  const force = hitResult.score / 3;
  shakeIntensity = 0.2 + force * 0.35;

  // Impact flash at contact point
  spawnImpactFlash(contactPt);

  // Physics fragments at contact point
  const fragDir = 1; // fragments fly rightward (from opponent's perspective)
  if (hitResult.type === "shatter") {
    spawnPhysFragments(contactPt.x, contactPt.y, contactPt.z, fragDir, 16, 1.0);
    spawnArmorChunks(contactPt.x, contactPt.y, contactPt.z, fragDir);
    spawnDust(contactPt.x, 0.1, contactPt.z, 4.0);
  } else if (hitResult.type === "solid") {
    spawnPhysFragments(contactPt.x, contactPt.y, contactPt.z, fragDir, 8, 0.7);
    spawnDust(contactPt.x, 0.1, contactPt.z, 2.0);
  } else {
    spawnPhysFragments(contactPt.x, contactPt.y, contactPt.z, fragDir, 3, 0.3);
  }

  // Opponent reaction
  if (hitResult.type === "shatter") {
    spawnOpponentRagdoll(opponentModel, contactPt);
  } else if (hitResult.type === "solid") {
    oppRecoilAngle = 0.55;
    oppRecoilImpulse.set(1.0, 0.2, 0.4);
  } else {
    oppRecoilAngle = 0.2;
    oppRecoilImpulse.set(0.3, 0, 0.15);
  }

  // Dust cloud at contact
  for (let i = 0; i < 4; i++) {
    spawnDust(contactPt.x + (Math.random() - 0.5) * 0.5, 0.05, contactPt.z + (Math.random() - 0.5) * 0.5, 1.5);
  }
}

function triggerPlayerHitEffects(hitResult: HitResult) {
  if (!hitResult || hitResult.type === "miss") return;
  const force = hitResult.score / 3;
  camFlinchX = (0.1 + force * 0.2) * (Math.random() > 0.5 ? 1 : -1);
  camFlinchY = -(0.05 + force * 0.12);
  shakeIntensity = Math.max(shakeIntensity, 0.1 + force * 0.2);
  playImpactSound();

  const pz = knightAModel ? knightAModel.position.z : 0;
  if (hitResult.score >= 2) spawnPhysFragments(LANE_X_OFFSET, 2.0, pz, -1, 5, force);
}

// ═══════════════════════════════════════════════════════
// Impact Flash (bright spark at contact point)
// ═══════════════════════════════════════════════════════
function spawnImpactFlash(pos: THREE.Vector3) {
  if (impactFlash) scene.remove(impactFlash);
  impactFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 1.0 }),
  );
  impactFlash.position.copy(pos);
  scene.add(impactFlash);
  impactFlashAge = 0;
}

function updateImpactFlash(delta: number) {
  if (!impactFlash) return;
  impactFlashAge += delta;
  const life = 1 - impactFlashAge / 0.25; // 0.25s flash
  if (life <= 0) {
    scene.remove(impactFlash);
    impactFlash = null;
  } else {
    (impactFlash.material as THREE.MeshBasicMaterial).opacity = life;
    impactFlash.scale.setScalar(1 + impactFlashAge * 4); // expands
  }
}

// ═══════════════════════════════════════════════════════
// POST-HIT phase (physics plays out, camera watches)
// ═══════════════════════════════════════════════════════
function phasePostHit(delta: number) {
  shakeIntensity *= 0.88;
  camFlinchX *= 0.93;
  camFlinchY *= 0.93;

  const t = mgState!.timer;
  const driftP = easeOutQuad(Math.min(t / POST_HIT_DURATION, 1));

  // Camera pulls back and up to watch the aftermath
  const camZ = driftP * 5.0;
  const camY = 2.25 + driftP * 1.5;
  const camX = LANE_X_OFFSET + driftP * 1.5;

  camera.position.set(
    camX + (Math.random() - 0.5) * shakeIntensity + camFlinchX,
    camY + (Math.random() - 0.5) * shakeIntensity * 0.4 + camFlinchY,
    camZ + (Math.random() - 0.5) * shakeIntensity,
  );

  const lookTarget = hitContactPoint
    ? new THREE.Vector3(hitContactPoint.x, Math.max(0.5, hitContactPoint.y - driftP * 0.3), hitContactPoint.z - 1)
    : new THREE.Vector3(0, 1.5, -2);
  camera.lookAt(lookTarget);

  animateOpponentRecoil(delta);

  if (t < 0.1) {
    const lastRound = mgState!.roundResults[mgState!.roundResults.length - 1];
    let text: string;
    if (lastRound.playerWonRound) {
      text = lastRound.playerHit.type === "shatter" ? "SHATTERED!" : "HIT!";
    } else if (lastRound.isDraw) {
      text = "CLASH!";
    } else {
      text = lastRound.playerAction === "block" ? "BLOCKED!" : "STRUCK!";
    }
    setActionText(text, true);
  }
  if (t > POST_HIT_DURATION * 0.4) setActionText("");

  if (t >= POST_HIT_DURATION) {
    if (mgState!.playerRoundsWon >= 2 || mgState!.opponentRoundsWon >= 2 || mgState!.currentRound >= 3) {
      enterPhase("match-result");
    } else {
      enterPhase("round-result");
    }
  }
}

function phaseRoundGap() {
  camera.position.set(LANE_X_OFFSET + 3, 3, 8);
  camera.lookAt(0, 1, 0);
  if (mgState!.timer < 0.1) setActionText(`${mgState!.playerRoundsWon} — ${mgState!.opponentRoundsWon}`, true);
  if (mgState!.timer > ROUND_GAP_DURATION * 0.6) setActionText("");
  if (mgState!.timer >= ROUND_GAP_DURATION) {
    mgState!.currentRound++;
    cleanupRoundPhysics();
    resetForNewRound();
    enterPhase("ready");
  }
}

function phaseMatchResult(delta: number) {
  if (mgState!.timer < 0.1) {
    const pw = mgState!.playerRoundsWon > mgState!.opponentRoundsWon;
    const draw = mgState!.playerRoundsWon === mgState!.opponentRoundsWon;
    setActionText(draw ? "A DRAW!" : pw ? "VICTORY!" : "DEFEAT!", true);
  }
  const drift = easeOutQuad(Math.min(mgState!.timer / MATCH_RESULT_DURATION, 1));
  camera.position.set(LANE_X_OFFSET + drift * 6, 2.5 + drift * 4, drift * 12);
  camera.lookAt(0, 1, -2);
  animateOpponentRecoil(delta);
  if (mgState!.timer >= MATCH_RESULT_DURATION) {
    setActionText("");
    document.getElementById("view-fade")!.classList.add("active");
    enterPhase("fade-out");
  }
}

function phaseFadeOut() {
  if (mgState!.timer >= FADE_DURATION * 0.5 && fpLance) {
    teardownFirstPerson();
    resetForNewRound();
    resetLegsAll();
  }
  if (mgState!.timer >= FADE_DURATION) {
    document.getElementById("view-fade")!.classList.remove("active");
    hideHUD(); removeInputListeners();
    const result = buildFinalResult();
    setJoustResult(result);
    mgState = null;
    if (_onComplete) _onComplete(result);
  }
}

// ═══════════════════════════════════════════════════════
// Finalize round
// ═══════════════════════════════════════════════════════
function finalizeRoundResult() {
  const pHit = playerHitResult || { type: "miss" as const, score: 0, label: "misses wide" };
  const oHit = opponentHitResult || { type: "miss" as const, score: 0, label: "misses wide" };

  let playerWonRound = false;
  let isDraw = false;

  if (Math.abs(pHit.score - oHit.score) < 0.1) isDraw = true;
  else playerWonRound = pHit.score > oHit.score;

  if (playerWonRound) mgState!.playerRoundsWon++;
  else if (!isDraw) mgState!.opponentRoundsWon++;

  mgState!.roundResults.push({
    playerAction: mgState!.isBlocking ? "block" : "attack",
    playerAimZone: getAimZone(mgState!.aimY),
    opponentAimZone: "center",
    playerHit: pHit, opponentHit: oHit,
    playerWonRound, isDraw,
  });

  updateScoreDisplay();
  resetLegsAll();
}

// ═══════════════════════════════════════════════════════
// Physics fragments (cannon-es)
// ═══════════════════════════════════════════════════════
function spawnPhysFragments(x: number, y: number, z: number, dir: number, count: number, force: number) {
  const w = ensurePhysWorld();
  const geos = [
    new THREE.BoxGeometry(0.04, 0.04, 0.2),
    new THREE.BoxGeometry(0.06, 0.03, 0.15),
    new THREE.BoxGeometry(0.03, 0.05, 0.25),
  ];
  const mat = new THREE.MeshStandardMaterial({ color: 0xc4a46c, roughness: 0.7 });

  for (let i = 0; i < count; i++) {
    const g = geos[i % geos.length];
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z);
    mesh.castShadow = true;
    scene.add(mesh);

    const p = g.parameters;
    const body = new CANNON.Body({
      mass: 0.2 + Math.random() * 0.3,
      shape: new CANNON.Box(new CANNON.Vec3(p.width / 2, p.height / 2, p.depth / 2)),
      position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
      linearDamping: 0.03, angularDamping: 0.08,
    });

    const spd = (4 + Math.random() * 6) * (0.5 + force);
    body.velocity.set(
      dir * spd * (0.5 + Math.random()) + (Math.random() - 0.5) * 3,
      3 + Math.random() * 7 * force,
      (Math.random() - 0.5) * 6,
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 18,
    );
    w.addBody(body);
    physFragments.push({ body, mesh, age: 0 });
  }
}

function spawnArmorChunks(x: number, y: number, z: number, dir: number) {
  const w = ensurePhysWorld();
  const geos = [
    new THREE.BoxGeometry(0.12, 0.08, 0.06),
    new THREE.BoxGeometry(0.06, 0.12, 0.08),
    new THREE.BoxGeometry(0.09, 0.06, 0.1),
    new THREE.BoxGeometry(0.07, 0.07, 0.07),
  ];
  const mat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(geos[i], mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.2, y, z);
    mesh.castShadow = true;
    scene.add(mesh);
    const body = new CANNON.Body({
      mass: 0.6, shape: new CANNON.Box(new CANNON.Vec3(0.05, 0.04, 0.04)),
      position: new CANNON.Vec3(mesh.position.x, y, z),
      linearDamping: 0.06, angularDamping: 0.12,
    });
    body.velocity.set(dir * (3 + Math.random() * 4), 2 + Math.random() * 5, (Math.random() - 0.5) * 4);
    body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10);
    w.addBody(body);
    physFragments.push({ body, mesh, age: 0 });
  }
}

// ═══════════════════════════════════════════════════════
// Ragdoll (opponent knocked off horse)
// ═══════════════════════════════════════════════════════
function spawnOpponentRagdoll(model: THREE.Group, contactPt: THREE.Vector3) {
  const w = ensurePhysWorld();
  model.updateWorldMatrix(true, true);
  (model as any).userData.rider.visible = false;
  if ((model as any).userData.gltfModel) (model as any).userData.gltfModel.visible = false;
  opponentUnhorsed = true;

  const rider = (model as any).userData.rider as THREE.Group;
  const knockDir = new THREE.Vector3(1, 0.5, 0.3).normalize();

  for (const child of rider.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const wp = new THREE.Vector3(); child.getWorldPosition(wp);
    const wq = new THREE.Quaternion(); child.getWorldQuaternion(wq);

    const clone = child.clone();
    clone.position.copy(wp); clone.quaternion.copy(wq);
    clone.castShadow = true;
    // Ensure ragdoll pieces are visible (originals may be ghosted for GLTF overlay)
    if ((clone.material as THREE.MeshStandardMaterial).opacity < 1) {
      clone.material = (clone.material as THREE.MeshStandardMaterial).clone();
      (clone.material as THREE.MeshStandardMaterial).transparent = false;
      (clone.material as THREE.MeshStandardMaterial).opacity = 1;
      (clone.material as THREE.MeshStandardMaterial).depthWrite = true;
    }
    scene.add(clone);

    let shape: CANNON.Shape;
    const geo = child.geometry;
    if (geo instanceof THREE.BoxGeometry) {
      const p = geo.parameters;
      shape = new CANNON.Box(new CANNON.Vec3(p.width / 2, p.height / 2, p.depth / 2));
    } else if (geo instanceof THREE.SphereGeometry) {
      shape = new CANNON.Sphere(geo.parameters.radius);
    } else if (geo instanceof THREE.CylinderGeometry) {
      const p = geo.parameters;
      const r = Math.max(p.radiusTop ?? 0.02, p.radiusBottom ?? 0.02);
      shape = new CANNON.Box(new CANNON.Vec3(r, p.height / 2, r));
    } else {
      shape = new CANNON.Box(new CANNON.Vec3(0.08, 0.08, 0.08));
    }

    const body = new CANNON.Body({
      mass: 0.8 + Math.random() * 0.6, shape,
      position: new CANNON.Vec3(wp.x, wp.y, wp.z),
      quaternion: new CANNON.Quaternion(wq.x, wq.y, wq.z, wq.w),
      linearDamping: 0.04, angularDamping: 0.12,
    });

    const dist = wp.distanceTo(contactPt);
    const velScale = Math.max(0.4, 1.5 - dist * 0.5);
    const baseSpd = 7 + Math.random() * 5;
    body.velocity.set(
      knockDir.x * baseSpd * velScale + (Math.random() - 0.5) * 3,
      knockDir.y * baseSpd * velScale + 3 + Math.random() * 4,
      knockDir.z * baseSpd * velScale + (Math.random() - 0.5) * 4,
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14,
    );
    w.addBody(body);
    ragdollPieces.push({ body, mesh: clone });
  }

  for (let i = 0; i < 6; i++)
    spawnDust(contactPt.x + (Math.random() - 0.5), 0.1, contactPt.z + (Math.random() - 0.5), 2.0);
}

// ═══════════════════════════════════════════════════════
// Dust
// ═══════════════════════════════════════════════════════
function spawnDust(x: number, y: number, z: number, intensity: number) {
  const count = Math.floor(1 + intensity * 1.5);
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(dustGeo, dustMat.clone());
    mesh.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.1, z + (Math.random() - 0.5) * 0.4);
    mesh.scale.setScalar(0.5 + Math.random() * 1.5);
    scene.add(mesh);
    dustParticles.push({
      mesh, vx: (Math.random() - 0.5) * 1.5, vy: 0.3 + Math.random() * 0.8,
      vz: (Math.random() - 0.5) * 1.0, age: 0, maxAge: 0.8 + Math.random() * 0.6,
    });
  }
}

function updateDust(delta: number) {
  for (let i = dustParticles.length - 1; i >= 0; i--) {
    const d = dustParticles[i];
    d.age += delta;
    d.mesh.position.x += d.vx * delta;
    d.mesh.position.y += d.vy * delta;
    d.mesh.position.z += d.vz * delta;
    d.vy -= 0.5 * delta;
    (d.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - d.age / d.maxAge) * 0.4;
    d.mesh.scale.setScalar(d.mesh.scale.x + delta * 0.8);
    if (d.age >= d.maxAge) { scene.remove(d.mesh); dustParticles.splice(i, 1); }
  }
}

// ═══════════════════════════════════════════════════════
// Physics step
// ═══════════════════════════════════════════════════════
function stepPhysics(delta: number) {
  if (!physWorld) return;
  physWorld.step(1 / 60, delta, 3);
  for (let i = physFragments.length - 1; i >= 0; i--) {
    const f = physFragments[i];
    f.age += delta;
    f.mesh.position.set(f.body.position.x, f.body.position.y, f.body.position.z);
    f.mesh.quaternion.set(f.body.quaternion.x, f.body.quaternion.y, f.body.quaternion.z, f.body.quaternion.w);
    if (f.age > 4.0 || f.body.position.y < -1) {
      scene.remove(f.mesh); physWorld!.removeBody(f.body); physFragments.splice(i, 1);
    }
  }
  for (const r of ragdollPieces) {
    r.mesh.position.set(r.body.position.x, r.body.position.y, r.body.position.z);
    r.mesh.quaternion.set(r.body.quaternion.x, r.body.quaternion.y, r.body.quaternion.z, r.body.quaternion.w);
  }
}

function cleanupRoundPhysics() {
  for (const f of physFragments) { scene.remove(f.mesh); if (physWorld) physWorld.removeBody(f.body); }
  physFragments.length = 0;
  for (const r of ragdollPieces) { scene.remove(r.mesh); if (physWorld) physWorld.removeBody(r.body); }
  ragdollPieces.length = 0;
  for (const d of dustParticles) scene.remove(d.mesh);
  dustParticles.length = 0;
  if (impactFlash) { scene.remove(impactFlash); impactFlash = null; }
}

// ═══════════════════════════════════════════════════════
// Opponent recoil (non-ragdoll hits)
// ═══════════════════════════════════════════════════════
function animateOpponentRecoil(delta: number) {
  const bModel = knightBModel;
  if (!bModel || opponentUnhorsed) return;
  oppRecoilAngle *= 0.94;
  oppRecoilImpulse.multiplyScalar(0.95);
  bModel.userData.rider.rotation.x = oppRecoilAngle;
  bModel.userData.rider.rotation.z = oppRecoilAngle * 0.4;
  if (bModel.userData.gltfModel) {
    bModel.userData.gltfModel.rotation.x = oppRecoilAngle;
    bModel.userData.gltfModel.rotation.z = oppRecoilAngle * 0.4;
  }
  bModel.position.z += oppRecoilImpulse.z * delta;
  bModel.position.x += oppRecoilImpulse.x * delta;
}

// ═══════════════════════════════════════════════════════
// Build JoustResult
// ═══════════════════════════════════════════════════════
function buildFinalResult(): JoustResult {
  const pWon = mgState!.playerRoundsWon > mgState!.opponentRoundsWon;
  const isDraw = mgState!.playerRoundsWon === mgState!.opponentRoundsWon;
  const lastRound = mgState!.roundResults[mgState!.roundResults.length - 1];

  const aCost = 12 + Math.floor(rand() * 10);
  const bCost = 12 + Math.floor(rand() * 10);
  playerKnight!.stamina = Math.max(0, playerKnight!.stamina - aCost);
  opponentKnight!.stamina = Math.max(0, opponentKnight!.stamina - bCost);

  let winner: Knight | null = null;
  let loser: Knight | null = null;
  if (!isDraw) {
    winner = pWon ? playerKnight! : opponentKnight!;
    loser = pWon ? opponentKnight! : playerKnight!;
    winner.wins++; winner.reputation = Math.min(100, winner.reputation + 5);
    loser.losses++; loser.reputation = Math.max(0, loser.reputation - 3);
  } else { playerKnight!.draws++; opponentKnight!.draws++; }

  const aName = playerKnight!.name.split(" ")[1];
  const bName = opponentKnight!.name.split(" ")[1];
  const rs = `(${mgState!.playerRoundsWon}-${mgState!.opponentRoundsWon})`;
  let narrative = `${aName} ${lastRound.playerHit.label}. ${bName} ${lastRound.opponentHit.label}.`;
  if (isDraw) narrative += ` A draw ${rs}!`;
  else narrative += ` ${winner!.name.split(" ")[1]} wins the match ${rs}!`;

  return { knightA: playerKnight!, knightB: opponentKnight!, aHit: lastRound.playerHit, bHit: lastRound.opponentHit, winner, loser, isDraw, narrative };
}

// ═══════════════════════════════════════════════════════
// FP Camera & Weapons
// ═══════════════════════════════════════════════════════
function setupFirstPerson() {
  if (knightAModel) knightAModel.visible = false;

  fpLance = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.02, 3.2, 6),
    new THREE.MeshStandardMaterial({ color: 0xc4a46c, roughness: 0.6 }),
  );
  shaft.castShadow = true;
  fpLance.add(shaft);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.18, 5),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.5 }),
  );
  tip.position.y = 1.7;
  fpLance.add(tip);
  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.5 }),
  );
  guard.position.y = -0.8;
  fpLance.add(guard);
  scene.add(fpLance);

  const shieldColor = playerKnight ? playerKnight.accent : 0x1565c0;
  fpShield = new THREE.Group();
  fpShield.add(new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.6, 0.06),
    new THREE.MeshStandardMaterial({ color: shieldColor, roughness: 0.4, metalness: 0.2 }),
  ));
  const boss = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xd4a843, roughness: 0.3, metalness: 0.4 }),
  );
  boss.position.z = 0.04;
  fpShield.add(boss);
  fpShield.visible = false;
  scene.add(fpShield);

  updateFPCamera(0, 0);
}

function teardownFirstPerson() {
  if (fpLance) { scene.remove(fpLance); fpLance = null; }
  if (fpShield) { scene.remove(fpShield); fpShield = null; }
  if (knightAModel) knightAModel.visible = true;
  camera.position.copy(savedCamPos);
  controls.target.copy(savedCamTarget);
  controls.enabled = true;
  controls.update();
  cleanupAllPhysics();
}

function updateFPCamera(chargeProgress: number, t: number) {
  const p = chargeProgress;
  const zPos = LANE_START * (1 - p);
  const legFreq = 10 + p * 8;
  const bobI = p;
  const bobY = p > 0 && p < 1 ? Math.sin(t * legFreq * 0.5) * 0.09 * bobI : 0;
  const bobX = p > 0 && p < 1 ? Math.sin(t * legFreq * 0.25) * 0.03 * bobI : 0;
  const lean = p * 0.08;

  camera.position.set(LANE_X_OFFSET + bobX, 2.25 + bobY - lean, zPos);
  // Look slightly left (toward the opponent's lane) and ahead
  camera.lookAt(-LANE_X_OFFSET * 0.3, 1.8 - lean, zPos - 8);
}

function updateFPWeapons(chargeProgress: number, t: number) {
  if (!fpLance || !fpShield) return;

  // The lance in a joust extends LEFT across the barrier (toward -X)
  // It's held in the right hand, couched under the arm, pointing across
  const playerZ = LANE_START * (1 - chargeProgress);
  const aimY = mgState!.aimY;
  const aimOffset = aimY * 0.4;

  if (mgState!.isBlocking) {
    fpLance.visible = false;
    fpShield.visible = true;

    // Shield on the left side, facing the opponent
    fpShield.position.set(
      LANE_X_OFFSET - 0.5,   // toward center/opponent
      1.85,
      playerZ - 0.3,
    );
    fpShield.rotation.set(0, Math.PI / 2, 0); // face left toward opponent
  } else {
    fpLance.visible = true;
    fpShield.visible = false;

    // Lance extends from right side of player ACROSS the barrier
    // Base near the player's right hip, tip extending to the left
    const lanceBaseX = LANE_X_OFFSET + 0.2;
    const lanceBaseY = 1.85 + aimOffset * 0.3;
    const lanceBaseZ = playerZ;

    // The lance angles across: from +X (player side) toward -X (opponent side)
    fpLance.position.set(
      lanceBaseX - 0.8, // center the lance mesh
      lanceBaseY,
      lanceBaseZ,
    );

    // Rotate so lance points left (-X) with aim tilt
    fpLance.rotation.set(0, 0, Math.PI / 2 + aimOffset * 0.3);
    // Slight forward cant
    fpLance.rotateY(0.08);

    // Gallop sway
    if (chargeProgress > 0 && chargeProgress < 1) {
      fpLance.rotateX(Math.sin(t * 7) * 0.012);
      fpLance.rotateZ(Math.sin(t * 5) * 0.008);
    }
  }
}

// ═══════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════
function addInputListeners() {
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("contextmenu", onContextMenu);
}
function removeInputListeners() {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mousedown", onMouseDown);
  document.removeEventListener("mouseup", onMouseUp);
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("keyup", onKeyUp);
  document.removeEventListener("contextmenu", onContextMenu);
}
function onMouseMove(e: MouseEvent) { if (mgState) mgState.aimY = THREE.MathUtils.clamp(1 - (e.clientY / window.innerHeight) * 2, -1, 1); }
function onMouseDown(e: MouseEvent) { if (e.button === 2 && mgState) mgState.isBlocking = true; }
function onMouseUp(e: MouseEvent) { if (e.button === 2 && mgState) mgState.isBlocking = false; }
function onKeyDown(e: KeyboardEvent) { if (e.key === "Shift" && mgState) mgState.isBlocking = true; }
function onKeyUp(e: KeyboardEvent) { if (e.key === "Shift" && mgState) mgState.isBlocking = false; }
function onContextMenu(e: Event) { e.preventDefault(); }

function getAimZone(aimY: number): LanceAimZone {
  if (aimY > 0.33) return "high";
  if (aimY < -0.33) return "low";
  return "center";
}

// ═══════════════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════════════
function showHUD() { document.getElementById("minigame-hud")!.style.display = "block"; }
function hideHUD() { document.getElementById("minigame-hud")!.style.display = "none"; }
function updateRoundDisplay() {
  const el = document.getElementById("mg-round-display")!;
  el.textContent = `Round ${mgState!.currentRound} of 3`;
  el.classList.add("visible");
}
function updateScoreDisplay() {
  document.getElementById("mg-player-score")!.textContent = String(mgState!.playerRoundsWon);
  document.getElementById("mg-opponent-score")!.textContent = String(mgState!.opponentRoundsWon);
}
function setActionText(text: string, show = false) {
  const el = document.getElementById("mg-action-text")!;
  el.textContent = text;
  if (show) el.classList.add("visible"); else el.classList.remove("visible");
}
function updateCrosshairUI() {
  if (!mgState) return;
  const ch = document.getElementById("mg-crosshair")!;
  ch.style.transform = `translate(0, ${-mgState.aimY * 100}px)`;
  ch.classList.toggle("blocking", mgState.isBlocking);
  const zone = getAimZone(mgState.aimY);
  document.querySelectorAll("#mg-aim-guide .aim-zone").forEach(el => {
    (el as HTMLElement).classList.toggle("active", el.getAttribute("data-zone") === zone);
  });
}
function updateBlockUI() {
  if (!mgState) return;
  document.getElementById("mg-block-indicator")!.classList.toggle("visible", mgState.isBlocking);
}

// ═══════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════
function enterPhase(phase: MiniGameState["phase"]) { mgState!.phase = phase; mgState!.timer = 0; }
function easeInQuad(t: number) { return t * t; }
function easeOutQuad(t: number) { return 1 - (1 - t) * (1 - t); }

function resetForNewRound() {
  hitResolved = false;
  playerHitResult = null; opponentHitResult = null; hitContactPoint = null;
  oppRecoilAngle = 0; oppRecoilImpulse.set(0, 0, 0);
  opponentUnhorsed = false; oppLanceTilt = 0;
  camFlinchX = 0; camFlinchY = 0; shakeIntensity = 0;
  timeScale = 1.0;
  if (knightAModel) knightAModel.position.set(LANE_X_OFFSET, 0, LANE_START);
  if (knightBModel) {
    knightBModel.position.set(-LANE_X_OFFSET, 0, -LANE_START);
    knightBModel.position.y = 0;
    knightBModel.userData.rider.visible = true;
    knightBModel.userData.rider.rotation.set(0, 0, 0);
    knightBModel.userData.lance.rotation.set(Math.PI / 2, 0.15, 0);
    if (knightBModel.userData.gltfModel) {
      knightBModel.userData.gltfModel.visible = true;
      knightBModel.userData.gltfModel.rotation.set(0, 0, 0);
    }
  }
}

function resetLegsAll() {
  for (const model of [knightAModel, knightBModel]) {
    if (!model) continue;
    for (const l of model.userData.horse.userData.legs) l.rotation.x = 0;
    resetGltfPose(model);
  }
}

// ═══════════════════════════════════════════════════════
// Sound
// ═══════════════════════════════════════════════════════
function playHornSound() {
  if (!audioCtx) audioCtx = new AudioContext();
  const ctx = audioCtx; const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.linearRampToValueAtTime(280, now + 0.25);
  osc.frequency.linearRampToValueAtTime(220, now + 0.7);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 600;
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.9);
}
