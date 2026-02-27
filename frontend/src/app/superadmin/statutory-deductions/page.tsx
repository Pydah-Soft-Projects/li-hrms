'use client';

import { useState, useEffect } from 'react';
import { api, type ProfessionTaxSlab, type StatutoryPF } from '@/lib/api';
import { toast } from 'react-toastify';
import { Save, Shield, Building2, Briefcase, Plus, Trash2 } from 'lucide-react';

const defaultEsi = {
  enabled: false,
  employeePercent: 0.75,
  employerPercent: 3.25,
  wageBasePercentOfBasic: 50,
  wageCeiling: 21000,
};
const defaultPf: StatutoryPF = {
  enabled: false,
  employeePercent: 12,
  employerPercent: 12,
  wageCeiling: 15000,
  base: 'basic',
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
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Statutory deductions</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Configure ESI, PF (Provident Fund), and Profession Tax. Only <strong>employee share</strong> is deducted from salary; employer share is for your records.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="space-y-6">
        {/* ESI */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/80 flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">ESI (Employees&apos; State Insurance)</h2>
          </div>
          <div className="p-5 space-y-4">
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
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
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
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">% of basic for ESI wage</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={esi.wageBasePercentOfBasic ?? 50}
                  onChange={(e) => setEsi((s) => ({ ...s, wageBasePercentOfBasic: Number(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                />
                <p className="mt-0.5 text-xs text-slate-400">e.g. 50 = ESI on 50% of basic</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Wage ceiling (₹/month) – applicable when basic ≤ ceiling</label>
                <input
                  type="number"
                  min="0"
                  value={esi.wageCeiling}
                  onChange={(e) => setEsi((s) => ({ ...s, wageCeiling: Number(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                />
                <p className="mt-0.5 text-xs text-slate-400">When enabled: ESI applies only if employee basic pay ≤ this ceiling. Contribution is still on (% of basic) above. 0 = no ceiling.</p>
              </div>
            </div>
          </div>
        </div>

        {/* PF */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/80 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">PF (Provident Fund / EPF)</h2>
          </div>
          <div className="p-5 space-y-4">
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
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
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
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Upper limit / wage ceiling (₹/month)</label>
                <input
                  type="number"
                  min="0"
                  value={pf.wageCeiling}
                  onChange={(e) => setPf((s) => ({ ...s, wageCeiling: Number(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                />
                <p className="mt-0.5 text-xs text-slate-400">If basic ≥ this, PF calculated on this amount; else on full basic. e.g. 15000.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Base</label>
                <select
                  value={pf.base}
                  onChange={(e) => setPf((s) => ({ ...s, base: e.target.value as 'basic' | 'basic_da' }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                >
                  <option value="basic">Basic only</option>
                  <option value="basic_da">Basic + DA</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Profession Tax */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/80 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Profession Tax</h2>
          </div>
          <div className="p-5 space-y-4">
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
                className="w-full max-w-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Slabs (salary range → amount)</span>
                <button
                  type="button"
                  onClick={() => setProfessionTax((s) => ({ ...s, slabs: [...(s.slabs ?? defaultPtSlabs), { min: 0, max: null, amount: 0 }] }))}
                  className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add slab
                </button>
              </div>
              <div className="space-y-2">
                {(professionTax.slabs ?? defaultPtSlabs).map((slab, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30">
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
                      className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Max (empty = above)"
                      value={slab.max ?? ''}
                      onChange={(e) => setProfessionTax((s) => {
                        const next = [...(s.slabs ?? defaultPtSlabs)];
                        const v = e.target.value.trim();
                        next[i] = { ...next[i], max: v === '' ? null : Number(v) };
                        return { ...s, slabs: next };
                      })}
                      className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                      title="Leave empty for no upper limit (and above)"
                    />
                    <span className="text-slate-500 text-sm">→ ₹</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Amount"
                      value={slab.amount}
                      onChange={(e) => setProfessionTax((s) => {
                        const next = [...s.slabs];
                        next[i] = { ...next[i], amount: Number(e.target.value) || 0 };
                        return { ...s, slabs: next };
                      })}
                      className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setProfessionTax((s) => ({ ...s, slabs: (s.slabs ?? defaultPtSlabs).filter((_, j) => j !== i) }))}
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
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
        </div>
      </div>
    </div>
  );
}
