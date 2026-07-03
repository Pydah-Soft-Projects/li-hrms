'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  settingsFieldHelpClass,
  settingsInputClass,
  settingsInputStyle,
  settingsLedgerBorder,
  settingsSectionTitleClass,
} from '@/lib/settingsUi';
import { SettingsOutlineButton } from './SettingsPageShell';
import { DurationTimeInput } from './DurationTimeInput';
import { minutesToHHMM, hhmmToMinutes, hoursToHHMM, hhmmToHours } from './otTimeHelpers';

export type ShiftRange = {
  _id?: string;
  minShiftHours: number | '';
  maxShiftHours: number | '';
  minimumMinutes: number | '';
  allowedMinutes: number | '';
  description?: string;
};

export type AutoRuleSet = {
  shiftDurationRanges: ShiftRange[];
};

export const emptyRuleSet = (): AutoRuleSet => ({ shiftDurationRanges: [] });

export const defaultRange = (): ShiftRange => ({
  minShiftHours: '',
  maxShiftHours: '',
  minimumMinutes: 1,
  allowedMinutes: '',
  description: '',
});

type ApiShiftRange = {
  _id?: string;
  minShiftHours: number;
  maxShiftHours: number;
  minimumMinutes?: number;
  allowedMinutes: number;
  description?: string;
};

type ApiRuleSet = { shiftDurationRanges?: ApiShiftRange[] };

export const toLocalRuleSet = (rs?: ApiRuleSet): AutoRuleSet => ({
  shiftDurationRanges: (rs?.shiftDurationRanges || []).map((r) => ({
    _id: r._id,
    minShiftHours: r.minShiftHours,
    maxShiftHours: r.maxShiftHours,
    minimumMinutes: r.minimumMinutes ?? 1,
    allowedMinutes: r.allowedMinutes,
    description: r.description,
  })),
});

export function normalizeAutoRulesForApi(rules: AutoRuleSet) {
  return {
    shiftDurationRanges: (rules.shiftDurationRanges || []).map((range) => ({
      minShiftHours: Number(range.minShiftHours),
      maxShiftHours: Number(range.maxShiftHours),
      minimumMinutes:
        range.minimumMinutes === '' || range.minimumMinutes === undefined ? 1 : Number(range.minimumMinutes),
      allowedMinutes: Number(range.allowedMinutes),
      description: String(range.description || '').trim(),
    })),
  };
}

export function validateAutoRuleSets(
  sets: { label: string; rules: AutoRuleSet }[],
  requireRanges: boolean
): string | null {
  if (!requireRanges) return null;
  for (const set of sets) {
    if (!set.rules.shiftDurationRanges?.length) {
      return `${set.label}: add at least one range.`;
    }
    for (const range of set.rules.shiftDurationRanges || []) {
      if (
        range.minShiftHours === '' ||
        range.maxShiftHours === '' ||
        range.allowedMinutes === '' ||
        range.minimumMinutes === ''
      ) {
        return `${set.label}: complete all range fields (HH:MM durations).`;
      }
      if (Number(range.maxShiftHours) <= Number(range.minShiftHours)) {
        return `${set.label}: max shift duration must be greater than min.`;
      }
      if (Number(range.minimumMinutes) > Number(range.allowedMinutes)) {
        return `${set.label}: minimum trigger cannot exceed allowed duration.`;
      }
    }
  }
  return null;
}

type Props = {
  title: string;
  help?: string;
  ruleSet: AutoRuleSet;
  onChange: (next: AutoRuleSet) => void;
};

export function AutoEdgePermissionRulesEditor({ title, help, ruleSet, onChange }: Props) {
  const inputCls = settingsInputClass();
  const inputStyle = settingsInputStyle();
  const ranges = ruleSet.shiftDurationRanges || [];

  const updateRange = (index: number, field: keyof ShiftRange, value: string) => {
    const nextRanges = ranges.map((range, idx) => {
      if (idx !== index) return range;
      if (field === 'description') return { ...range, [field]: value };
      return { ...range, [field]: value === '' ? '' : Number(value) };
    });
    onChange({ shiftDurationRanges: nextRanges });
  };

  const addRange = () => onChange({ shiftDurationRanges: [...ranges, defaultRange()] });
  const removeRange = (index: number) =>
    onChange({ shiftDurationRanges: ranges.filter((_, idx) => idx !== index) });

  return (
    <div className="space-y-3 border p-4" style={settingsLedgerBorder}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={settingsSectionTitleClass}>{title}</p>
          {help ? <p className={settingsFieldHelpClass}>{help}</p> : null}
        </div>
        <SettingsOutlineButton onClick={addRange}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </SettingsOutlineButton>
      </div>

      {ranges.length === 0 ? (
        <div
          className="border border-dashed px-4 py-5 text-center text-xs font-medium text-stone-400"
          style={settingsLedgerBorder}
        >
          No ranges configured.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-[9px] font-semibold uppercase tracking-widest text-stone-400 md:grid md:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]">
            <span>Min shift (HH:MM)</span>
            <span>Max shift (HH:MM)</span>
            <span>Min trigger (HH:MM)</span>
            <span>Allowed (HH:MM)</span>
            <span>Description</span>
            <span />
          </div>
          {ranges.map((range, index) => (
            <div
              key={range._id || index}
              className="grid grid-cols-1 gap-2 border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]"
              style={settingsLedgerBorder}
            >
              <DurationTimeInput
                allowEmpty
                value={
                  range.minShiftHours === '' ? '' : hoursToHHMM(Number(range.minShiftHours))
                }
                onChange={(v) => {
                  const hours = v ? hhmmToHours(v) : null;
                  updateRange(index, 'minShiftHours', hours == null ? '' : String(hours));
                }}
                className={`${inputCls} min-w-0 text-xs`}
                style={inputStyle}
                placeholder="08:00"
              />
              <DurationTimeInput
                allowEmpty
                value={
                  range.maxShiftHours === '' ? '' : hoursToHHMM(Number(range.maxShiftHours))
                }
                onChange={(v) => {
                  const hours = v ? hhmmToHours(v) : null;
                  updateRange(index, 'maxShiftHours', hours == null ? '' : String(hours));
                }}
                className={`${inputCls} min-w-0 text-xs`}
                style={inputStyle}
                placeholder="12:00"
              />
              <DurationTimeInput
                allowEmpty
                value={
                  range.minimumMinutes === ''
                    ? ''
                    : minutesToHHMM(Number(range.minimumMinutes))
                }
                onChange={(v) => {
                  updateRange(index, 'minimumMinutes', v ? String(hhmmToMinutes(v)) : '');
                }}
                className={`${inputCls} min-w-0 text-xs`}
                style={inputStyle}
                placeholder="00:01"
              />
              <DurationTimeInput
                allowEmpty
                value={
                  range.allowedMinutes === ''
                    ? ''
                    : minutesToHHMM(Number(range.allowedMinutes))
                }
                onChange={(v) => {
                  updateRange(index, 'allowedMinutes', v ? String(hhmmToMinutes(v)) : '');
                }}
                className={`${inputCls} min-w-0 text-xs`}
                style={inputStyle}
                placeholder="03:00"
              />
              <input
                type="text"
                value={range.description || ''}
                onChange={(e) => updateRange(index, 'description', e.target.value)}
                className={`${inputCls} min-w-0 text-xs`}
                style={inputStyle}
                placeholder="Description"
              />
              <button
                type="button"
                onClick={() => removeRange(index)}
                className="flex h-9 w-9 items-center justify-center border text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                style={settingsLedgerBorder}
                title="Remove range"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
