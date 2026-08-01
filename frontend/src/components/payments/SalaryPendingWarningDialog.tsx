"use client";

import MissingPayrollEmployeeTable from "@/components/payments/MissingPayrollEmployeeTable";
import type { MissingEmployeeDetail } from "@/lib/payrollBatchValidation";

type Props = {
  open: boolean;
  onClose: () => void;
  employees: MissingEmployeeDetail[];
  title?: string;
  summary?: string;
};

export default function SalaryPendingWarningDialog({
  open,
  onClose,
  employees,
  title = "Salary not finalized",
  summary,
}: Props) {
  if (!open || employees.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        role="alertdialog"
        aria-labelledby="salary-pending-warning-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden border border-rose-200 dark:border-rose-800/60"
      >
        <div className="px-6 pt-6 pb-4 border-b border-rose-100 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-950/30">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 font-bold">
              !
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="salary-pending-warning-title" className="text-lg font-bold text-rose-900 dark:text-rose-100">
                {title}
              </h3>
              <p className="text-sm text-rose-800/90 dark:text-rose-200/90 mt-1">
                {summary ||
                  `${employees.length} employee${employees.length === 1 ? "" : "s"} still have salary pending approval. Finalize salary on the employee profile, recalculate payroll, then approve this batch.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-6 py-4 max-h-[min(55vh,400px)] overflow-y-auto">
          <MissingPayrollEmployeeTable employees={employees} />
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
