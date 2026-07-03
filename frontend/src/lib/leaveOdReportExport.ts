import { api } from '@/lib/api';

export type LeaveOdTypeOption = {
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  typeCode?: string;
  _id?: string;
  label?: string;
};

export type LeaveODReportExportFilters = {
  fromDate: string;
  toDate: string;
  search?: string;
  division?: string[];
  department?: string[];
  designation?: string[];
  employeeId?: string[];
  status?: string;
  leaveType?: string;
};

function leaveOdTypeOptionKey(t: LeaveOdTypeOption | null | undefined): string {
  const raw = t?.code ?? t?.typeCode ?? t?._id;
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
}

function leaveOdTypeOptionLabel(t: LeaveOdTypeOption | null | undefined): string {
  const raw = t?.name ?? t?.label ?? t?.code ?? t?.typeCode;
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : 'Type';
}

export function normalizeLeaveOdTypesForSelect(types: unknown): LeaveOdTypeOption[] {
  if (!Array.isArray(types)) return [];
  return types
    .filter((t): t is LeaveOdTypeOption => !!t && typeof t === 'object' && (t as LeaveOdTypeOption).isActive !== false)
    .map((t) => {
      const code = leaveOdTypeOptionKey(t);
      const name = leaveOdTypeOptionLabel(t);
      return { ...t, code, name };
    })
    .filter((t) => t.code)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

export function buildLeaveODExportPayload(
  filters: LeaveODReportExportFilters,
  options: { includeLeaves: boolean; includeODs: boolean; includeSummary?: boolean }
) {
  return {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    search: filters.search?.trim() || undefined,
    division: filters.division?.length ? filters.division : undefined,
    department: filters.department?.length ? filters.department : undefined,
    designation: filters.designation?.length ? filters.designation : undefined,
    employeeId: filters.employeeId?.length ? filters.employeeId : undefined,
    status: filters.status || undefined,
    leaveType: filters.leaveType || undefined,
    includeLeaves: options.includeLeaves,
    includeODs: options.includeODs,
    includeSummary: options.includeSummary ?? true,
  };
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

export async function downloadLeaveODReportPdf(
  filters: LeaveODReportExportFilters,
  options: { includeLeaves: boolean; includeODs: boolean; includeSummary?: boolean },
  fileName: string
): Promise<void> {
  const blob = await api.downloadLeaveODReportPDF(buildLeaveODExportPayload(filters, options));
  triggerBlobDownload(blob, fileName);
}

export async function downloadLeaveODReportXlsx(
  filters: LeaveODReportExportFilters,
  options: { includeLeaves: boolean; includeODs: boolean; includeSummary?: boolean },
  fileName: string
): Promise<void> {
  const blob = await api.downloadLeaveODReportXLSX(buildLeaveODExportPayload(filters, options));
  triggerBlobDownload(blob, fileName);
}
