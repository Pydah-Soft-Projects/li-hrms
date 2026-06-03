"use client";

import { useId } from "react";

/**
 * Inline vector 404 background — crisp at any size (no rasterized img / blur overlay).
 */
export default function NotFoundNatureScene() {
  const uid = useId().replace(/:/g, "");
  const sky = `nf-sky-${uid}`;
  const hill1 = `nf-hill1-${uid}`;
  const hill2 = `nf-hill2-${uid}`;
  const shadow = `nf-shadow-${uid}`;

  return (
    <svg
      className="nf-nature-svg absolute inset-0 h-full w-full"
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={sky} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d4fc79" />
          <stop offset="100%" stopColor="#96e6a1" />
        </linearGradient>
        <linearGradient id={hill1} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#43a047" />
          <stop offset="100%" stopColor="#2e7d32" />
        </linearGradient>
        <linearGradient id={hill2} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#66bb6a" />
          <stop offset="100%" stopColor="#388e3c" />
        </linearGradient>
        <filter id={shadow}>
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodOpacity="0.25" />
        </filter>
      </defs>

      <rect width="1200" height="700" fill={`url(#${sky})`} />

      <circle cx="980" cy="120" r="60" fill="#fff59d">
        <animate
          attributeName="r"
          values="60;65;60"
          dur="4s"
          repeatCount="indefinite"
        />
      </circle>

      <g opacity="0.9">
        <g>
          <ellipse cx="150" cy="120" rx="50" ry="25" fill="white" />
          <ellipse cx="190" cy="120" rx="60" ry="35" fill="white" />
          <ellipse cx="240" cy="120" rx="45" ry="25" fill="white" />
          <animateTransform
            attributeName="transform"
            type="translate"
            values="-50 0;1250 0"
            dur="40s"
            repeatCount="indefinite"
          />
        </g>
        <g>
          <ellipse cx="800" cy="180" rx="40" ry="20" fill="white" />
          <ellipse cx="840" cy="180" rx="50" ry="30" fill="white" />
          <ellipse cx="885" cy="180" rx="40" ry="20" fill="white" />
          <animateTransform
            attributeName="transform"
            type="translate"
            values="-100 0;1200 0"
            dur="50s"
            repeatCount="indefinite"
          />
        </g>
      </g>

      <g fill="none" stroke="#2e7d32" strokeWidth="3">
        <path d="M0 0 Q10 -10 20 0 Q30 -10 40 0">
          <animateMotion
            dur="18s"
            repeatCount="indefinite"
            path="M-50 150 Q600 50 1250 180"
          />
        </path>
      </g>

      <path
        d="M0 450 Q250 300 500 420 T1200 400 V700 H0 Z"
        fill={`url(#${hill2})`}
      />
      <path
        d="M0 520 Q250 350 600 500 T1200 450 V700 H0 Z"
        fill={`url(#${hill1})`}
      />

      <g transform="translate(180,430)">
        <g className="nf-tree-sway">
          <rect x="-8" y="50" width="16" height="70" fill="#6d4c41" />
          <circle cx="0" cy="25" r="40" fill="#2e7d32" />
        </g>
      </g>
      <g transform="translate(950,420)">
        <g className="nf-tree-sway nf-tree-sway--alt">
          <rect x="-8" y="50" width="16" height="70" fill="#6d4c41" />
          <circle cx="0" cy="25" r="45" fill="#388e3c" />
        </g>
      </g>

      <g filter={`url(#${shadow})`}>
        <text
          x="600"
          y="320"
          textAnchor="middle"
          fontSize="180"
          fontFamily="var(--font-sans), system-ui, sans-serif"
          fontWeight="900"
          fill="white"
          className="nf-404-float"
        >
          404
        </text>
      </g>

      <g fill="#81c784">
        <ellipse cx="100" cy="500" rx="10" ry="5">
          <animateMotion
            dur="8s"
            repeatCount="indefinite"
            path="M0 0 Q200 -150 400 -50"
          />
        </ellipse>
        <ellipse cx="1000" cy="550" rx="10" ry="5">
          <animateMotion
            dur="10s"
            repeatCount="indefinite"
            path="M0 0 Q-250 -200 -500 -50"
          />
        </ellipse>
      </g>
    </svg>
  );
}
