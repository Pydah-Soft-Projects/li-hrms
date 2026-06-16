import type { CSSProperties } from 'react';
import type { SettingsTabType } from '@/components/settings/SettingsHubClient';

/** Contextual palette for section cards, fields, and borders (page header stays company accent). */
export type SettingsThemeKey = SettingsTabType | 'workflow';

export type SettingsThemeTokens = {
  border: string;
  soft: string;
  ink: string;
  accent: string;
};

const THEMES: Record<SettingsThemeKey, SettingsThemeTokens> = {
  general: { border: 'rgb(14 165 233 / 0.38)', soft: 'rgb(14 165 233 / 0.09)', ink: 'rgb(3 105 161)', accent: 'rgb(14 165 233)' },
  company: { border: 'rgb(20 184 166 / 0.38)', soft: 'rgb(20 184 166 / 0.09)', ink: 'rgb(15 118 110)', accent: 'rgb(20 184 166)' },
  communications: { border: 'rgb(139 92 246 / 0.38)', soft: 'rgb(139 92 246 / 0.09)', ink: 'rgb(91 33 182)', accent: 'rgb(139 92 246)' },
  feature_control: { border: 'rgb(245 158 11 / 0.4)', soft: 'rgb(245 158 11 / 0.1)', ink: 'rgb(180 83 9)', accent: 'rgb(245 158 11)' },
  employee: { border: 'rgb(99 102 241 / 0.38)', soft: 'rgb(99 102 241 / 0.09)', ink: 'rgb(67 56 202)', accent: 'rgb(99 102 241)' },
  leave: { border: 'rgb(16 185 129 / 0.38)', soft: 'rgb(16 185 129 / 0.09)', ink: 'rgb(4 120 87)', accent: 'rgb(16 185 129)' },
  leave_policy: { border: 'rgb(20 184 166 / 0.38)', soft: 'rgb(20 184 166 / 0.09)', ink: 'rgb(15 118 110)', accent: 'rgb(20 184 166)' },
  od: { border: 'rgb(6 182 212 / 0.38)', soft: 'rgb(6 182 212 / 0.09)', ink: 'rgb(14 116 144)', accent: 'rgb(6 182 212)' },
  ccl: { border: 'rgb(245 158 11 / 0.4)', soft: 'rgb(245 158 11 / 0.1)', ink: 'rgb(180 83 9)', accent: 'rgb(245 158 11)' },
  resignation: { border: 'rgb(249 115 22 / 0.4)', soft: 'rgb(249 115 22 / 0.1)', ink: 'rgb(194 65 12)', accent: 'rgb(249 115 22)' },
  promotions_transfers: { border: 'rgb(139 92 246 / 0.38)', soft: 'rgb(139 92 246 / 0.09)', ink: 'rgb(91 33 182)', accent: 'rgb(139 92 246)' },
  shift: { border: 'rgb(245 158 11 / 0.4)', soft: 'rgb(245 158 11 / 0.1)', ink: 'rgb(180 83 9)', accent: 'rgb(245 158 11)' },
  attendance: { border: 'rgb(234 179 8 / 0.42)', soft: 'rgb(234 179 8 / 0.11)', ink: 'rgb(161 98 7)', accent: 'rgb(234 179 8)' },
  attendance_deductions: { border: 'rgb(244 63 94 / 0.38)', soft: 'rgb(244 63 94 / 0.09)', ink: 'rgb(190 18 60)', accent: 'rgb(244 63 94)' },
  ot: { border: 'rgb(244 63 94 / 0.38)', soft: 'rgb(244 63 94 / 0.09)', ink: 'rgb(190 18 60)', accent: 'rgb(244 63 94)' },
  payroll: { border: 'rgb(6 182 212 / 0.38)', soft: 'rgb(6 182 212 / 0.09)', ink: 'rgb(14 116 144)', accent: 'rgb(6 182 212)' },
  loan: { border: 'rgb(34 197 94 / 0.38)', soft: 'rgb(34 197 94 / 0.09)', ink: 'rgb(21 128 61)', accent: 'rgb(34 197 94)' },
  salary_advance: { border: 'rgb(132 204 22 / 0.42)', soft: 'rgb(132 204 22 / 0.11)', ink: 'rgb(77 124 15)', accent: 'rgb(132 204 22)' },
  permissions: { border: 'rgb(120 113 108 / 0.35)', soft: 'rgb(120 113 108 / 0.08)', ink: 'rgb(68 64 60)', accent: 'rgb(87 83 78)' },
  workflow: { border: 'rgb(139 92 246 / 0.38)', soft: 'rgb(139 92 246 / 0.09)', ink: 'rgb(91 33 182)', accent: 'rgb(139 92 246)' },
};

export function getSettingsTheme(key: SettingsThemeKey): SettingsThemeTokens {
  return THEMES[key] ?? THEMES.general;
}

export function settingsThemeCssVars(key: SettingsThemeKey): CSSProperties {
  const t = getSettingsTheme(key);
  return {
    '--settings-theme-border': t.border,
    '--settings-theme-soft': t.soft,
    '--settings-theme-ink': t.ink,
    '--settings-theme-accent': t.accent,
  } as CSSProperties;
}
