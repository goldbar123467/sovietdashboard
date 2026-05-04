import { useEffect, useMemo, useState } from "react";
import hammerSickleImg from "../assets/hammer-sickle.png";
import { useWebSocketContext } from "../hooks/useWebSocketContext";

interface CommandDefinition {
  id: string;
  title: string;
  description: string;
  group: "openclaw" | "codex" | "browser";
}

interface CommandResult {
  id: string;
  ok: boolean;
  title: string;
  output: string;
  code?: number | null;
  finishedAt: string;
}

interface StatusPayload {
  commands: CommandDefinition[];
  host: {
    platform: string;
    wsl: boolean;
    openclawRepo: string;
  };
}

const groupTitle: Record<CommandDefinition["group"], string> = {
  openclaw: "OpenClaw",
  codex: "Codex CLI",
  browser: "Browser",
};

const groupTone: Record<CommandDefinition["group"], string> = {
  openclaw: "border-soviet-red/50",
  codex: "border-soviet-sky/50",
  browser: "border-soviet-teal/50",
};

function addUniqueResult(prev: CommandResult[], result: CommandResult): CommandResult[] {
  const key = `${result.id}:${result.finishedAt}:${result.output}`;
  const filtered = prev.filter((item) => `${item.id}:${item.finishedAt}:${item.output}` !== key);
  return [result, ...filtered].slice(0, 12);
}

