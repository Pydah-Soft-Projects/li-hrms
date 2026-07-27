'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Search, X } from 'lucide-react';

export type LoanGuarantorCandidate = {
  _id: string;
  emp_no: string;
  employee_name: string;
  department?: { _id?: string; name?: string } | null;
  designation?: { _id?: string; name?: string } | null;
  eligibility?: {
    eligible: boolean;
    reasons?: string[];
    ownEmi?: number;
    guaranteedEmi?: number;
    exposurePercent?: number;
  };
};

type Props = {
  loanId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Optional seed for chip labels (already assigned guarantors / prior search hits). */
  knownPeople?: Array<{
    _id?: string;
    employeeId?: string | { _id?: string };
    emp_no?: string;
    name?: string;
    employee_name?: string;
  }>;
  minGuarantors?: number;
  maxGuarantors?: number;
  disabled?: boolean;
  helperText?: string;
};

function personId(p: {
  _id?: string;
  employeeId?: string | { _id?: string };
  emp_no?: string;
  name?: string;
  employee_name?: string;
}): string {
  if (typeof p.employeeId === 'object' && p.employeeId?._id) return String(p.employeeId._id);
  if (p.employeeId) return String(p.employeeId);
  if (p._id) return String(p._id);
  return '';
}

function personLabel(p: {
  emp_no?: string;
  name?: string;
  employee_name?: string;
}): string {
  const name = p.name || p.employee_name || '';
  const emp = p.emp_no || '';
  if (name && emp) return `${name} (${emp})`;
  return name || emp || 'Unknown';
}

export default function LoanGuarantorPicker({
  loanId,
  selectedIds,
  onChange,
  knownPeople = [],
  minGuarantors = 2,
  maxGuarantors = 4,
  disabled = false,
  helperText,
}: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LoanGuarantorCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedMap, setSelectedMap] = useState<Record<string, LoanGuarantorCandidate>>({});
  const wrapRef = useRef<HTMLDivElement>(null);

  // Seed labels from known guarantors / prior picks
  useEffect(() => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      for (const p of knownPeople) {
        const id = personId(p);
        if (!id || next[id]) continue;
        next[id] = {
          _id: id,
          emp_no: p.emp_no || '',
          employee_name: p.name || p.employee_name || '',
        };
      }
      return next;
    });
  }, [knownPeople]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (!q || !loanId) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getGuarantorCandidates({ search: q, loanId, limit: 40 });
        if (cancelled) return;
        if (res.success) {
          setResults((res.data || []) as LoanGuarantorCandidate[]);
          setOpen(true);
        } else {
          setResults([]);
          setError((res as any).error || (res as any).message || 'Failed to search employees');
        }
      } catch (e: any) {
        if (!cancelled) {
          setResults([]);
          setError(e?.message || 'Failed to search employees');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, loanId]);

  const atMax = selectedIds.length >= maxGuarantors;

  const dropdownRows = useMemo(
    () => results.filter((c) => !selectedIds.includes(String(c._id))),
    [results, selectedIds]
  );

  const addCandidate = (c: LoanGuarantorCandidate) => {
    if (disabled || atMax) return;
    if (c.eligibility && c.eligibility.eligible === false) return;
    const id = String(c._id);
    if (selectedIds.includes(id)) return;
    setSelectedMap((prev) => ({ ...prev, [id]: c }));
    onChange([...selectedIds, id]);
    setSearch('');
    setResults([]);
    setOpen(false);
  };

  const removeId = (id: string) => {
    if (disabled) return;
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div className="space-y-3" ref={wrapRef}>
      {helperText && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{helperText}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {selectedIds.length === 0 ? (
          <p className="text-xs text-slate-500">No guarantors selected yet. Search by name or employee number.</p>
        ) : (
          selectedIds.map((id) => {
            const c = selectedMap[id];
            const label = c ? personLabel(c) : id;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeId(id)}
                    className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-700"
                    aria-label="Remove guarantor"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          disabled={disabled || atMax}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (search.trim()) setOpen(true);
          }}
          placeholder={
            atMax
              ? `Maximum ${maxGuarantors} guarantors selected`
              : 'Search employee by name or emp no…'
          }
          className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
        />

        {open && search.trim() && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {loading && (
              <p className="px-3 py-3 text-xs text-slate-500">Searching eligible employees…</p>
            )}
            {!loading && error && (
              <p className="px-3 py-3 text-xs text-red-600">{error}</p>
            )}
            {!loading && !error && dropdownRows.length === 0 && (
              <p className="px-3 py-3 text-xs text-slate-500">
                No employees found for “{search.trim()}”. Try full name or emp no.
              </p>
            )}
            {!loading &&
              !error &&
              dropdownRows.map((c) => {
                const eligible = c.eligibility?.eligible !== false;
                const reason = c.eligibility?.reasons?.[0];
                return (
                  <button
                    key={c._id}
                    type="button"
                    disabled={!eligible || atMax}
                    onClick={() => addCandidate(c)}
                    className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-800 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {c.employee_name || '—'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {c.emp_no}
                          {c.department?.name ? ` · ${c.department.name}` : ''}
                          {c.designation?.name ? ` · ${c.designation.name}` : ''}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          eligible
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {eligible ? 'Eligible' : 'Not eligible'}
                      </span>
                    </div>
                    {!eligible && reason && (
                      <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{reason}</p>
                    )}
                    {eligible && typeof c.eligibility?.exposurePercent === 'number' && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        EMI exposure {c.eligibility.exposurePercent}% of salary
                      </p>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Select {minGuarantors}
        {maxGuarantors !== minGuarantors ? `–${maxGuarantors}` : ''} eligible employees. Only eligible
        people can be added ({selectedIds.length}/{maxGuarantors} selected).
      </p>
    </div>
  );
}
