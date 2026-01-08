import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import {
  X,
  Check,
  User,
  Calendar,
  IndianRupee,
  AlertCircle,
  FileText,
  Clock,
  TrendingUp,
  Info,
  ShieldCheck,
  Zap,
  ChevronDown
} from 'lucide-react';

const ArrearsForm = ({ open, onClose, onSubmit, employees = [] }) => {
  const [formData, setFormData] = useState({
    employee: '',
    startMonth: '',
    endMonth: '',
    monthlyAmount: '',
    totalAmount: '',
    reason: ''
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetchingAttendance, setFetchingAttendance] = useState(false);
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [attendanceData, setAttendanceData] = useState([]);
  const [calculationBreakdown, setCalculationBreakdown] = useState([]);

  useEffect(() => {
    if (employees && employees.length > 0) {
      setLocalEmployees(employees);
    } else {
      loadEmployees();
    }
  }, [employees, open]);

  // Fetch attendance data when selection changes
  useEffect(() => {
    if (formData.employee && formData.startMonth && formData.endMonth && formData.startMonth <= formData.endMonth) {
      setFetchingAttendance(true);
      api.getAttendanceDataRange(formData.employee, formData.startMonth, formData.endMonth)
        .then(response => {
          if (response.success) {
            setAttendanceData(response.data || []);
          }
        })
        .catch(err => console.error('Error fetching attendance data:', err))
        .finally(() => setFetchingAttendance(false));
    } else {
      setAttendanceData([]);
    }
  }, [formData.employee, formData.startMonth, formData.endMonth]);

  // Real-time proration calculation
  useEffect(() => {
    if (!formData.startMonth || !formData.endMonth || !formData.monthlyAmount) {
      setCalculationBreakdown([]);
      setFormData(prev => ({ ...prev, totalAmount: '0' }));
      return;
    }

    const [startYear, startMonthNum] = formData.startMonth.split('-').map(Number);
    const [endYear, endMonthNum] = formData.endMonth.split('-').map(Number);

    const months = [];
    let currYear = startYear;
    let currMonth = startMonthNum;

    while (currYear < endYear || (currYear === endYear && currMonth <= endMonthNum)) {
      const monthStr = `${currYear}-${String(currMonth).padStart(2, '0')}`;
      months.push(monthStr);

      currMonth++;
      if (currMonth > 12) {
        currMonth = 1;
        currYear++;
      }
    }

    const monthlyAmount = parseFloat(formData.monthlyAmount) || 0;
    const breakdown = months.map(m => {
      const record = attendanceData.find(r => r.month === m);
      const totalDays = record ? record.totalDaysInMonth : new Date(Number(m.split('-')[0]), Number(m.split('-')[1]), 0).getDate();
      const paidDays = record && record.attendance ? record.attendance.totalPaidDays : 0;
      const proratedAmount = totalDays > 0 ? (monthlyAmount / totalDays) * paidDays : 0;

      return {
        month: m,
        monthlyAmount,
        totalDays,
        paidDays,
        proratedAmount,
        hasRecord: !!record
      };
    });

    setCalculationBreakdown(breakdown);
    const total = breakdown.reduce((sum, item) => sum + item.proratedAmount, 0);
    setFormData(prev => ({ ...prev, totalAmount: total.toFixed(2) }));
  }, [attendanceData, formData.monthlyAmount, formData.startMonth, formData.endMonth]);

  const loadEmployees = () => {
    Promise.resolve(api.getEmployees({ is_active: true }))
      .then((response) => {
        if (response.success) {
          setLocalEmployees(response.data || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load employees:', err);
      });
  };

  const getEmployeeName = (emp) => {
    if (emp.employee_name) return emp.employee_name;
    if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
    if (emp.first_name) return emp.first_name;
    return emp.emp_no;
  };

  const handleMonthlyAmountChange = (e) => {
    setFormData(prev => ({
      ...prev,
      monthlyAmount: e.target.value
    }));
  };

  const handleMonthChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.employee) newErrors.employee = 'Required';
    if (!formData.startMonth) newErrors.startMonth = 'Required';
    if (!formData.endMonth) newErrors.endMonth = 'Required';
    if (!formData.monthlyAmount) newErrors.monthlyAmount = 'Required';
    if (!formData.reason) newErrors.reason = 'Required';

    if (formData.startMonth && formData.endMonth && formData.startMonth > formData.endMonth) {
      newErrors.endMonth = 'Must be after start';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);

    const submitData = {
      employee: formData.employee,
      startMonth: formData.startMonth,
      endMonth: formData.endMonth,
      monthlyAmount: parseFloat(formData.monthlyAmount),
      totalAmount: parseFloat(formData.totalAmount),
      reason: formData.reason,
      calculationBreakdown: calculationBreakdown.map(b => ({
        month: b.month,
        monthlyAmount: b.monthlyAmount,
        totalDays: b.totalDays,
        paidDays: b.paidDays,
        proratedAmount: parseFloat(b.proratedAmount.toFixed(2))
      }))
    };

    Promise.resolve(onSubmit(submitData))
      .then(() => {
        setFormData({
          employee: '',
          startMonth: '',
          endMonth: '',
          monthlyAmount: '',
          totalAmount: '',
          reason: ''
        });
        setCalculationBreakdown([]);
        setErrors({});
      })
      .catch((err) => console.error('Error submitting form:', err))
      .finally(() => setLoading(false));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-50 flex w-full max-w-xl max-h-[90vh] flex-col overflow-hidden rounded-3xl bg-slate-50 shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] dark:bg-slate-950 border border-slate-300 dark:border-slate-800">

        {/* Compact Professional Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 shadow-inner dark:bg-blue-900/20 border border-blue-200">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white leading-tight">Create Arrears</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Payroll Request Protocol</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-950 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300 text-slate-950">
          <form id="arrears-form" onSubmit={handleSubmit} className="space-y-6">

            {/* Row 1: Employee */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                <User className="h-3 w-3" />
                Employee Information
              </label>
              <div className="relative group">
                <select
                  value={formData.employee}
                  onChange={(e) => setFormData(prev => ({ ...prev, employee: e.target.value }))}
                  className={`w-full appearance-none rounded-xl border bg-white py-2.5 pl-4 pr-10 text-xs font-semibold text-slate-950 transition-all focus:ring-4 dark:bg-slate-900 dark:text-white ${errors.employee
                      ? 'border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700'
                    }`}
                >
                  <option value="">Search internal registry...</option>
                  {localEmployees.map(emp => (
                    <option key={emp._id} value={emp._id}>
                      {getEmployeeName(emp)} ({emp.emp_no})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 pointer-events-none" />
              </div>
              {errors.employee && <p className="text-[9px] font-bold text-rose-700 uppercase tracking-widest ml-1">{errors.employee}</p>}
            </div>

            {/* Row 2: Period & Amount Matrix */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Start Period
                </label>
                <input
                  type="month"
                  value={formData.startMonth}
                  onChange={(e) => handleMonthChange('startMonth', e.target.value)}
                  className={`w-full rounded-xl border bg-white py-2.5 px-4 text-xs font-semibold text-slate-950 focus:ring-4 dark:bg-slate-900 dark:text-white ${errors.startMonth
                      ? 'border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700'
                    }`}
                />
                {errors.startMonth && <p className="text-[9px] font-bold text-rose-700 uppercase tracking-widest ml-1">{errors.startMonth}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  End Period
                </label>
                <input
                  type="month"
                  value={formData.endMonth}
                  onChange={(e) => handleMonthChange('endMonth', e.target.value)}
                  className={`w-full rounded-xl border bg-white py-2.5 px-4 text-xs font-semibold text-slate-950 focus:ring-4 dark:bg-slate-900 dark:text-white ${errors.endMonth
                      ? 'border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700'
                    }`}
                />
                {errors.endMonth && <p className="text-[9px] font-bold text-rose-700 uppercase tracking-widest ml-1">{errors.endMonth}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                  <IndianRupee className="h-3 w-3" />
                  Monthly Val.
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.monthlyAmount}
                  onChange={handleMonthlyAmountChange}
                  placeholder="0.00"
                  className={`w-full rounded-xl border bg-white py-2.5 px-4 text-xs font-semibold text-slate-950 focus:ring-4 dark:bg-slate-900 dark:text-white placeholder:text-slate-300 ${errors.monthlyAmount
                      ? 'border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700'
                    }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                  <Zap className="h-3 w-3" />
                  Total Commitment
                </label>
                <div className="flex h-[38px] items-center rounded-xl bg-slate-200/50 px-4 text-xs font-bold text-slate-950 dark:bg-slate-900/50 dark:text-white border border-slate-300 dark:border-slate-800 shadow-inner">
                  ₹{parseFloat(formData.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Justification */}
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                <FileText className="h-3 w-3" />
                Reason for Adjustment
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Retroactive rationale..."
                rows="2"
                className={`w-full resize-none rounded-xl border bg-white p-4 text-xs font-semibold text-slate-950 transition-all focus:ring-4 dark:bg-slate-900 dark:text-white placeholder:text-slate-300 ${errors.reason
                    ? 'border-rose-500 focus:ring-rose-500/20'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700'
                  }`}
              />
            </div>

            {/* Calculation Logs - Very Compact */}
            {(formData.startMonth && formData.endMonth && formData.monthlyAmount) && (
              <div className="rounded-2xl border border-slate-300 bg-slate-100 overflow-hidden dark:border-slate-800 dark:bg-slate-900/20 shadow-sm">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700">Compute Log</span>
                  {fetchingAttendance && <span className="text-[9px] font-bold text-blue-700 animate-pulse uppercase tracking-widest">Syncing Registry...</span>}
                </div>
                <div className="max-h-32 overflow-y-auto scrollbar-thin">
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {calculationBreakdown.map((item, idx) => (
                        <tr key={idx} className="text-[10px] hover:bg-white dark:hover:bg-slate-900/50 transition-colors">
                          <td className="px-4 py-2 font-bold text-slate-800 dark:text-slate-400">{format(new Date(item.month), 'MMM yy')}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[8px] uppercase border ${item.hasRecord ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-slate-200 border-slate-300 text-slate-700'}`}>
                              {item.paidDays}/{item.totalDays} Days
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-slate-950 dark:text-white">₹{item.proratedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Minimalist Footer */}
        <div className="border-t border-slate-300 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 hover:text-slate-950 transition-colors"
            >
              Discard
            </button>
            <button
              form="arrears-form"
              type="submit"
              disabled={loading}
              className="flex-[2] rounded-xl bg-slate-950 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white shadow-xl transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-slate-900 border border-slate-800"
            >
              {loading ? 'Processing...' : 'Provision Arrear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArrearsForm;
