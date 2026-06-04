"use client";

import Link from "next/link";
import MissingPayrollEmployeeTable from "@/components/payments/MissingPayrollEmployeeTable";
import {
  BatchPayrollValidationIssue,
  totalMissingEmployeeCount,
  payRegisterPathFromIssues,
} from "@/lib/payrollBatchValidation";

type Props = {
  open: boolean;
  onClose: () => void;
  issues: BatchPayrollValidationIssue[];
  payRegisterBasePath: string;
  summary?: string;
  onProceedAnyway?: () => void | Promise<void>;
  proceedAnywayLoading?: boolean;
};

export default function MissingPayrollWarningDialog({
  open,
  onClose,
  issues,
  payRegisterBasePath,
  summary,
  onProceedAnyway,
  proceedAnywayLoading = false,
}: Props) {
  if (!open || issues.length === 0) return null;

  const employeeCount = totalMissingEmployeeCount(issues);
  const payRegisterHref = payRegisterPathFromIssues(payRegisterBasePath, issues);
  const batchCount = issues.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        role="alertdialog"
        aria-labelledby="missing-payroll-warning-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden border border-amber-200 dark:border-amber-800/60"
      >
        <div className="px-6 pt-6 pb-4 border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <WarningIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3
                id="missing-payroll-warning-title"
                className="text-lg font-bold text-amber-900 dark:text-amber-100"
              >
                Payroll not calculated
              </h3>
              <p className="text-sm text-amber-800/90 dark:text-amber-200/90 mt-1">
                {summary ||
                  `${employeeCount} employee${employeeCount === 1 ? "" : "s"} in ${batchCount} batch${batchCount === 1 ? "" : "es"} do not have payroll calculated yet.`}
              </p>
              {onProceedAnyway && (
                <p className="text-xs text-amber-700/90 dark:text-amber-300/80 mt-2">
                  <strong>Proceed anyway</strong> will approve all selected batch(es). Where payroll is
                  missing, only employees who are already calculated are included; the employees listed
                  below are excluded for that batch.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={proceedAnywayLoading}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              aria-label="Close"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 max-h-[min(55vh,400px)] overflow-y-auto space-y-5">
          {issues.map((issue) => (
            <div key={issue.batchId}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                {issue.batchLabel}
                {issue.month ? ` · ${issue.month}` : ""}
                <span className="ml-2 font-normal normal-case">
                  ({issue.missingEmployees.length} excluded)
                </span>
              </p>
              <MissingPayrollEmployeeTable employees={issue.missingEmployees} />
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3">
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={proceedAnywayLoading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60"
            >
              Close
            </button>
            <Link
              href={payRegisterHref}
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium text-center text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 shadow-sm"
            >
              Go to Pay Register
            </Link>
          </div>
          {onProceedAnyway && (
            <button
              type="button"
              onClick={() => onProceedAnyway()}
              disabled={proceedAnywayLoading}
              className="w-full px-4 py-2.5 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
            >
              {proceedAnywayLoading
                ? "Approving…"
                : "Proceed anyway & approve all selected"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WarningIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