export function CommandBoard() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [prompt, setPrompt] = useState("Summarize what is running on this machine in one paragraph.");
  const [url, setUrl] = useState("https://www.youtube.com");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<CommandResult[]>([]);
  const ws = useWebSocketContext();

  useEffect(() => {
    fetch("/api/command-board/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch((err) => {
        setResults((prev) => [{
          id: "status",
          ok: false,
          title: "Status",
          output: String(err),
          finishedAt: new Date().toISOString(),
        }, ...prev]);
      });
  }, []);

  useEffect(() => {
    return ws.on("command_result", (result: CommandResult) => {
      setResults((prev) => addUniqueResult(prev, result));
      setRunning((current) => current === result.id ? null : current);
    });
  }, [ws]);

  const grouped = useMemo(() => {
    const groups = new Map<CommandDefinition["group"], CommandDefinition[]>();
    for (const command of status?.commands ?? []) {
      if (command.id === "codex.prompt") continue;
      if (!groups.has(command.group)) groups.set(command.group, []);
      groups.get(command.group)!.push(command);
    }
    return groups;
  }, [status]);

  async function runCommand(id: string, body: Record<string, string> = {}) {
    setRunning(id);
    try {
      const res = await fetch(`/api/command-board/commands/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      setResults((prev) => addUniqueResult(prev, result));
    } catch (err) {
      setResults((prev) => [{
        id,
        ok: false,
        title: id,
        output: String(err),
        finishedAt: new Date().toISOString(),
      }, ...prev]);
    } finally {
      setRunning(null);
    }
  }

  async function openExternalBrowser() {
    setRunning("browser.open");
    try {
      const res = await fetch("/api/command-board/browser/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = await res.json();
      setResults((prev) => addUniqueResult(prev, {
        id: "browser.open",
        ok: Boolean(result.ok),
        title: "Open External Browser",
        output: result.message ?? JSON.stringify(result),
        finishedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setResults((prev) => [{
        id: "browser.open",
        ok: false,
        title: "Open External Browser",
        output: String(err),
        finishedAt: new Date().toISOString(),
      }, ...prev]);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="relative h-full min-h-0 flex flex-col border-2 border-soviet-red bg-soviet-panel overflow-hidden">
      <div className="relative flex items-center h-8 bg-soviet-red shrink-0">
        <div className="stripe-bg absolute inset-0 pointer-events-none" />
        <img src={hammerSickleImg} alt="" className="relative z-10 w-4 h-4 ml-2 opacity-80" />
        <span className="relative z-10 ml-2 text-xs font-['Russo_One'] text-soviet-cream tracking-wider">
          Local Command Board
        </span>
        <span className="relative z-10 ml-auto mr-3 text-[10px] font-mono text-soviet-cream/80">
          {status ? `${status.host.platform}${status.host.wsl ? " / WSL" : ""}` : "probing..."}
        </span>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[1.1fr_0.9fr] gap-2 p-2 overflow-hidden">
        <div className="min-h-0 overflow-y-auto scroll-soviet pr-1 space-y-2">
          {[...grouped.entries()].map(([group, commands]) => (
            <section key={group} className={`border ${groupTone[group]} bg-soviet-bg/45 p-2`}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-['Russo_One'] text-soviet-cream text-xs tracking-wider">
                  {groupTitle[group]}
                </h3>
                <span className="text-[9px] font-mono text-soviet-cream/35">{commands.length} controls</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {commands.map((command) => (
                  <button
                    key={command.id}
                    onClick={() => runCommand(command.id)}
                    disabled={running !== null}
                    title={command.description}
                    className="min-h-[48px] text-left border border-soviet-red/35 bg-soviet-panel px-2 py-1
                               hover:border-soviet-red-bright hover:bg-soviet-red/15 transition-colors
                               disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <span className="block text-[11px] font-['Oswald'] uppercase tracking-wider text-soviet-cream">
                      {running === command.id ? "Running..." : command.title}
                    </span>
                    <span className="block text-[10px] leading-snug text-soviet-cream/45">{command.description}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <section className="border border-soviet-sky/40 bg-soviet-bg/45 p-2">
            <h3 className="font-['Russo_One'] text-soviet-cream text-xs tracking-wider mb-2">
              Codex One-Shot
            </h3>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="w-full h-20 resize-none bg-soviet-panel border border-soviet-red/40 p-2 text-xs font-mono text-soviet-cream
                         focus:outline-none focus:border-soviet-red-bright"
            />
            <button
              onClick={() => runCommand("codex.prompt", { prompt })}
              disabled={running !== null || !prompt.trim()}
              className="mt-1 w-full bg-soviet-red text-soviet-cream text-[11px] font-['Oswald'] uppercase tracking-wider py-2
                         hover:bg-soviet-red-bright transition-colors disabled:opacity-45"
            >
              {running === "codex.prompt" ? "Codex Running..." : "Send To Codex"}
            </button>
          </section>

          <section className="border border-soviet-teal/40 bg-soviet-bg/45 p-2">
            <h3 className="font-['Russo_One'] text-soviet-cream text-xs tracking-wider mb-2">
              Chromium Fallback
            </h3>
            <div className="flex gap-1">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="flex-1 bg-soviet-panel border border-soviet-red/40 p-2 text-xs font-mono text-soviet-cream
                           focus:outline-none focus:border-soviet-red-bright"
              />
              <button
                onClick={openExternalBrowser}
                disabled={running !== null}
                className="bg-soviet-teal/70 text-soviet-cream text-[11px] font-['Oswald'] uppercase tracking-wider px-3
                           hover:bg-soviet-teal disabled:opacity-45"
              >
                Open
              </button>
            </div>
          </section>
        </div>

        <div className="min-h-0 flex flex-col border border-soviet-red/35 bg-soviet-bg/55">
          <div className="px-2 py-1 border-b border-soviet-red/30">
            <h3 className="text-xs font-['Russo_One'] text-soviet-red-bright glow-red uppercase tracking-wider">
              Command Output
            </h3>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-soviet p-2 space-y-2">
            {results.length === 0 ? (
              <p className="text-[11px] italic text-soviet-cream/35">No command output yet.</p>
            ) : results.map((result, index) => (
              <article key={`${result.id}-${result.finishedAt}-${index}`} className="border border-soviet-red/25 bg-soviet-panel/80 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-['Oswald'] uppercase tracking-wider ${result.ok ? "text-soviet-green" : "text-soviet-gold"}`}>
                    {result.title}
                  </span>
                  <span className="text-[9px] font-mono text-soviet-cream/35">
                    {new Date(result.finishedAt).toLocaleTimeString("en-US", { hour12: false })}
                  </span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-snug text-soviet-cream/75 font-mono">
                  {result.output}
                </pre>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
