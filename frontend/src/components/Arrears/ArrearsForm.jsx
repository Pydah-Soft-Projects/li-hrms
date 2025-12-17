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
  const [localEmployees, setLocalEmployees] = useState(employees);

  useEffect(() => {
    if (employees && employees.length > 0) {
      setLocalEmployees(employees);
    } else {
      loadEmployees();
    }
  }, [employees, open]);

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
    const monthly = e.target.value;
    setFormData(prev => ({
      ...prev,
      monthlyAmount: monthly,
      totalAmount: calculateTotal(prev.startMonth, prev.endMonth, monthly).toString()
    }));
  };

  const handleMonthChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      totalAmount: calculateTotal(
        field === 'startMonth' ? value : prev.startMonth,
        field === 'endMonth' ? value : prev.endMonth,
        prev.monthlyAmount
      ).toString()
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
      reason: formData.reason
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
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white ${
                errors.employee
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
                className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white ${
                  errors.startMonth
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
                className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white ${
                  errors.endMonth
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
                className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white ${
                  errors.monthlyAmount
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
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none ${
                errors.reason
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400'
              } focus:outline-none`}
            />
            {errors.reason && <p className="text-red-500 text-sm mt-1">{errors.reason}</p>}
          </div>

          {/* Summary Card */}
          {formData.monthlyAmount && formData.totalAmount && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Monthly Amount:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">₹{parseFloat(formData.monthlyAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Number of Months:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formData.startMonth && formData.endMonth
                      ? (() => {
                          const [startYear, startMonthNum] = formData.startMonth.split('-').map(Number);
                          const [endYear, endMonthNum] = formData.endMonth.split('-').map(Number);
                          return (endYear - startYear) * 12 + (endMonthNum - startMonthNum) + 1;
                        })()
                      : 0}
                  </span>
                </div>
                <div className="border-t border-blue-200 dark:border-blue-800 pt-2 mt-2 flex justify-between">
                  <span className="text-slate-900 dark:text-white font-semibold">Total Amount:</span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">₹{parseFloat(formData.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
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
