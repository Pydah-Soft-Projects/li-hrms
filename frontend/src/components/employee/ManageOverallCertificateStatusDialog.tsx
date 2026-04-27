'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Trash2, X } from 'lucide-react';
import {
  isPresetOverallCertificateStatusValue,
  overallCertificateStatusInRawSetting,
  overallCertificateStatusStageLabel,
  qualificationStatusBadgeClass,
  syncOverallCertificateStatusesToSetting,
} from '@/lib/qualificationStatus';

type OptionRow = { value: string; label: string };

type SettingsApi = {
  getSetting: (key: string) => Promise<{ success?: boolean; data?: { value?: unknown } }>;
  upsertSetting: (body: {
    key: string;
    value: unknown;
    category?: string;
    description?: string;
  }) => Promise<{ success?: boolean; data?: { value?: unknown } }>;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  mergedOptions: OptionRow[];
  rawSetting: unknown;
  settingsApi: SettingsApi;
  onSettingSaved: (next: OptionRow[]) => void;
  onAddNewAndApply?: (trimmed: string) => Promise<void>;
  addSubmitting?: boolean;
};

export default function ManageOverallCertificateStatusDialog({
  isOpen,
  onClose,
  mergedOptions,
  rawSetting,
  settingsApi,
  onSettingSaved,
  onAddNewAndApply,
  addSubmitting = false,
}: Props) {
  const [rows, setRows] = useState<OptionRow[]>([]);
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [listBusy, setListBusy] = useState(false);

  const mergedFingerprint = useMemo(
    () =>
      mergedOptions
        .map((o) => `${o.value}\t${o.label}`)
        .sort()
        .join('\n'),
    [mergedOptions]
  );

  useEffect(() => {
    if (!isOpen) return;
    setRows(mergedOptions.map((o) => ({ ...o })));
    setEditingValue(null);
    setEditDraft('');
    setNewLabel('');
  }, [isOpen, mergedFingerprint, mergedOptions]);

  const persistRows = useCallback(
    async (next: OptionRow[]) => {
      setListBusy(true);
      try {
        const { ok, merged } = await syncOverallCertificateStatusesToSetting(settingsApi, next);
        if (ok && merged.length) {
          onSettingSaved(merged);
          setRows(merged.map((o) => ({ ...o })));
        }
      } finally {
        setListBusy(false);
      }
    },
    [onSettingSaved, settingsApi]
  );

  const startEdit = (row: OptionRow) => {
    setEditingValue(row.value);
    setEditDraft(row.label);
  };

  const cancelEdit = () => {
    setEditingValue(null);
    setEditDraft('');
  };

  const saveEdit = async () => {
    if (editingValue == null) return;
    const label = editDraft.trim();
    if (!label) return;
    const next = rows.map((r) => (r.value === editingValue ? { ...r, label } : r));
    setRows(next);
    setEditingValue(null);
    setEditDraft('');
    await persistRows(next);
  };

  const removeRow = async (value: string) => {
    if (isPresetOverallCertificateStatusValue(value)) return;
    if (!overallCertificateStatusInRawSetting(rawSetting, value)) return;
    if (!window.confirm('Remove this status from the shared list? Employees who still have it will keep the value until you change it.')) {
      return;
    }
    const next = rows.filter((r) => r.value !== value);
    if (next.length === 0) return;
    setRows(next);
    await persistRows(next);
  };

  const submitNew = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed || addSubmitting || !onAddNewAndApply) return;
    await onAddNewAndApply(trimmed);
    setNewLabel('');
  };

  if (!isOpen) return null;

  const busy = listBusy || addSubmitting;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        aria-label="Close dialog"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-cert-status-title"
        className="relative z-[71] flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 id="manage-cert-status-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Certificate statuses
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Built-in rows follow the four verification stages. Custom values are shared across the organization. Edit labels,
            remove unused custom entries, or add a new status below.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Display name</span>
            <span className="w-28 shrink-0 text-right sm:w-32">Stage</span>
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => {
              const isPreset = isPresetOverallCertificateStatusValue(row.value);
              const inSetting = overallCertificateStatusInRawSetting(rawSetting, row.value);
              const canRemove = !isPreset && inSetting;
              const stageText = overallCertificateStatusStageLabel(row.value);
              const isEditing = editingValue === row.value;

              return (
                <li
                  key={row.value}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editDraft.trim() && !listBusy) {
                                e.preventDefault();
                                void saveEdit();
                              }
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none ring-indigo-500/30 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={listBusy || !editDraft.trim()}
                              onClick={() => void saveEdit()}
                              className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={listBusy}
                              onClick={cancelEdit}
                              className="inline-flex rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                              aria-label="Cancel edit"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{row.label}</span>
                          <span className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500" title={row.value}>
                            {row.value}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${qualificationStatusBadgeClass(
                          isPreset ? row.value : 'custom'
                        )}`}
                      >
                        {stageText}
                      </span>
                      {!isEditing && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={listBusy}
                            onClick={() => startEdit(row)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
                            title="Edit display name"
                            aria-label={`Edit ${row.label}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={listBusy || !canRemove}
                            onClick={() => void removeRow(row.value)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            title={
                              canRemove
                                ? 'Remove from shared list'
                                : isPreset
                                  ? 'Built-in stages cannot be removed'
                                  : 'Only values saved in organization settings can be removed'
                            }
                            aria-label={`Remove ${row.label}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/90 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Add status</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLabel.trim() && !busy && onAddNewAndApply) {
                  e.preventDefault();
                  void submitNew();
                }
              }}
              placeholder="New status label (saved for everyone)"
              disabled={!onAddNewAndApply || busy}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-indigo-500/25 focus:ring-2 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              disabled={!onAddNewAndApply || busy || !newLabel.trim()}
              onClick={() => void submitNew()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {addSubmitting ? 'Adding…' : 'Add & apply'}
            </button>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
