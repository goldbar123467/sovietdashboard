import { useRef, useCallback } from "react";
import anthemSrc from "../assets/soviet-anthem.mp3";

export function useAnthem() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(anthemSrc);
      audioRef.current.volume = 0.3;
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, []);

  return { play };
}
