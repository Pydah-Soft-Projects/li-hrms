'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, PayrollConfig, PayrollConfigStep, PayrollOutputColumn, PayrollStepComponent, PayslipSectionType, StatutoryDeductionConfig } from '@/lib/api';
import { inferPayslipSectionFromField } from '@/lib/payslipSections';
import { toast } from 'react-toastify';
import { FileSpreadsheet, Save, Plus, Trash2, ChevronDown, ChevronUp, HelpCircle, ArrowRight, GripVertical, Loader2 } from 'lucide-react';
import {
  LoansPageShell,
  LoansPageHeader,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanDetailSection,
  LoanDetailSectionTitle,
  LoanFormLabel,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormCompactInputClass,
  loansFormSelectClass,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { LedgerCollapsiblePanel } from '@/components/ledger/LedgerCollapsiblePanel';

const DEFAULT_STEP_TYPES: { type: string; label: string }[] = [
  { type: 'attendance', label: 'Attendance & paid days' },
  { type: 'basic_pay', label: 'Basic pay' },
  { type: 'ot_pay', label: 'OT pay' },
  { type: 'allowances', label: 'Allowances' },
  { type: 'attendance_deduction', label: 'Attendance deduction' },
  { type: 'other_deductions', label: 'Other deductions' },
  { type: 'statutory_deductions', label: 'Statutory (ESI, PF, PT)' },
  { type: 'loan_advance', label: 'Loan & salary advance' },
  { type: 'round_off', label: 'Round-off & net' },
];

/** Step types that have configurable components (allowances / deductions list) */
const STEP_TYPES_WITH_COMPONENTS = ['allowances', 'other_deductions'];

/** All selectable components for the paysheet (fields from payroll data).
 * Removed: net salary, total deductions, final paid days, total paid days, extra days,
 * total allowances, gross salary (use basic pay / formulas and deductions cumulative instead).
 */
const OUTPUT_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'employee.emp_no', label: 'Employee Code' },
  { value: 'employee.name', label: 'Name' },
  { value: 'employee.designation', label: 'Designation' },
  { value: 'employee.department', label: 'Department' },
  { value: 'employee.division', label: 'Division' },
  { value: 'employee.bank_account_no', label: 'Bank Account No' },
  { value: 'employee.bank_name', label: 'Bank Name' },
  { value: 'employee.bank_place', label: 'Bank Branch' },
  { value: 'employee.ifsc_code', label: 'IFSC Code' },
  { value: 'employee.payment_mode', label: 'Salary Mode' },
  { value: 'earnings.basicPay', label: 'Basic pay' },
  { value: 'earnings.otPay', label: 'OT pay' },
  { value: 'earnings.allowancesCumulative', label: 'Allowances cumulative' },
  { value: 'earnings.incentive', label: 'Incentive' },
  { value: 'earnings.perDayBasicPay', label: 'Per day basic' },
  { value: 'attendance.presentDays', label: 'Present days' },
  { value: 'attendance.payableShifts', label: 'Payable shifts' },
  { value: 'attendance.totalDaysInMonth', label: 'Month days' },
  { value: 'attendance.weeklyOffs', label: 'Week offs' },
  { value: 'attendance.holidays', label: 'Holidays' },
  { value: 'attendance.paidLeaveDays', label: 'Paid leave days' },
  { value: 'attendance.elUsedInPayroll', label: 'EL (Earned leave used in payroll)' },
  { value: 'attendance.lopDays', label: 'LOP leave days' },
  { value: 'attendance.odDays', label: 'OD days' },
  { value: 'attendance.absentDays', label: 'Absent days' },
  { value: 'deductions.permissionDeduction', label: 'Permission deduction' },
  { value: 'deductions.permissionDeductionBreakdown.permissionCount', label: 'Permissions count' },
  { value: 'attendance.permissionDeductionDays', label: 'Permission deduction days' },
  { value: 'deductions.deductionsCumulative', label: 'Deductions cumulative' },
  { value: 'deductions.statutoryCumulative', label: 'Statutory cumulative' },
  { value: 'deductions.attendanceDeduction', label: 'Attendance deduction' },
  { value: 'attendance.attendanceDeductionDays', label: 'Attendance deduction days' },
  { value: 'loanAdvance.advanceDeduction', label: 'Advance deduction' },
  { value: 'loanAdvance.totalEMI', label: 'Loan EMI' },
  { value: 'loanAdvance.remainingBalance', label: 'Loans (remaining balance)' },
  { value: 'roundOff', label: 'Round off' },
  { value: 'arrears.arrearsAmount', label: 'Arrears' },
  { value: 'manualDeductions.manualDeductionsAmount', label: 'Manual deductions' },
];

