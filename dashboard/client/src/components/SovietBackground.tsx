import sickle from "../assets/hammer-sickle.png";

export function SovietBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        {/* Constructivist rays from top-left */}
        <g opacity="0.025">
          <polygon points="0,0 1920,300 1920,350" fill="#c41e1e" />
          <polygon points="0,0 1920,500 1920,550" fill="#c41e1e" />
          <polygon points="0,0 1920,700 1920,750" fill="#c41e1e" />
          <polygon points="0,0 1920,900 1920,950" fill="#c41e1e" />
          <polygon points="0,0 1400,1080 1450,1080" fill="#c41e1e" />
          <polygon points="0,0 900,1080 950,1080" fill="#c41e1e" />
        </g>

        {/* Sickle watermarks */}
        <image href={sickle} x="860" y="440" width="200" height="200" opacity="0.04" />
        <image href={sickle} x="150" y="350" width="120" height="120" opacity="0.04" />
        <image href={sickle} x="1650" y="300" width="100" height="100" opacity="0.03" />
        <image href={sickle} x="400" y="900" width="90" height="90" opacity="0.03" />
        <image href={sickle} x="1400" y="850" width="110" height="110" opacity="0.035" />

        {/* Border stripes */}
        <rect x="0" y="0" width="100%" height="4" fill="rgba(196,30,30,0.2)" />
        <rect x="0" y="99%" width="100%" height="4" fill="rgba(196,30,30,0.2)" />

        {/* Cyrillic watermark */}
        <text x="50%" y="98%" textAnchor="middle" fontFamily="'Oswald', sans-serif" fontSize="12" fill="rgba(196,30,30,0.035)" letterSpacing="1.2em">
          КОМАНДНЫЙ ПУНКТ
        </text>
      </svg>
    </div>
  );
}
