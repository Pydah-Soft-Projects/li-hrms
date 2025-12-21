import React, { useState, useEffect } from 'react';
import { format, addMonths } from 'date-fns';
import { api } from '@/lib/api';

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const XIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

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

  const calculateTotal = (start, end, monthly) => {
    if (!start || !end || !monthly) return 0;

    const [startYear, startMonthNum] = start.split('-').map(Number);
    const [endYear, endMonthNum] = end.split('-').map(Number);

    const months = (endYear - startYear) * 12 + (endMonthNum - startMonthNum) + 1;

    return months * parseFloat(monthly);
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

    if (!formData.employee) newErrors.employee = 'Employee is required';
    if (!formData.startMonth) newErrors.startMonth = 'Start month is required';
    if (!formData.endMonth) newErrors.endMonth = 'End month is required';
    if (!formData.monthlyAmount) newErrors.monthlyAmount = 'Monthly amount is required';
    if (!formData.reason) newErrors.reason = 'Reason is required';

    if (formData.startMonth && formData.endMonth && formData.startMonth > formData.endMonth) {
      newErrors.endMonth = 'End month must be after start month';
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
      .catch((err) => {
        console.error('Error submitting form:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-900 dark:to-blue-800 px-6 py-6 flex items-center justify-between border-b border-blue-700 dark:border-blue-900">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <PlusIcon />
              Create Arrears Request
            </h2>
            <p className="text-blue-100 text-sm mt-1">Fill in the details to create a new arrears request</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-700 dark:hover:bg-blue-800 rounded-lg transition-colors duration-200"
          >
            <XIcon className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Employee Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
              Employee <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.employee}
              onChange={(e) => setFormData(prev => ({ ...prev, employee: e.target.value }))}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white ${errors.employee
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
                } focus:outline-none`}
            >
              <option value="">
                {localEmployees.length === 0 ? 'Loading employees...' : 'Select an employee'}
              </option>
              {localEmployees.map(emp => (
                <option key={emp._id} value={emp._id}>
                  {getEmployeeName(emp)} ({emp.emp_no})
                </option>
              ))}
            </select>
            {errors.employee && <p className="text-red-500 text-sm mt-1">{errors.employee}</p>}
          </div>

          {/* Month Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Start Month <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                value={formData.startMonth}
                onChange={(e) => handleMonthChange('startMonth', e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white ${errors.startMonth
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
                  } focus:outline-none`}
              />
              {errors.startMonth && <p className="text-red-500 text-sm mt-1">{errors.startMonth}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                End Month <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                value={formData.endMonth}
                onChange={(e) => handleMonthChange('endMonth', e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white ${errors.endMonth
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
                  } focus:outline-none`}
              />
              {errors.endMonth && <p className="text-red-500 text-sm mt-1">{errors.endMonth}</p>}
            </div>
          </div>

          {/* Amount Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Monthly Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.monthlyAmount}
                onChange={handleMonthlyAmountChange}
                placeholder="0.00"
                className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white ${errors.monthlyAmount
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
                  } focus:outline-none`}
              />
              {errors.monthlyAmount && <p className="text-red-500 text-sm mt-1">{errors.monthlyAmount}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Total Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.totalAmount}
                readOnly
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Auto-calculated</p>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Enter the reason for arrears..."
              rows="4"
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none ${errors.reason
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
                } focus:outline-none`}
            />
            {errors.reason && <p className="text-red-500 text-sm mt-1">{errors.reason}</p>}
          </div>

          {/* Breakdown Table (Replacement for Summary Card) */}
          {(formData.startMonth && formData.endMonth && formData.monthlyAmount) && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
              <div className="bg-slate-50 dark:bg-slate-800 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="font-semibold text-slate-900 dark:text-white">Calculation Breakdown</h3>
                {fetchingAttendance && (
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-medium">
                    <div className="w-3 h-3 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                    Updating attendance...
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="px-4 py-3 font-semibold">Month</th>
                      <th className="px-4 py-3 font-semibold text-right">Amount</th>
                      <th className="px-4 py-3 font-semibold text-center">Paid/Total</th>
                      <th className="px-4 py-3 font-semibold text-right">Prorated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {calculationBreakdown.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-2 text-slate-700 dark:text-slate-300 font-medium">
                          {format(new Date(item.month), 'MMM yyyy')}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">
                          ₹{item.monthlyAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${item.hasRecord
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-500'
                            }`}>
                            {item.paidDays}/{item.totalDays}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900 dark:text-white">
                          ₹{item.proratedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50/50 dark:bg-blue-900/10 border-t-2 border-blue-100 dark:border-blue-900/30">
                      <td colSpan="3" className="px-4 py-3 font-bold text-slate-900 dark:text-white">Total Arrears Amount</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400 text-base">
                        ₹{parseFloat(formData.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!calculationBreakdown.some(b => b.hasRecord) && !fetchingAttendance && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs flex gap-2 items-start border-t border-amber-100 dark:border-amber-900/30">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>No payroll records found for selected period. Arrears will be 0 for months without attendance.</span>
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  <CheckIcon />
                  Create Arrears
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ArrearsForm;
