'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  loansFormInputClass,
  loansFormInputStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { PAYSLIP_ACCENT_FALLBACK, payslipAccentCssVars } from '@/lib/payslipTheme';

interface MultiSelectProps {
  label?: string;
  options: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  single?: boolean;
  /** Ledger UI — accent borders, flat panel, company accent highlights */
  variant?: 'default' | 'ledger';
  /** Shorter trigger + tighter label (toolbar / header filters) */
  compact?: boolean;
}

const LEDGER_VAR_KEYS = [
  '--ps-accent',
  '--ps-accent-rgb',
  '--ps-accent-soft',
  '--ps-accent-muted',
  '--ps-accent-border',
  '--ps-accent-ink',
] as const;

function readLedgerThemeFromDom(anchor: HTMLElement | null): React.CSSProperties {
  const fallback = payslipAccentCssVars(PAYSLIP_ACCENT_FALLBACK) as React.CSSProperties;
  if (!anchor || typeof window === 'undefined') return fallback;

  let node: HTMLElement | null = anchor;
  while (node) {
    const cs = getComputedStyle(node);
    const accent = cs.getPropertyValue('--ps-accent').trim();
    if (accent) {
      const vars: Record<string, string> = {};
      for (const key of LEDGER_VAR_KEYS) {
        const val = cs.getPropertyValue(key).trim();
        if (val) vars[key] = val;
      }
      return vars as React.CSSProperties;
    }
    node = node.parentElement;
  }
  return fallback;
}

function idsMatch(a: string, b: string): boolean {
  return String(a) === String(b);
}

