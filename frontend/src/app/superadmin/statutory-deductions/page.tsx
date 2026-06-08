'use client';

import { useState, useEffect } from 'react';
import { api, type ProfessionTaxSlab, type StatutoryPF, type StatutoryESI } from '@/lib/api';
import { toast } from 'react-toastify';
import { Save, Shield, Building2, Briefcase, Plus, Trash2 } from 'lucide-react';
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
} from '@/components/loans/LoanDetailDialogShell';

const defaultEsi: StatutoryESI = {
  enabled: false,
  employeePercent: 0.75,
  employerPercent: 3.25,
  wageBasePercentOfBasic: 50,
  wageBaseField: '',
  wageCeiling: 21000,
};
const defaultPf: StatutoryPF = {
  enabled: false,
  employeePercent: 12,
  employerPercent: 12,
  wageCeiling: 15000,
  base: 'basic',
  wageBaseField: '',
};
const defaultPtSlabs: ProfessionTaxSlab[] = [
  { min: 0, max: 14999, amount: 0 },
  { min: 15000, max: 19999, amount: 150 },
  { min: 20000, max: null, amount: 200 },
];
const defaultPt = {
  enabled: false,
  state: '',
  slabs: defaultPtSlabs,
};

export default function StatutoryDeductionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [esi, setEsi] = useState(defaultEsi);
  const [pf, setPf] = useState(defaultPf);
  const [professionTax, setProfessionTax] = useState(defaultPt);
  const [salaryFields, setSalaryFields] = useState<any[]>([]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await api.getStatutoryConfig();
      if (res?.data) {
        const d = res.data;
        if (d.esi) setEsi({ ...defaultEsi, ...d.esi });
        if (d.pf) setPf({ ...defaultPf, ...d.pf });
        if (d.professionTax) {
          const pt = d.professionTax as typeof defaultPt;
          setProfessionTax({
            enabled: pt.enabled ?? defaultPt.enabled,
            state: pt.state ?? defaultPt.state,
            slabs: Array.isArray(pt.slabs) && pt.slabs.length > 0
              ? pt.slabs.map((s: ProfessionTaxSlab) => ({ min: Number(s.min) || 0, max: s.max == null ? null : Number(s.max), amount: Number(s.amount) || 0 }))
              : defaultPtSlabs,
          });
        }
      }

      // Load form settings to get salary fields
      const formSettingsRes = await api.getEmployeeFormSettings();
      const settingsData = (formSettingsRes && (formSettingsRes as any).data !== undefined) ? (formSettingsRes as any).data : formSettingsRes;
      if (settingsData && Array.isArray(settingsData.groups)) {
        const salariesGroup = settingsData.groups.find((g: any) => g.id === 'salaries');
        if (salariesGroup && Array.isArray(salariesGroup.fields)) {
          setSalaryFields(salariesGroup.fields.filter((f: any) => f.isEnabled));
        }
      }
    } catch (e) {
      toast.error('Failed to load statutory config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.putStatutoryConfig({
        esi,
        pf,
        professionTax: { ...professionTax, slabs: professionTax.slabs ?? defaultPtSlabs },
      });
      toast.success('Statutory deductions saved.');
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LoansPageShell>
        <div className="flex min-h-[200px] items-center justify-center border bg-white p-6 dark:bg-stone-950" style={{ borderColor: 'var(--ps-accent-border)' }}>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--ps-accent)' }} />
        </div>
      </LoansPageShell>
    );
  }

  return (
    <LoansPageShell>
      <LoansPageHeader
        badge="Statutory payroll"
        title="Statutory deductions"
        subtitle="Configure ESI, PF, and Profession Tax. Only employee share is deducted from salary; employer share is for your records."
        action={
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
            style={loansPrimaryButtonStyle()}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        }
      />

      <div className="space-y-5">
        <LoanDetailSection>
          <LoanDetailSectionTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" style={{ color: 'var(--ps-accent)' }} />
            ESI (Employees&apos; State Insurance)
          </LoanDetailSectionTitle>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={esi.enabled}
                onChange={(e) => setEsi((s) => ({ ...s, enabled: e.target.checked }))}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable ESI</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ESI is calculated on a percentage of basic pay (e.g. 50%). When enabled, wage ceiling applies: only if this wage ≤ ceiling. Employee share is deducted from salary; employer share is for records.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Employee % (deducted from salary)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={esi.employeePercent}
                  onChange={(e) => setEsi((s) => ({ ...s, employeePercent: Number(e.target.value) || 0 }))}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Employer % (for records)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={esi.employerPercent}
                  onChange={(e) => setEsi((s) => ({ ...s, employerPercent: Number(e.target.value) || 0 }))}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">ESI Wage Base (Calculation Method)</label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <select
                      value={esi.wageBaseField || ''}
                      onChange={(e) => setEsi((s) => ({ ...s, wageBaseField: e.target.value }))}
                      className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                    >
                      <option value="">Percentage of Basic Pay</option>
                      {salaryFields.map((field) => (
                        <option key={field.id} value={field.id}>
                          Use {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!esi.wageBaseField && (
                    <div className="flex-1">
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={esi.wageBasePercentOfBasic ?? 50}
                          onChange={(e) => setEsi((s) => ({ ...s, wageBasePercentOfBasic: Number(e.target.value) || 0 }))}
                          className={`${loansFormInputClass()} pr-8`}
                          style={loansFormInputStyle()}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {esi.wageBaseField 
                    ? `ESI will be calculated on the full value of "${salaryFields.find(f => f.id === esi.wageBaseField)?.label || esi.wageBaseField}".`
                    : `ESI will be calculated on ${esi.wageBasePercentOfBasic}% of the employee's Basic Salary.`}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Wage ceiling (₹/month) – applicable when basic ≤ ceiling</label>
                <input
                  type="number"
                  min="0"
                  value={esi.wageCeiling}
                  onChange={(e) => setEsi((s) => ({ ...s, wageCeiling: Number(e.target.value) || 0 }))}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
                <p className="mt-0.5 text-xs text-slate-400">When enabled: ESI applies only if employee basic pay ≤ this ceiling. Contribution is still on (% of basic) above. 0 = no ceiling.</p>
              </div>
            </div>
          </div>
        </LoanDetailSection>

        <LoanDetailSection>
          <LoanDetailSectionTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" style={{ color: 'var(--ps-accent)' }} />
            PF (Provident Fund / EPF)
          </LoanDetailSectionTitle>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pf.enabled}
                onChange={(e) => setPf((s) => ({ ...s, enabled: e.target.checked }))}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable PF</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Calculated on Basic (or Basic + DA). Upper limit: if salary ≥ ceiling, PF is calculated on the ceiling amount (e.g. ₹15,000); else on full basic. Employee share is deducted from salary; employer share is for records.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Employee %</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={pf.employeePercent}
                  onChange={(e) => setPf((s) => ({ ...s, employeePercent: Number(e.target.value) || 0 }))}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Employer %</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={pf.employerPercent}
                  onChange={(e) => setPf((s) => ({ ...s, employerPercent: Number(e.target.value) || 0 }))}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Upper limit / wage ceiling (₹/month)</label>
                <input
                  type="number"
                  min="0"
                  value={pf.wageCeiling}
                  onChange={(e) => setPf((s) => ({ ...s, wageCeiling: Number(e.target.value) || 0 }))}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
                <p className="mt-0.5 text-xs text-slate-400">If basic ≥ this, PF calculated on this amount; else on full basic. e.g. 15000.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Contribution Base (Calculated On)</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <select
                      value={pf.wageBaseField || ""}
                      onChange={(e) => setPf((s) => ({ ...s, wageBaseField: e.target.value || null }))}
                      className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                    >
                      <option value="">Use Standard Base (Basic/DA)</option>
                      {salaryFields.map((field) => (
                        <option key={field.id} value={field.id}>
                          Use {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!pf.wageBaseField && (
                    <div className="flex-1">
                      <select
                        value={pf.base}
                        onChange={(e) => setPf((s) => ({ ...s, base: e.target.value as 'basic' | 'basic_da' }))}
                        className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                      >
                        <option value="basic">Basic only</option>
                        <option value="basic_da">Basic + DA</option>
                      </select>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {pf.wageBaseField 
                    ? `PF will be calculated on the full value of "${salaryFields.find(f => f.id === pf.wageBaseField)?.label || pf.wageBaseField}".`
                    : `PF will be calculated on ${pf.base === 'basic' ? 'Basic Salary' : 'Basic + Dearness Allowance'}.`}
                </p>
              </div>
            </div>
          </div>
        </LoanDetailSection>

        <LoanDetailSection>
          <LoanDetailSectionTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" style={{ color: 'var(--ps-accent)' }} />
            Profession Tax
          </LoanDetailSectionTitle>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={professionTax.enabled}
                onChange={(e) => setProfessionTax((s) => ({ ...s, enabled: e.target.checked }))}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Profession Tax</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              State-level tax. Employee only (no employer share). Slab-based on basic pay: salary range (min–max) → amount. Use empty max for &quot;and above&quot;.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">State (optional)</label>
              <input
                type="text"
                value={professionTax.state}
                onChange={(e) => setProfessionTax((s) => ({ ...s, state: e.target.value }))}
                placeholder="e.g. Maharashtra"
                className={`max-w-xs ${loansFormInputClass()}`}
                style={loansFormInputStyle()}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Slabs (salary range → amount)</span>
                <button
                  type="button"
                  onClick={() => setProfessionTax((s) => ({ ...s, slabs: [...(s.slabs ?? defaultPtSlabs), { min: 0, max: null, amount: 0 }] }))}
                  className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  style={{ color: 'var(--ps-accent)' }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add slab
                </button>
              </div>
              <div className="space-y-1.5">
                {(professionTax.slabs ?? defaultPtSlabs).map((slab, i) => (
                  <div
                    key={i}
                    className="flex flex-nowrap items-center gap-1.5 border px-2.5 py-1.5 sm:gap-2 sm:px-3 sm:py-2"
                    style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)' }}
                  >
                    <input
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={slab.min}
                      onChange={(e) => setProfessionTax((s) => {
                        const next = [...(s.slabs ?? defaultPtSlabs)];
                        next[i] = { ...next[i], min: Number(e.target.value) || 0 };
                        return { ...s, slabs: next };
                      })}
                      className={`w-[5.5rem] ${loansFormCompactInputClass()}`}
                      style={loansFormInputStyle()}
                    />
                    <span className="shrink-0 text-stone-400">–</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Max"
                      value={slab.max ?? ''}
                      onChange={(e) => setProfessionTax((s) => {
                        const next = [...(s.slabs ?? defaultPtSlabs)];
                        const v = e.target.value.trim();
                        next[i] = { ...next[i], max: v === '' ? null : Number(v) };
                        return { ...s, slabs: next };
                      })}
                      className={`w-[5.5rem] ${loansFormCompactInputClass()}`}
                      style={loansFormInputStyle()}
                      title="Leave empty for no upper limit (and above)"
                    />
                    <span className="shrink-0 text-xs text-stone-500">→ ₹</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Amt"
                      value={slab.amount}
                      onChange={(e) => setProfessionTax((s) => {
                        const next = [...s.slabs];
                        next[i] = { ...next[i], amount: Number(e.target.value) || 0 };
                        return { ...s, slabs: next };
                      })}
                      className={`w-[4.5rem] ${loansFormCompactInputClass()}`}
                      style={loansFormInputStyle()}
                    />
                    <button
                      type="button"
                      onClick={() => setProfessionTax((s) => ({ ...s, slabs: (s.slabs ?? defaultPtSlabs).filter((_, j) => j !== i) }))}
                      className="ml-auto shrink-0 p-1 text-stone-400 transition hover:text-rose-600 dark:hover:text-rose-400"
                      title="Remove slab"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Example: 0–14999 → ₹0, 15000–19999 → ₹150, 20000+ (max empty) → ₹200</p>
            </div>
          </div>
        </LoanDetailSection>
      </div>
    </LoansPageShell>
  );
}
