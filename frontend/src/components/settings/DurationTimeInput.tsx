'use client';

import React from 'react';
import { settingsInputClass, settingsInputStyle } from '@/lib/settingsUi';
import { minutesToHHMM, hhmmToMinutes, hoursToHHMM, hhmmToHours } from './otTimeHelpers';

const HHMM_PATTERN = /^\d{1,2}:[0-5]\d$/;

function normalizeHHMM(raw: string): string {
  const v = String(raw || '').trim();
  const m = v.match(/^(\d{1,2}):([0-5]?\d)$/);
  if (!m) return v;
  const hh = String(parseInt(m[1], 10)).padStart(2, '0');
  const mm = String(parseInt(m[2], 10)).padStart(2, '0');
  return `${hh}:${mm}`;
}

type DurationTimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
};

/** Always displays 24-hour HH:MM (duration or clock), independent of OS 12h picker. */
export function DurationTimeInput({
  value,
  onChange,
  className,
  style,
  placeholder = '00:00',
  disabled,
  title = '24-hour time (HH:MM)',
}: DurationTimeInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      lang="en-GB"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d:]/g, ''))}
      onBlur={(e) => {
        const next = normalizeHHMM(e.target.value);
        if (HHMM_PATTERN.test(next)) onChange(next);
      }}
      className={className ?? settingsInputClass()}
      style={style ?? settingsInputStyle()}
      pattern="^\d{1,2}:[0-5]\d$"
      title={title}
    />
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
      value={hoursToHHMM(hours)}
      onChange={(v) => onChangeHours(v ? hhmmToHours(v) : null)}
      title="Duration in 24-hour HH:MM (e.g. 08:00 = 8 hours)"
    />
  );
}

export function isValidHHMM(value: string): boolean {
  return HHMM_PATTERN.test(String(value || '').trim());
}
