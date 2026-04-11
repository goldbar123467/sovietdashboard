import { gameState } from './state';

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getSnapshot(): number {
  return version;
}

export function notify(): void {
  version++;
  for (const l of listeners) l();
}

export function getGameState() {
  return gameState;
}
