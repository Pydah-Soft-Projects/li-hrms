'use client';

import React, { useMemo } from 'react';
import { settingsInputClass, settingsInputStyle } from '@/lib/settingsUi';
import { minutesToHHMM, hhmmToMinutes, hoursToHHMM, hhmmToHours } from './otTimeHelpers';

const HHMM_PATTERN = /^\d{1,2}:[0-5]\d$/;

function parseHHMM(value: string): { hours: string; minutes: string } | null {
  const v = String(value || '').trim();
  const m = v.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  return {
    hours: String(parseInt(m[1], 10)).padStart(2, '0'),
    minutes: String(parseInt(m[2], 10)).padStart(2, '0'),
  };
}

function buildHourOptions(maxHours: number): string[] {
  const max = Math.max(0, Math.min(99, maxHours));
  return Array.from({ length: max + 1 }, (_, i) => String(i).padStart(2, '0'));
}

function buildMinuteOptions(step: number): string[] {
  const safeStep = Math.max(1, Math.min(30, step));
  const options: string[] = [];
  for (let m = 0; m < 60; m += safeStep) {
    options.push(String(m).padStart(2, '0'));
  }
  return options;
}

type DurationTimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  /** Max hour in 24h duration (inclusive). Default 23. */
  maxHours?: number;
  /** When true, user can clear to empty (parent receives ""). */
  allowEmpty?: boolean;
  /** Minute dropdown step. Default 1. */
  minuteStep?: number;
  /** Fixed-width selects for tight layouts (e.g. OT slab rows). */
  compact?: boolean;
};

/** 24-hour HH:MM selector (hour + minute dropdowns), independent of OS locale. */
export function DurationTimeInput({
  value,
  onChange,
  className,
  style,
  placeholder = '00:00',
  disabled,
  title = '24-hour time (HH:MM)',
  maxHours = 23,
  allowEmpty = false,
  minuteStep = 1,
  compact = false,
}: DurationTimeInputProps) {
  const hourOptions = useMemo(() => buildHourOptions(maxHours), [maxHours]);
  const minuteOptions = useMemo(() => buildMinuteOptions(minuteStep), [minuteStep]);
  const parsed = parseHHMM(value);
  const isEmpty = !parsed;
  const hours = parsed?.hours ?? '';
  const minutes = parsed?.minutes ?? '';

  const selectCls = compact
    ? 'w-12 shrink-0 rounded border border-stone-200 bg-white px-1 py-1.5 text-xs tabular-nums text-stone-900 focus:outline-none focus:ring-1 focus:ring-[color:var(--settings-theme-accent,var(--ps-accent))] dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100'
    : `${settingsInputClass()} min-w-[3rem] flex-1 px-1 py-1.5 text-xs tabular-nums`;
  const selectStyle = settingsInputStyle();

  const emit = (hh: string, mm: string) => {
    if (!hh || !mm) {
      onChange('');
      return;
    }
    onChange(`${hh}:${mm}`);
  };

  return (
    <div
      className={`inline-flex items-center gap-1 ${compact ? 'w-[6.5rem]' : 'min-w-0 w-full'} ${className ?? ''}`}
      style={style}
      title={title}
      data-duration-time="picker"
    >
      <select
        aria-label="Hours (24-hour)"
        data-duration-time="hours"
        disabled={disabled}
        value={isEmpty && allowEmpty ? '' : hours || '00'}
        onChange={(e) => {
          const hh = e.target.value;
          if (!hh) {
            emit('', '');
            return;
          }
          emit(hh, minutes || '00');
        }}
        className={selectCls}
        style={selectStyle}
      >
        {allowEmpty ? (
          <option value="">{placeholder === '00:00' ? '--' : placeholder}</option>
        ) : null}
        {hourOptions.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="select-none text-xs font-semibold text-stone-500 dark:text-stone-400">:</span>
      <select
        aria-label="Minutes"
        data-duration-time="minutes"
        disabled={disabled || (allowEmpty && isEmpty)}
        value={isEmpty && allowEmpty ? '' : minutes || '00'}
        onChange={(e) => {
          const mm = e.target.value;
          if (!mm) {
            emit('', '');
            return;
          }
          emit(hours || '00', mm);
        }}
        className={selectCls}
        style={selectStyle}
      >
        {allowEmpty && isEmpty ? <option value="">--</option> : null}
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

type DurationMinutesInputProps = Omit<DurationTimeInputProps, 'value' | 'onChange'> & {
  minutes: number;
  onChangeMinutes: (minutes: number) => void;
};

export function DurationMinutesInput({ minutes, onChangeMinutes, ...rest }: DurationMinutesInputProps) {
  return (
    <DurationTimeInput
      {...rest}
      value={minutesToHHMM(Math.max(0, minutes))}
      onChange={(v) => onChangeMinutes(hhmmToMinutes(v))}
      title="Duration in 24-hour HH:MM"
    />
  );
}

type DurationHoursInputProps = Omit<DurationTimeInputProps, 'value' | 'onChange'> & {
  hours: number | null;
  onChangeHours: (hours: number | null) => void;
};

export function DurationHoursInput({ hours, onChangeHours, ...rest }: DurationHoursInputProps) {
  return (
    <DurationTimeInput
      {...rest}
      allowEmpty
      value={hoursToHHMM(hours)}
      onChange={(v) => onChangeHours(v ? hhmmToHours(v) : null)}
      title="Duration in 24-hour HH:MM (e.g. 08:00 = 8 hours)"
    />
  );
}

export function isValidHHMM(value: string): boolean {
  return HHMM_PATTERN.test(String(value || '').trim());
}
