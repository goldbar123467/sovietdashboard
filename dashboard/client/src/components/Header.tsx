import ushankaImg from "../assets/ushanka.png";

interface HeaderProps {
  connected: boolean;
}

export function Header({ connected }: HeaderProps) {
  return (
    <header className="col-span-full relative flex items-center bg-soviet-red border-2 border-soviet-red overflow-hidden">
      <div className="stripe-bg absolute inset-0 pointer-events-none" />

      <button
        className="relative z-10 ml-3 w-[46px] h-[46px] rounded-full border-2 border-white/30 bg-black/20
                   flex items-center justify-center overflow-hidden
                   hover:border-soviet-cream hover:shadow-[0_0_16px_rgba(245,236,208,0.3)] hover:scale-110
                   transition-all cursor-pointer"
        title="Command Board Menu"
      >
        <img src={ushankaImg} alt="Ushanka" className="w-full h-full object-cover brightness-150" />
      </button>

      <div className="relative z-10 ml-4 min-w-0">
        <h1 className="text-2xl text-soviet-cream font-['Russo_One'] tracking-wider glow-red leading-none truncate">
          ТОВАРИЩ ЦЕНТР
        </h1>
        <p className="text-xs text-soviet-cream/70 font-['Oswald'] tracking-widest uppercase truncate">
          Local Codex Command Board
        </p>
      </div>

      <div className="relative z-10 ml-auto mr-4 hidden sm:flex items-center gap-5 text-xs font-['Oswald'] text-soviet-cream/90">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? "dot-active" : "dot-waiting"}`} />
          <span>Socket <strong className="text-soviet-cream">{connected ? "ONLINE" : "RETRY"}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full dot-idle" />
          <span>CLI <strong className="text-soviet-cream">DIRECT</strong></span>
        </div>
        <div>
          <span className="text-soviet-cream/60">Flow</span>{" "}
          <strong className="text-soviet-cream font-mono">AGENT COMMS</strong>
        </div>
      </div>
    </header>
  );
}
