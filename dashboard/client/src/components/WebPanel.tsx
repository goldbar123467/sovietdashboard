import { useMemo, useState } from "react";
import hammerSickleImg from "../assets/hammer-sickle.png";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://www.youtube.com";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("localhost:") || trimmed.startsWith("127.0.0.1:")) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

function embeddableUrl(input: string): string {
  const normalized = normalizeUrl(input);
  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, "");
    let videoId: string | null = null;
    if (host === "youtube.com" && url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (videoId) return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
  } catch {
    return normalized;
  }
  return normalized;
}

export function WebPanel() {
  const [draftUrl, setDraftUrl] = useState("https://www.youtube.com");
  const [history, setHistory] = useState(["https://www.youtube.com"]);
  const [index, setIndex] = useState(0);
  const [frameKey, setFrameKey] = useState(0);
  const currentUrl = history[index] ?? "https://www.youtube.com";
  const frameUrl = useMemo(() => embeddableUrl(currentUrl), [currentUrl]);

  function navigate(raw: string) {
    const next = normalizeUrl(raw);
    setHistory((prev) => [...prev.slice(0, index + 1), next]);
    setIndex((prev) => prev + 1);
    setDraftUrl(next);
    setFrameKey((prev) => prev + 1);
  }

  function go(delta: number) {
    setIndex((prev) => {
      const next = Math.max(0, Math.min(history.length - 1, prev + delta));
      setDraftUrl(history[next] ?? draftUrl);
      return next;
    });
    setFrameKey((prev) => prev + 1);
  }

  async function openExternal() {
    await fetch("/api/command-board/browser/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    }).catch(() => {});
  }

  return (
    <div className="relative h-full min-h-0 flex flex-col border-2 border-soviet-red bg-soviet-panel overflow-hidden">
      <div className="relative flex items-center h-8 bg-soviet-red shrink-0">
        <div className="stripe-bg absolute inset-0 pointer-events-none" />
        <img src={hammerSickleImg} alt="" className="relative z-10 w-4 h-4 ml-2 opacity-80" />
        <span className="relative z-10 ml-2 text-xs font-['Russo_One'] text-soviet-cream tracking-wider">
          Chromium Web Tab
        </span>
      </div>

      <div className="flex items-center gap-1 p-2 border-b border-soviet-red/35 bg-soviet-bg/65">
        <button
          onClick={() => go(-1)}
          disabled={index === 0}
          title="Back"
          className="w-8 h-8 border border-soviet-red/40 text-soviet-cream disabled:opacity-35 hover:bg-soviet-red/20"
        >
          &lt;
        </button>
        <button
          onClick={() => go(1)}
          disabled={index >= history.length - 1}
          title="Forward"
          className="w-8 h-8 border border-soviet-red/40 text-soviet-cream disabled:opacity-35 hover:bg-soviet-red/20"
        >
          &gt;
        </button>
        <button
          onClick={() => setFrameKey((prev) => prev + 1)}
          title="Reload"
          className="w-8 h-8 border border-soviet-red/40 text-soviet-cream hover:bg-soviet-red/20"
        >
          R
        </button>
        <form
          className="flex-1 flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(draftUrl);
          }}
        >
          <input
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            className="flex-1 h-8 bg-soviet-panel border border-soviet-red/40 px-2 text-xs font-mono text-soviet-cream
                       focus:outline-none focus:border-soviet-red-bright"
          />
          <button className="h-8 px-3 bg-soviet-red text-soviet-cream text-[11px] font-['Oswald'] uppercase tracking-wider hover:bg-soviet-red-bright">
            Go
          </button>
        </form>
        <button
          onClick={openExternal}
          title="Open in external Chrome/Chromium"
          className="h-8 px-3 border border-soviet-teal/60 text-soviet-cream text-[11px] font-['Oswald'] uppercase tracking-wider hover:bg-soviet-teal/20"
        >
          Chrome
        </button>
      </div>

      <div className="relative flex-1 min-h-0 bg-black">
        <iframe
          key={frameKey}
          title="Command board web tab"
          src={frameUrl}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
          className="absolute inset-0 w-full h-full bg-black"
        />
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
          <p className="text-[10px] font-mono text-soviet-cream/55 truncate">
            {frameUrl}
          </p>
        </div>
      </div>
    </div>
  );
}
