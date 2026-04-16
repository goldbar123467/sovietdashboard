import hammerSickleImg from "../assets/hammer-sickle.png";

type AgentStatus = "active" | "waiting" | "idle";

interface AgentCardProps {
  name: string;
  status: AgentStatus;
  statusText: string;
  worktree: string;
  model: string;
  role: string;
  tokens: number;
  toolCalls: number;
  activeTime: string;
}

const dotClass: Record<AgentStatus, string> = {
  active: "dot-active",
  waiting: "dot-waiting",
  idle: "dot-idle",
};

const statusColor: Record<AgentStatus, string> = {
  active: "text-soviet-green",
  waiting: "text-soviet-gold",
  idle: "text-soviet-sky",
};

export function AgentCard({
  name,
  status,
  statusText,
  worktree,
  model,
  role,
  tokens,
  toolCalls,
  activeTime,
}: AgentCardProps) {
  return (
    <div className="relative border-2 border-soviet-red bg-soviet-panel panel-strip overflow-hidden">
      {/* Watermark */}
      <img
        src={hammerSickleImg}
        alt=""
        className="absolute top-1 right-1 w-10 h-10 opacity-[0.15] pointer-events-none"
      />

      <div className="px-3 pt-4 pb-2">
        {/* Name */}
        <h3 className="text-sm font-['Russo_One'] text-soviet-red-bright glow-red leading-tight">
          {name}
        </h3>

        {/* Status */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`w-2 h-2 rounded-full ${dotClass[status]} dot-pulse`} />
          <span className={`text-[11px] font-['Oswald'] uppercase tracking-wider ${statusColor[status]}`}>
            {statusText}
          </span>
        </div>

        {/* Info */}
        <div className="mt-2 space-y-0.5 text-[10px] font-mono text-soviet-sky">
          <div>wt: {worktree}</div>
          <div>model: {model} &middot; {role}</div>
        </div>

        {/* Mini metrics */}
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          <div className="border border-soviet-red/40 px-1.5 py-0.5 text-center">
            <div className="text-soviet-cream/50 font-['Oswald'] uppercase">Tok</div>
            <div className="text-soviet-cream font-mono">{tokens.toLocaleString()}</div>
          </div>
          <div className="border border-soviet-red/40 px-1.5 py-0.5 text-center">
            <div className="text-soviet-cream/50 font-['Oswald'] uppercase">Tools</div>
            <div className="text-soviet-cream font-mono">{toolCalls}</div>
          </div>
          <div className="border border-soviet-red/40 px-1.5 py-0.5 text-center">
            <div className="text-soviet-cream/50 font-['Oswald'] uppercase">Time</div>
            <div className="text-soviet-cream font-mono">{activeTime}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
