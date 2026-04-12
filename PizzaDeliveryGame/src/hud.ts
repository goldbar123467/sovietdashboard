/* ------------------------------------------------------------------ */
/*  HUD — DOM-based UI overlays for DOUGHBOY                          */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { GameLoop, GameEvent, GameState } from './gameLoop';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HUD {
  update(gameLoop: GameLoop): void;
  showScoreFloater(
    score: number,
    worldX: number,
    worldZ: number,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
  ): void;
  showPauseOverlay(visible: boolean): void;
  showScoreScreen(
    totalScore: number,
    deliveryCount: number,
    wipeoutCount: number,
  ): void;
  showTitleScreen(visible: boolean): void;
  onEvent(
    event: GameEvent,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
  ): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/*  CSS (injected once)                                                */
/* ------------------------------------------------------------------ */

const HUD_CSS = `
/* --- HUD container --- */
#game-hud {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  font-family: monospace;
  color: white;
}

/* --- In-game elements --- */
.hud-counter {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: 28px;
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
}

.hud-timer {
  position: absolute;
  top: 52px;
  right: 16px;
  font-size: 18px;
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
}

.hud-score {
  position: absolute;
  top: 16px;
  left: 16px;
  font-size: 22px;
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
}

/* --- Score floater --- */
.hud-floater {
  position: absolute;
  font: bold 24px monospace;
  color: #ffdd00;
  text-shadow: 0 0 6px rgba(0,0,0,0.9);
  pointer-events: none;
  animation: hud-float-up 1.2s ease-out forwards;
}

@keyframes hud-float-up {
  0%   { transform: translateY(0);    opacity: 1; }
  100% { transform: translateY(-80px); opacity: 0; }
}

/* --- Full-screen overlay base --- */
.hud-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

/* --- Pause overlay --- */
.hud-pause {
  background: rgba(0,0,0,0.6);
}
.hud-pause-title {
  font: bold 48px monospace;
  color: white;
}
.hud-pause-hint {
  font: 18px monospace;
  color: #aaa;
  margin-top: 16px;
}

/* --- Title screen --- */
.hud-title {
  background: rgba(10,10,30,0.9);
}
.hud-title-name {
  font: bold 64px monospace;
  color: white;
  letter-spacing: 8px;
}
.hud-title-hint {
  font: 18px monospace;
  color: #aaa;
  margin-top: 24px;
  animation: hud-pulse 1.5s ease-in-out infinite;
}

@keyframes hud-pulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 1.0; }
}

/* --- Score screen --- */
.hud-score-screen {
  background: rgba(10,10,30,0.9);
}
.hud-score-header {
  font: bold 36px monospace;
  color: white;
}
.hud-score-total {
  font: bold 56px monospace;
  color: #ffdd00;
  margin-top: 16px;
}
.hud-score-info {
  font: 20px monospace;
  color: #ccc;
  margin-top: 12px;
}
.hud-score-hint {
  font: 18px monospace;
  color: #aaa;
  margin-top: 24px;
  animation: hud-pulse 1.5s ease-in-out infinite;
}
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format seconds as MM:SS */
function formatTimer(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/** Project world position to screen pixel coordinates. */
function worldToScreen(
  worldX: number,
  worldY: number,
  worldZ: number,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): { x: number; y: number; behind: boolean } {
  const vec = new THREE.Vector3(worldX, worldY, worldZ);
  vec.project(camera);

  const size = renderer.getSize(new THREE.Vector2());
  const halfW = size.x / 2;
  const halfH = size.y / 2;

  return {
    x: vec.x * halfW + halfW,
    y: -(vec.y * halfH) + halfH,
    behind: vec.z > 1,
  };
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createHUD(): HUD {
  /* ---- Inject CSS ---- */
  const styleEl = document.createElement('style');
  styleEl.textContent = HUD_CSS;
  document.head.appendChild(styleEl);

  /* ---- Root container ---- */
  const container = document.createElement('div');
  container.id = 'game-hud';
  document.body.appendChild(container);

  /* ---- In-game HUD elements ---- */
  const counterEl = document.createElement('div');
  counterEl.className = 'hud-counter';
  counterEl.textContent = '0/7';
  container.appendChild(counterEl);

  const timerEl = document.createElement('div');
  timerEl.className = 'hud-timer';
  timerEl.textContent = '00:00';
  container.appendChild(timerEl);

  const scoreEl = document.createElement('div');
  scoreEl.className = 'hud-score';
  scoreEl.textContent = 'Score: 0';
  container.appendChild(scoreEl);

  const hudElements = [counterEl, timerEl, scoreEl];

  /* ---- Pause overlay ---- */
  const pauseOverlay = document.createElement('div');
  pauseOverlay.className = 'hud-overlay hud-pause';
  pauseOverlay.style.display = 'none';

  const pauseTitle = document.createElement('div');
  pauseTitle.className = 'hud-pause-title';
  pauseTitle.textContent = 'PAUSED';
  pauseOverlay.appendChild(pauseTitle);

  const pauseHint = document.createElement('div');
  pauseHint.className = 'hud-pause-hint';
  pauseHint.textContent = 'Press ESC to resume';
  pauseOverlay.appendChild(pauseHint);

  container.appendChild(pauseOverlay);

  /* ---- Title screen ---- */
  const titleOverlay = document.createElement('div');
  titleOverlay.className = 'hud-overlay hud-title';
  titleOverlay.style.display = 'flex';

  const titleName = document.createElement('div');
  titleName.className = 'hud-title-name';
  titleName.textContent = 'DOUGHBOY';
  titleOverlay.appendChild(titleName);

  const titleHint = document.createElement('div');
  titleHint.className = 'hud-title-hint';
  titleHint.textContent = 'Press any key to start';
  titleOverlay.appendChild(titleHint);

  container.appendChild(titleOverlay);

  /* ---- Score screen ---- */
  const scoreOverlay = document.createElement('div');
  scoreOverlay.className = 'hud-overlay hud-score-screen';
  scoreOverlay.style.display = 'none';

  const scoreHeader = document.createElement('div');
  scoreHeader.className = 'hud-score-header';
  scoreHeader.textContent = 'RUN COMPLETE';
  scoreOverlay.appendChild(scoreHeader);

  const scoreTotal = document.createElement('div');
  scoreTotal.className = 'hud-score-total';
  scoreTotal.textContent = '0';
  scoreOverlay.appendChild(scoreTotal);

  const scoreInfo = document.createElement('div');
  scoreInfo.className = 'hud-score-info';
  scoreInfo.textContent = 'Deliveries: 0 | Wipeouts: 0';
  scoreOverlay.appendChild(scoreInfo);

  const scoreHint = document.createElement('div');
  scoreHint.className = 'hud-score-hint';
  scoreHint.textContent = 'Press R to restart';
  scoreOverlay.appendChild(scoreHint);

  container.appendChild(scoreOverlay);

  /* ---- Track last-known state for visibility toggling ---- */
  let lastState: GameState | null = null;

  /* ---- Visibility helpers ---- */

  function setHUDVisible(visible: boolean): void {
    const display = visible ? '' : 'none';
    for (const el of hudElements) {
      el.style.display = display;
    }
  }

  function applyStateVisibility(state: GameState): void {
    if (state === lastState) return;
    lastState = state;

    switch (state) {
      case 'title':
        setHUDVisible(false);
        titleOverlay.style.display = 'flex';
        pauseOverlay.style.display = 'none';
        scoreOverlay.style.display = 'none';
        break;
      case 'playing':
        setHUDVisible(true);
        titleOverlay.style.display = 'none';
        pauseOverlay.style.display = 'none';
        scoreOverlay.style.display = 'none';
        break;
      case 'paused':
        setHUDVisible(true);
        titleOverlay.style.display = 'none';
        pauseOverlay.style.display = 'flex';
        scoreOverlay.style.display = 'none';
        break;
      case 'score':
        setHUDVisible(false);
        titleOverlay.style.display = 'none';
        pauseOverlay.style.display = 'none';
        scoreOverlay.style.display = 'flex';
        break;
    }
  }

  /* ---- Build the HUD interface ---- */

  const hud: HUD = {
    /* ------------------------------------------------------------ */
    /*  update — called every frame                                  */
    /* ------------------------------------------------------------ */

    update(gameLoop: GameLoop): void {
      // Visibility
      applyStateVisibility(gameLoop.state);

      // HUD text (only matters when visible, but cheap to set always)
      counterEl.textContent =
        gameLoop.deliveryCount + '/' + gameLoop.totalDeliveries;
      timerEl.textContent = formatTimer(gameLoop.deliveryTimer);
      scoreEl.textContent = 'Score: ' + gameLoop.currentScore;
    },

    /* ------------------------------------------------------------ */
    /*  showScoreFloater                                              */
    /* ------------------------------------------------------------ */

    showScoreFloater(
      score: number,
      worldX: number,
      worldZ: number,
      camera: THREE.PerspectiveCamera,
      renderer: THREE.WebGLRenderer,
    ): void {
      const screen = worldToScreen(worldX, 2, worldZ, camera, renderer);
      if (screen.behind) return; // behind the camera — skip

      const floater = document.createElement('div');
      floater.className = 'hud-floater';
      floater.textContent = '+' + score;
      floater.style.left = screen.x + 'px';
      floater.style.top = screen.y + 'px';
      container.appendChild(floater);

      floater.addEventListener('animationend', () => {
        floater.remove();
      });
    },

    /* ------------------------------------------------------------ */
    /*  showPauseOverlay                                              */
    /* ------------------------------------------------------------ */

    showPauseOverlay(visible: boolean): void {
      pauseOverlay.style.display = visible ? 'flex' : 'none';
    },

    /* ------------------------------------------------------------ */
    /*  showScoreScreen                                               */
    /* ------------------------------------------------------------ */

    showScoreScreen(
      totalScore: number,
      deliveryCount: number,
      wipeoutCount: number,
    ): void {
      scoreTotal.textContent = String(totalScore);
      scoreInfo.textContent =
        'Deliveries: ' + deliveryCount + ' | Wipeouts: ' + wipeoutCount;
      scoreOverlay.style.display = 'flex';
    },

    /* ------------------------------------------------------------ */
    /*  showTitleScreen                                                */
    /* ------------------------------------------------------------ */

    showTitleScreen(visible: boolean): void {
      titleOverlay.style.display = visible ? 'flex' : 'none';
    },

    /* ------------------------------------------------------------ */
    /*  onEvent — react to game events                                */
    /* ------------------------------------------------------------ */

    onEvent(
      event: GameEvent,
      camera: THREE.PerspectiveCamera,
      renderer: THREE.WebGLRenderer,
    ): void {
      switch (event.type) {
        case 'delivery':
          // Use 0,0 as fallback world position — the caller may provide
          // the actual delivery marker position in the future.
          hud.showScoreFloater(event.score, 0, 0, camera, renderer);
          break;
        case 'runEnd':
          // The score screen values will be set via update() state
          // transitions, but we also populate eagerly here.
          hud.showScoreScreen(event.totalScore, 0, 0);
          break;
      }
    },

    /* ------------------------------------------------------------ */
    /*  dispose — clean up all DOM elements                           */
    /* ------------------------------------------------------------ */

    dispose(): void {
      container.remove();
      styleEl.remove();
    },
  };

  return hud;
}
