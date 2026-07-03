import { test, expect } from '@playwright/test';
import {
  minutesToHHMM,
  hhmmToMinutes,
  hoursToHHMM,
  hhmmToHours,
} from '../src/components/settings/otTimeHelpers';

test.describe('Duration time helpers (24h HH:MM)', () => {
  test('minutesToHHMM formats durations for OT slabs', () => {
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(30)).toBe('00:30');
    expect(minutesToHHMM(60)).toBe('01:00');
    expect(minutesToHHMM(90)).toBe('01:30');
    expect(minutesToHHMM(180)).toBe('03:00');
  });

  test('hhmmToMinutes parses 24h slab values', () => {
    expect(hhmmToMinutes('00:30')).toBe(30);
    expect(hhmmToMinutes('01:00')).toBe(60);
    expect(hhmmToMinutes('03:00')).toBe(180);
    expect(hhmmToMinutes('')).toBe(0);
    expect(hhmmToMinutes('bad')).toBe(0);
  });

  test('hoursToHHMM / hhmmToHours for shift duration ranges', () => {
    expect(hoursToHHMM(8)).toBe('08:00');
    expect(hoursToHHMM(8.5)).toBe('08:30');
    expect(hoursToHHMM(null)).toBe('');
    expect(hhmmToHours('08:00')).toBe(8);
    expect(hhmmToHours('12:00')).toBe(12);
    expect(hhmmToHours('')).toBeNull();
  });

  test('round-trip OT slab example 00:30–01:00', () => {
    const min = hhmmToMinutes('00:30');
    const max = hhmmToMinutes('01:00');
    const credited = hhmmToMinutes('01:00');
    expect(minutesToHHMM(min)).toBe('00:30');
    expect(minutesToHHMM(max)).toBe('01:00');
    expect(minutesToHHMM(credited)).toBe('01:00');
  });
});
