'use client';

/**
 * Full-bleed sidebar ribbon art — SVG curves that span edge-to-edge
 * with no white gaps or dark edge artifacts.
 */
export function SidebarRibbonArt() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg
        viewBox="0 0 260 120"
        className="block h-full w-full"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sb-r1" x1="0" y1="120" x2="260" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#d1fae5" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#6ee7b7" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#a7f3d0" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="sb-r2" x1="0" y1="120" x2="260" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#bbf7d0" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#34d399" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="sb-r3" x1="0" y1="120" x2="260" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ecfdf5" stopOpacity="0.3" />
            <stop offset="45%" stopColor="#10b981" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="sb-r4" x1="0" y1="120" x2="260" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#86efac" stopOpacity="0.25" />
            <stop offset="55%" stopColor="#22c55e" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="sb-r5" x1="0" y1="120" x2="260" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f0fdf4" stopOpacity="0.1" />
            <stop offset="40%" stopColor="#16a34a" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#86efac" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Full-width ribbon bands — anchored bottom-left, sweep to top-right */}
        <path
          fill="url(#sb-r1)"
          d="M0,120 C30,95 60,80 100,60 C140,40 180,30 220,15 C240,8 255,4 260,0 L260,120 Z"
        />
        <path
          fill="url(#sb-r2)"
          d="M0,120 C25,98 55,82 95,62 C135,42 175,30 215,16 C238,8 252,3 260,0 L260,120 Z"
        />
        <path
          fill="url(#sb-r3)"
          d="M0,120 C20,100 50,85 90,65 C130,45 170,32 210,18 C235,9 250,4 260,0 L260,120 Z"
        />
        <path
          fill="url(#sb-r4)"
          d="M0,120 C15,102 45,88 85,68 C125,48 165,35 205,20 C230,11 248,5 260,0 L260,120 Z"
        />
        <path
          fill="url(#sb-r5)"
          d="M0,120 C10,105 40,92 80,72 C120,52 160,38 200,22 C225,12 245,6 260,0 L260,120 Z"
        />

        {/* Thread highlights */}
        <path
          fill="none"
          stroke="#34d399"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.4"
          vectorEffect="non-scaling-stroke"
          d="M0,108 C50,78 110,52 170,28 C210,14 240,6 260,0"
        />
        <path
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
          vectorEffect="non-scaling-stroke"
          d="M0,98 C45,72 100,48 160,26 C200,12 235,4 260,0"
        />
        <path
          fill="none"
          stroke="#6ee7b7"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.25"
          vectorEffect="non-scaling-stroke"
          d="M0,115 C40,88 95,62 155,36 C195,18 235,6 260,0"
        />
      </svg>

      {/* Soft fade into nav above */}
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white to-transparent dark:from-zinc-950" />
    </div>
  );
}
