const PineTree = ({ size = 60, opacity = 0.35 }: { size?: number; opacity?: number }) => (
  <svg style={{ width: size * 0.5, height: size, display: 'block' }} viewBox="0 0 30 60">
    <g fill="currentColor" opacity={opacity}>
      <polygon points="15,4 6,22 24,22" />
      <polygon points="15,16 3,38 27,38" />
      <polygon points="15,28 0,54 30,54" />
      <rect x="13" y="54" width="4" height="6" />
    </g>
  </svg>
);

const Cloud = ({ width = 120, opacity = 0.2 }: { width?: number; opacity?: number }) => (
  <svg style={{ width, height: width * 0.4, display: 'block' }} viewBox="0 0 100 40">
    <g fill="currentColor" opacity={opacity}>
      <ellipse cx="22" cy="26" rx="20" ry="12" />
      <ellipse cx="50" cy="20" rx="26" ry="16" />
      <ellipse cx="78" cy="26" rx="20" ry="12" />
    </g>
  </svg>
);

export const LandscapeArt = ({ isDark, opacity }: { isDark: boolean; opacity?: number }) => (
  <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, opacity: opacity ?? (isDark ? 0.08 : 0.05) }}>
    {/* Sun/Moon — fixed-size, top-right corner so it stays round at any aspect ratio */}
    <svg style={{ position: 'absolute', top: '10%', right: '8%', width: '110px', height: '110px' }} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill="currentColor" opacity="0.25" />
    </svg>

    {/* Birds — fixed-size, upper-left */}
    <svg style={{ position: 'absolute', top: '22%', left: '14%', width: '90px', height: '40px' }} viewBox="0 0 90 40">
      <g opacity="0.35" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 18 Q 12 8 19 18 Q 26 8 33 18" />
        <path d="M48 30 Q 55 20 62 30 Q 69 20 76 30" />
      </g>
    </svg>

    {/* Drifting clouds */}
    <div style={{ position: 'absolute', top: '14%', left: '38%' }}><Cloud width={140} opacity={0.18} /></div>
    <div style={{ position: 'absolute', top: '28%', left: '62%' }}><Cloud width={100} opacity={0.14} /></div>

    {/* Ridges — stretched horizontally at the bottom; vertical proportions stay consistent */}
    <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '45%', minHeight: '180px' }} preserveAspectRatio="none" viewBox="0 0 1200 400" xmlns="http://www.w3.org/2000/svg">
      {/* Distant Ridge */}
      <path d="M0 110 C 300 30 600 200 900 70 C 1100 -10 1200 30 1200 30 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.1" />
      {/* Mid Ridge */}
      <path d="M0 220 C 400 130 800 320 1200 180 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.2" />
      {/* Near Ridge */}
      <path d="M0 310 C 600 260 1000 380 1200 300 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.3" />
    </svg>

    {/* Tree clusters — fixed-size, anchored above the bottom so they sit on the ridges */}
    <div style={{ position: 'absolute', bottom: '24%', left: '8%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
      <PineTree size={48} opacity={0.4} />
      <PineTree size={68} opacity={0.5} />
      <PineTree size={42} opacity={0.35} />
    </div>
    <div style={{ position: 'absolute', bottom: '18%', right: '12%', display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
      <PineTree size={56} opacity={0.4} />
      <PineTree size={80} opacity={0.55} />
    </div>
    <div style={{ position: 'absolute', bottom: '32%', left: '46%' }}>
      <PineTree size={36} opacity={0.3} />
    </div>
    <div style={{ position: 'absolute', bottom: '12%', left: '32%' }}>
      <PineTree size={64} opacity={0.45} />
    </div>
  </div>
);

export const NetworkArt = ({ isDark, opacity }: { isDark: boolean; opacity?: number }) => (
  <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, opacity: opacity ?? (isDark ? 0.1 : 0.07) }}>
    <style>{`
      @keyframes twinkle {
        0%, 100% { opacity: 0.4; transform: scale(0.9); }
        50% { opacity: 0.9; transform: scale(1.1); }
      }
      .star {
        animation: twinkle 8s infinite ease-in-out;
      }
    `}</style>
    <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      {/* Interconnected constellations */}
      <g stroke="currentColor" strokeWidth="0.8" opacity="0.4" fill="none">
        <path d="M100 100 L300 150 L500 80 L700 200 L900 120 L1100 180" />
        <path d="M50 400 L250 450 L450 380 L650 500 L850 420 L1050 480" />
        <path d="M150 700 L350 750 L550 680 L750 780 L950 720 L1150 760" />
        <path d="M300 150 L250 450 L350 750" />
        <path d="M700 200 L650 500 L750 780" />
        <path d="M900 120 L850 420 L950 720" />
      </g>
      {/* Still rings at the joints the stars travel around */}
      <g fill="currentColor" stroke="none">
        <circle cx="100" cy="100" r="2.25" />
        <circle cx="300" cy="150" r="2.25" />
        <circle cx="500" cy="80" r="2.25" />
        <circle cx="700" cy="200" r="2.25" />
        <circle cx="900" cy="120" r="2.25" />
        <circle cx="1100" cy="180" r="2.25" />
        <circle cx="50" cy="400" r="2.25" />
        <circle cx="250" cy="450" r="2.25" />
        <circle cx="450" cy="380" r="2.25" />
        <circle cx="650" cy="500" r="2.25" />
        <circle cx="850" cy="420" r="2.25" />
        <circle cx="1050" cy="480" r="2.25" />
        <circle cx="150" cy="700" r="2.25" />
        <circle cx="350" cy="750" r="2.25" />
        <circle cx="550" cy="680" r="2.25" />
        <circle cx="750" cy="780" r="2.25" />
        <circle cx="950" cy="720" r="2.25" />
        <circle cx="1150" cy="760" r="2.25" />
      </g>
      {/* Starry background dots with twinkling */}
      <circle className="star" cx="100" cy="100" r="1.5" fill="currentColor" style={{ animationDelay: '0s' }} />
      <circle className="star" cx="300" cy="150" r="1" fill="currentColor" style={{ animationDelay: '1.2s' }} />
      <circle className="star" cx="500" cy="80" r="1.2" fill="currentColor" style={{ animationDelay: '0.5s' }} />
      <circle className="star" cx="700" cy="200" r="1.5" fill="currentColor" style={{ animationDelay: '2.1s' }} />
      <circle className="star" cx="900" cy="120" r="1" fill="currentColor" style={{ animationDelay: '0.8s' }} />
      <circle className="star" cx="1100" cy="180" r="1.2" fill="currentColor" style={{ animationDelay: '1.5s' }} />
      <circle className="star" cx="50" cy="400" r="1" fill="currentColor" style={{ animationDelay: '2.5s' }} />
      <circle className="star" cx="250" cy="450" r="1.5" fill="currentColor" style={{ animationDelay: '0.3s' }} />
      <circle className="star" cx="450" cy="380" r="1.2" fill="currentColor" style={{ animationDelay: '1.7s' }} />
      <circle className="star" cx="650" cy="500" r="1.5" fill="currentColor" style={{ animationDelay: '0.9s' }} />
      <circle className="star" cx="850" cy="420" r="1" fill="currentColor" style={{ animationDelay: '2.2s' }} />
      <circle className="star" cx="1050" cy="480" r="1.2" fill="currentColor" style={{ animationDelay: '1.1s' }} />
      <circle className="star" cx="150" cy="700" r="1.2" fill="currentColor" style={{ animationDelay: '0.6s' }} />
      <circle className="star" cx="350" cy="750" r="1" fill="currentColor" style={{ animationDelay: '1.9s' }} />
      <circle className="star" cx="550" cy="680" r="1.5" fill="currentColor" style={{ animationDelay: '0.4s' }} />
      <circle className="star" cx="750" cy="780" r="1.2" fill="currentColor" style={{ animationDelay: '2.7s' }} />
      <circle className="star" cx="950" cy="720" r="1.5" fill="currentColor" style={{ animationDelay: '1.3s' }} />
      <circle className="star" cx="1150" cy="760" r="1" fill="currentColor" style={{ animationDelay: '0.2s' }} />
    </svg>
  </div>
);

export type DiagramArtKind = 'landscape' | 'network';

export function pickDiagramArt(): DiagramArtKind {
  return Math.random() < 0.5 ? 'landscape' : 'network';
}
