/** Shared helpers for payslip list filters (workspace + superadmin). */

import { entityRefId } from '@/lib/loanListUi';
import { departmentsForDivisionFilter } from '@/lib/manualDeductionListUi';

export const PAYSLIP_LIST_STATUS_OPTIONS = [
  { id: 'calculated', name: 'Calculated' },
  { id: 'approved', name: 'Approved' },
  { id: 'processed', name: 'Processed' },
];

/** Payment batch must be frozen or completed before payslips can be released */
export const PAYSLIP_BATCH_RELEASABLE_STATUSES = ['freeze', 'complete'] as const;

export type PayslipReleaseBlockReason =
  | 'pending'
  | 'already_released'
  | 'batch_not_ready'
  | 'no_batch'
  | 'ineligible_status';

export type PayslipReleaseSummary = {
  total: number;
  alreadyReleased: number;
  pendingRelease: number;
  batchNotReady: number;
  noBatch: number;
  notEligible: number;
};

type PayslipBatchRef = { status?: string; batchNumber?: string } | string | null | undefined;

export function getPayrollBatchStatus(record: { payrollBatchId?: PayslipBatchRef }): string | null {
  const batch = record.payrollBatchId;
  if (!batch || typeof batch === 'string') return null;
  return batch.status ?? null;
}

export function isPayslipReleased(record: { isReleased?: boolean }): boolean {
  return record.isReleased === true;
}

export function getPayslipReleaseBlockReason(record: {
  status?: string;
  isReleased?: boolean;
  payrollBatchId?: PayslipBatchRef;
}): PayslipReleaseBlockReason {
  if (isPayslipReleased(record)) return 'already_released';
  if (record.status === 'draft' || record.status === 'cancelled') return 'ineligible_status';
  const batchStatus = getPayrollBatchStatus(record);
  if (!batchStatus) return 'no_batch';
  if (!PAYSLIP_BATCH_RELEASABLE_STATUSES.includes(batchStatus as (typeof PAYSLIP_BATCH_RELEASABLE_STATUSES)[number])) {
    return 'batch_not_ready';
  }
  return 'pending';
}

export function canReleasePayslipRecord(record: {
  status?: string;
  isReleased?: boolean;
  payrollBatchId?: PayslipBatchRef;
}): boolean {
  return getPayslipReleaseBlockReason(record) === 'pending';
}

export function getPayslipEmployeeViewLabel(record: {
  status?: string;
  isReleased?: boolean;
  payrollBatchId?: PayslipBatchRef;
}): { label: string; tone: 'released' | 'pending' | 'waiting' | 'neutral' } {
  const reason = getPayslipReleaseBlockReason(record);
  if (reason === 'already_released') return { label: 'Released', tone: 'released' };
  if (reason === 'pending') return { label: 'Ready to release', tone: 'pending' };
  if (reason === 'batch_not_ready') return { label: 'Awaiting batch', tone: 'waiting' };
  if (reason === 'no_batch') return { label: 'No batch', tone: 'waiting' };
  return { label: 'N/A', tone: 'neutral' };
}

export function summarizePayslipRelease(
  records: Array<{ status?: string; isReleased?: boolean; payrollBatchId?: PayslipBatchRef }>,
): PayslipReleaseSummary {
  let alreadyReleased = 0;
  let pendingRelease = 0;
  let batchNotReady = 0;
  let noBatch = 0;
  let notEligible = 0;

  for (const r of records) {
    switch (getPayslipReleaseBlockReason(r)) {
      case 'already_released':
        alreadyReleased += 1;
        break;
      case 'pending':
        pendingRelease += 1;
        break;
      case 'batch_not_ready':
        batchNotReady += 1;
        break;
      case 'no_batch':
        noBatch += 1;
        break;
      default:
        notEligible += 1;
        break;
    }
  }

  return { total: records.length, alreadyReleased, pendingRelease, batchNotReady, noBatch, notEligible };
}

export function formatPayslipReleaseMessage(summary: PayslipReleaseSummary, newlyReleased = 0): string {
  if (newlyReleased > 0) {
    const parts = [`Released ${newlyReleased} payslip(s)`];
    if (summary.alreadyReleased > 0) parts.push(`${summary.alreadyReleased} already released`);
    if (summary.batchNotReady > 0) parts.push(`${summary.batchNotReady} awaiting batch freeze/complete`);
    if (summary.noBatch > 0) parts.push(`${summary.noBatch} not linked to a payment batch`);
    if (summary.notEligible > 0) parts.push(`${summary.notEligible} ineligible (draft/cancelled)`);
    return parts.join('. ') + '.';
  }

  if (summary.pendingRelease === 0 && summary.total === 0) {
    return 'No payslips match your current filters for this period.';
  }

  const parts: string[] = ['Nothing to release'];
  if (summary.alreadyReleased > 0) parts.push(`${summary.alreadyReleased} already released`);
  if (summary.batchNotReady > 0) parts.push(`${summary.batchNotReady} awaiting batch freeze/complete`);
  if (summary.noBatch > 0) parts.push(`${summary.noBatch} not linked to a payment batch`);
  if (summary.notEligible > 0) parts.push(`${summary.notEligible} ineligible (draft/cancelled)`);
  if (summary.pendingRelease === 0 && summary.batchNotReady > 0) {
    parts.push('freeze or complete the payment batch first');
  }
  return parts.join('. ') + '.';
}

export type PayslipListRow = {
  emp_no?: string;
  status?: string;
  employeeId?: {
    _id?: string;
    employee_name?: string;
    emp_no?: string;
    department_id?: { _id?: string; name?: string } | string;
    designation_id?: { _id?: string; name?: string } | string;
  } | string;
};

export function payslipMatchesSearch(record: PayslipListRow, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  const q = searchTerm.toLowerCase();
  const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
  return (
    (record.emp_no ?? '').toLowerCase().includes(q)
    || (employee?.employee_name ?? '').toLowerCase().includes(q)
    || (employee?.emp_no ?? '').toLowerCase().includes(q)
  );
}

export function payslipMatchesListOrgAndStatus(
  record: PayslipListRow,
  divisions: any[],
  departments: any[],
  filterDivisions: string[],
  filterDepartments: string[],
  filterDesignations: string[],
  filterStatuses: string[],
): boolean {
  if (filterStatuses.length > 0 && record.status && !filterStatuses.includes(record.status)) {
    return false;
  }

  const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
  const deptId = entityRefId(employee?.department_id);
  const desigId = entityRefId(employee?.designation_id);

  if (filterDepartments.length > 0) {
    if (!deptId || !filterDepartments.includes(deptId)) return false;
  }

  if (filterDesignations.length > 0) {
    if (!desigId || !filterDesignations.includes(desigId)) return false;
  }

  if (filterDivisions.length > 0) {
    const allowed = departmentsForDivisionFilter(divisions, departments, filterDivisions);
    const allowedIds = new Set(allowed.map((d: any) => String(d._id)));
    if (!deptId || !allowedIds.has(deptId)) return false;
  }

  return true;
}
