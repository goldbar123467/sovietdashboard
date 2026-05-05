import { lazy, Suspense, useMemo, useState } from "react";
import {
  petModeForCodex,
  petMoodLine,
  petPromptShortcut,
  petReplyForMessage,
  type PetMode,
  type PetShortcut,
} from "./petLogic";

const SovietPetScene = lazy(() => import("./SovietPetScene").then((module) => ({
  default: module.SovietPetScene,
})));

interface PetDockProps {
  codexStatus: "idle" | "running";
  failures: number;
  lastRunOk?: boolean;
  totalTokens: number;
  cachedInputTokens: number;
  onPromptPick: (prompt: string) => void;
}

const modeTone: Record<PetMode, string> = {
  idle: "text-soviet-sky",
  review: "text-soviet-gold",
  salute: "text-soviet-green",
  failed: "text-soviet-red-bright",
  play: "text-soviet-violet",
};

const shortcutLabels: Array<[PetShortcut, string]> = [
  ["diff", "Diff"],
  ["tests", "Tests"],
  ["tokens", "Tokens"],
];

export function PetDock({
  codexStatus,
  failures,
  lastRunOk,
  totalTokens,
  cachedInputTokens,
  onPromptPick,
}: PetDockProps) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("Signal quiet. Tovarish Byte is watching the board.");
  const [playing, setPlaying] = useState(false);

  const mode = useMemo(() => petModeForCodex({
    status: codexStatus,
    failures,
    lastRunOk,
    playing,
  }), [codexStatus, failures, lastRunOk, playing]);

  function sendPetMessage() {
    const body = message.trim();
    if (!body) return;
    setReply(petReplyForMessage(body, { totalTokens, cachedInputTokens }));
    setMessage("");
  }

  function play() {
    setPlaying(true);
    window.setTimeout(() => setPlaying(false), 2200);
  }

  return (
    <section className="border border-soviet-gold/45 bg-soviet-bg/45 p-2">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-['Russo_One'] text-soviet-cream text-xs tracking-wider">
          Tovarish Byte
        </h3>
        <span className={`text-[9px] font-mono uppercase ${modeTone[mode]}`}>
          {mode}
        </span>
      </div>

      <div className="grid grid-cols-[132px_1fr] gap-2">
        <button
          type="button"
          onClick={play}
          className="pet-canvas-shell h-[138px]"
          title="Play with Tovarish Byte"
        >
          <Suspense fallback={<div className="h-full w-full" />}>
            <SovietPetScene mode={mode} onInteract={play} />
          </Suspense>
        </button>

        <div className="min-w-0 flex flex-col">
          <div className="border border-soviet-red/25 bg-soviet-panel/70 p-2 min-h-[58px]">
            <div className="text-[9px] font-['Oswald'] uppercase tracking-wider text-soviet-cream/40">
              Pet Note
            </div>
            <p className="mt-1 text-[10px] leading-snug text-soviet-cream/70">
              {reply || petMoodLine(mode)}
            </p>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {shortcutLabels.map(([id, label]) => (
              <button
                key={id}
                onClick={() => onPromptPick(petPromptShortcut(id))}
                className="h-7 border border-soviet-gold/25 bg-soviet-panel/70 text-[10px] font-['Oswald'] uppercase tracking-wider text-soviet-gold/80 hover:border-soviet-gold"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-1">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              sendPetMessage();
            }
          }}
          placeholder="Talk to Tovarish Byte..."
          className="min-w-0 flex-1 bg-soviet-panel border border-soviet-red/35 px-2 py-1.5 text-[10px] font-mono text-soviet-cream focus:outline-none focus:border-soviet-gold"
        />
        <button
          onClick={sendPetMessage}
          disabled={!message.trim()}
          className="px-3 border border-soviet-gold/45 bg-soviet-gold/15 text-[10px] font-['Oswald'] uppercase tracking-wider text-soviet-gold disabled:opacity-45"
        >
          Ask
        </button>
      </div>

      <div className="mt-2 text-[9px] font-mono text-soviet-cream/35">
        {petMoodLine(mode)}
      </div>
    </section>
  );
}