function isSelected(selectedIds: string[], optionId: string): boolean {
  return selectedIds.some((id) => idsMatch(id, optionId));
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  label,
  options,
  selectedIds,
  onChange,
  placeholder = 'Select options...',
  disabled = false,
  loading = false,
  className = '',
  single = false,
  variant = 'default',
  compact = false,
}) => {
  const isLedger = variant === 'ledger';
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});
  const [ledgerTheme, setLedgerTheme] = useState<React.CSSProperties>({});

  const refreshLedgerTheme = useCallback(() => {
    if (!isLedger) return;
    setLedgerTheme(readLedgerThemeFromDom(containerRef.current));
  }, [isLedger]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isInsideTrigger = containerRef.current && containerRef.current.contains(event.target as Node);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(event.target as Node);

      if (!isInsideTrigger && !isInsideDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updatePosition = () => {
    if (containerRef.current && isOpen) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyles({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      refreshLedgerTheme();
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, refreshLedgerTheme]);

  const toggleOption = (id: string) => {
    if (single) {
      onChange([String(id)]);
      setIsOpen(false);
      return;
    }
    if (isSelected(selectedIds, id)) {
      onChange(selectedIds.filter((selectedId) => !idsMatch(selectedId, id)));
    } else {
      onChange([...selectedIds, String(id)]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map((opt) => String(opt.id)));
    }
  };

  const getSelectedLabels = () => {
    if (selectedIds.length === 0) return placeholder;
    if (single) {
      const selected = options.find((o) => isSelected(selectedIds, o.id));
      return selected ? selected.name : placeholder;
    }
    if (selectedIds.length === options.length && options.length > 0) return 'All selected';
    if (selectedIds.length > 2) return `${selectedIds.length} selected`;

    return options
      .filter((opt) => isSelected(selectedIds, opt.id))
      .map((opt) => opt.name)
      .join(', ');
  };

  const allSelected = options.length > 0 && selectedIds.length === options.length;

  const ledgerCheckboxStyle = (checked: boolean): React.CSSProperties =>
    checked
      ? {
          backgroundColor: 'var(--ps-accent)',
          borderColor: 'var(--ps-accent)',
        }
      : {
          backgroundColor: 'white',
          borderColor: 'rgb(214 211 209)',
        };

  const ledgerRowStyle = (selected: boolean): React.CSSProperties | undefined =>
    selected ? { backgroundColor: 'var(--ps-accent-soft)' } : undefined;

  const ledgerLabelStyle = (selected: boolean): React.CSSProperties | undefined =>
    selected ? { color: 'var(--ps-accent-ink)', fontWeight: 600 } : undefined;

  const checkboxClass = (checked: boolean) => {
    if (isLedger) {
      return 'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-all';
    }
    return `flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
      checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
    }`;
  };

  const optionRowClass = (selected: boolean) => {
    if (isLedger) {
      return `flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 transition-all ${
        selected ? '' : 'hover:bg-stone-50 dark:hover:bg-stone-900'
      }`;
    }
    return `flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-all ${
      selected ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
    }`;
  };

  const optionLabelClass = (selected: boolean) => {
    if (isLedger) {
      return `text-xs transition-colors ${selected ? '' : 'font-medium text-stone-700 dark:text-stone-300'}`;
    }
    return `text-xs font-bold transition-colors ${
      selected ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'
    }`;
  };

  const triggerHeight = compact ? 'h-7' : isLedger ? 'h-10' : 'h-9';

  return (
    <div className={`relative flex flex-col ${compact ? 'gap-0.5' : 'gap-1.5'} ${className}`} ref={containerRef}>
      {label && (
        <label
          className={
            isLedger
              ? compact
                ? 'text-[9px] font-semibold uppercase tracking-[0.16em]'
                : 'text-[10px] font-semibold uppercase tracking-[0.2em]'
              : 'ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500'
          }
          style={isLedger ? { color: 'var(--ps-accent-ink)' } : undefined}
        >
          {label}
        </label>
      )}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={
          isLedger
            ? `flex ${triggerHeight} cursor-pointer items-center justify-between ${compact ? 'px-2' : 'px-3'} transition hover:opacity-95 ${
                disabled ? 'cursor-not-allowed opacity-50' : ''
              } ${loansFormInputClass()}`
            : `flex h-9 cursor-pointer items-center justify-between rounded-lg border px-3 transition-all ${
                disabled ? 'cursor-not-allowed bg-slate-50 opacity-50' : 'bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800'
              } ${isOpen ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 shadow-sm dark:border-slate-800'}`
        }
        style={isLedger ? loansFormInputStyle() : undefined}
      >
        <span
          className={`truncate font-semibold ${compact ? 'text-[10px]' : 'text-[11px]'} ${
            selectedIds.length === 0 ? 'text-stone-400' : 'text-stone-900 dark:text-stone-100'
          }`}
          style={isLedger && selectedIds.length > 0 ? { color: 'var(--ps-accent-ink)' } : undefined}
        >
          {loading ? 'Loading…' : getSelectedLabels()}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {isOpen && !disabled && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            ...dropdownStyles,
            ...(isLedger ? ledgerTheme : {}),
            ...(isLedger ? { borderColor: 'var(--ps-accent-border)' } : {}),
          }}
          className={
            isLedger
              ? 'overflow-hidden border bg-white shadow-lg dark:bg-stone-950'
              : 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900'
          }
        >
          <div className="custom-scrollbar max-h-60 overflow-y-auto p-1.5">
            {loading ? (
              <div className="p-4 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" style={isLedger ? { color: 'var(--ps-accent)' } : undefined} />
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Loading…</p>
              </div>
            ) : (
              <>
                {options.length > 0 && !single && (
                  <div
                    onClick={toggleAll}
                    className={`mb-1 flex cursor-pointer items-center gap-2.5 border-b px-2 py-2 transition-colors ${
                      isLedger
                        ? 'border-stone-100 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900'
                        : 'rounded-lg border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800'
                    }`}
                    style={isLedger && allSelected ? ledgerRowStyle(true) : undefined}
                  >
                    <div
                      className={checkboxClass(allSelected)}
                      style={isLedger ? ledgerCheckboxStyle(allSelected) : undefined}
                    >
                      {allSelected && <Check className="h-2.5 w-2.5 stroke-[3] text-white" />}
                    </div>
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-tight ${
                        isLedger
                          ? allSelected
                            ? ''
                            : 'text-stone-500'
                          : allSelected
                            ? 'text-blue-600'
                            : 'text-slate-500'
                      }`}
                      style={isLedger && allSelected ? ledgerLabelStyle(true) : undefined}
                    >
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </span>
                  </div>
                )}

                {options.length > 0 ? (
                  <div className="space-y-0.5">
                    {options.map((option) => {
                      const selected = isSelected(selectedIds, option.id);
                      return (
                        <div
                          key={option.id}
                          onClick={() => toggleOption(option.id)}
                          className={optionRowClass(selected)}
                          style={isLedger ? ledgerRowStyle(selected) : undefined}
                        >
                          {!single && (
                            <div
                              className={checkboxClass(selected)}
                              style={isLedger ? ledgerCheckboxStyle(selected) : undefined}
                            >
                              {selected && <Check className="h-2.5 w-2.5 stroke-[3] text-white" />}
                            </div>
                          )}
                          <span
                            className={optionLabelClass(selected)}
                            style={isLedger ? ledgerLabelStyle(selected) : undefined}
                          >
                            {option.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">No items</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
