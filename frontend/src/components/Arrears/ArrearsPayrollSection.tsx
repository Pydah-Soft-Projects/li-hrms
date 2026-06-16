import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import {
  LoansContentPanel,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  loansFormInputClass,
  loansFormInputStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { ledgerMoneyClass } from '@/lib/ledgerUi';

// Define the API response type for getArrearsForPayroll
interface ArrearsForPayrollResponse {
  success: boolean;
  data: ArrearsForPayroll[];
  count: number;
}

interface ArrearsForPayroll {
  _id: string;
  type?: 'incremental' | 'direct';
  employee: {
    _id: string;
    emp_no: string;
    first_name: string;
    last_name: string;
    department_id: string | { _id: string; name: string };
    division_id?: string | { _id: string; name: string };
  };
  totalAmount: number;
  settledAmount: number;
  isFullySettled: boolean;
  status: string;
  startMonth?: string;
  endMonth?: string;
  reason: string;
  monthlyAmount: number;
  remainingAmount?: number;
}

interface ArrearsPayrollSectionProps {
  month: number;
  year: number;
  divisionId?: string;
  departmentId?: string;
  onArrearsSelected: (arrears: Array<{ id: string; amount: number; employeeId?: string }>) => void;
}

export const ArrearsPayrollSection: React.FC<ArrearsPayrollSectionProps> = ({
  month,
  year,
  divisionId,
  departmentId,
  onArrearsSelected,
}) => {
  const [arrears, setArrears] = useState<ArrearsForPayroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArrears, setSelectedArrears] = useState<Record<string, number>>({});

  useEffect(() => {
    const selection = Object.entries(selectedArrears).map(([id, amount]) => {
      const arrear = arrears.find((a) => a._id === id);
      return {
        id,
        amount,
        employeeId: arrear?.employee._id,
      };
    });
    onArrearsSelected(selection);
  }, [selectedArrears, arrears, onArrearsSelected]);

  useEffect(() => {
    fetchArrears();
  }, [month, year]);

  const filteredArrears = arrears.filter(arr => {
    const emp = arr.employee as { department_id?: string | { _id: string }; division_id?: string | { _id: string } };
    const empDivId = typeof emp?.division_id === 'object' ? emp?.division_id?._id : emp?.division_id;
    const empDeptId = typeof emp?.department_id === 'object' ? emp?.department_id?._id : emp?.department_id;
    if (divisionId && empDivId !== divisionId) return false;
    if (departmentId && empDeptId !== departmentId) return false;
    return true;
  });

  const fetchArrears = async () => {
    try {
      setLoading(true);

      // Use the API client method
      const response = await api.getArrearsForPayroll({
        month,
        year,
      });

      console.log('[ArrearsPayrollSection] API Response:', response);

      // Extract the data array from the response
      // Backend returns: { success: true, count: X, data: [...] }
      // apiRequest spreads it, so we get: { success: true, count: X, data: [...] }
      // Backend returns: { success: true, count: X, data: [...] }
      const arrearsData = (response?.data && Array.isArray(response.data)) ? response.data : [];
      console.log('[ArrearsPayrollSection] Arrears data:', arrearsData);
      setArrears(arrearsData as ArrearsForPayroll[]);

      // Initialize selected arrears with remaining amount
      const initialSelected: Record<string, number> = {};
      arrearsData.forEach((arr: ArrearsForPayroll) => {
        initialSelected[arr._id] = arr.remainingAmount || (arr.totalAmount - (arr.settledAmount || 0));
      });
      setSelectedArrears(initialSelected);
    } catch (error) {
      console.error('Error fetching arrears:', error);
      toast.error('Failed to load arrears data');
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (id: string, value: string) => {
    const amount = parseFloat(value) || 0;
    setSelectedArrears(prev => ({
      ...prev,
      [id]: amount
    }));
  };

  const toggleArrear = (id: string, isChecked: boolean) => {
    const arrearsItem = arrears.find(arr => arr._id === id);
    if (!arrearsItem) return;

    const remainingAmount = arrearsItem.totalAmount - (arrearsItem.settledAmount || 0);

    setSelectedArrears(prev => {
      const updated = { ...prev };
      if (isChecked) {
        updated[id] = remainingAmount;
      } else {
        delete updated[id];
      }
      return updated;
    });
  };

  if (loading) {
    return <p className="text-sm text-stone-500">Loading arrears…</p>;
  }

  if (filteredArrears.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No pending arrears for this period
        {(divisionId || departmentId) ? ' with the current filter' : ''}.
      </p>
    );
  }

  return (
    <LoansContentPanel>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
              <th className="px-4 py-3 text-left font-semibold">Include</th>
              <th className="px-4 py-3 text-left font-semibold">Employee</th>
              <th className="px-4 py-3 text-left font-semibold">Period</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 text-right font-semibold">Settled</th>
              <th className="px-4 py-3 text-right font-semibold">Remaining</th>
              <th className="px-4 py-3 text-right font-semibold">Amount to settle</th>
            </tr>
          </thead>
          <tbody>
            {filteredArrears.map((arr) => {
              const remaining = arr.totalAmount - (arr.settledAmount || 0);
              const isSelected = selectedArrears.hasOwnProperty(arr._id);

              return (
                <tr
                  key={arr._id}
                  className="border-b transition hover:bg-stone-50 dark:hover:bg-stone-900/40"
                  style={{
                    borderColor: 'var(--ps-accent-border)',
                    backgroundColor: isSelected ? 'var(--ps-accent-soft)' : undefined,
                  }}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => toggleArrear(arr._id, e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-900 dark:text-stone-100">
                      {arr.employee.first_name} {arr.employee.last_name}
                    </div>
                    <div className="text-xs text-stone-500">{arr.employee.emp_no}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-stone-900 dark:text-stone-100">
                      {arr.type === 'direct'
                        ? '—'
                        : `${arr.startMonth ? new Date(arr.startMonth).toLocaleDateString() : '—'} – ${arr.endMonth ? new Date(arr.endMonth).toLocaleDateString() : '—'}`}
                    </div>
                    <div className="text-xs text-stone-500">{arr.reason}</div>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${ledgerMoneyClass()}`}>
                    ₹{arr.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    ₹{(arr.settledAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${ledgerMoneyClass()}`}>
                    ₹{remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <span>₹</span>
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        step="0.01"
                        value={isSelected ? (selectedArrears[arr._id] || '') : ''}
                        onChange={(e) => handleAmountChange(arr._id, e.target.value)}
                        disabled={!isSelected}
                        className={`w-28 ${loansFormInputClass()}`}
                        style={loansFormInputStyle()}
                      />
                      <span className="text-xs text-stone-500">
                        / {remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </LoansContentPanel>
  );
};

export default ArrearsPayrollSection;
