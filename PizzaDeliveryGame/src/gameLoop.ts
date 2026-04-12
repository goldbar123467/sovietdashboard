/* ------------------------------------------------------------------ */
/*  Game loop — central state machine for DOUGHBOY                     */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { InputState } from './input';
import type { ScooterState, ScooterEvents } from './scooter';
import type { AudioManager } from './audio';
import type { BootResult } from './renderer';
import { rebuildCity } from './renderer';
import { gridToWorld } from './grid';
import { createPRNG } from './prng';
import type { PRNG } from './prng';
import {
  findDeliveryTarget,
  createDeliveryMarker,
  removeDeliveryMarker,
} from './delivery';
import type { DeliveryMarker } from './delivery';
import {
  spawnShrooms,
  checkShroomPickup,
  removeShrooms,
  updateShrooms,
} from './shrooms';
import type { Shroom } from './shrooms';
import { createWaypointArrow } from './waypoint';
import type { WaypointArrow } from './waypoint';
import { calculateDeliveryScore, calculateRunTotal } from './scoring';
import type { DeliveryScore } from './scoring';
import { triggerDissolve } from './tripShader';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type GameEvent =
  | { type: 'delivery'; deliveryIndex: number; score: number }
  | { type: 'wipeout' }
  | { type: 'scrape' }
  | { type: 'shroom'; tripIntensity: number }
  | { type: 'idle' }
  | { type: 'nearDelivery' }
  | { type: 'runEnd'; totalScore: number };

export type GameState = 'title' | 'playing' | 'paused' | 'score';

