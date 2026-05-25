'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type TodayDayType = 'HOLIDAY' | 'WEEK_OFF';

interface HolidayCelebrationOverlayProps {
  dayType: TodayDayType;
  holidayName?: string | null;
}

type RibbonSpec = {
  id: string;
  left: number;
  delay: number;
  duration: number;
  width: number;
  hue: number;
  tilt: number;
  layer: 'back' | 'front';
};

type ConfettiSpec = {
  id: string;
  left: number;
  delay: number;
  duration: number;
  w: number;
  h: number;
  color: string;
  rotate: number;
};

const HOLIDAY_HUES = [38, 12, 350, 28, 45];
const WEEKOFF_HUES = [158, 172, 188, 142, 165];

function buildRibbons(count: number, hues: number[]): RibbonSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ribbon-${i}`,
    left: (i / count) * 100 + (Math.random() * 8 - 4),
    delay: Math.random() * 3,
    duration: 7 + Math.random() * 5,
    width: 28 + Math.random() * 22,
    hue: hues[i % hues.length],
    tilt: -25 + Math.random() * 50,
    layer: i % 3 === 0 ? 'back' : 'front',
  }));
}

function buildConfetti(count: number, palette: string[]): ConfettiSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `conf-${i}`,
    left: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 4 + Math.random() * 4,
    w: 6 + Math.random() * 10,
    h: 10 + Math.random() * 14,
    color: palette[i % palette.length],
    rotate: Math.random() * 360,
  }));
}

const HOLIDAY_PALETTE = ['#fbbf24', '#f472b6', '#fb7185', '#fcd34d', '#fda4af', '#fff7ed'];
const WEEKOFF_PALETTE = ['#6ee7b7', '#5eead4', '#a7f3d0', '#99f6e4', '#ecfdf5', '#ffffff'];

function sessionDismissKey(dayType: TodayDayType) {
  return `hrms_celebration_dismissed_${new Date().toISOString().slice(0, 10)}_${dayType}`;
}

export default function HolidayCelebrationOverlay({ dayType, holidayName }: HolidayCelebrationOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const isHoliday = dayType === 'HOLIDAY';
  const hues = isHoliday ? HOLIDAY_HUES : WEEKOFF_HUES;
  const palette = isHoliday ? HOLIDAY_PALETTE : WEEKOFF_PALETTE;

  const ribbons = useMemo(() => buildRibbons(22, hues), [hues]);
  const confetti = useMemo(() => buildConfetti(55, palette), [palette]);
  const banners = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: `banner-${i}`,
        left: 8 + i * 16,
        delay: i * 0.45,
      })),
    []
  );

  const headline = isHoliday
    ? holidayName
      ? `Happy Holiday`
      : `Happy Holiday`
    : `Happy Week Off`;

  const subline = isHoliday
    ? holidayName
      ? `Today we celebrate ${holidayName}`
      : `Take a breath — today is yours`
    : `Your roster marked today as a well-earned break`;

  const tagline = isHoliday
    ? 'No rush. No guilt. Just good energy.'
    : 'Slow down, smile a little, recharge fully.';

  useEffect(() => {
    setMounted(true);
    try {
      setVisible(!sessionStorage.getItem(sessionDismissKey(dayType)));
    } catch {
      setVisible(true);
    }
  }, [dayType]);

  const dismiss = () => {
    try {
      sessionStorage.setItem(sessionDismissKey(dayType), '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!mounted || !visible) return null;

  const overlay = (
    <div className="hrms-celebration-root fixed inset-0 z-[9999] overflow-hidden" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 ${
          isHoliday
            ? 'bg-gradient-to-b from-amber-950/50 via-rose-950/35 to-slate-950/65'
            : 'bg-gradient-to-b from-teal-950/45 via-emerald-950/30 to-slate-950/65'
        } backdrop-blur-[3px]`}
      />

      {/* Paper confetti */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {confetti.map((c) => (
          <span
            key={c.id}
            className="hrms-paper-confetti absolute rounded-[2px] shadow-sm"
            style={{
              left: `${c.left}%`,
              top: '-6%',
              width: c.w,
              height: c.h,
              backgroundColor: c.color,
              ['--rot' as string]: `${c.rotate}deg`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Falling ribbons */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {ribbons.map((r) => (
          <div
            key={r.id}
            className={`hrms-paper-ribbon absolute ${r.layer === 'back' ? 'opacity-70' : 'opacity-95'}`}
            style={{
              left: `${r.left}%`,
              top: '-18%',
              width: r.width,
              ['--ribbon-hue' as string]: String(r.hue),
              ['--ribbon-tilt' as string]: `${r.tilt}deg`,
              animationDelay: `${r.delay}s`,
              animationDuration: `${r.duration}s`,
            }}
          >
            <div className="hrms-ribbon-body" />
            <div className="hrms-ribbon-tail" />
          </div>
        ))}
      </div>

      {/* Corner paper banners */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {banners.map((b) => (
          <div
            key={b.id}
            className="hrms-paper-banner absolute"
            style={{
              left: `${b.left}%`,
              top: '-4%',
              animationDelay: `${b.delay}s`,
            }}
          >
            <span className={isHoliday ? 'hrms-banner-holiday' : 'hrms-banner-wo'}>{isHoliday ? 'HOLIDAY' : 'WEEK OFF'}</span>
          </div>
        ))}
      </div>

      {/* Center greeting card — paper cut aesthetic */}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md hrms-celebration-card-enter">
          <div className="relative">
            <div
              className={`absolute -inset-1 rounded-[28px] blur-md opacity-80 ${
                isHoliday ? 'bg-gradient-to-r from-amber-400 via-rose-400 to-orange-400' : 'bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400'
              }`}
            />
            <div className="relative overflow-hidden rounded-[26px] border border-white/40 bg-[#fffdf8] text-slate-900 shadow-2xl">
              <div
                className={`h-2 w-full ${
                  isHoliday
                    ? 'bg-gradient-to-r from-amber-400 via-rose-400 to-amber-500'
                    : 'bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400'
                }`}
              />
              <div className="px-6 py-8 sm:px-8 sm:py-10 text-center">
                <button
                  type="button"
                  onClick={dismiss}
                  className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>

                <p
                  className={`text-[11px] font-bold uppercase tracking-[0.35em] mb-3 ${
                    isHoliday ? 'text-amber-700' : 'text-teal-700'
                  }`}
                >
                  {isHoliday ? 'Holiday mode' : 'Week off mode'}
                </p>

                <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 leading-tight">
                  {headline}
                </h2>

                {isHoliday && holidayName && (
                  <p
                    className={`mt-2 text-lg sm:text-xl font-bold ${
                      isHoliday ? 'text-rose-600' : 'text-teal-600'
                    }`}
                  >
                    {holidayName}
                  </p>
                )}

                <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">{subline}</p>
                <p className="mt-2 text-xs sm:text-sm font-medium text-slate-500 italic">{tagline}</p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={dismiss}
                    className={`rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] ${
                      isHoliday
                        ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-amber-500/30'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30'
                    }`}
                  >
                    Let&apos;s go — thanks!
                  </button>
                </div>
              </div>
              <div className="h-3 bg-[repeating-linear-gradient(-45deg,#f1f5f9_0,#f1f5f9_4px,transparent_4px,transparent_8px)] opacity-60" />
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .hrms-paper-confetti {
          animation: hrms-confetti-fall linear infinite;
        }
        @keyframes hrms-confetti-fall {
          0% {
            transform: translateY(-8vh) rotate(var(--rot, 0deg));
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translateY(108vh) rotate(calc(var(--rot, 0deg) + 540deg));
            opacity: 0.5;
          }
        }
        .hrms-paper-ribbon {
          animation: hrms-ribbon-fall linear infinite;
        }
        .hrms-ribbon-body {
          height: 140px;
          border-radius: 4px 4px 2px 2px;
          background: linear-gradient(
            180deg,
            hsl(var(--ribbon-hue, 38) 85% 62%) 0%,
            hsl(var(--ribbon-hue, 38) 70% 48%) 100%
          );
          box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.12), 2px 4px 12px rgba(0, 0, 0, 0.15);
          transform: skewX(-6deg);
        }
        .hrms-ribbon-tail {
          width: 0;
          height: 0;
          margin: 0 auto;
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-top: 22px solid hsl(var(--ribbon-hue, 38) 65% 42%);
          filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.2));
        }
        @keyframes hrms-ribbon-fall {
          0% {
            transform: translateY(-20vh) rotate(var(--ribbon-tilt, 0deg)) scale(0.9);
            opacity: 0;
          }
          8% {
            opacity: 1;
          }
          100% {
            transform: translateY(115vh) rotate(calc(var(--ribbon-tilt, 0deg) + 180deg)) scale(1);
            opacity: 0.4;
          }
        }
        .hrms-paper-banner {
          animation: hrms-banner-drop 1.2s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
        }
        .hrms-paper-banner span {
          display: inline-block;
          padding: 6px 14px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #fff;
          transform: rotate(-8deg);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
          clip-path: polygon(0 0, 100% 0, 96% 100%, 4% 100%);
        }
        .hrms-banner-holiday {
          background: linear-gradient(135deg, #f59e0b, #e11d48);
        }
        .hrms-banner-wo {
          background: linear-gradient(135deg, #10b981, #0d9488);
        }
        @keyframes hrms-banner-drop {
          0% {
            transform: translateY(-120%) rotate(-12deg);
            opacity: 0;
          }
          100% {
            transform: translateY(0) rotate(-8deg);
            opacity: 1;
          }
        }
        .hrms-celebration-card-enter {
          animation: hrms-card-pop 0.65s cubic-bezier(0.34, 1.45, 0.64, 1) forwards;
        }
        @keyframes hrms-card-pop {
          0% {
            transform: scale(0.88) translateY(16px);
            opacity: 0;
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}
