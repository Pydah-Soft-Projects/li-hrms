'use client';

import { Cake } from 'lucide-react';

type TodayBirthdayItem = {
  id: string;
  name: string;
  designationName: string;
};

interface TodayBirthdayTickerProps {
  items: TodayBirthdayItem[];
}

export default function TodayBirthdayTicker({ items }: TodayBirthdayTickerProps) {
  if (items.length === 0) {
    return null;
  }

  const segment = items
    .map((emp) => `${emp.name} (${emp.designationName || '—'})`)
    .join('   •   ');

  const segments = Array.from({ length: 8 }, () => segment);

  return (
    <div className="sticky top-2 z-30 rounded-2xl border border-emerald-200/80 bg-white p-2 sm:p-3 shadow-sm dark:border-emerald-900 dark:bg-slate-900">
      <div className="grid grid-cols-[auto_1fr] items-center overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-900/10">
        <div className="sticky-label inline-flex items-center gap-1.5 border-r border-emerald-200/70 px-2.5 py-2 text-[10px] sm:gap-2 sm:px-3 sm:text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">
          <Cake className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">Today Birthday</span>
        </div>

        <div className="birthday-ticker-wrapper py-2">
          <div className="birthday-ticker-track">
            <div className="birthday-ticker-group">
              {segments.map((item, index) => (
                <span key={`ticker-a-${index}`} className="birthday-ticker-item">
                  🎉 {item}
                </span>
              ))}
            </div>
            <div className="birthday-ticker-group" aria-hidden>
              {segments.map((item, index) => (
                <span key={`ticker-b-${index}`} className="birthday-ticker-item">
                  🎉 {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .birthday-ticker-track {
          display: flex;
          align-items: center;
          white-space: nowrap;
          width: max-content;
          will-change: transform;
          animation: birthdayTicker 30s linear infinite;
        }

        .birthday-ticker-wrapper {
          position: relative;
          overflow: hidden;
          width: 100%;
        }

        .birthday-ticker-group {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          gap: 2rem;
          padding-right: 2rem;
        }

        .birthday-ticker-item {
          display: inline-block;
          white-space: nowrap;
          font-size: 11px;
          line-height: 1.1;
          font-weight: 600;
          color: #0f766e;
        }

        .sticky-label {
          background: rgba(236, 253, 245, 0.85);
        }

        @keyframes birthdayTicker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        :global(.dark) .birthday-ticker-item {
          color: #5eead4;
        }

        :global(.dark) .sticky-label {
          background: rgba(6, 78, 59, 0.25);
        }
      `}</style>
    </div>
  );
}
