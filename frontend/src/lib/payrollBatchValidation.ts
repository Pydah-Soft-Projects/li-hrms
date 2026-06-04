import { api, PayrollBatch } from "@/lib/api";

export type MissingEmployeeDetail = {
  employeeId?: string;
  emp_no?: string;
  employee_name?: string;
  department_name?: string;
  designation_name?: string;
  doj?: string;
};

export type BatchPayrollValidationIssue = {
  batchId: string;
  batchLabel: string;
  month: string;
  departmentId?: string;
  divisionId?: string;
  missingEmployees: MissingEmployeeDetail[];
};

export function formatEmployeeLabel(detail: MissingEmployeeDetail): string {
  const code = detail.emp_no?.trim() || "?";
  const name = detail.employee_name?.trim() || "Unknown";
  return `${code} - ${name}`;
}

export function isMissingPayrollError(message?: string, code?: string): boolean {
  if (code === "MISSING_PAYROLL") return true;
  return Boolean(message?.toLowerCase().includes("payroll not calculated"));
}

/** Parse employee labels from approval error message (fallback when API has no structured list). */
export function parseMissingPayrollErrorMessage(message: string): MissingEmployeeDetail[] {
  const lower = message.toLowerCase();
  const marker = "payroll not calculated for:";
  const idx = lower.indexOf(marker);
  if (idx === -1) return [];

  const rest = message.slice(idx + marker.length).trim();
  const withoutMore = rest.replace(/\s*\(\+\d+ more\)\s*$/i, "");
  if (!withoutMore) return [];

  return withoutMore.split(",").map((part) => {
    const trimmed = part.trim();
    const dash = trimmed.indexOf(" - ");
    if (dash === -1) return { emp_no: trimmed, employee_name: "" };
    return {
      emp_no: trimmed.slice(0, dash).trim(),
      employee_name: trimmed.slice(dash + 3).trim(),
    };
  });
}

function batchDeptId(batch: PayrollBatch): string | undefined {
  const dept = batch.department;
  if (!dept) return undefined;
  return typeof dept === "object" ? dept._id : String(dept);
}

function batchDivId(batch: PayrollBatch): string | undefined {
  const div = batch.division;
  if (!div) return undefined;
  return typeof div === "object" ? div._id : String(div);
}

function issueFromBatch(
  batch: PayrollBatch,
  missingEmployees: MissingEmployeeDetail[],
): BatchPayrollValidationIssue {
  return {
    batchId: String(batch._id),
    batchLabel: batch.department?.name || batch.batchNumber || "Batch",
    month: batch.month,
    departmentId: batchDeptId(batch),
    divisionId: batchDivId(batch),
    missingEmployees,
  };
}

/** Run server validation before approve; returns batches that still need payroll. */
export async function collectApproveValidationIssues(
  batches: PayrollBatch[],
): Promise<BatchPayrollValidationIssue[]> {
  const results = await Promise.all(
    batches.map(async (batch) => {
      const res = await api.validatePayrollBatch(String(batch._id));
      if (!res.success || !res.data || res.data.allEmployeesCalculated) {
        return null;
      }

      let missing = res.data.missingEmployeeDetails || [];
      if (!missing.length && res.data.missingEmployees?.length) {
        missing = res.data.missingEmployees.map((id) => ({
          employeeId: id,
          emp_no: "",
          employee_name: "Unknown",
        }));
      }

      return issueFromBatch(batch, missing);
    }),
  );

  return results.filter((r): r is BatchPayrollValidationIssue => r !== null);
}

export type BulkApproveErrorEntry = {
  batchId: string;
  error: string;
  code?: string;
  missingEmployees?: MissingEmployeeDetail[];
};

export function issuesFromBulkApproveErrors(
  errors: BulkApproveErrorEntry[],
  batchesById: Map<string, PayrollBatch>,
): BatchPayrollValidationIssue[] {
  const issues: BatchPayrollValidationIssue[] = [];

  for (const err of errors) {
    if (!isMissingPayrollError(err.error, err.code)) continue;

    const batch = batchesById.get(String(err.batchId));
    let missing = err.missingEmployees || [];
    if (!missing.length && err.error) {
      missing = parseMissingPayrollErrorMessage(err.error);
    }
    if (!missing.length) continue;

    if (batch) {
      issues.push(issueFromBatch(batch, missing));
    } else {
      issues.push({
        batchId: String(err.batchId),
        batchLabel: "Batch",
        month: "",
        missingEmployees: missing,
      });
    }
  }

  return issues;
}

export function totalMissingEmployeeCount(issues: BatchPayrollValidationIssue[]): number {
  const seen = new Set<string>();
  for (const issue of issues) {
    for (const emp of issue.missingEmployees) {
      const key = emp.employeeId || `${issue.batchId}:${emp.emp_no}:${emp.employee_name}`;
      seen.add(key);
    }
  }
  return seen.size;
}

export function payRegisterPathFromIssues(
  payRegisterBasePath: string,
  issues: BatchPayrollValidationIssue[],
): string {
  const first = issues[0];
  if (!first?.month) return payRegisterBasePath;
  const params = new URLSearchParams({ month: first.month });
  if (first.departmentId) params.set("departmentId", first.departmentId);
  if (first.divisionId) params.set("divisionId", first.divisionId);
  return `${payRegisterBasePath}?${params.toString()}`;
}
