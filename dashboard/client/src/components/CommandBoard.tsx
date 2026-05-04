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

interface ServerChatMessage {
  from: string;
  to: string;
  body: string;
  timestamp: string;
}

interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

interface CodexRunRecord {
  id: string;
  ok: boolean;
  prompt: string;
  reply: string;
  threadId?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  usage: CodexUsage;
  toolCalls: number;
  error?: string;
}

interface CodexSessionSummary {
  id: string;
  timestamp: string;
  cwd?: string;
  originator?: string;
  cliVersion?: string;
  modelProvider?: string;
  file: string;
  updatedAt: string;
}

interface CodexDashboardSnapshot {
  status: "idle" | "running";
  activeThreadId?: string;
  activeRun?: {
    id: string;
    startedAt: string;
    prompt: string;
  };
  runs: CodexRunRecord[];
  totals: {
    turns: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
    toolCalls: number;
    failures: number;
    avgDurationMs: number;
  };
  recentSessions: CodexSessionSummary[];
}

interface StatusPayload {
  commands: CommandDefinition[];
  host: {
    platform: string;
    wsl: boolean;
    openclawRepo: string;
  };
}

const EMPTY_CODEX_STATE: CodexDashboardSnapshot = {
  status: "idle",
  runs: [],
  totals: {
    turns: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
    failures: 0,
    avgDurationMs: 0,
  },
  recentSessions: [],
};

const commandTone: Record<"openclaw" | "codex", string> = {
  openclaw: "border-soviet-red/45 hover:border-soviet-red-bright hover:bg-soviet-red/15",
  codex: "border-soviet-sky/45 hover:border-soviet-sky hover:bg-soviet-sky/15",
};

function addUniqueResult(prev: CommandResult[], result: CommandResult): CommandResult[] {
  const key = `${result.id}:${result.finishedAt}:${result.output}`;
  const filtered = prev.filter((item) => `${item.id}:${item.finishedAt}:${item.output}` !== key);
  return [result, ...filtered].slice(0, 30);
}

