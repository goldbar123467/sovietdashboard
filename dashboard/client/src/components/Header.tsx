import ushankaImg from "../assets/ushanka.png";

export function Header() {
  return (
    <header className="col-span-3 relative flex items-center bg-soviet-red border-2 border-soviet-red overflow-hidden">
      {/* Diagonal stripe overlay */}
      <div className="stripe-bg absolute inset-0 pointer-events-none" />

      {/* Ushanka button */}
      <button
        className="relative z-10 ml-3 w-[46px] h-[46px] rounded-full border-2 border-white/30 bg-black/20
                   flex items-center justify-center overflow-hidden
                   hover:border-soviet-cream hover:shadow-[0_0_16px_rgba(245,236,208,0.3)] hover:scale-110
                   transition-all cursor-pointer"
        title="ТОВАРИЩ ЦЕНТР Menu"
      >
        <img src={ushankaImg} alt="Ushanka" className="w-full h-full object-cover brightness-150" />
      </button>

      {/* Title */}
      <div className="relative z-10 ml-4">
        <h1 className="text-2xl text-soviet-cream font-['Russo_One'] tracking-wider glow-red leading-none">
          ТОВАРИЩ ЦЕНТР
        </h1>
        <p className="text-xs text-soviet-cream/70 font-['Oswald'] tracking-widest uppercase">
          Comrade Orchestration System
        </p>
      </div>

      {/* Right stats */}
      <div className="relative z-10 ml-auto mr-4 flex items-center gap-5 text-xs font-['Oswald'] text-soviet-cream/90">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full dot-active" />
          <span>Agents <strong className="text-soviet-cream">4/4</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full dot-active" />
          <span>Session <strong className="text-soviet-cream">ACTIVE</strong></span>
        </div>
        <div>
          <span className="text-soviet-cream/60">Mission Time</span>{" "}
          <strong className="text-soviet-cream font-mono">00:00:00</strong>
        </div>
      </div>
    </header>
  );
}
