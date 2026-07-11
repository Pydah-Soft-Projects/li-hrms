'use client';

import FieldTypeSelect from './FieldTypeSelect';
import FieldTypeConfigPanel from './FieldTypeConfigPanel';
import {
  QUALIFICATION_FIELD_GROUPS,
  defaultConfigForFieldType,
  type QualificationColumnDraft,
} from '@/lib/fieldTypeConfig';

type Props = {
  draft: QualificationColumnDraft;
  onChange: (draft: QualificationColumnDraft) => void;
  mode?: 'add' | 'edit';
};

export default function QualificationColumnForm({ draft, onChange, mode = 'add' }: Props) {
  const set = (patch: Partial<QualificationColumnDraft>) => onChange({ ...draft, ...patch });

  const handleTypeChange = (type: string) => {
    onChange({
      ...draft,
      type,
      ...defaultConfigForFieldType(type),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Column name</label>
        <input
          type="text"
          value={draft.label}
          onChange={(e) => set({ label: e.target.value })}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          placeholder="e.g. Percentage, Board, University"
        />
      </div>

      <FieldTypeSelect
        groups={QUALIFICATION_FIELD_GROUPS}
        value={draft.type}
        onChange={handleTypeChange}
        label="Column type"
      />

      <FieldTypeConfigPanel draft={draft} onChange={onChange} />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draft.isRequired}
            onChange={(e) => set({ isRequired: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-violet-600"
          />
          <span className="text-sm text-slate-600 dark:text-slate-300">Required column</span>
        </label>
        {mode === 'add' ? (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isEnabled}
              onChange={(e) => set({ isEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-violet-600"
            />
            <span className="text-sm text-slate-600 dark:text-slate-300">Enabled</span>
          </label>
        ) : null}
      </div>
    </div>
  );
}
