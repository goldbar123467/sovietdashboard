/* ------------------------------------------------------------------ */
/*  Dialogue system — the pizza talks to you while you drive           */
/* ------------------------------------------------------------------ */

import { PIZZA_LINES } from './pizzaLines';
import type { TriggerType } from './pizzaLines';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DialogueSystem {
  update(dt: number, tripIntensity: number): void;
  trigger(type: TriggerType): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COOLDOWN_SECS = 8;
const IDLE_TRIGGER_SECS = 20;
const BUBBLE_VISIBLE_SECS = 3;
const BUBBLE_FADE_IN_SECS = 0.2;
const BUBBLE_FADE_OUT_SECS = 0.5;
const ROLLING_WINDOW = 3;
const LYING_TRIP_THRESHOLD = 0.6;
const LYING_CHANCE = 0.3;

/** Priority order: higher index = higher priority. */
const PRIORITY: TriggerType[] = [
  'idle',
  'nearDelivery',
  'shroom',
  'delivery',
  'wipeout',
];

/* ------------------------------------------------------------------ */
/*  CSS (injected once per dialogue system instance)                    */
/* ------------------------------------------------------------------ */

const DIALOGUE_CSS = `
.pizza-bubble {
  position: fixed;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.7);
  color: #ffffff;
  font: italic 18px monospace;
  padding: 12px 20px;
  border-radius: 8px;
  pointer-events: none;
  z-index: 20;
  opacity: 0;
  transition: opacity ${BUBBLE_FADE_IN_SECS}s ease-in;
  white-space: nowrap;
}
.pizza-bubble.visible {
  opacity: 1;
}
.pizza-bubble.fading {
  opacity: 0;
  transition: opacity ${BUBBLE_FADE_OUT_SECS}s ease-out;
}
`;

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createDialogueSystem(): DialogueSystem {
  /* ---- Inject CSS ---- */
  const styleEl = document.createElement('style');
  styleEl.textContent = DIALOGUE_CSS;
  document.head.appendChild(styleEl);

  /* ---- State ---- */
  let cooldown = 0;
  let idleTimer = 0;
  let currentTrip = 0;
  const recentIndices: number[] = []; // rolling window of last N shown
  let activeBubble: HTMLDivElement | null = null;
  let bubbleTimeout: ReturnType<typeof setTimeout> | null = null;
  let fadeTimeout: ReturnType<typeof setTimeout> | null = null;

  /* ---- Helpers ---- */

  function priorityOf(type: TriggerType): number {
    return PRIORITY.indexOf(type);
  }

  function removeBubble(): void {
    if (bubbleTimeout !== null) {
      clearTimeout(bubbleTimeout);
      bubbleTimeout = null;
    }
    if (fadeTimeout !== null) {
      clearTimeout(fadeTimeout);
      fadeTimeout = null;
    }
    if (activeBubble) {
      activeBubble.remove();
      activeBubble = null;
    }
  }

  function showBubble(text: string): void {
    // Remove any existing bubble first
    removeBubble();

    const el = document.createElement('div');
    el.className = 'pizza-bubble';
    el.textContent = text;
    document.body.appendChild(el);
    activeBubble = el;

    // Force reflow so the initial opacity: 0 is applied before transition
    void el.offsetHeight;
    el.classList.add('visible');

    // After visible duration, start fade-out
    bubbleTimeout = setTimeout(() => {
      el.classList.remove('visible');
      el.classList.add('fading');

      // After fade-out completes, remove from DOM
      fadeTimeout = setTimeout(() => {
        if (activeBubble === el) {
          el.remove();
          activeBubble = null;
        }
      }, BUBBLE_FADE_OUT_SECS * 1000);
    }, BUBBLE_VISIBLE_SECS * 1000);
  }

  function pushRecent(index: number): void {
    recentIndices.push(index);
    if (recentIndices.length > ROLLING_WINDOW) {
      recentIndices.shift();
    }
  }

  /* ---- Core trigger logic ---- */

  function handleTrigger(type: TriggerType): void {
    const isWipeout = type === 'wipeout';

    // Respect cooldown (wipeout overrides)
    if (cooldown > 0 && !isWipeout) return;

    // Build candidate list
    let candidates: { index: number; text: string }[];

    if (
      type === 'nearDelivery' &&
      currentTrip > LYING_TRIP_THRESHOLD &&
      Math.random() < LYING_CHANCE
    ) {
      // Pick from lying lines
      candidates = PIZZA_LINES
        .map((line, i) => ({ index: i, text: line.text, line }))
        .filter((c) => c.line.lying && c.line.triggers.includes(type))
        .map(({ index, text }) => ({ index, text }));
    } else {
      // Pick from regular (non-lying) lines matching the trigger
      candidates = PIZZA_LINES
        .map((line, i) => ({ index: i, text: line.text, line }))
        .filter((c) => !c.line.lying && c.line.triggers.includes(type))
        .map(({ index, text }) => ({ index, text }));
    }

    // Filter out recently shown
    const filtered = candidates.filter(
      (c) => !recentIndices.includes(c.index),
    );

    // If all filtered out, fall back to full candidates
    const pool = filtered.length > 0 ? filtered : candidates;
    if (pool.length === 0) return;

    // Pick random
    const pick = pool[Math.floor(Math.random() * pool.length)];
    pushRecent(pick.index);
    showBubble(pick.text);

    // Reset cooldown and idle timer
    cooldown = COOLDOWN_SECS;
    idleTimer = 0;
  }

  /* ---- Public interface ---- */

  const system: DialogueSystem = {
    update(dt: number, tripIntensity: number): void {
      currentTrip = tripIntensity;

      // Tick cooldown
      if (cooldown > 0) {
        cooldown = Math.max(0, cooldown - dt);
      }

      // Tick idle timer
      idleTimer += dt;
      if (idleTimer >= IDLE_TRIGGER_SECS) {
        handleTrigger('idle');
        idleTimer = 0;
      }
    },

    trigger(type: TriggerType): void {
      // Reset idle timer on any explicit trigger
      idleTimer = 0;
      handleTrigger(type);
    },

    dispose(): void {
      removeBubble();
      styleEl.remove();
    },
  };

  return system;
}
