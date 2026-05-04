import { useRef, useCallback } from "react";
import anthemSrc from "../assets/soviet-anthem.mp3";
import { startAnthemClip } from "./anthemClip";

const ANTHEM_CLIP_MS = 5000;

export function useAnthem() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const play = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(anthemSrc);
      audioRef.current.volume = 0.3;
    }
    stopTimerRef.current = startAnthemClip(audioRef.current, {
      clipMs: ANTHEM_CLIP_MS,
      previousTimer: stopTimerRef.current,
      scheduleStop: window.setTimeout,
      clearStop: window.clearTimeout,
    });
  }, []);

  return { play };
}
