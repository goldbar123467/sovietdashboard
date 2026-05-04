export interface AnthemAudio {
  currentTime: number;
  volume: number;
  pause: () => void;
  play: () => Promise<unknown>;
}

export interface AnthemClipOptions<Timer> {
  clipMs: number;
  previousTimer?: Timer | null;
  scheduleStop: (fn: () => void, ms: number) => Timer;
  clearStop: (timer: Timer) => void;
}

export function startAnthemClip<Timer>(
  audio: AnthemAudio,
  options: AnthemClipOptions<Timer>,
): Timer {
  if (options.previousTimer) {
    options.clearStop(options.previousTimer);
  }

  audio.currentTime = 0;
  audio.play().catch(() => {});

  return options.scheduleStop(() => {
    audio.pause();
    audio.currentTime = 0;
  }, options.clipMs);
}
