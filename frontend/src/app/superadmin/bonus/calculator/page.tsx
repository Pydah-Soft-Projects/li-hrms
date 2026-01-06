'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, BonusPolicy, Department, Division } from '@/lib/api';
import { toast } from 'react-toastify';
import { FiPlay, FiSearch } from 'react-icons/fi';

export default function BonusCalculatorPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<BonusPolicy[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  const [form, setForm] = useState({
    month: new Date().toISOString().slice(0, 7), // YYYY-MM
    policyId: '',
    departmentId: '',
    divisionId: '',
  });

  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [policiesRes, deptRes, divRes] = await Promise.all([
        api.getBonusPolicies(),
        api.getDepartments(true),
        api.getDivisions(true),
      ]);

      if (policiesRes.success && policiesRes.data) setPolicies(policiesRes.data);
      if (deptRes.success && deptRes.data) setDepartments(deptRes.data);
      if (divRes.success && divRes.data) setDivisions(divRes.data);
    } catch (error) {
      console.error('Error loading data', error);
      toast.error('Failed to load form data');
    }
  };

  const handleCalculateAndCreate = async () => {
    if (!form.month || !form.policyId) {
      toast.error('Please select Month and Policy');
      return;
    }

    try {
      setCalculating(true);
      const response = await api.createBonusBatch({
        month: form.month,
        policyId: form.policyId,
        departmentId: form.departmentId || undefined,
        divisionId: form.divisionId || undefined,
      });

      if (response.success && response.data) {
        toast.success('Bonus calculated and batch created!');
        router.push(`/superadmin/bonus/batches/${response.data._id}`);
      } else {
        toast.error(response.message || 'Calculation failed');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error occurred during calculation');
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className='p-6 max-w-4xl mx-auto'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2'>Bonus Calculator</h1>
        <p className='text-slate-500 dark:text-slate-400'>
          Select criteria to calculate employee bonuses and create a new bonus batch.
        </p>
      </div>

      <div className='bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* Month Selection */}
          <div className='col-span-1'>
            <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'>
              Select Month
            </label>
            <input
              type='month'
              className='w-full px-4 py-2.5 border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-blue-500'
              value={form.month}
              onChange={(e) => setForm({ ...form, month: e.target.value })}
            />
          </div>

          {/* Policy Selection */}
          <div className='col-span-1'>
            <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'>
              Select Bonus Policy
            </label>
            <select
              className='w-full px-4 py-2.5 border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-blue-500'
              value={form.policyId}
              onChange={(e) => setForm({ ...form, policyId: e.target.value })}
            >
              <option value=''>-- Select Policy --</option>
              {policies.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.policyType === 'attendance_regular' ? 'Attendance' : 'Payroll'})
                </option>
              ))}
            </select>
            {form.policyId && (
              <p className='text-xs text-slate-500 mt-1'>
                {policies.find(p => p._id === form.policyId)?.description}
              </p>
            )}
          </div>

          <div className='col-span-2 my-4 border-t border-slate-200 dark:border-slate-700'></div>

          <h3 className='col-span-2 font-semibold text-slate-800 dark:text-slate-200'>Filters (Optional)</h3>

          {/* Division Filter */}
          <div className='col-span-1'>
            <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'>
              Division
            </label>
            <select
              className='w-full px-4 py-2.5 border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-600'
              value={form.divisionId}
              onChange={(e) => setForm({ ...form, divisionId: e.target.value })}
            >
              <option value=''>All Divisions</option>
              {divisions.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div className='col-span-1'>
            <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'>
              Department
            </label>
            <select
              className='w-full px-4 py-2.5 border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-600'
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              <option value=''>All Departments</option>
              {departments
                .filter(d => !form.divisionId || (d.divisions as any)?.some((div: any) => (typeof div === 'string' ? div : div._id) === form.divisionId))
                .map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className='mt-8 flex justify-end'>
          <button
            onClick={handleCalculateAndCreate}
            disabled={calculating || !form.policyId || !form.month}
            className={`
              flex items-center gap-2 px-8 py-3 rounded-lg text-white font-medium shadow-md transition-all
              ${calculating || !form.policyId || !form.month
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/30'
              }
            `}
          >
            {calculating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Calculating & Creating Batch...
              </>
            ) : (
              <>
                <FiPlay /> Calculate Bonus
              </>
            )}
          </button>
        </div>
      </div>

      <div className='mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4'>
        <h4 className='font-semibold text-blue-800 dark:text-blue-200 mb-2'>How it works</h4>
        <ul className='list-disc list-inside text-sm text-blue-700 dark:text-blue-300 space-y-1'>
          <li>Select the month for which attendance/data should be used.</li>
          <li>Choose a Bonus Policy (Attendance-based or Payroll-based).</li>
          <li>The system will calculate bonus amounts for all matching employees based on the policy tiers.</li>
          <li>A &quot;Pending&quot; batch will be created which you can review, edit, and approve.</li>
        </ul>
      </div>
    </div>
  );
}