export interface GameLoop {
  state: GameState;
  deliveryCount: number;
  totalDeliveries: number;
  currentScore: number;
  deliveryTimer: number;
  tripIntensity: number;
  deliveryProgress: number;
  shroomsThisDelivery: number;
  wipeoutCount: number;
  onEvent: (event: GameEvent) => void;
  init(
    boot: BootResult,
    scooter: ScooterState,
    scooterMesh: THREE.Group,
    scooterEvents: ScooterEvents,
    audio: AudioManager,
  ): void;
  update(dt: number, input: InputState): void;
  start(): void;
  pause(): void;
  resume(): void;
  restart(newSeed: number): void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TOTAL_DELIVERIES = 7;
const SHROOM_COUNT = 6;
const FIRST_MIN_DIST = 12;
const FIRST_MAX_DIST = 16;
const NEXT_MIN_DIST = 10;
const NEXT_MAX_DIST = 16;
const DELIVERY_RADIUS = 4; // meters — pickup distance
const NEAR_DELIVERY_RADIUS = 20; // meters
const NEAR_DELIVERY_COOLDOWN = 5; // seconds between nearDelivery events
const IDLE_THRESHOLD = 20; // seconds of no events → idle
const TRIP_PER_SHROOM = 0.15;
const MARKER_SPIN_SPEED = 2; // radians/sec

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createGameLoop(): GameLoop {
  // Internal references (set during init)
  let boot: BootResult | null = null;
  let scooter: ScooterState | null = null;
  let scooterMesh: THREE.Group | null = null;
  let audio: AudioManager | null = null;
  let rng: PRNG | null = null;

  // Delivery state
  let currentMarker: DeliveryMarker | null = null;
  let previousGridX = 0;
  let previousGridZ = 0;

  // Shroom state
  let shrooms: Shroom[] = [];

  // Waypoint
  let waypoint: WaypointArrow | null = null;

  // Score history
  let deliveryScores: DeliveryScore[] = [];

  // Timers & cooldowns
  let nearDeliveryCooldown = 0;
  let lastEventTime = 0;
  let elapsedTime = 0;
  let idleFired = false;

  // Seed tracking for city rebuilds
  let currentSeed = 0;

  /* ---------------------------------------------------------------- */
  /*  Helper: emit event                                               */
  /* ---------------------------------------------------------------- */

  function emit(event: GameEvent): void {
    lastEventTime = elapsedTime;
    idleFired = false;
    loop.onEvent(event);
  }

  /* ---------------------------------------------------------------- */
  /*  Helper: place next delivery                                      */
  /* ---------------------------------------------------------------- */

  function placeDelivery(minDist: number, maxDist: number): void {
    if (!boot || !rng) return;
    const { grid, lots } = boot.city;

    const target = findDeliveryTarget(
      grid,
      lots,
      previousGridX,
      previousGridZ,
      minDist,
      maxDist,
      rng,
    );

    const { wx, wz } = gridToWorld(grid, target.gridX, target.gridZ);
    currentMarker = createDeliveryMarker(boot.scene, wx, wz);
    currentMarker.gridX = target.gridX;
    currentMarker.gridZ = target.gridZ;
    previousGridX = target.gridX;
    previousGridZ = target.gridZ;
  }

  /* ---------------------------------------------------------------- */
  /*  Helper: spawn shrooms into the scene                             */
  /* ---------------------------------------------------------------- */

  function respawnShrooms(): void {
    if (!boot || !rng) return;
    if (shrooms.length > 0) {
      removeShrooms(shrooms, boot.scene);
    }
    shrooms = spawnShrooms(boot.city.grid, boot.scene, rng, SHROOM_COUNT);
  }

  /* ---------------------------------------------------------------- */
  /*  The loop object                                                  */
  /* ---------------------------------------------------------------- */

  const loop: GameLoop = {
    state: 'title' as GameState,
    deliveryCount: 0,
    totalDeliveries: TOTAL_DELIVERIES,
    currentScore: 0,
    deliveryTimer: 0,
    tripIntensity: 0,
    deliveryProgress: 0,
    shroomsThisDelivery: 0,
    wipeoutCount: 0,
    onEvent: () => {},

    /* -------------------------------------------------------------- */
    /*  init                                                           */
    /* -------------------------------------------------------------- */

    init(
      bootRef: BootResult,
      scooterRef: ScooterState,
      scooterMeshRef: THREE.Group,
      scooterEventsRef: ScooterEvents,
      audioRef: AudioManager,
    ): void {
      boot = bootRef;
      scooter = scooterRef;
      scooterMesh = scooterMeshRef;
      audio = audioRef;
      currentSeed = Date.now();
      rng = createPRNG(currentSeed);

      // Create waypoint arrow
      waypoint = createWaypointArrow(boot.scene);

      // Place first delivery (12-16 tiles from grid tile 0,0)
      previousGridX = 0;
      previousGridZ = 0;
      placeDelivery(FIRST_MIN_DIST, FIRST_MAX_DIST);

      // Spawn shrooms
      respawnShrooms();

      // Wire scooter events
      scooterEventsRef.onWipeout = () => {
        loop.wipeoutCount++;
        emit({ type: 'wipeout' });
        audio?.play('wipeout');
      };

      scooterEventsRef.onScrape = () => {
        emit({ type: 'scrape' });
        audio?.play('scrape');
      };

      loop.state = 'title';
      loop.totalDeliveries = TOTAL_DELIVERIES;
    },

    /* -------------------------------------------------------------- */
    /*  update                                                         */
    /* -------------------------------------------------------------- */

    update(dt: number, input: InputState): void {
      elapsedTime += dt;

      // ----- Title screen: wait for any movement key -----
      if (loop.state === 'title') {
        if (input.forward || input.brake || input.left || input.right) {
          loop.start();
        }
        return;
      }

      // ----- Paused: check for resume -----
      if (loop.state === 'paused') {
        if (input.pause) {
          loop.resume();
          input.pause = false;
        }
        return;
      }

      // ----- Score screen: check for restart -----
      if (loop.state === 'score') {
        if (input.restart) {
          loop.restart(Math.floor(Math.random() * 100000));
          input.restart = false;
        }
        return;
      }

      // ----- Playing -----
      if (!scooter || !boot || !audio) return;

      // 1. Delivery timer
      loop.deliveryTimer += dt;

      // 2. Rotate delivery marker
      if (currentMarker) {
        currentMarker.mesh.rotation.y += dt * MARKER_SPIN_SPEED;
      }

      // 3. Animate shrooms
      updateShrooms(shrooms, elapsedTime);

      // 4. Check shroom pickup
      const pickedShroom = checkShroomPickup(
        shrooms,
        scooter.position.x,
        scooter.position.z,
      );
      if (pickedShroom) {
        loop.tripIntensity = Math.min(1.0, loop.tripIntensity + TRIP_PER_SHROOM);
        loop.shroomsThisDelivery++;
        emit({ type: 'shroom', tripIntensity: loop.tripIntensity });
        audio.play('shroom');
      }

      // 5. Check delivery completion
      if (currentMarker) {
        const dx = scooter.position.x - currentMarker.worldX;
        const dz = scooter.position.z - currentMarker.worldZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < DELIVERY_RADIUS * DELIVERY_RADIUS) {
          // Score this delivery
          const score = calculateDeliveryScore(
            loop.deliveryTimer,
            loop.shroomsThisDelivery,
          );
          deliveryScores.push(score);
          loop.currentScore += score.total;
          loop.deliveryCount++;

          emit({
            type: 'delivery',
            deliveryIndex: loop.deliveryCount - 1,
            score: score.total,
          });
          audio.play('chime');

          // Remove old marker
          removeDeliveryMarker(currentMarker, boot.scene);
          currentMarker = null;

          // Check run end
          if (loop.deliveryCount === TOTAL_DELIVERIES) {
            const totalScore = calculateRunTotal(
              deliveryScores,
              loop.wipeoutCount,
            );
            loop.currentScore = totalScore;
            emit({ type: 'runEnd', totalScore });
            loop.state = 'score';

            // Clean up waypoint
            if (waypoint) {
              boot.scene.remove(waypoint.group);
            }

            audio.stopMusic();
            return;
          }

          // Dissolve + rebuild city at delivery 3 and 6
          if (loop.deliveryCount === 3 || loop.deliveryCount === 6) {
            const bootRef = boot;
            triggerDissolve(boot.uniforms, () => {
              currentSeed = Math.floor(Math.random() * 100000);
              rebuildCity(bootRef, currentSeed);
              rng = createPRNG(currentSeed);
              respawnShrooms();
            });
          }

          // Place next delivery
          placeDelivery(NEXT_MIN_DIST, NEXT_MAX_DIST);

          // Reset per-delivery state
          loop.deliveryTimer = 0;
          loop.shroomsThisDelivery = 0;
        } else {
          // 6. Near-delivery check
          nearDeliveryCooldown = Math.max(0, nearDeliveryCooldown - dt);
          if (
            distSq < NEAR_DELIVERY_RADIUS * NEAR_DELIVERY_RADIUS &&
            nearDeliveryCooldown <= 0
          ) {
            emit({ type: 'nearDelivery' });
            nearDeliveryCooldown = NEAR_DELIVERY_COOLDOWN;
          }
        }
      }

      // 7. Idle check
      if (
        !idleFired &&
        elapsedTime - lastEventTime > IDLE_THRESHOLD
      ) {
        emit({ type: 'idle' });
        idleFired = true;
      }

      // 8. Update waypoint arrow
      if (waypoint && currentMarker) {
        waypoint.update(
          scooter.position.x,
          scooter.position.z,
          scooter.heading,
          currentMarker.worldX,
          currentMarker.worldZ,
          dt,
          loop.tripIntensity,
        );
      }

      // 9. Update trip shader uniforms
      boot.uniforms.uTripIntensity.value = loop.tripIntensity;

      // 10. Update delivery progress
      loop.deliveryProgress = loop.deliveryCount / TOTAL_DELIVERIES;
      boot.uniforms.uDeliveryProgress.value = loop.deliveryProgress;

      // 10b. Update sky gradient to match delivery progress
      boot.sky.update(loop.deliveryProgress);

      // 11. Update audio
      audio.setThrottle(scooter.speed / 12);
      audio.setTripIntensity(loop.tripIntensity);

      // 12. Handle pause
      if (input.pause) {
        loop.pause();
        input.pause = false;
      }

      // 13. Handle restart
      if (input.restart) {
        loop.restart(Math.floor(Math.random() * 100000));
        input.restart = false;
      }
    },

    /* -------------------------------------------------------------- */
    /*  start                                                          */
    /* -------------------------------------------------------------- */

    start(): void {
      if (!audio) return;

      audio.init();
      audio.startMusic();

      loop.state = 'playing';
      loop.deliveryTimer = 0;
      loop.deliveryCount = 0;
      loop.currentScore = 0;
      loop.tripIntensity = 0;
      loop.wipeoutCount = 0;
      loop.shroomsThisDelivery = 0;
      loop.deliveryProgress = 0;
      deliveryScores = [];

      lastEventTime = elapsedTime;
      idleFired = false;
      nearDeliveryCooldown = 0;
    },

    /* -------------------------------------------------------------- */
    /*  pause / resume                                                 */
    /* -------------------------------------------------------------- */

    pause(): void {
      loop.state = 'paused';
    },

    resume(): void {
      loop.state = 'playing';
    },

    /* -------------------------------------------------------------- */
    /*  restart                                                        */
    /* -------------------------------------------------------------- */

    restart(newSeed: number): void {
      if (!boot || !audio) return;

      // Clean up old state
      if (currentMarker) {
        removeDeliveryMarker(currentMarker, boot.scene);
        currentMarker = null;
      }
      removeShrooms(shrooms, boot.scene);
      shrooms = [];

      if (waypoint) {
        boot.scene.remove(waypoint.group);
        waypoint = null;
      }

      audio.stopMusic();

      // Rebuild city
      currentSeed = newSeed;
      rebuildCity(boot, currentSeed);
      rng = createPRNG(currentSeed);

      // Reset scooter position to new grid origin
      if (scooter) {
        const spawnWorld = gridToWorld(boot.city.grid, 0, 0);
        scooter.position.set(spawnWorld.wx, 0, spawnWorld.wz);
        scooter.speed = 0;
        scooter.heading = 0;
        scooter.isWipedOut = false;
        scooter.wipeoutTimer = 0;
      }

      // Recreate waypoint arrow
      waypoint = createWaypointArrow(boot.scene);

      // Place first delivery
      previousGridX = 0;
      previousGridZ = 0;
      placeDelivery(FIRST_MIN_DIST, FIRST_MAX_DIST);

      // Respawn shrooms
      respawnShrooms();

      // Reset all counters
      loop.state = 'title';
      loop.deliveryCount = 0;
      loop.currentScore = 0;
      loop.deliveryTimer = 0;
      loop.tripIntensity = 0;
      loop.wipeoutCount = 0;
      loop.shroomsThisDelivery = 0;
      loop.deliveryProgress = 0;
      deliveryScores = [];

      lastEventTime = elapsedTime;
      idleFired = false;
      nearDeliveryCooldown = 0;

      // Update uniforms
      boot.uniforms.uTripIntensity.value = 0;
      boot.uniforms.uDeliveryProgress.value = 0;
    },
  };

  return loop;
}
