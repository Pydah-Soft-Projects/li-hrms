import MissingPayrollEmployeeTable from "@/components/payments/MissingPayrollEmployeeTable";
import { type MissingEmployeeDetail } from "@/lib/payrollBatchValidation";

export type { MissingEmployeeDetail };

type Props = {
  details?: MissingEmployeeDetail[];
  /** Fallback when only ObjectId strings are stored (legacy batches) */
  missingEmployeeIds?: string[];
};

export function MissingPayrollEmployeesAlert({ details, missingEmployeeIds }: Props) {
  const hasDetails = (details?.length ?? 0) > 0;
  const idCount = missingEmployeeIds?.length ?? 0;

  if (!hasDetails && idCount === 0) {
    return (
      <p>
        Not all employees in this department have payroll calculated for this month.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p>
        Payroll is not calculated for the following employee
        {(hasDetails ? details!.length : idCount) === 1 ? "" : "s"}:
      </p>
      {hasDetails ? (
        <MissingPayrollEmployeeTable employees={details!} />
      ) : (
        <p className="font-medium">Missing: {idCount} employee(s)</p>
      )}
    </div>
  );
}
