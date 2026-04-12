/* ------------------------------------------------------------------ */
/*  Input handler — keyboard state for scooter control                 */
/* ------------------------------------------------------------------ */

export interface InputState {
  forward: boolean;   // W key
  brake: boolean;     // S key
  left: boolean;      // A key
  right: boolean;     // D key
  pause: boolean;     // Escape key (single-frame pulse)
  restart: boolean;   // R key (single-frame pulse)
}

/**
 * Creates a keyboard input handler that tracks held keys and
 * single-frame pulses. The consumer must reset pulse fields
 * (pause, restart) to false after reading them each frame.
 */
export function createInputHandler(): { state: InputState; dispose(): void } {
  const state: InputState = {
    forward: false,
    brake: false,
    left: false,
    right: false,
    pause: false,
    restart: false,
  };

  function onKeyDown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        state.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        state.brake = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        state.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        state.right = true;
        break;
      case 'Escape':
        state.pause = true;
        break;
      case 'KeyR':
        state.restart = true;
        break;
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        state.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        state.brake = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        state.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        state.right = false;
        break;
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function dispose(): void {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  return { state, dispose };
}