function codexResultToCommand(result: CodexRunRecord): CommandResult {
  const usage = [
    `tokens ${formatNumber(result.usage.totalTokens)}`,
    `tools ${formatNumber(result.toolCalls)}`,
    `duration ${formatDuration(result.durationMs)}`,
  ].join(" | ");
  return {
    id: result.id,
    ok: result.ok,
    title: result.ok ? "Codex CLI reply" : "Codex CLI failed",
    output: `${result.reply}\n\n${usage}`,
    finishedAt: result.finishedAt,
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatDuration(value: number): string {
  if (!value) return "0s";
  if (value < 1000) return `${value}ms`;
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function compactId(value?: string): string {
  if (!value) return "none";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function timeLabel(value?: string): string {
  if (!value) return "--:--:--";
  return new Date(value).toLocaleTimeString("en-US", { hour12: false });
}

export function CommandBoard() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [codexState, setCodexState] = useState<CodexDashboardSnapshot>(EMPTY_CODEX_STATE);
  const [prompt, setPrompt] = useState("Review the current repo status and tell me the next best code action.");
  const [openClawText, setOpenClawText] = useState("Reply with OK only.");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<CommandResult[]>([]);
  const ws = useWebSocketContext();

  useEffect(() => {
    fetch("/api/command-board/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch((err) => {
        setResults((prev) => addUniqueResult(prev, {
          id: "status",
          ok: false,
          title: "Status probe failed",
          output: String(err),
          finishedAt: new Date().toISOString(),
        }));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/codex/session")
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setCodexState(data);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return ws.on("command_result", (result: CommandResult) => {
      setResults((prev) => addUniqueResult(prev, result));
      setRunning((current) => current === result.id ? null : current);
    });
  }, [ws]);

  useEffect(() => {
    return ws.on("codex_state", (snapshot: CodexDashboardSnapshot) => {
      setCodexState(snapshot);
    });
  }, [ws]);

  useEffect(() => {
    return ws.on("codex_result", (result: CodexRunRecord) => {
      setResults((prev) => addUniqueResult(prev, codexResultToCommand(result)));
      setRunning((current) => current === "codex.chat" ? null : current);
    });
  }, [ws]);

  useEffect(() => {
    return ws.on("chat", (message: ServerChatMessage) => {
      if (message.from === "operator" || message.from === "codex") return;
      setResults((prev) => addUniqueResult(prev, {
        id: `chat.${message.from}`,
        ok: true,
        title: `${message.from} reply`,
        output: message.body,
        finishedAt: message.timestamp,
      }));
    });
  }, [ws]);

  const visibleCommands = useMemo(() => {
    const commands = status?.commands ?? [];
    return {
      openclaw: commands.filter((command) => command.group === "openclaw" && command.id !== "openclaw.text"),
      codex: commands.filter((command) => command.group === "codex"),
    };
  }, [status]);

  const statCards = useMemo(() => ([
    ["Total Tokens", formatNumber(codexState.totals.totalTokens), "border-soviet-red/50"],
    ["Input", formatNumber(codexState.totals.inputTokens), "border-soviet-sky/50"],
    ["Cached", formatNumber(codexState.totals.cachedInputTokens), "border-soviet-teal/50"],
    ["Output", formatNumber(codexState.totals.outputTokens), "border-soviet-gold/50"],
    ["Reasoning", formatNumber(codexState.totals.reasoningOutputTokens), "border-soviet-violet/50"],
    ["Tool Calls", formatNumber(codexState.totals.toolCalls), "border-soviet-green/50"],
    ["Turns", formatNumber(codexState.totals.turns), "border-soviet-cream/35"],
    ["Avg Turn", formatDuration(codexState.totals.avgDurationMs), "border-soviet-red/35"],
  ]), [codexState]);

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
      setResults((prev) => addUniqueResult(prev, {
        id,
        ok: false,
        title: id,
        output: String(err),
        finishedAt: new Date().toISOString(),
      }));
    } finally {
      setRunning(null);
    }
  }

  async function sendCodexPrompt() {
    const body = prompt.trim();
    if (!body) return;
    setRunning("codex.chat");
    setResults((prev) => addUniqueResult(prev, {
      id: "chat.operator",
      ok: true,
      title: "Operator prompt",
      output: body,
      finishedAt: new Date().toISOString(),
    }));
    try {
      const res = await fetch("/api/codex/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "operator", to: "codex", body }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      if (payload.result) {
        setResults((prev) => addUniqueResult(prev, codexResultToCommand(payload.result)));
      }
      setPrompt("");
    } catch (err) {
      setResults((prev) => addUniqueResult(prev, {
        id: "codex.chat",
        ok: false,
        title: "Codex CLI dispatch failed",
        output: String(err),
        finishedAt: new Date().toISOString(),
      }));
    } finally {
      setRunning(null);
    }
  }

  const disabled = running !== null || codexState.status === "running";
  const newestRun = codexState.runs[0];

  return (
    <div className="relative h-full min-h-0 flex flex-col border-2 border-soviet-red bg-soviet-panel overflow-hidden">
      <div className="relative flex items-center h-8 bg-soviet-red shrink-0">
        <div className="stripe-bg absolute inset-0 pointer-events-none" />
        <img src={hammerSickleImg} alt="" className="relative z-10 w-4 h-4 ml-2 opacity-80" />
        <span className="relative z-10 ml-2 text-xs font-['Russo_One'] text-soviet-cream tracking-wider">
          Agent Comms / Codex CLI Direct
        </span>
        <span className="relative z-10 ml-auto mr-3 text-[10px] font-mono text-soviet-cream/80 truncate">
          {status ? `${status.host.platform}${status.host.wsl ? " / WSL" : ""}` : "probing host..."}
        </span>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(420px,1.35fr)_minmax(300px,0.75fr)] gap-2 p-2 overflow-y-auto lg:overflow-hidden scroll-soviet">
        <section className="min-h-[560px] lg:min-h-0 flex flex-col border border-soviet-red/35 bg-soviet-bg/55 overflow-hidden">
          <div className="px-3 py-2 border-b border-soviet-red/30 flex items-center gap-3">
            <div>
              <h2 className="text-sm font-['Russo_One'] text-soviet-red-bright glow-red uppercase tracking-wider">
                Agent Comms
              </h2>
              <p className="text-[10px] font-mono text-soviet-cream/45">
                direct local Codex CLI session | thread {compactId(codexState.activeThreadId)}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-[10px] font-mono uppercase">
              <span className={`w-2 h-2 rounded-full ${codexState.status === "running" ? "dot-waiting dot-pulse" : "dot-active"}`} />
              <span className={codexState.status === "running" ? "text-soviet-gold" : "text-soviet-green"}>
                {codexState.status === "running" ? "Codex running" : "Ready"}
              </span>
            </div>
          </div>

          <div className="p-3 border-b border-soviet-red/25 bg-soviet-bg/35">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void sendCodexPrompt();
                }
              }}
              placeholder="Type to Codex CLI..."
              className="w-full h-28 resize-none bg-soviet-panel border border-soviet-red/40 p-3 text-xs leading-relaxed font-mono text-soviet-cream
                         focus:outline-none focus:border-soviet-red-bright"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={sendCodexPrompt}
                disabled={disabled || !prompt.trim()}
                className="h-9 px-5 bg-soviet-gold/85 text-soviet-bg text-[12px] font-['Oswald'] uppercase tracking-wider
                           hover:bg-soviet-gold transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {running === "codex.chat" || codexState.status === "running" ? "Codex Running..." : "Send To Codex"}
              </button>
              <button
                onClick={() => setPrompt("Inspect the current git diff, run the narrowest useful checks, and report the next implementation step.")}
                disabled={disabled}
                className="h-9 px-3 border border-soviet-sky/45 text-soviet-sky text-[11px] font-['Oswald'] uppercase tracking-wider
                           hover:bg-soviet-sky/15 disabled:opacity-45"
              >
                Status Prompt
              </button>
              <span className="ml-auto text-[10px] font-mono text-soviet-cream/40">
                Ctrl/Cmd Enter sends
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scroll-soviet p-3 space-y-2">
            {results.length === 0 ? (
              <div className="h-full min-h-[220px] flex items-center justify-center border border-dashed border-soviet-red/25 bg-soviet-panel/40">
                <p className="text-[11px] italic text-soviet-cream/35">Command output will stream into this board.</p>
              </div>
            ) : results.map((result, index) => (
              <article key={`${result.id}-${result.finishedAt}-${index}`} className="border border-soviet-red/25 bg-soviet-panel/85 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-['Oswald'] uppercase tracking-wider ${result.ok ? "text-soviet-green" : "text-soviet-gold"}`}>
                    {result.title}
                  </span>
                  <span className="text-[9px] font-mono text-soviet-cream/35 shrink-0">
                    {timeLabel(result.finishedAt)}
                  </span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-soviet-cream/78 font-mono">
                  {result.output}
                </pre>
              </article>
            ))}
          </div>
        </section>

        <aside className="min-h-0 overflow-visible lg:overflow-y-auto scroll-soviet pr-1 space-y-2">
          <section className="border border-soviet-red/45 bg-soviet-bg/45 p-2">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-['Russo_One'] text-soviet-cream text-xs tracking-wider">
                Live Codex Stats
              </h3>
              <span className="text-[9px] font-mono text-soviet-cream/35">
                failures {formatNumber(codexState.totals.failures)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {statCards.map(([label, value, tone]) => (
                <div key={label} className={`min-h-[54px] border ${tone} bg-soviet-panel/80 p-2`}>
                  <div className="text-[9px] font-['Oswald'] uppercase tracking-wider text-soviet-cream/45">
                    {label}
                  </div>
                  <div className="mt-1 text-lg leading-none font-mono text-soviet-cream truncate">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-soviet-sky/40 bg-soviet-bg/45 p-2">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-['Russo_One'] text-soviet-cream text-xs tracking-wider">
                Codex CLI Controls
              </h3>
              <span className="text-[9px] font-mono text-soviet-cream/35">
                {visibleCommands.codex.length} checks
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {visibleCommands.codex.map((command) => (
                <button
                  key={command.id}
                  onClick={() => runCommand(command.id)}
                  disabled={disabled}
                  title={command.description}
                  className={`min-h-[52px] text-left border ${commandTone.codex} bg-soviet-panel px-2 py-1 transition-colors
                             disabled:opacity-45 disabled:cursor-not-allowed`}
                >
                  <span className="block text-[11px] font-['Oswald'] uppercase tracking-wider text-soviet-cream">
                    {running === command.id ? "Running..." : command.title}
                  </span>
                  <span className="block text-[10px] leading-snug text-soviet-cream/45">{command.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="border border-soviet-red/45 bg-soviet-bg/45 p-2">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-['Russo_One'] text-soviet-cream text-xs tracking-wider">
                OpenClaw
              </h3>
              <span className="text-[9px] font-mono text-soviet-cream/35 truncate max-w-[190px]">
                {status?.host.openclawRepo ?? "probing..."}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {visibleCommands.openclaw.map((command) => (
                <button
                  key={command.id}
                  onClick={() => runCommand(command.id)}
                  disabled={disabled}
                  title={command.description}
                  className={`min-h-[52px] text-left border ${commandTone.openclaw} bg-soviet-panel px-2 py-1 transition-colors
                             disabled:opacity-45 disabled:cursor-not-allowed`}
                >
                  <span className="block text-[11px] font-['Oswald'] uppercase tracking-wider text-soviet-cream">
                    {running === command.id ? "Running..." : command.title}
                  </span>
                  <span className="block text-[10px] leading-snug text-soviet-cream/45">{command.description}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 border border-soviet-red/30 bg-soviet-panel/70 p-2">
              <div className="text-[10px] font-['Oswald'] uppercase tracking-wider text-soviet-cream/60 mb-1">
                Text OpenClaw
              </div>
              <textarea
                value={openClawText}
                onChange={(event) => setOpenClawText(event.target.value)}
                className="w-full h-20 resize-none bg-soviet-bg border border-soviet-red/35 p-2 text-xs font-mono text-soviet-cream
                           focus:outline-none focus:border-soviet-red-bright"
              />
              <button
                onClick={() => runCommand("openclaw.text", { prompt: openClawText })}
                disabled={disabled || !openClawText.trim()}
                className="mt-1 w-full h-8 bg-soviet-red text-soviet-cream text-[11px] font-['Oswald'] uppercase tracking-wider
                           hover:bg-soviet-red-bright transition-colors disabled:opacity-45"
              >
                {running === "openclaw.text" ? "OpenClaw Running..." : "Send To OpenClaw"}
              </button>
            </div>
          </section>

          <section className="border border-soviet-teal/40 bg-soviet-bg/45 p-2">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-['Russo_One'] text-soviet-cream text-xs tracking-wider">
                Session Radar
              </h3>
              <span className="text-[9px] font-mono text-soviet-cream/35">
                {codexState.recentSessions.length} seen
              </span>
            </div>
            <div className="space-y-1.5">
              {codexState.activeRun && (
                <article className="border border-soviet-gold/45 bg-soviet-panel/85 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-['Oswald'] uppercase tracking-wider text-soviet-gold">
                      Active Run
                    </span>
                    <span className="text-[9px] font-mono text-soviet-cream/35">{timeLabel(codexState.activeRun.startedAt)}</span>
                  </div>
                  <p className="mt-1 max-h-12 overflow-hidden text-[10px] leading-snug text-soviet-cream/65">
                    {codexState.activeRun.prompt}
                  </p>
                </article>
              )}
              {newestRun && (
                <article className="border border-soviet-green/45 bg-soviet-panel/85 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-['Oswald'] uppercase tracking-wider text-soviet-green">
                      Last Turn
                    </span>
                    <span className="text-[9px] font-mono text-soviet-cream/35">{formatDuration(newestRun.durationMs)}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-soviet-cream/65">
                    {compactId(newestRun.threadId)} | {formatNumber(newestRun.usage.totalTokens)} tokens
                  </p>
                </article>
              )}
              {codexState.recentSessions.slice(0, 7).map((session) => (
                <article key={`${session.id}-${session.updatedAt}`} className="border border-soviet-teal/25 bg-soviet-panel/70 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-soviet-cream truncate">
                      {compactId(session.id)}
                    </span>
                    <span className="text-[9px] font-mono text-soviet-cream/35 shrink-0">
                      {timeLabel(session.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] leading-snug text-soviet-cream/40 truncate">
                    {session.cwd ?? "unknown cwd"}
                  </p>
                </article>
              ))}
              {codexState.recentSessions.length === 0 && (
                <p className="text-[11px] italic text-soviet-cream/35">No Codex session metadata found yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
