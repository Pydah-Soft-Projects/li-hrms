/** Append division/department filters for pay-register APIs (supports multi-select). */
export function appendPayRegisterOrgFilters(
  query: URLSearchParams,
  filters: { divisionIds?: string[]; departmentIds?: string[] },
) {
  for (const id of filters.divisionIds ?? []) {
    const s = String(id).trim();
    if (s) query.append('divisionId', s);
  }
  for (const id of filters.departmentIds ?? []) {
    const s = String(id).trim();
    if (s) query.append('departmentId', s);
  }
}

export type PayRegisterExportFilters = {
  month: string;
  divisionIds?: string[];
  departmentIds?: string[];
  search?: string;
  employeeGroupId?: string;
};

export function payRegisterExportQueryParams(params: PayRegisterExportFilters): URLSearchParams {
  const query = new URLSearchParams();
  query.append('month', params.month);
  appendPayRegisterOrgFilters(query, {
    divisionIds: params.divisionIds,
    departmentIds: params.departmentIds,
  });
  if (params.search) query.append('search', params.search);
  if (params.employeeGroupId) query.append('employeeGroupId', params.employeeGroupId);
  return query;
}