export default function PayrollConfigPage() {
  const [config, setConfig] = useState<PayrollConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState<PayrollConfigStep[]>([]);
  const [outputColumns, setOutputColumns] = useState<PayrollOutputColumn[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [formulaHelpOpen, setFormulaHelpOpen] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [statutoryConfig, setStatutoryConfig] = useState<StatutoryDeductionConfig | null>(null);
  const [statutoryProratePaidDaysColumnHeader, setStatutoryProratePaidDaysColumnHeader] = useState('');
  const [statutoryProrateTotalDaysColumnHeader, setStatutoryProrateTotalDaysColumnHeader] = useState('');
  const [professionTaxSlabEarningsColumnHeader, setProfessionTaxSlabEarningsColumnHeader] = useState('');
  const [loanAdvancePayableColumnHeader, setLoanAdvancePayableColumnHeader] = useState('');
  const [allowPaysheetModification, setAllowPaysheetModification] = useState(false);

  const outputFieldOptions = useMemo(() => {
    const extra = config?.employeeSalaryFieldOptions ?? [];
    if (extra.length === 0) return OUTPUT_FIELD_OPTIONS;
    const seen = new Set(OUTPUT_FIELD_OPTIONS.map((o) => o.value));
    const merged = [...OUTPUT_FIELD_OPTIONS];
    for (const o of extra) {
      if (o?.value && !seen.has(o.value)) {
        seen.add(o.value);
        merged.push(o);
      }
    }
    return merged;
  }, [config?.employeeSalaryFieldOptions]);

  /** Numeric payroll-record paths allowed as paysheet adjustment storage (not employee identity fields). */
  const paysheetStorageFieldOptions = useMemo(
    () => outputFieldOptions.filter((o) => !o.value.startsWith('employee.')),
    [outputFieldOptions]
  );

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [payrollRes, statutoryRes] = await Promise.all([
        api.getPayrollConfig(),
        api.getStatutoryConfig().catch(() => ({ data: null })),
      ]);
      const data = (payrollRes as { data?: PayrollConfig })?.data ?? null;
      const statutory = (statutoryRes as { data?: StatutoryDeductionConfig })?.data ?? null;
      setStatutoryConfig(statutory ?? null);
      setConfig(data);
      setEnabled(data?.enabled ?? false);
      if (Array.isArray(data?.steps) && data.steps.length > 0) {
        setSteps(data.steps.map((s, i) => ({
          ...s,
          order: s.order ?? i,
          formula: s.formula ?? '',
          components: Array.isArray(s.components) ? s.components.map((c, j) => ({ ...c, order: c.order ?? j })) : [],
        })));
      } else {
        setSteps(
          DEFAULT_STEP_TYPES.map((t, i) => ({
            id: `${t.type}_${i}`,
            type: t.type,
            label: t.label,
            order: i,
            enabled: true,
            formula: '',
            components: [],
          }))
        );
      }
      if (Array.isArray(data?.outputColumns) && data.outputColumns.length > 0) {
        setOutputColumns(
          data.outputColumns.map((c, i) => ({
            ...c,
            order: c.order ?? i,
            payslipSection: c.payslipSection || 'none',
          }))
        );
      } else {
        setOutputColumns([]);
      }
      setStatutoryProratePaidDaysColumnHeader(data?.statutoryProratePaidDaysColumnHeader ?? '');
      setStatutoryProrateTotalDaysColumnHeader(data?.statutoryProrateTotalDaysColumnHeader ?? '');
      setProfessionTaxSlabEarningsColumnHeader(data?.professionTaxSlabEarningsColumnHeader ?? '');
      setLoanAdvancePayableColumnHeader(data?.loanAdvancePayableColumnHeader ?? '');
      setAllowPaysheetModification(!!data?.allowPaysheetModification);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load payroll config');
      setSteps(
        DEFAULT_STEP_TYPES.map((t, i) => ({
          id: `${t.type}_${i}`,
          type: t.type,
          label: t.label,
          order: i,
          enabled: true,
          formula: '',
          components: [],
        }))
      );
      setOutputColumns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalizedColumns = outputColumns.map((c, i) => {
        const header = (c.header != null && String(c.header).trim()) ? String(c.header).trim() : `Column ${i + 1}`;
        return { ...c, header, order: i };
      });
      const missingStorage = normalizedColumns.filter(
        (c) =>
          c.paysheetEditable &&
          !(c.paysheetEditableFieldPath?.trim() || (c.source === 'field' && c.field && !c.field.startsWith('employee.')))
      );
      if (allowPaysheetModification && missingStorage.length > 0) {
        toast.error(
          `Select a storage field for editable columns: ${missingStorage.map((c) => c.header).join(', ')}`
        );
        setSaving(false);
        return;
      }
      const payload = {
        enabled,
        steps: steps.map((s, i) => ({ ...s, order: i })),
        outputColumns: normalizedColumns,
        statutoryProratePaidDaysColumnHeader: statutoryProratePaidDaysColumnHeader.trim(),
        statutoryProrateTotalDaysColumnHeader: statutoryProrateTotalDaysColumnHeader.trim(),
        professionTaxSlabEarningsColumnHeader: professionTaxSlabEarningsColumnHeader.trim(),
        loanAdvancePayableColumnHeader: loanAdvancePayableColumnHeader.trim(),
        allowPaysheetModification,
      };
      await api.putPayrollConfig(payload);
      toast.success('Payroll configuration saved');
      await loadConfig();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const moveStep = (index: number, dir: number) => {
    const next = index + dir;
    if (next < 0 || next >= steps.length) return;
    const arr = [...steps];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    setSteps(arr.map((s, i) => ({ ...s, order: i })));
  };

  const addOutputColumn = () => {
    setOutputColumns((prev) => [
      ...prev,
      { header: '', source: 'field', field: 'employee.emp_no', payslipSection: 'none', order: prev.length },
    ]);
  };

  /** Add only the cumulative column for a step. Components (allowances, deductions, PF/ESI/PT) are calculated by payroll services and stored; we only expose the cumulative so the engine/Excel shows the sum. */
  const addColumnsFromStep = (stepType: string) => {
    const nextOrder = outputColumns.length;
    let newCol: PayrollOutputColumn | null = null;
    if (stepType === 'allowances') {
      newCol = { header: 'Allowances cumulative', source: 'field', field: 'earnings.allowancesCumulative', formula: '', payslipSection: 'earnings', order: nextOrder };
    } else if (stepType === 'other_deductions') {
      newCol = { header: 'Deductions cumulative', source: 'field', field: 'deductions.deductionsCumulative', formula: '', payslipSection: 'deductions', order: nextOrder };
    } else if (stepType === 'statutory_deductions') {
      newCol = { header: 'Statutory cumulative', source: 'field', field: 'deductions.statutoryCumulative', formula: '', payslipSection: 'deductions', order: nextOrder };
    }
    if (newCol) {
      const withOrder = { ...newCol, order: newCol.order ?? nextOrder };
      setOutputColumns((prev) => prev.map((c, i) => ({ ...c, order: i })).concat([withOrder]));
      toast.success('Added cumulative column');
    }
  };

  const removeOutputColumn = (index: number) => {
    setOutputColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const moveOutputColumn = (index: number, dir: number) => {
    const next = index + dir;
    if (next < 0 || next >= outputColumns.length) return;
    const arr = [...outputColumns];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    setOutputColumns(arr.map((c, i) => ({ ...c, order: i })));
  };

  const sortedSteps = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const updateStepFormula = (stepIndex: number, formula: string) => {
    setSteps((prev) => prev.map((s, i) => (i === stepIndex ? { ...s, formula } : s)));
  };

  const addStepComponent = (stepIndex: number) => {
    const step = steps[stepIndex];
    const comps = step?.components ?? [];
    const newComp: PayrollStepComponent = {
      id: `comp_${Date.now()}_${comps.length}`,
      name: '',
      type: 'fixed',
      amount: 0,
      order: comps.length,
    };
    setSteps((prev) => prev.map((s, i) => (i === stepIndex ? { ...s, components: [...(s.components ?? []), newComp] } : s)));
  };

  const updateStepComponent = (stepIndex: number, compIndex: number, patch: Partial<PayrollStepComponent>) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const comps = [...(s.components ?? [])];
        if (compIndex < 0 || compIndex >= comps.length) return s;
        comps[compIndex] = { ...comps[compIndex], ...patch };
        return { ...s, components: comps };
      })
    );
  };

  const removeStepComponent = (stepIndex: number, compIndex: number) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const comps = (s.components ?? []).filter((_, j) => j !== compIndex).map((c, j) => ({ ...c, order: j }));
        return { ...s, components: comps };
      })
    );
  };

  const moveStepComponent = (stepIndex: number, compIndex: number, dir: number) => {
    const step = steps[stepIndex];
    const comps = step?.components ?? [];
    const next = compIndex + dir;
    if (next < 0 || next >= comps.length) return;
    const arr = [...comps];
    [arr[compIndex], arr[next]] = [arr[next], arr[compIndex]];
    setSteps((prev) =>
      prev.map((s, i) => (i === stepIndex ? { ...s, components: arr.map((c, j) => ({ ...c, order: j })) } : s))
    );
  };

  return (
    <LoansPageShell>
      <LoansPageHeader
        badge="Payroll configuration"
        title="Payroll configuration"
        subtitle="Set paysheet columns, payroll engine steps, and Excel export."
        action={
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className={`inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
            style={loansPrimaryButtonStyle()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        }
      />

      <div className="space-y-5">
        {/* Payroll flow */}
        <LoanDetailSection>
          <LoanDetailSectionTitle>Payroll flow (engine steps)</LoanDetailSectionTitle>
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
            Steps run in this order. Add allowance or deduction components on the matching steps.
          </p>
            {loading ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="h-10 w-[120px] rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  ))}
                </div>
                <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700/80">
                  <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mb-3" />
                  <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                </div>
              </>
            ) : (
              <>
                {/* Flowchart: horizontal steps */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-1">
                  {sortedSteps.map((step, idx) => {
                    const stepIndex = steps.findIndex((s) => s.id === step.id);
                    const isSelected = selectedStepIndex === stepIndex;
                    const compCount = (step.components ?? []).length;
                    return (
                      <div key={step.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedStepIndex(stepIndex)}
                          className="min-w-[100px] border px-3 py-2 text-left text-sm font-medium transition sm:min-w-[120px]"
                          style={
                            isSelected
                              ? {
                                  borderColor: 'var(--ps-accent)',
                                  backgroundColor: 'var(--ps-accent-soft)',
                                  color: 'var(--ps-accent-ink)',
                                }
                              : { borderColor: 'var(--ps-accent-border)' }
                          }
                        >
                          <span className="block truncate">{step.label || step.type}</span>
                          {STEP_TYPES_WITH_COMPONENTS.includes(step.type) && compCount > 0 && (
                            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{compCount} items</span>
                          )}
                        </button>
                        {idx < sortedSteps.length - 1 && (
                          <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-500 shrink-0 hidden sm:block" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Step detail: components or formula */}
                {selectedStepIndex !== null && steps[selectedStepIndex] && (
                  <div className="mt-6 border-t pt-6" style={{ borderColor: 'var(--ps-accent-border)' }}>
                    {(() => {
                      const step = steps[selectedStepIndex];
                      const hasComponents = STEP_TYPES_WITH_COMPONENTS.includes(step.type);
                      const comps = step.components ?? [];
                      return (
                        <>
                          <h3 className="mb-3 text-sm font-semibold text-stone-800 dark:text-stone-200">
                            {step.label || step.type}
                          </h3>
                          {hasComponents ? (
                            <>
                              <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
                                Fixed amount, percentage, or formula.
                              </p>
                              <div className="space-y-2">
                                {comps.map((comp, cIdx) => (
                                  <div
                                    key={comp.id}
                                    className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center"
                                    style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)' }}
                                  >
                                    <div className="flex items-center gap-2 shrink-0">
                                      <GripVertical className="h-4 w-4 text-slate-400" />
                                      <button type="button" onClick={() => moveStepComponent(selectedStepIndex, cIdx, -1)} disabled={cIdx === 0} className="p-1 rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30">↑</button>
                                      <button type="button" onClick={() => moveStepComponent(selectedStepIndex, cIdx, 1)} disabled={cIdx === comps.length - 1} className="p-1 rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30">↓</button>
                                      <button type="button" onClick={() => removeStepComponent(selectedStepIndex, cIdx)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                    <input
                                      type="text"
                                      value={comp.name ?? ''}
                                      onChange={(e) => updateStepComponent(selectedStepIndex, cIdx, { name: e.target.value })}
                                      placeholder="Name"
                                      className={`min-w-0 flex-1 ${loansFormInputClass()}`}
                                      style={loansFormInputStyle()}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <div className="flex overflow-hidden border p-0.5" style={{ borderColor: 'var(--ps-accent-border)' }}>
                                        {(['fixed', 'percentage', 'formula'] as const).map((t) => (
                                          <button
                                            key={t}
                                            type="button"
                                            onClick={() => updateStepComponent(selectedStepIndex, cIdx, { type: t })}
                                            className="px-2 py-1 text-xs font-medium capitalize"
                                            style={
                                              comp.type === t
                                                ? { backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }
                                                : { color: 'rgb(120 113 108)' }
                                            }
                                          >
                                            {t}
                                          </button>
                                        ))}
                                      </div>
                                      {comp.type === 'fixed' && (
                                        <input
                                          type="number"
                                          value={comp.amount ?? 0}
                                          onChange={(e) => updateStepComponent(selectedStepIndex, cIdx, { amount: Number(e.target.value) || 0 })}
                                          placeholder="Amount"
                                          className={`w-24 ${loansFormCompactInputClass()}`}
                                          style={loansFormInputStyle()}
                                        />
                                      )}
                                      {comp.type === 'percentage' && (
                                        <>
                                          <input
                                            type="number"
                                            value={comp.percentage ?? 0}
                                            onChange={(e) => updateStepComponent(selectedStepIndex, cIdx, { percentage: Number(e.target.value) || 0 })}
                                            placeholder="%"
                                            className={`w-16 ${loansFormCompactInputClass()}`}
                                            style={loansFormInputStyle()}
                                          />
                                          <select
                                            value={comp.base ?? 'basic'}
                                            onChange={(e) => updateStepComponent(selectedStepIndex, cIdx, { base: e.target.value as 'basic' | 'gross' })}
                                            className={loansFormSelectClass()}
                                            style={loansFormInputStyle()}
                                          >
                                            <option value="basic">of basic</option>
                                            <option value="gross">of gross</option>
                                          </select>
                                        </>
                                      )}
                                      {comp.type === 'formula' && (
                                        <input
                                          type="text"
                                          value={comp.formula ?? ''}
                                          onChange={(e) => updateStepComponent(selectedStepIndex, cIdx, { formula: e.target.value })}
                                          placeholder="e.g. Math.min(basicPay * 0.12, 1800)"
                                          className={`min-w-[200px] flex-1 font-mono ${loansFormInputClass()}`}
                                          style={loansFormInputStyle()}
                                        />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => addStepComponent(selectedStepIndex)}
                                className={`mt-3 inline-flex items-center gap-2 border border-dashed px-3 py-2 text-sm ${loansDialogOutlineButtonClass()}`}
                                style={loansDialogOutlineButtonStyle()}
                              >
                                <Plus className="h-4 w-4" />
                                Add component
                              </button>
                            </>
                          ) : (
                            <div>
                              <LoanFormLabel>Formula (optional)</LoanFormLabel>
                              <input
                                type="text"
                                value={step.formula ?? ''}
                                onChange={(e) => updateStepFormula(selectedStepIndex, e.target.value)}
                                placeholder="e.g. perDayBasicPay * totalPaidDays"
                                className={`mt-1.5 font-mono ${loansFormInputClass()}`}
                                style={loansFormInputStyle()}
                              />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
        </LoanDetailSection>

        {/* Excel export toggle */}
        <LoanDetailSection soft>
          {loading ? (
            <div className="flex items-start gap-3">
              <div className="mt-1 h-4 w-4 shrink-0 animate-pulse border bg-stone-100" style={{ borderColor: 'var(--ps-accent-border)' }} />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 animate-pulse bg-stone-200 dark:bg-stone-700" />
                <div className="h-3 max-w-sm animate-pulse bg-stone-100 dark:bg-stone-800" />
              </div>
            </div>
          ) : (
            <label className="group flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-1"
                style={{ accentColor: 'var(--ps-accent)' }}
              />
              <div>
                <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  Use this layout for Excel export
                </span>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  When on, Excel uses the columns defined below.
                </p>
              </div>
            </label>
          )}
        </LoanDetailSection>

        {/* Formula help */}
        <LedgerCollapsiblePanel
          title="Formula help"
          subtitle="Variables and examples"
          icon={<HelpCircle className="h-5 w-5" />}
          open={formulaHelpOpen}
          onToggle={() => setFormulaHelpOpen((o) => !o)}
        >
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Use numbers, + − × ÷, parentheses, and variables like basicPay, presentDays, allowancesCumulative.
            Reference earlier columns by header (spaces → underscores). Math: min, max, round, floor, ceil, abs.
          </p>
          <p className="mt-2 font-mono text-xs text-stone-500 dark:text-stone-400 border px-3 py-2" style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)' }}>
            Math.min(basicPay, 15000) &nbsp;·&nbsp; basicPay * 0.5 &nbsp;·&nbsp; (basicPay / monthDays) * presentDays
          </p>
        </LedgerCollapsiblePanel>

        {/* Paysheet columns */}
        <LoanDetailSection className="!p-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6" style={{ borderColor: 'var(--ps-accent-border)' }}>
            <div>
              <LoanDetailSectionTitle className="mb-1">Paysheet columns</LoanDetailSectionTitle>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Add columns in order. Use cumulative shortcuts for allowance, deduction, or statutory totals.
              </p>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                Payslip shows columns tagged Attendance, Earnings, or Deductions only.
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                <input
                  type="checkbox"
                  checked={allowPaysheetModification}
                  onChange={(e) => setAllowPaysheetModification(e.target.checked)}
                  style={{ accentColor: 'var(--ps-accent)' }}
                />
                Allow paysheet edit requests (approval required)
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {loading ? (
                <>
                  <div className="h-10 w-44 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="h-10 w-28 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                </>
              ) : (
                <>
                  <div className="relative group">
                    <select
                      onChange={(e) => {
                        const v = e.target.value;
                        e.target.value = '';
                        if (v) addColumnsFromStep(v);
                      }}
                      className={`appearance-none pl-4 pr-8 ${loansFormSelectClass()}`}
                      style={loansFormInputStyle()}
                      value=""
                    >
                      <option value="" disabled>Add cumulative…</option>
                      <option value="allowances">Allowances cumulative</option>
                      <option value="other_deductions">Deductions cumulative</option>
                      <option value="statutory_deductions">Statutory cumulative</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  </div>
                  <button
                    type="button"
                    onClick={addOutputColumn}
                    className={`inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
                    style={loansPrimaryButtonStyle()}
                  >
                    <Plus className="h-4 w-4" />
                    Add column
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--ps-accent-border)' }}>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex gap-2 shrink-0">
                    <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    <div className="sm:col-span-2 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  </div>
                </div>
              ))
            ) : outputColumns.length === 0 ? (
              <div className="px-5 py-12 text-center sm:px-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center text-stone-400" style={{ backgroundColor: 'var(--ps-accent-soft)' }}>
                  <FileSpreadsheet className="h-6 w-6" style={{ color: 'var(--ps-accent)' }} />
                </div>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  No columns yet. Add a column or use a cumulative shortcut above.
                </p>
                <button
                  type="button"
                  onClick={addOutputColumn}
                  className={`mt-5 inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
                  style={loansPrimaryButtonStyle()}
                >
                  <Plus className="h-4 w-4" />
                  Add your first column
                </button>
              </div>
            ) : (
              outputColumns.map((col, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-stone-50/50 dark:hover:bg-stone-900/30 sm:flex-row sm:items-center sm:px-6"
                >
                  <div className="flex shrink-0 items-center gap-2 order-2 sm:order-1">
                    <span className="w-6 text-xs font-medium text-stone-400 dark:text-stone-500">
                      {index + 1}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveOutputColumn(index, -1)}
                        disabled={index === 0}
                        className="p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-stone-800"
                        title="Move up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOutputColumn(index, 1)}
                        disabled={index === outputColumns.length - 1}
                        className="p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-stone-800"
                        title="Move down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOutputColumn(index)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Remove column"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="order-1 grid min-w-0 flex-1 grid-cols-1 gap-4 sm:order-2 sm:grid-cols-4">
                    <div>
                      <LoanFormLabel>Column name</LoanFormLabel>
                      <input
                        type="text"
                        value={col.header}
                        onChange={(e) =>
                          setOutputColumns((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, header: e.target.value } : c))
                          )
                        }
                        placeholder="e.g. Employee Code"
                        className={loansFormInputClass()}
                        style={loansFormInputStyle()}
                      />
                    </div>
                    <div>
                      <LoanFormLabel>Payslip section</LoanFormLabel>
                      <select
                        value={col.payslipSection || 'none'}
                        onChange={(e) =>
                          setOutputColumns((prev) =>
                            prev.map((c, i) =>
                              i === index ? { ...c, payslipSection: e.target.value as PayslipSectionType } : c
                            )
                          )
                        }
                        className={loansFormSelectClass()}
                        style={loansFormInputStyle()}
                      >
                        <option value="none">Paysheet only</option>
                        <option value="attendance">Attendance</option>
                        <option value="earnings">Earnings</option>
                        <option value="deductions">Deductions</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <LoanFormLabel>Data source</LoanFormLabel>
                      <div className="mt-1.5 flex gap-2">
                        <div className="flex overflow-hidden border p-0.5" style={{ borderColor: 'var(--ps-accent-border)' }}>
                          <button
                            type="button"
                            onClick={() =>
                              setOutputColumns((prev) =>
                                prev.map((c, i) => (i === index ? { ...c, source: 'field' as const } : c))
                              )
                            }
                            className="px-3 py-1.5 text-xs font-medium"
                            style={
                              col.source === 'field'
                                ? { backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }
                                : { color: 'rgb(120 113 108)' }
                            }
                          >
                            Field
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setOutputColumns((prev) =>
                                prev.map((c, i) => (i === index ? { ...c, source: 'formula' as const } : c))
                              )
                            }
                            className="px-3 py-1.5 text-xs font-medium"
                            style={
                              col.source === 'formula'
                                ? { backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }
                                : { color: 'rgb(120 113 108)' }
                            }
                          >
                            Formula
                          </button>
                        </div>
                        {col.source === 'field' ? (
                          <select
                            value={col.field ?? ''}
                            onChange={(e) => {
                              const field = e.target.value;
                              setOutputColumns((prev) =>
                                prev.map((c, i) => {
                                  if (i !== index) return c;
                                  const suggested = inferPayslipSectionFromField(field);
                                  const payslipSection =
                                    c.payslipSection == null ? suggested : c.payslipSection;
                                  return { ...c, field, payslipSection };
                                })
                              );
                            }}
                            className={`min-w-0 flex-1 ${loansFormSelectClass()}`}
                            style={loansFormInputStyle()}
                          >
                            <option value="">Select field...</option>
                            {outputFieldOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={col.formula ?? ''}
                            onChange={(e) =>
                              setOutputColumns((prev) =>
                                prev.map((c, i) => (i === index ? { ...c, formula: e.target.value } : c))
                              )
                            }
                            placeholder="e.g. Math.min(basicPay, 15000)"
                            className={`min-w-0 flex-1 font-mono ${loansFormInputClass()}`}
                            style={loansFormInputStyle()}
                          />
                        )}
                      </div>
                    </div>
                    {allowPaysheetModification && (
                      <div
                        className="mt-1 flex flex-wrap items-center gap-3 border border-dashed px-3 py-2 sm:col-span-4"
                        style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)' }}
                      >
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium" style={{ color: 'var(--ps-accent-ink)' }}>
                          <input
                            type="checkbox"
                            checked={!!col.paysheetEditable}
                            onChange={(e) =>
                              setOutputColumns((prev) =>
                                prev.map((c, i) =>
                                  i === index
                                    ? {
                                        ...c,
                                        paysheetEditable: e.target.checked,
                                        paysheetEditableFieldPath: e.target.checked
                                          ? c.paysheetEditableFieldPath ||
                                            (c.source === 'field' && c.field && !c.field.startsWith('employee.')
                                              ? c.field
                                              : '')
                                          : '',
                                      }
                                    : c
                                )
                              )
                            }
                            style={{ accentColor: 'var(--ps-accent)' }}
                          />
                          Editable on paysheet
                        </label>
                        {col.paysheetEditable && (
                          <select
                            value={col.paysheetEditableFieldPath || col.field || ''}
                            onChange={(e) =>
                              setOutputColumns((prev) =>
                                prev.map((c, i) =>
                                  i === index ? { ...c, paysheetEditableFieldPath: e.target.value } : c
                                )
                              )
                            }
                            className={`min-w-[12rem] text-xs ${loansFormSelectClass()}`}
                            style={loansFormInputStyle()}
                          >
                            <option value="">Select storage field…</option>
                            {paysheetStorageFieldOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {!loading && outputColumns.length > 0 && (
            <div className="border-t px-5 py-3 sm:px-6" style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)' }}>
              <button
                type="button"
                onClick={addOutputColumn}
                className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80"
                style={{ color: 'var(--ps-accent)' }}
              >
                <Plus className="h-4 w-4" />
                Add another column
              </button>
            </div>
          )}
          {loading && (
            <div className="border-t px-5 py-3 sm:px-6" style={{ borderColor: 'var(--ps-accent-border)' }}>
              <div className="h-8 w-36 animate-pulse bg-stone-200 dark:bg-stone-700" />
            </div>
          )}
        </LoanDetailSection>

        {/* Proration & advanced column links */}
        <LoanDetailSection>
          <LoanDetailSectionTitle>Proration &amp; column links</LoanDetailSectionTitle>
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
            Paid days prorate statutory, allowances, and deductions. Place the paid-days column before cumulative columns.
          </p>
          <div className="space-y-4">
            <div>
              <LoanFormLabel>Paid days column</LoanFormLabel>
              <select
                value={statutoryProratePaidDaysColumnHeader}
                onChange={(e) => setStatutoryProratePaidDaysColumnHeader(e.target.value)}
                className={`mt-1.5 max-w-md ${loansFormSelectClass()}`}
                style={loansFormInputStyle()}
              >
                <option value="">Auto-detect by name (Paid Days, Present days, …)</option>
                {[...outputColumns]
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((c) => {
                    const header = (c.header && String(c.header).trim()) || `Column ${(c.order ?? 0) + 1}`;
                    return (
                      <option key={header + (c.order ?? 0)} value={header}>
                        {header}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div>
              <LoanFormLabel>Total days column (optional)</LoanFormLabel>
              <select
                value={statutoryProrateTotalDaysColumnHeader}
                onChange={(e) => setStatutoryProrateTotalDaysColumnHeader(e.target.value)}
                className={`mt-1.5 max-w-md ${loansFormSelectClass()}`}
                style={loansFormInputStyle()}
              >
                <option value="">Auto-detect by name (Month days, Total days, …)</option>
                {[...outputColumns]
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((c) => {
                    const header = (c.header && String(c.header).trim()) || `Column ${(c.order ?? 0) + 1}`;
                    return (
                      <option key={header + (c.order ?? 0)} value={header}>
                        {header}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div>
              <LoanFormLabel>Profession Tax slab column (optional)</LoanFormLabel>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                Column value used for PT slab. Default: prorated basic pay.
              </p>
              <select
                value={professionTaxSlabEarningsColumnHeader}
                onChange={(e) => setProfessionTaxSlabEarningsColumnHeader(e.target.value)}
                className={`mt-1.5 max-w-md ${loansFormSelectClass()}`}
                style={loansFormInputStyle()}
              >
                <option value="">Use prorated basic pay for PT slab</option>
                {[...outputColumns]
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((c) => {
                    const header = (c.header && String(c.header).trim()) || `Column ${(c.order ?? 0) + 1}`;
                    return (
                      <option key={`pt-${header}-${c.order ?? 0}`} value={header}>
                        {header}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div>
              <LoanFormLabel>Loan &amp; advance recovery cap (optional)</LoanFormLabel>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                Column value limits how much loan/advance can be recovered this month.
              </p>
              <select
                value={loanAdvancePayableColumnHeader}
                onChange={(e) => setLoanAdvancePayableColumnHeader(e.target.value)}
                className={`mt-1.5 max-w-md ${loansFormSelectClass()}`}
                style={loansFormInputStyle()}
              >
                <option value="">No cap — use full scheduled loan/advance values</option>
                {[...outputColumns]
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((c) => {
                    const header = (c.header && String(c.header).trim()) || `Column ${(c.order ?? 0) + 1}`;
                    return (
                      <option key={`loan-payable-${header}-${c.order ?? 0}`} value={header}>
                        {header}
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>
        </LoanDetailSection>
      </div>
    </LoansPageShell>
  );
}
