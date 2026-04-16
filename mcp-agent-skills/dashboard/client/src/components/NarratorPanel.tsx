import hammerSickleImg from "../assets/hammer-sickle.png";

export function NarratorPanel() {
  return (
    <div className="relative border-2 border-soviet-red bg-soviet-panel panel-strip overflow-hidden">
      <div className="px-3 pt-4 pb-2">
        {/* Title */}
        <div className="flex items-center gap-2">
          <img src={hammerSickleImg} alt="" className="w-4 h-4 opacity-60" />
          <h3 className="text-xs font-['Russo_One'] text-soviet-red-bright glow-red uppercase tracking-wider">
            Mission Briefing
          </h3>
        </div>

        {/* Content */}
        <p className="mt-2 text-[11px] font-['Oswald'] text-soviet-cream/70 leading-relaxed">
          Awaiting mission data. Agents standing by for orders.
        </p>

        {/* Bottom strip */}
        <div className="mt-3 flex items-center gap-2 text-[9px] font-mono text-soviet-cream/40">
          <span className="w-2 h-2 rounded-full dot-active dot-pulse" />
          <span className="font-['Oswald'] uppercase tracking-wider">
            OpenRouter &middot; Haiku 4.5 &middot; 20s poll
          </span>
          <span className="ml-auto">--:--:--</span>
        </div>
      </div>
    </div>
  );
}
