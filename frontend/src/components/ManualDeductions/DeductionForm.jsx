'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { User, IndianRupee, FileText, Zap } from 'lucide-react';
import EmployeeSelect from '@/components/EmployeeSelect';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  LoanDialogFooter,
  LoanDialogTypeToggle,
  LoanFormLabel,
  LoanFormPanel,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormTextareaClass,
} from '@/components/loans/LoanDetailDialogShell';

const DeductionForm = ({ open, onClose, onSubmit, employees = [] }) => {
  const [deductionType, setDeductionType] = useState('incremental');
  const [formData, setFormData] = useState({
    employee: '',
    startMonth: '',
    endMonth: '',
    monthlyAmount: '',
    totalAmount: '',
    directAmount: '',
    reason: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetchingAttendance, setFetchingAttendance] = useState(false);
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [attendanceData, setAttendanceData] = useState([]);
  const [calculationBreakdown, setCalculationBreakdown] = useState([]);

  useEffect(() => {
    if (employees?.length > 0) setLocalEmployees(employees);
    else loadEmployees();
  }, [employees, open]);

  useEffect(() => {
    if (deductionType !== 'incremental') { setAttendanceData([]); return; }
    if (formData.employee && formData.startMonth && formData.endMonth && formData.startMonth <= formData.endMonth) {
      setFetchingAttendance(true);
      api.getAttendanceDataRange(formData.employee, formData.startMonth, formData.endMonth)
        .then((r) => { if (r.success && Array.isArray(r.data)) setAttendanceData(r.data); else setAttendanceData([]); })
        .catch(() => setAttendanceData([]))
        .finally(() => setFetchingAttendance(false));
    } else setAttendanceData([]);
  }, [deductionType, formData.employee, formData.startMonth, formData.endMonth]);

  useEffect(() => {
    if (deductionType !== 'incremental') { setCalculationBreakdown([]); return; }
    if (!formData.startMonth || !formData.endMonth || !formData.monthlyAmount) {
      setCalculationBreakdown([]);
      setFormData((p) => ({ ...p, totalAmount: '0' }));
      return;
    }
    const [startYear, startMonthNum] = formData.startMonth.split('-').map(Number);
    const [endYear, endMonthNum] = formData.endMonth.split('-').map(Number);
    const months = [];
    let currYear = startYear, currMonth = startMonthNum;
    while (currYear < endYear || (currYear === endYear && currMonth <= endMonthNum)) {
      months.push(`${currYear}-${String(currMonth).padStart(2, '0')}`);
      currMonth++; if (currMonth > 12) { currMonth = 1; currYear++; }
    }
    const monthlyAmount = parseFloat(formData.monthlyAmount) || 0;
    const breakdown = months.map((m) => {
      const record = attendanceData.find((r) => String(r.month) === String(m));
      const totalDays = record ? (Number(record.totalDaysInMonth) || new Date(m.split('-')[0], m.split('-')[1], 0).getDate()) : new Date(m.split('-')[0], m.split('-')[1], 0).getDate();
      const paidDays = record?.attendance != null ? Number(record.attendance.totalPaidDays) || 0 : 0;
      const proratedAmount = totalDays > 0 ? (monthlyAmount / totalDays) * paidDays : 0;
      return { month: m, monthlyAmount, totalDays, paidDays, proratedAmount, hasRecord: !!record };
    });
    setCalculationBreakdown(breakdown);
    const total = breakdown.reduce((sum, item) => sum + item.proratedAmount, 0);
    setFormData((p) => ({ ...p, totalAmount: total.toFixed(2) }));
  }, [deductionType, attendanceData, formData.monthlyAmount, formData.startMonth, formData.endMonth]);

  const loadEmployees = () => {
    api.getEmployees({ is_active: true }).then((r) => { if (r.success) setLocalEmployees(r.data || []); }).catch(() => {});
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.employee) newErrors.employee = 'Required';
    if (!formData.reason) newErrors.reason = 'Required';
    if (deductionType === 'direct') {
      const amt = parseFloat(formData.directAmount);
      if (!formData.directAmount || Number.isNaN(amt) || amt <= 0) newErrors.directAmount = 'Enter a valid amount';
    } else {
      if (!formData.startMonth) newErrors.startMonth = 'Required';
      if (!formData.endMonth) newErrors.endMonth = 'Required';
      if (formData.startMonth && formData.endMonth && formData.startMonth > formData.endMonth) newErrors.endMonth = 'Must be after start';
      const monthly = parseFloat(formData.monthlyAmount);
      if (!formData.monthlyAmount || Number.isNaN(monthly) || monthly <= 0) newErrors.monthlyAmount = 'Enter a valid amount';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    const submitData = deductionType === 'direct'
      ? { type: 'direct', employee: formData.employee, totalAmount: parseFloat(formData.directAmount), reason: formData.reason }
      : {
          type: 'incremental',
          employee: formData.employee,
          startMonth: formData.startMonth,
          endMonth: formData.endMonth,
          monthlyAmount: parseFloat(formData.monthlyAmount),
          totalAmount: parseFloat(formData.totalAmount),
          reason: formData.reason,
          calculationBreakdown: calculationBreakdown.map((b) => ({ month: b.month, monthlyAmount: b.monthlyAmount, totalDays: b.totalDays, paidDays: b.paidDays, proratedAmount: parseFloat(b.proratedAmount.toFixed(2)) }))
        };
    Promise.resolve(onSubmit(submitData))
      .then(() => { setFormData({ employee: '', startMonth: '', endMonth: '', monthlyAmount: '', totalAmount: '', directAmount: '', reason: '' }); setCalculationBreakdown([]); setErrors({}); })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  if (!open) return null;

  return (
    <LoanDetailDialog open onClose={onClose} maxWidth="max-w-xl">
      <LoanDetailDialogHeader
        badge="Manual deduction"
        title="Create manual deduction"
        subtitle="Deduction from pay"
        onClose={onClose}
      />
      <LoanDetailDialogBody>
        <form id="deduction-form" onSubmit={handleSubmit} className="space-y-5">
          <LoanDialogTypeToggle
            value={deductionType}
            onChange={setDeductionType}
            options={[
              { value: 'incremental', label: 'Incremental (period)' },
              { value: 'direct', label: 'Direct (amount)' },
            ]}
          />
          <div>
            <LoanFormLabel className="flex items-center gap-2"><User className="h-3 w-3" /> Employee</LoanFormLabel>
            <EmployeeSelect value={formData.employee} onChange={(emp) => setFormData((p) => ({ ...p, employee: emp ? emp._id : '' }))} placeholder="Select employee" error={errors.employee} />
            {errors.employee && <p className="mt-1 text-xs text-rose-600">{errors.employee}</p>}
          </div>
          {deductionType === 'direct' && (
            <>
              <div>
                <LoanFormLabel className="flex items-center gap-2"><IndianRupee className="h-3 w-3" /> Amount to deduct</LoanFormLabel>
                <input type="number" step="0.01" min="0" value={formData.directAmount} onChange={(e) => setFormData((p) => ({ ...p, directAmount: e.target.value }))} placeholder="0.00" className={loansFormInputClass(!!errors.directAmount)} style={loansFormInputStyle(!!errors.directAmount)} />
                {errors.directAmount && <p className="mt-1 text-xs text-rose-600">{errors.directAmount}</p>}
              </div>
              <div>
                <LoanFormLabel className="flex items-center gap-2"><FileText className="h-3 w-3" /> Remarks</LoanFormLabel>
                <textarea value={formData.reason} onChange={(e) => setFormData((p) => ({ ...p, reason: e.target.value }))} placeholder="Reason for this deduction…" rows={2} className={loansFormTextareaClass(!!errors.reason)} style={loansFormInputStyle(!!errors.reason)} />
                {errors.reason && <p className="mt-1 text-xs text-rose-600">{errors.reason}</p>}
              </div>
            </>
          )}
          {deductionType === 'incremental' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <LoanFormLabel>Start period</LoanFormLabel>
                  <input type="month" value={formData.startMonth} onChange={(e) => setFormData((p) => ({ ...p, startMonth: e.target.value }))} className={loansFormInputClass(!!errors.startMonth)} style={loansFormInputStyle(!!errors.startMonth)} />
                  {errors.startMonth && <p className="mt-1 text-xs text-rose-600">{errors.startMonth}</p>}
                </div>
                <div>
                  <LoanFormLabel>End period</LoanFormLabel>
                  <input type="month" value={formData.endMonth} onChange={(e) => setFormData((p) => ({ ...p, endMonth: e.target.value }))} className={loansFormInputClass(!!errors.endMonth)} style={loansFormInputStyle(!!errors.endMonth)} />
                  {errors.endMonth && <p className="mt-1 text-xs text-rose-600">{errors.endMonth}</p>}
                </div>
                <div>
                  <LoanFormLabel>Monthly deduction</LoanFormLabel>
                  <input type="number" step="0.01" min="0" value={formData.monthlyAmount} onChange={(e) => setFormData((p) => ({ ...p, monthlyAmount: e.target.value }))} placeholder="0.00" className={loansFormInputClass(!!errors.monthlyAmount)} style={loansFormInputStyle(!!errors.monthlyAmount)} />
                </div>
                <div>
                  <LoanFormLabel className="flex items-center gap-2"><Zap className="h-3 w-3" /> Total (prorated)</LoanFormLabel>
                  <div className="flex h-[42px] items-center border px-4 font-mono text-sm font-semibold tabular-nums" style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }}>
                    ₹{(parseFloat(formData.totalAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div>
                <LoanFormLabel>Reason</LoanFormLabel>
                <textarea value={formData.reason} onChange={(e) => setFormData((p) => ({ ...p, reason: e.target.value }))} placeholder="Reason for deduction…" rows={2} className={loansFormTextareaClass(!!errors.reason)} style={loansFormInputStyle(!!errors.reason)} />
                {errors.reason && <p className="mt-1 text-xs text-rose-600">{errors.reason}</p>}
              </div>
              {calculationBreakdown.length > 0 && (
                <LoanFormPanel soft className="!p-0 overflow-hidden">
                  <div className="border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--ps-accent-border)', color: 'var(--ps-accent-ink)' }}>
                    Compute log {fetchingAttendance ? '(loading attendance…)' : ''}
                  </div>
                  <div className="max-h-28 overflow-y-auto">
                    {calculationBreakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between border-t px-4 py-2 text-xs" style={{ borderColor: 'var(--ps-accent-border)' }}>
                        <span>{format(new Date(item.month + '-01'), 'MMM yy')}</span>
                        <span className="font-mono tabular-nums">{item.paidDays}/{item.totalDays} days → ₹{item.proratedAmount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </LoanFormPanel>
              )}
            </>
          )}
          <LoanDialogFooter
            onCancel={onClose}
            cancelLabel="Discard"
            submitLabel={loading ? 'Processing…' : 'Provision deduction'}
            loading={loading}
          />
        </form>
      </LoanDetailDialogBody>
    </LoanDetailDialog>
  );
};

export default DeductionForm;
